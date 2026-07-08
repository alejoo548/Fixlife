import { Request, Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { AuthRequest } from '../middlewares/auth.middleware';
import { createUserNotification, notifyAdmins } from '../utils/notifications';
import { emitChatMessage, emitToUser } from '../services/socketManager';
import { getWorkerBonusPayouts, getWorkerRewardsSettings, syncWorkerBonusPayouts } from '../utils/workerRewards';
import { resolveRequestLocation, reverseGeocodeLocation, suggestLocationTexts } from '../services/geocoding.service';
import { getProximityBounds, getWorkerBoundsFilter } from '../services/nearbyWorkers.service';
import { buildProtectedAssetUrl, buildPublicAssetUrl, deleteUploadIfExists } from '../utils/assets';
import { shouldRunRuntimeSchemaSync } from '../config/schemaSync';
import {
  assertPaypalCaptureMatchesRequest,
  buildCheckoutReference,
  buildInvoiceNumber,
  capturePaypalOrder,
  createPaypalOrder,
  getDefaultFrontendUrl,
  getRequestChargeAmount,
  parseRequestedPaymentMethod,
  sanitizePaymentValue,
  sanitizeRedirectUrl,
  type SupportedPaymentMethod,
} from '../services/requestPayments.service';
import {
  calculateCommissionBreakdown,
  ensureCommissionEngineTables,
  normalizePromoCode,
  normalizeUrgencyLevel,
  resolveWorkerTier,
} from '../services/commissionEngine.service';
import {
  ensurePaymentLedgerTables,
  recordConfirmedPaymentLedger,
  scheduleWorkerPayoutForReleasedRequest,
} from '../services/paymentLedger.service';
import { evaluateAutomaticWorkerTier } from '../services/workerTier.service';
import { enqueueBackgroundJob } from '../services/backgroundJobs.service';
import { storePaypalWebhookEvent, verifyPaypalWebhookSignature } from '../services/paypalWebhook.service';
import { isDatabaseSchemaReady } from '../services/schemaState.service';
import { recordSystemEvent } from '../services/systemEvents.service';
import { sanitizeMessage, sanitizeStrictText } from '../utils/sanitize';

const assertRequestOwnership = async (idRequest: number, userId: number): Promise<boolean> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT 1 FROM service_requests WHERE id_request = ? AND id_user = ? LIMIT 1`,
    [idRequest, userId]
  );
  return rows.length > 0;
};

const processAutomaticWorkerTierPromotion = async (workerProfileId: number | null | undefined) => {
  if (!workerProfileId) return;

  const promotion = await evaluateAutomaticWorkerTier({
    workerProfileId: Number(workerProfileId),
  });

  if (!promotion?.changed || !promotion.user_id) return;

  await createUserNotification({
    userId: Number(promotion.user_id),
    eventType: 'tier_updated',
    title: 'Congratulations, you unlocked a new tier!',
    message: `You are now ${String(promotion.next_tier || 'standard').toUpperCase()} after completing ${Number(promotion.completed_jobs || 0)} jobs.`,
    tone: 'success',
    actionUrl: '/pro-dashboard',
    dedupeKey: `worker-tier-auto-${Number(promotion.user_id)}-${String(promotion.next_tier)}`,
    metadata: {
      previous_tier: promotion.previous_tier,
      next_tier: promotion.next_tier,
      completed_jobs: Number(promotion.completed_jobs || 0),
      benefits: promotion.benefit,
      reason: promotion.reason || null,
    },
  });

  emitToUser(Number(promotion.user_id), 'worker_tier_updated', {
    previous_tier: promotion.previous_tier,
    membership_tier: promotion.next_tier,
    completed_jobs: Number(promotion.completed_jobs || 0),
    benefits: promotion.benefit,
    reason: promotion.reason || null,
  });
};

type ServiceCardRow = RowDataPacket & {
  id_card: number;
  id_service: number;
  image_url: string | null;
  badge: string | null;
  headline: string | null;
  summary: string | null;
  cta_label: string | null;
  sort_order: number;
  is_active: number;
  service_name: string;
  service_icon: string | null;
  service_description: string | null;
};

let serviceCardsTableChecked = false;
let workerGeoColumnsChecked = false;
let serviceRequestsTablesChecked = false;
let savedLocationsTableChecked = false;

const SERVICE_REQUEST_STATUS_ENUM =
  `ENUM('open', 'pending', 'assigned', 'route_in_progress', 'arrived', 'start_pending', 'in_progress', 'finish_pending', 'payment_pending', 'paid', 'completion_pending', 'awaiting_confirmation', 'done', 'cancelled')`;
const SAVED_LOCATION_KIND_ENUM = `ENUM('home', 'work', 'favorite', 'recent')`;
const SERVICE_CARD_SORT_INDEX = 'ux_service_cards_sort';
const MIN_SCHEDULED_REQUEST_DURATION_MINUTES = 60;
const MAX_SCHEDULED_REQUEST_DURATION_MINUTES = 7 * 60;
const DEFAULT_SCHEDULED_REQUEST_DURATION_MINUTES = Math.max(
  MIN_SCHEDULED_REQUEST_DURATION_MINUTES,
  Math.min(Number(process.env.SCHEDULED_REQUEST_DURATION_MINUTES || 120), MAX_SCHEDULED_REQUEST_DURATION_MINUTES)
);
const CHAT_ENABLED_REQUEST_STATUSES = [
  'assigned',
  'route_in_progress',
  'arrived',
  'start_pending',
  'finish_pending',
  'payment_pending',
  'paid',
  'completion_pending',
  'in_progress',
  'awaiting_confirmation',
  'done',
];

const normalizeBookingType = (value: unknown): 'express' | 'scheduled' => {
  return String(value || '').trim().toLowerCase() === 'scheduled' ? 'scheduled' : 'express';
};

const parseScheduledDurationMinutes = (value: unknown) => {
  const raw = Number(value ?? DEFAULT_SCHEDULED_REQUEST_DURATION_MINUTES);
  if (!Number.isFinite(raw)) {
    return DEFAULT_SCHEDULED_REQUEST_DURATION_MINUTES;
  }

  const rounded = Math.round(raw / 60) * 60;
  if (rounded < MIN_SCHEDULED_REQUEST_DURATION_MINUTES || rounded > MAX_SCHEDULED_REQUEST_DURATION_MINUTES) {
    throw new Error('Estimated visit duration must be between 1 and 7 hours.');
  }

  return rounded;
};

const parseScheduledRequestTime = (body: any) => {
  const bookingType = normalizeBookingType(body?.booking_type);
  if (bookingType === 'express') {
    return {
      bookingType,
      scheduledDate: null,
      scheduledTime: null,
      scheduledStartTime: null,
      scheduledEndTime: null,
      scheduledDurationMinutes: null,
    };
  }

  const scheduledDate = String(body?.scheduled_date || '').trim();
  const scheduledTime = String(body?.scheduled_time || '').trim();
  const scheduledStartRaw = String(body?.scheduled_start_time || '').trim();
  const scheduledDurationMinutes = parseScheduledDurationMinutes(body?.scheduled_duration_minutes);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
    throw new Error('Select a valid scheduled date.');
  }
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(scheduledTime)) {
    throw new Error('Select a valid scheduled time.');
  }

  const scheduledStartDate = scheduledStartRaw
    ? new Date(scheduledStartRaw)
    : new Date(`${scheduledDate}T${scheduledTime.length === 5 ? `${scheduledTime}:00` : scheduledTime}Z`);

  if (Number.isNaN(scheduledStartDate.getTime())) {
    throw new Error('Select a valid scheduled time.');
  }
  if (scheduledStartDate.getTime() <= Date.now() + 5 * 60_000) {
    throw new Error('Scheduled visits must be at least 5 minutes in the future.');
  }

  const scheduledEndDate = new Date(
    scheduledStartDate.getTime() + scheduledDurationMinutes * 60_000
  );
  const normalizedTime = scheduledTime.length === 5 ? `${scheduledTime}:00` : scheduledTime;

  return {
    bookingType,
    scheduledDate,
    scheduledTime: normalizedTime,
    scheduledStartTime: scheduledStartDate.toISOString().slice(0, 19).replace('T', ' '),
    scheduledEndTime: scheduledEndDate.toISOString().slice(0, 19).replace('T', ' '),
    scheduledDurationMinutes,
  };
};

const getScheduledAvailabilityLookup = (schedule: ReturnType<typeof parseScheduledRequestTime>) => {
  if (schedule.bookingType !== 'scheduled' || !schedule.scheduledDate || !schedule.scheduledTime) {
    return null;
  }

  const date = new Date(`${schedule.scheduledDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;

  const start = new Date(`${schedule.scheduledDate}T${schedule.scheduledTime}`);
  if (Number.isNaN(start.getTime())) return null;

  const end = new Date(start.getTime() + Number(schedule.scheduledDurationMinutes || DEFAULT_SCHEDULED_REQUEST_DURATION_MINUTES) * 60_000);
  if (end.toISOString().slice(0, 10) !== schedule.scheduledDate) return null;

  return {
    dayOfWeek: date.getUTCDay(),
    startTime: schedule.scheduledTime,
    endTime: end.toTimeString().slice(0, 8),
  };
};

type CatalogService = {
  name: string;
  aliases?: string[];
  description: string;
  icon: string;
};

const CATALOG_SERVICES: CatalogService[] = [
  {
    name: 'Carpentry',
    description: 'Custom woodwork, furniture repair, and door/window installations.',
    icon: '\u{1FA9A}',
  },
  {
    name: 'Auto Mechanic',
    description: 'Vehicle diagnostics, maintenance, and mechanical repairs.',
    icon: '\u{1F527}',
  },
  {
    name: 'Childcare / Babysitting',
    description: 'Safe and reliable care for children at home.',
    icon: '\u{1F9F8}',
  },
  {
    name: 'Gardening',
    description: 'Lawn care, pruning, planting, and garden maintenance.',
    icon: '\u{1F33F}',
  },
  {
    name: 'Electrical Services',
    description: 'Wiring, outlets, lighting, and electrical troubleshooting.',
    icon: '\u26A1',
  },
  {
    name: 'Plumbing',
    description: 'Leak repairs, pipe installation, and drain unclogging.',
    icon: '\u{1F6B0}',
  },
  {
    name: 'House Painting',
    aliases: ['Painting'],
    description: 'Interior and exterior painting with professional finishing.',
    icon: '\u{1F3A8}',
  },
  {
    name: 'Masonry',
    description: 'Brickwork, concrete repairs, and structural improvements.',
    icon: '\u{1F9F1}',
  },
  {
    name: 'Welding',
    description: 'Metal fabrication, repairs, and custom welding jobs.',
    icon: '\u{1F525}',
  },
  {
    name: 'AC Installation & Repair',
    description: 'Air conditioner setup, maintenance, and cooling fixes.',
    icon: '\u2744\uFE0F',
  },
  {
    name: 'Refrigeration Repair',
    description: 'Repair and maintenance for refrigerators and cooling systems.',
    icon: '\u{1F9CA}',
  },
  {
    name: 'Locksmith Services',
    description: 'Lock installation, key duplication, and emergency unlocking.',
    icon: '\u{1F510}',
  },
  {
    name: 'Drywall Installation',
    description: 'Drywall mounting, patching, and wall finishing.',
    icon: '\u{1F9F1}',
  },
  {
    name: 'Home Cleaning',
    aliases: ['Cleaning'],
    description: 'Deep cleaning and regular housekeeping services.',
    icon: '\u{1F9F9}',
  },
  {
    name: 'Elderly Care',
    description: 'Companion and basic support care for seniors.',
    icon: '\u{1F91D}',
  },
  {
    name: 'Computer Technician',
    description: 'PC troubleshooting, software setup, and hardware repair.',
    icon: '\u{1F4BB}',
  },
  {
    name: 'Security Camera Installation',
    description: 'CCTV setup, configuration, and basic monitoring guidance.',
    icon: '\u{1F4F9}',
  },
  {
    name: 'Appliance Repair',
    description: 'Repair of washers, dryers, stoves, and home appliances.',
    icon: '\u{1F6E0}\uFE0F',
  },
];

const ensureIndexExists = async (tableName: string, indexName: string, alterSql: string) => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND index_name = ?`,
    [tableName, indexName]
  );

  if (Number(rows[0]?.total || 0) === 0) {
    await pool.execute(alterSql);
  }
};

let serviceCatalogDataChecked = false;
let serviceCardDataChecked = false;

const repairServiceCatalogData = async () => {
  if (serviceCatalogDataChecked) return;

  for (const service of CATALOG_SERVICES) {
    await pool.execute(
      `UPDATE services
       SET description = ?, icon = ?
       WHERE LOWER(name) = ?`,
      [service.description, service.icon, service.name.toLowerCase()]
    );

    for (const alias of service.aliases || []) {
      await pool.execute(
        `UPDATE services
         SET name = ?, description = ?, icon = ?
         WHERE LOWER(name) = ?
           AND NOT EXISTS (
             SELECT 1
             FROM (SELECT id_service FROM services WHERE LOWER(name) = ? LIMIT 1) AS existing_service
           )`,
        [service.name, service.description, service.icon, alias.toLowerCase(), service.name.toLowerCase()]
      );
    }
  }

  serviceCatalogDataChecked = true;
};

const repairServiceCardSeedData = async () => {
  if (serviceCardDataChecked) return;

  await pool.execute(
    `UPDATE service_cards
     SET headline = 'House Painting',
         summary = 'Interior and exterior painting with clean, professional finishing.'
     WHERE id_service = 9
       AND (headline IS NULL
            OR headline <> 'House Painting'
            OR summary IS NULL
            OR summary LIKE '%delivery service%')`
  );

  await pool.execute(
    `UPDATE service_cards
     SET summary = 'Lawn care, planting, pruning, and garden maintenance.'
     WHERE id_service = 6
       AND summary LIKE '%service.'`
  );

  serviceCardDataChecked = true;
};

const normalizeServiceCardSortOrder = async () => {
  const [summaryRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total, COUNT(DISTINCT sort_order) AS unique_total FROM service_cards`
  );
  const total = Number(summaryRows[0]?.total || 0);
  const uniqueTotal = Number(summaryRows[0]?.unique_total || 0);

  if (total === 0 || total === uniqueTotal) return;

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id_card
     FROM service_cards
     ORDER BY sort_order ASC, id_card ASC`
  );
  const tempOffset = 100000;

  for (let index = 0; index < rows.length; index += 1) {
    await pool.execute(
      `UPDATE service_cards SET sort_order = ? WHERE id_card = ?`,
      [tempOffset + index + 1, Number(rows[index].id_card)]
    );
  }

  for (let index = 0; index < rows.length; index += 1) {
    await pool.execute(
      `UPDATE service_cards SET sort_order = ? WHERE id_card = ?`,
      [index + 1, Number(rows[index].id_card)]
    );
  }
};

const toPublicRequestStatus = (status: string | null | undefined) => {
  if (!status) return 'pending';
  return status === 'open' ? 'pending' : status;
};

const parseCommissionSnapshot = (value: unknown) => {
  if (typeof value !== 'string' || !value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const resolveRequestWorkerTier = (row: any) =>
  resolveWorkerTier({
    membershipTier: row?.worker_membership_tier,
    isVerified: row?.worker_is_verified,
  });
const defaultImageForService = (serviceName: string) => {
  const name = serviceName.toLowerCase();
  if (name.includes('plumb')) return 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?q=80&w=1400&auto=format&fit=crop';
  if (name.includes('electric')) return 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?q=80&w=1400&auto=format&fit=crop';
  if (name.includes('carp')) return 'https://images.unsplash.com/photo-1610557892470-55d9e80c0bce?q=80&w=1400&auto=format&fit=crop';
  if (name.includes('clean')) return 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=1400&auto=format&fit=crop';
  if (name.includes('mechan')) return 'https://images.unsplash.com/photo-1530046339160-71153320c072?q=80&w=1400&auto=format&fit=crop';
  return 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?q=80&w=1400&auto=format&fit=crop';
};

const ensureDefaultServices = async () => {
  if (!shouldRunRuntimeSchemaSync()) return;

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM services`
  );

  const total = Number(rows[0]?.total || 0);
  if (total === 0) {
    for (const service of CATALOG_SERVICES) {
      await pool.execute(
        `INSERT INTO services (name, description, icon, is_active)
         VALUES (?, ?, ?, 1)`,
        [service.name, service.description, service.icon]
      );
    }
  }

  await repairServiceCatalogData();
};

const buildAssetUrl = (req: Request, fileName: string | null) => {
  return buildPublicAssetUrl(req, fileName);
};

const getWorkerUserIdByProfileId = async (profileId: number | null | undefined) => {
  if (!profileId) return null;
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id_user FROM worker_profiles WHERE id_worker_profile = ? LIMIT 1`,
    [profileId]
  );
  return rows.length > 0 ? Number(rows[0].id_user) : null;
};

const requeueAssignedRequest = async (
  connection: any,
  input: {
    idRequest: number;
    idService: number | null | undefined;
    latitude: number | null | undefined;
    longitude: number | null | undefined;
    radiusKm: number | null | undefined;
    assignedWorkerProfile: number;
  }
) => {
  await connection.execute(
    `UPDATE service_request_workers
     SET status = 'rejected',
         counter_status = CASE WHEN counter_status = 'pending' THEN 'declined' ELSE counter_status END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id_request = ? AND id_worker_profile = ?`,
    [input.idRequest, input.assignedWorkerProfile]
  );

  await connection.execute(
    `UPDATE service_requests
     SET status = 'pending',
         assigned_worker_profile = NULL,
         assigned_at = NULL,
         worker_arrived_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id_request = ?`,
    [input.idRequest]
  );

  if (input.latitude == null || input.longitude == null || input.idService == null) {
    return;
  }

  const lat = Number(input.latitude);
  const lng = Number(input.longitude);
  const radiusKm = Number(input.radiusKm || 8);
  const idService = Number(input.idService);
  const boundsFilter = getWorkerBoundsFilter(getProximityBounds(lat, lng, radiusKm));

  const [nearRows] = await connection.execute(
    `SELECT
       wp.id_worker_profile,
       wp.coverage_km,
       (ST_Distance_Sphere(point(wp.longitude, wp.latitude), point(?, ?)) / 1000) AS distance_km
     FROM worker_profiles wp
     INNER JOIN users u ON u.id_user = wp.id_user
     INNER JOIN worker_services ws ON ws.id_worker_profile = wp.id_worker_profile
     LEFT JOIN service_request_workers srw
       ON srw.id_request = ? AND srw.id_worker_profile = wp.id_worker_profile
     WHERE u.rol = 'worker'
       AND wp.is_verified = 1
       AND ws.id_service = ?
       AND wp.latitude IS NOT NULL
       AND wp.longitude IS NOT NULL
       ${boundsFilter.sql}
       AND wp.id_worker_profile <> ?
       AND srw.id_request IS NULL
     HAVING distance_km <= ? AND distance_km <= wp.coverage_km
     ORDER BY distance_km ASC
     LIMIT 50`,
    [lng, lat, input.idRequest, idService, ...boundsFilter.params, input.assignedWorkerProfile, radiusKm]
  );

  await bulkInsertRequestWorkerCandidates(connection, input.idRequest, nearRows as RowDataPacket[]);
};

export const ensureServiceCardsTable = async () => {
  if (serviceCardsTableChecked) return;
  if (isDatabaseSchemaReady()) {
    serviceCardsTableChecked = true;
    return;
  }
  if (!shouldRunRuntimeSchemaSync()) {
    serviceCardsTableChecked = true;
    return;
  }

  await ensureDefaultServices();

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS service_cards (
      id_card INT NOT NULL AUTO_INCREMENT,
      id_service INT NOT NULL,
      image_url VARCHAR(255) DEFAULT NULL,
      badge VARCHAR(40) DEFAULT 'POPULAR',
      headline VARCHAR(120) DEFAULT NULL,
      summary VARCHAR(255) DEFAULT NULL,
      cta_label VARCHAR(60) NOT NULL DEFAULT 'Learn More',
      sort_order INT NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_card),
      UNIQUE KEY ux_service_cards_sort (sort_order),
      KEY idx_service_cards_service (id_service),
      KEY idx_service_cards_active_sort (is_active, sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [fkRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM information_schema.referential_constraints
     WHERE constraint_schema = DATABASE()
       AND table_name = 'service_cards'
       AND constraint_name = 'fk_service_cards_service'`
  );

  const fkExists = Number(fkRows[0]?.total || 0) > 0;
  if (!fkExists) {
    await pool.execute(`
      ALTER TABLE service_cards
      ADD CONSTRAINT fk_service_cards_service
      FOREIGN KEY (id_service) REFERENCES services(id_service)
      ON DELETE CASCADE
    `);
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM service_cards`
  );

  const total = Number(rows[0]?.total || 0);
  if (total === 0) {
    const [services] = await pool.execute<RowDataPacket[]>(
      `SELECT id_service, name, description
       FROM services
       WHERE is_active = 1
       ORDER BY id_service ASC
       LIMIT 4`
    );

    for (let index = 0; index < services.length; index += 1) {
      const service = services[index];
      await pool.execute(
        `INSERT INTO service_cards (id_service, image_url, badge, headline, summary, cta_label, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          service.id_service,
          defaultImageForService(String(service.name || '')),
          'POPULAR',
          String(service.name || '').slice(0, 120),
          String(service.description || 'Trusted professionals ready to help your project.').slice(0, 255),
          'Learn More',
          index + 1,
        ]
      );
    }
  }

  await repairServiceCardSeedData();
  await normalizeServiceCardSortOrder();
  await ensureIndexExists(
    'service_cards',
    SERVICE_CARD_SORT_INDEX,
    `ALTER TABLE service_cards ADD UNIQUE KEY ${SERVICE_CARD_SORT_INDEX} (sort_order)`
  );
  await ensureIndexExists(
    'service_cards',
    'idx_service_cards_active_sort',
    `ALTER TABLE service_cards ADD KEY idx_service_cards_active_sort (is_active, sort_order)`
  );

  serviceCardsTableChecked = true;
};

export const getActiveServices = async (_req: Request, res: Response): Promise<void> => {
  try {
    await ensureDefaultServices();

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_service, name, description, icon FROM services WHERE is_active = 1 ORDER BY name ASC`
    );
    res.json({ success: true, services: rows });
  } catch (error: any) {
    console.error('Error in getActiveServices:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPublicServiceCards = async (_req: Request, res: Response): Promise<void> => {
  try {
    await ensureServiceCardsTable();

    const [rows] = await pool.execute<ServiceCardRow[]>(
      `SELECT
         sc.id_card,
         sc.id_service,
         sc.image_url,
         sc.badge,
         sc.headline,
         sc.summary,
         sc.cta_label,
         sc.sort_order,
         sc.is_active,
         s.name AS service_name,
         s.icon AS service_icon,
         s.description AS service_description
       FROM service_cards sc
       INNER JOIN services s ON s.id_service = sc.id_service
       WHERE sc.is_active = 1 AND s.is_active = 1
       ORDER BY sc.sort_order ASC, sc.id_card ASC`
    );

    const cards = rows.map((row) => ({
      id_card: Number(row.id_card),
      id_service: Number(row.id_service),
      image_url: row.image_url,
      badge: row.badge || 'POPULAR',
      headline: row.headline || row.service_name,
      summary: row.summary || row.service_description || '',
      cta_label: row.cta_label || 'Learn More',
      sort_order: Number(row.sort_order),
      service_name: row.service_name,
      service_icon: row.service_icon,
    }));

    res.json({ success: true, cards });
  } catch (error: any) {
    console.error('Error in getPublicServiceCards:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const ensureWorkerGeoColumns = async () => {
  if (workerGeoColumnsChecked) return;
  if (isDatabaseSchemaReady()) {
    workerGeoColumnsChecked = true;
    return;
  }
  if (!shouldRunRuntimeSchemaSync()) {
    workerGeoColumnsChecked = true;
    return;
  }

  const [columns] = await pool.execute<RowDataPacket[]>(
    `SELECT COLUMN_NAME
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'worker_profiles'
       AND column_name IN ('latitude', 'longitude', 'coverage_km', 'is_online', 'last_seen_at')`
  );

  const names = new Set(columns.map((c: any) => String(c.COLUMN_NAME)));

  if (!names.has('latitude')) {
    await pool.execute(`ALTER TABLE worker_profiles ADD COLUMN latitude DECIMAL(10,7) NULL`);
  }
  if (!names.has('longitude')) {
    await pool.execute(`ALTER TABLE worker_profiles ADD COLUMN longitude DECIMAL(10,7) NULL`);
  }
  if (!names.has('coverage_km')) {
    await pool.execute(`ALTER TABLE worker_profiles ADD COLUMN coverage_km DECIMAL(6,2) NOT NULL DEFAULT 8.00`);
  }
  if (!names.has('is_online')) {
    await pool.execute(`ALTER TABLE worker_profiles ADD COLUMN is_online TINYINT(1) NOT NULL DEFAULT 0`);
  }
  if (!names.has('last_seen_at')) {
    await pool.execute(`ALTER TABLE worker_profiles ADD COLUMN last_seen_at TIMESTAMP NULL`);
  }

  await ensureIndexExists(
    'worker_profiles',
    'idx_worker_profiles_geo_verified',
    `ALTER TABLE worker_profiles ADD KEY idx_worker_profiles_geo_verified (is_verified, latitude, longitude)`
  );
  await ensureIndexExists(
    'worker_profiles',
    'idx_worker_profiles_geo_online',
    `ALTER TABLE worker_profiles ADD KEY idx_worker_profiles_geo_online (is_verified, is_online, latitude, longitude)`
  );
  await ensureIndexExists(
    'worker_services',
    'idx_worker_services_service_profile',
    `ALTER TABLE worker_services ADD KEY idx_worker_services_service_profile (id_service, id_worker_profile)`
  );

  workerGeoColumnsChecked = true;
};

export const ensureSavedLocationsTable = async () => {
  if (savedLocationsTableChecked) return;
  if (isDatabaseSchemaReady()) {
    savedLocationsTableChecked = true;
    return;
  }
  if (!shouldRunRuntimeSchemaSync()) {
    savedLocationsTableChecked = true;
    return;
  }

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS user_saved_locations (
      id_saved_location INT NOT NULL AUTO_INCREMENT,
      id_user INT NOT NULL,
      kind ${SAVED_LOCATION_KIND_ENUM} NOT NULL,
      title VARCHAR(80) NOT NULL,
      label VARCHAR(255) NOT NULL,
      latitude DECIMAL(10,7) NOT NULL,
      longitude DECIMAL(10,7) NOT NULL,
      last_used_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_saved_location),
      KEY idx_user_saved_locations_user_kind (id_user, kind),
      KEY idx_user_saved_locations_user_last_used (id_user, last_used_at),
      CONSTRAINT fk_user_saved_locations_user FOREIGN KEY (id_user) REFERENCES users(id_user) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  savedLocationsTableChecked = true;
};

const mapSavedLocationRow = (row: any) => ({
  id_saved_location: Number(row.id_saved_location),
  kind: String(row.kind),
  title: String(row.title || ''),
  label: String(row.label || ''),
  lat: Number(row.latitude),
  lng: Number(row.longitude),
  last_used_at: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
});

export const getNearbyWorkers = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureWorkerGeoColumns();

    const idService = Number(req.query.id_service);
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const hasRadius = req.query.radius_km != null && req.query.radius_km !== '';
    const radiusKmRaw = hasRadius ? Number(req.query.radius_km) : 8;

    if (!Number.isSafeInteger(idService) || idService <= 0) {
      res.status(400).json({ error: 'id_service is required.' });
      return;
    }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      res.status(400).json({ error: 'A valid latitude is required.' });
      return;
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      res.status(400).json({ error: 'A valid longitude is required.' });
      return;
    }
    if (!Number.isFinite(radiusKmRaw) || radiusKmRaw <= 0) {
      res.status(400).json({ error: 'A positive search radius is required.' });
      return;
    }
    const radiusKm = Math.min(radiusKmRaw, 50);

    const boundsFilter = getWorkerBoundsFilter(getProximityBounds(lat, lng, radiusKm));

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         u.id_user,
         u.name,
         u.lastname,
         u.profile_image,
         wp.id_worker_profile,
         wp.coverage_km,
         wp.bio,
         wp.latitude,
         wp.longitude,
         (ST_Distance_Sphere(point(wp.longitude, wp.latitude), point(?, ?)) / 1000) AS distance_km
       FROM worker_profiles wp
       INNER JOIN users u ON u.id_user = wp.id_user
       INNER JOIN worker_services ws ON ws.id_worker_profile = wp.id_worker_profile
       WHERE u.rol = 'worker'
         AND wp.is_verified = 1
         AND wp.is_online = 1
         AND ws.id_service = ?
         AND wp.latitude IS NOT NULL
         AND wp.longitude IS NOT NULL
         ${boundsFilter.sql}
       HAVING distance_km <= ? AND distance_km <= wp.coverage_km
       ORDER BY distance_km ASC
       LIMIT 20`,
      [lng, lat, idService, ...boundsFilter.params, radiusKm]
    );

    const workers = rows.map((row: any) => ({
      id_user: Number(row.id_user),
      id_worker_profile: Number(row.id_worker_profile),
      name: `${row.name || ''} ${row.lastname || ''}`.trim(),
      bio: row.bio || '',
      profile_image: row.profile_image || null,
      latitude: row.latitude != null ? Number(row.latitude) : null,
      longitude: row.longitude != null ? Number(row.longitude) : null,
      distance_km: row.distance_km != null ? Number(row.distance_km) : null,
    }));

    res.json({ success: true, workers, center: { lat, lng }, radius_km: radiusKm });
  } catch (error: any) {
    console.error('Error in getNearbyWorkers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const geocodeLocation = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query || query.length > 255) {
      res.status(400).json({ error: 'q is required (max 255 chars).' });
      return;
    }

    const location = await resolveRequestLocation(query, null, null);
    if (!location) {
      res.status(404).json({ error: 'Could not resolve that address. Try a more specific place or paste coordinates.' });
      return;
    }

    res.json({ success: true, location });
  } catch (error: any) {
    console.error('Error in geocodeLocation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const suggestLocations = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query || query.length < 2 || query.length > 255) {
      res.json({ success: true, suggestions: [] });
      return;
    }

    const suggestions = await suggestLocationTexts(query);
    res.json({ success: true, suggestions });
  } catch (error: any) {
    console.error('Error in suggestLocations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const reverseGeocode = async (req: Request, res: Response): Promise<void> => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      res.status(400).json({ error: 'A valid latitude is required.' });
      return;
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      res.status(400).json({ error: 'A valid longitude is required.' });
      return;
    }

    const location = await reverseGeocodeLocation(lat, lng);
    if (!location) {
      res.status(404).json({ error: 'Could not read a friendly address for that point.' });
      return;
    }

    res.json({ success: true, location });
  } catch (error: any) {
    console.error('Error in reverseGeocode:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getSavedLocations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureSavedLocationsTable();

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_saved_location, kind, title, label, latitude, longitude, last_used_at
       FROM user_saved_locations
       WHERE id_user = ?
       ORDER BY
         FIELD(kind, 'home', 'work', 'favorite', 'recent'),
         CASE WHEN kind = 'favorite' THEN last_used_at END DESC,
         CASE WHEN kind = 'recent' THEN last_used_at END DESC,
         id_saved_location DESC`,
      [userId]
    );

    res.json({
      success: true,
      locations: rows.map(mapSavedLocationRow),
    });
  } catch (error: any) {
    console.error('Error in getSavedLocations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createSavedLocation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureSavedLocationsTable();

    const kind = String(req.body?.kind || '').trim().toLowerCase();
    const title = String(req.body?.title || '').trim();
    const label = String(req.body?.label || '').trim();
    const latitude = Number(req.body?.lat);
    const longitude = Number(req.body?.lng);

    if (!['home', 'work', 'favorite', 'recent'].includes(kind)) {
      res.status(400).json({ error: 'Invalid location kind.' });
      return;
    }
    if (!title || title.length > 80) {
      res.status(400).json({ error: 'title is required (max 80 chars).' });
      return;
    }
    if (!label || label.length > 255) {
      res.status(400).json({ error: 'label is required (max 255 chars).' });
      return;
    }
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      res.status(400).json({ error: 'Valid lat/lng are required.' });
      return;
    }

    if (kind === 'home' || kind === 'work') {
      await pool.execute(
        `DELETE FROM user_saved_locations
         WHERE id_user = ? AND kind = ?`,
        [userId, kind]
      );
    }

    if (kind === 'recent') {
      const [existingRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id_saved_location
         FROM user_saved_locations
         WHERE id_user = ?
           AND kind = 'recent'
           AND label = ?
           AND latitude = ?
           AND longitude = ?
         LIMIT 1`,
        [userId, label, latitude, longitude]
      );

      if (existingRows.length > 0) {
        await pool.execute(
          `UPDATE user_saved_locations
           SET title = ?, last_used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id_saved_location = ?`,
          [title, Number(existingRows[0].id_saved_location)]
        );
      } else {
        await pool.execute(
          `INSERT INTO user_saved_locations (id_user, kind, title, label, latitude, longitude, last_used_at)
           VALUES (?, 'recent', ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [userId, title, label, latitude, longitude]
        );
      }

      await pool.execute(
        `DELETE FROM user_saved_locations
         WHERE id_user = ?
           AND kind = 'recent'
           AND id_saved_location NOT IN (
             SELECT id_saved_location
             FROM (
               SELECT id_saved_location
               FROM user_saved_locations
               WHERE id_user = ? AND kind = 'recent'
               ORDER BY last_used_at DESC, id_saved_location DESC
               LIMIT 4
             ) AS keep_recent
           )`,
        [userId, userId]
      );
    } else if (kind === 'favorite') {
      const [existingRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id_saved_location
         FROM user_saved_locations
         WHERE id_user = ?
           AND kind = 'favorite'
           AND (
             LOWER(title) = LOWER(?)
             OR (label = ? AND latitude = ? AND longitude = ?)
           )
         LIMIT 1`,
        [userId, title, label, latitude, longitude]
      );

      if (existingRows.length > 0) {
        await pool.execute(
          `UPDATE user_saved_locations
           SET title = ?, label = ?, latitude = ?, longitude = ?, last_used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id_saved_location = ?`,
          [title, label, latitude, longitude, Number(existingRows[0].id_saved_location)]
        );
      } else {
        await pool.execute(
          `INSERT INTO user_saved_locations (id_user, kind, title, label, latitude, longitude, last_used_at)
           VALUES (?, 'favorite', ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [userId, title, label, latitude, longitude]
        );
      }
    } else {
      await pool.execute(
        `INSERT INTO user_saved_locations (id_user, kind, title, label, latitude, longitude, last_used_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [userId, kind, title, label, latitude, longitude]
      );
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_saved_location, kind, title, label, latitude, longitude, last_used_at
       FROM user_saved_locations
       WHERE id_user = ?
       ORDER BY
         FIELD(kind, 'home', 'work', 'favorite', 'recent'),
         CASE WHEN kind = 'favorite' THEN last_used_at END DESC,
         CASE WHEN kind = 'recent' THEN last_used_at END DESC,
         id_saved_location DESC`,
      [userId]
    );

    res.status(201).json({
      success: true,
      locations: rows.map(mapSavedLocationRow),
    });
  } catch (error: any) {
    console.error('Error in createSavedLocation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateSavedLocation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureSavedLocationsTable();

    const idSavedLocation = Number(req.params.idSavedLocation);
    if (!idSavedLocation) {
      res.status(400).json({ error: 'Invalid saved location id.' });
      return;
    }

    const titleRaw = req.body?.title;
    const title = titleRaw != null ? String(titleRaw).trim() : null;
    const touch = Boolean(req.body?.touch);

    const updates: string[] = [];
    const params: any[] = [];

    if (title != null) {
      if (!title || title.length > 80) {
        res.status(400).json({ error: 'title must be between 1 and 80 chars.' });
        return;
      }
      updates.push('title = ?');
      params.push(title);
    }

    if (touch) {
      updates.push('last_used_at = CURRENT_TIMESTAMP');
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'Nothing to update.' });
      return;
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE user_saved_locations
       SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id_saved_location = ? AND id_user = ?`,
      [...params, idSavedLocation, userId]
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Saved location not found.' });
      return;
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_saved_location, kind, title, label, latitude, longitude, last_used_at
       FROM user_saved_locations
       WHERE id_user = ?
       ORDER BY
         FIELD(kind, 'home', 'work', 'favorite', 'recent'),
         CASE WHEN kind = 'favorite' THEN last_used_at END DESC,
         CASE WHEN kind = 'recent' THEN last_used_at END DESC,
         id_saved_location DESC`,
      [userId]
    );

    res.json({
      success: true,
      locations: rows.map(mapSavedLocationRow),
    });
  } catch (error: any) {
    console.error('Error in updateSavedLocation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteSavedLocation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureSavedLocationsTable();

    const idSavedLocation = Number(req.params.idSavedLocation);
    if (!idSavedLocation) {
      res.status(400).json({ error: 'Invalid saved location id.' });
      return;
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `DELETE FROM user_saved_locations
       WHERE id_saved_location = ? AND id_user = ?`,
      [idSavedLocation, userId]
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Saved location not found.' });
      return;
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error in deleteSavedLocation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const clearSavedLocationsByKind = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureSavedLocationsTable();

    const kind = String(req.query.kind || '').trim().toLowerCase();
    if (kind !== 'recent') {
      res.status(400).json({ error: 'Only kind=recent can be cleared in bulk.' });
      return;
    }

    await pool.execute(
      `DELETE FROM user_saved_locations
       WHERE id_user = ? AND kind = 'recent'`,
      [userId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error in clearSavedLocationsByKind:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const ensureServiceRequestTables = async () => {
  if (serviceRequestsTablesChecked) return;
  if (isDatabaseSchemaReady()) {
    serviceRequestsTablesChecked = true;
    return;
  }
  if (!shouldRunRuntimeSchemaSync()) {
    serviceRequestsTablesChecked = true;
    return;
  }

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS service_requests (
      id_request INT NOT NULL AUTO_INCREMENT,
      id_user INT NULL,
      id_service INT NOT NULL,
      description TEXT NOT NULL,
      location_text VARCHAR(255) NOT NULL,
      latitude DECIMAL(10,7) NULL,
      longitude DECIMAL(10,7) NULL,
      initial_budget DECIMAL(10,2) NULL,
      budget DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      final_budget DECIMAL(10,2) NULL,
      radius_km DECIMAL(6,2) NOT NULL DEFAULT 8.00,
      urgency_level VARCHAR(40) NOT NULL DEFAULT 'standard',
      assigned_worker_profile INT NULL,
      assigned_at TIMESTAMP NULL,
      booking_type ENUM('express', 'scheduled') NOT NULL DEFAULT 'express',
      scheduled_date DATE NULL,
      scheduled_time TIME NULL,
      scheduled_start_time DATETIME NULL,
      scheduled_end_time DATETIME NULL,
      workflow_version TINYINT UNSIGNED NOT NULL DEFAULT 1,
      client_approved_at DATETIME NULL,
      route_started_at DATETIME NULL,
      worker_arrived_at DATETIME NULL,
      work_started_at DATETIME NULL,
      work_finished_at DATETIME NULL,
      completed_at DATETIME NULL,
      status ${SERVICE_REQUEST_STATUS_ENUM} NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_request),
      KEY idx_service_requests_service (id_service),
      KEY idx_service_requests_status_created (status, created_at),
      KEY idx_service_requests_user (id_user),
      KEY idx_service_requests_assigned_worker (assigned_worker_profile),
      KEY idx_scheduled_times (booking_type, status, scheduled_start_time),
      CONSTRAINT fk_service_requests_service FOREIGN KEY (id_service) REFERENCES services(id_service) ON DELETE CASCADE,
      CONSTRAINT fk_service_requests_user FOREIGN KEY (id_user) REFERENCES users(id_user) ON DELETE SET NULL,
      CONSTRAINT fk_service_requests_assigned_worker FOREIGN KEY (assigned_worker_profile) REFERENCES worker_profiles(id_worker_profile) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    ALTER TABLE service_requests
    MODIFY COLUMN status ${SERVICE_REQUEST_STATUS_ENUM}
    NOT NULL DEFAULT 'pending'
  `);

  const [assignedColRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'service_requests'
       AND column_name IN (
         'assigned_worker_profile',
         'initial_budget',
         'final_budget',
         'assigned_at',
         'urgency_level',
         'booking_type',
         'scheduled_date',
         'scheduled_time',
         'scheduled_start_time',
         'scheduled_end_time',
         'worker_arrived_at',
         'workflow_version',
         'client_approved_at',
         'route_started_at',
         'work_started_at',
         'work_finished_at',
         'completed_at'
       )`
  );
  const requestColsCount = Number(assignedColRows[0]?.total || 0);
  if (requestColsCount < 17) {
    const [requestCols] = await pool.execute<RowDataPacket[]>(
      `SELECT COLUMN_NAME
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'service_requests'
         AND column_name IN (
           'assigned_worker_profile',
           'initial_budget',
           'final_budget',
           'assigned_at',
           'urgency_level',
           'booking_type',
           'scheduled_date',
           'scheduled_time',
           'scheduled_start_time',
           'scheduled_end_time',
           'worker_arrived_at',
           'workflow_version',
           'client_approved_at',
           'route_started_at',
           'work_started_at',
           'work_finished_at',
           'completed_at'
         )`
    );
    const requestColSet = new Set(requestCols.map((c: any) => String(c.COLUMN_NAME)));
    if (!requestColSet.has('assigned_worker_profile')) {
      await pool.execute(`ALTER TABLE service_requests ADD COLUMN assigned_worker_profile INT NULL`);
    }
    if (!requestColSet.has('initial_budget')) {
      await pool.execute(`ALTER TABLE service_requests ADD COLUMN initial_budget DECIMAL(10,2) NULL`);
    }
    if (!requestColSet.has('final_budget')) {
      await pool.execute(`ALTER TABLE service_requests ADD COLUMN final_budget DECIMAL(10,2) NULL`);
    }
    if (!requestColSet.has('assigned_at')) {
      await pool.execute(`ALTER TABLE service_requests ADD COLUMN assigned_at TIMESTAMP NULL`);
    }
    if (!requestColSet.has('urgency_level')) {
      await pool.execute(`ALTER TABLE service_requests ADD COLUMN urgency_level VARCHAR(40) NOT NULL DEFAULT 'standard'`);
    }
    if (!requestColSet.has('booking_type')) {
      await pool.execute(`ALTER TABLE service_requests ADD COLUMN booking_type ENUM('express', 'scheduled') NOT NULL DEFAULT 'express'`);
    }
    if (!requestColSet.has('scheduled_date')) {
      await pool.execute(`ALTER TABLE service_requests ADD COLUMN scheduled_date DATE NULL`);
    }
    if (!requestColSet.has('scheduled_time')) {
      await pool.execute(`ALTER TABLE service_requests ADD COLUMN scheduled_time TIME NULL`);
    }
    if (!requestColSet.has('scheduled_start_time')) {
      await pool.execute(`ALTER TABLE service_requests ADD COLUMN scheduled_start_time DATETIME NULL`);
    }
    if (!requestColSet.has('scheduled_end_time')) {
      await pool.execute(`ALTER TABLE service_requests ADD COLUMN scheduled_end_time DATETIME NULL`);
    }
    if (!requestColSet.has('worker_arrived_at')) {
      await pool.execute(`ALTER TABLE service_requests ADD COLUMN worker_arrived_at DATETIME NULL`);
    }
    if (!requestColSet.has('workflow_version')) {
      await pool.execute(`ALTER TABLE service_requests ADD COLUMN workflow_version TINYINT UNSIGNED NOT NULL DEFAULT 1`);
    }
    if (!requestColSet.has('client_approved_at')) {
      await pool.execute(`ALTER TABLE service_requests ADD COLUMN client_approved_at DATETIME NULL`);
    }
    if (!requestColSet.has('route_started_at')) {
      await pool.execute(`ALTER TABLE service_requests ADD COLUMN route_started_at DATETIME NULL`);
    }
    if (!requestColSet.has('work_started_at')) {
      await pool.execute(`ALTER TABLE service_requests ADD COLUMN work_started_at DATETIME NULL`);
    }
    if (!requestColSet.has('work_finished_at')) {
      await pool.execute(`ALTER TABLE service_requests ADD COLUMN work_finished_at DATETIME NULL`);
    }
    if (!requestColSet.has('completed_at')) {
      await pool.execute(`ALTER TABLE service_requests ADD COLUMN completed_at DATETIME NULL`);
    }
  }

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS service_request_workflow_approvals (
      id_approval INT NOT NULL AUTO_INCREMENT,
      id_request INT NOT NULL,
      action ENUM('start_work', 'finish_work', 'complete_service') NOT NULL,
      actor_role ENUM('client', 'worker') NOT NULL,
      id_user INT NOT NULL,
      approved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_approval),
      UNIQUE KEY ux_request_action_role (id_request, action, actor_role),
      KEY idx_workflow_approval_user (id_user),
      CONSTRAINT fk_workflow_approval_request FOREIGN KEY (id_request) REFERENCES service_requests(id_request) ON DELETE CASCADE,
      CONSTRAINT fk_workflow_approval_user FOREIGN KEY (id_user) REFERENCES users(id_user) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [assignedIdxRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'service_requests'
       AND index_name = 'idx_service_requests_assigned_worker'`
  );
  if (Number(assignedIdxRows[0]?.total || 0) === 0) {
    await pool.execute(`ALTER TABLE service_requests ADD KEY idx_service_requests_assigned_worker (assigned_worker_profile)`);
  }

  const [scheduledIdxRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'service_requests'
       AND index_name = 'idx_scheduled_times'`
  );
  if (Number(scheduledIdxRows[0]?.total || 0) === 0) {
    await pool.execute(`ALTER TABLE service_requests ADD KEY idx_scheduled_times (booking_type, status, scheduled_start_time)`);
  }

  const [assignedFkRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM information_schema.referential_constraints
     WHERE constraint_schema = DATABASE()
       AND table_name = 'service_requests'
       AND constraint_name = 'fk_service_requests_assigned_worker'`
  );
  if (Number(assignedFkRows[0]?.total || 0) === 0) {
    await pool.execute(
      `ALTER TABLE service_requests
       ADD CONSTRAINT fk_service_requests_assigned_worker
       FOREIGN KEY (assigned_worker_profile) REFERENCES worker_profiles(id_worker_profile)
       ON DELETE SET NULL`
    );
  }

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS service_request_images (
      id_image INT NOT NULL AUTO_INCREMENT,
      id_request INT NOT NULL,
      image_url VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_image),
      KEY idx_service_request_images_request (id_request),
      CONSTRAINT fk_service_request_images_request FOREIGN KEY (id_request) REFERENCES service_requests(id_request) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS service_request_workers (
      id_request INT NOT NULL,
      id_worker_profile INT NOT NULL,
      distance_km DECIMAL(8,3) NULL,
      status ENUM('new', 'accepted', 'rejected', 'expired') NOT NULL DEFAULT 'new',
      proposed_budget DECIMAL(10,2) NULL,
      counter_message VARCHAR(255) NULL,
      counter_status ENUM('pending', 'accepted', 'declined') NULL,
      notified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_request, id_worker_profile),
      KEY idx_service_request_workers_worker_status (id_worker_profile, status, notified_at),
      KEY idx_service_request_workers_request (id_request),
      CONSTRAINT fk_service_request_workers_request FOREIGN KEY (id_request) REFERENCES service_requests(id_request) ON DELETE CASCADE,
      CONSTRAINT fk_service_request_workers_worker FOREIGN KEY (id_worker_profile) REFERENCES worker_profiles(id_worker_profile) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS worker_availabilities (
      id_availability INT NOT NULL AUTO_INCREMENT,
      id_worker_profile INT NOT NULL,
      day_of_week INT NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      PRIMARY KEY (id_availability),
      UNIQUE KEY uniq_worker_day_slot (id_worker_profile, day_of_week, start_time, end_time),
      KEY idx_worker_availability_lookup (day_of_week, is_active, start_time, end_time),
      CONSTRAINT fk_worker_availability_profile FOREIGN KEY (id_worker_profile) REFERENCES worker_profiles(id_worker_profile) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS service_request_chat_messages (
      id_message INT NOT NULL AUTO_INCREMENT,
      id_request INT NOT NULL,
      sender_role ENUM('client','worker') NOT NULL,
      id_user INT NOT NULL,
      id_worker_profile INT NULL,
      message VARCHAR(500) NULL,
      image_url VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_message),
      KEY idx_sr_chat_request_created (id_request, created_at),
      KEY idx_sr_chat_sender (id_user),
      CONSTRAINT fk_sr_chat_request FOREIGN KEY (id_request) REFERENCES service_requests(id_request) ON DELETE CASCADE,
      CONSTRAINT fk_sr_chat_user FOREIGN KEY (id_user) REFERENCES users(id_user) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS service_request_ratings (
      id_rating INT NOT NULL AUTO_INCREMENT,
      id_request INT NOT NULL,
      id_client_user INT NOT NULL,
      id_worker_profile INT NOT NULL,
      punctuality TINYINT NOT NULL,
      quality TINYINT NOT NULL,
      price_fairness TINYINT NOT NULL,
      comment VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_rating),
      UNIQUE KEY uniq_sr_rating_request (id_request),
      KEY idx_sr_rating_worker (id_worker_profile),
      CONSTRAINT fk_sr_rating_request FOREIGN KEY (id_request) REFERENCES service_requests(id_request) ON DELETE CASCADE,
      CONSTRAINT fk_sr_rating_client FOREIGN KEY (id_client_user) REFERENCES users(id_user) ON DELETE CASCADE,
      CONSTRAINT fk_sr_rating_worker FOREIGN KEY (id_worker_profile) REFERENCES worker_profiles(id_worker_profile) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS service_request_payments (
      id_payment INT NOT NULL AUTO_INCREMENT,
      id_request INT NOT NULL,
      provider VARCHAR(50) NOT NULL DEFAULT 'sandbox',
      checkout_reference VARCHAR(64) NOT NULL,
      provider_payment_id VARCHAR(120) NULL,
      provider_capture_id VARCHAR(120) NULL,
      currency_code VARCHAR(8) NOT NULL DEFAULT 'USD',
      amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      platform_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      worker_payout DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      payment_status ENUM('pending', 'paid', 'released', 'refunded', 'failed', 'cancelled') NOT NULL DEFAULT 'pending',
      paid_at TIMESTAMP NULL,
      released_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_payment),
      UNIQUE KEY uniq_sr_payment_request (id_request),
      UNIQUE KEY uniq_sr_payment_reference (checkout_reference),
      KEY idx_sr_payment_status (payment_status, created_at),
      CONSTRAINT fk_sr_payment_request FOREIGN KEY (id_request) REFERENCES service_requests(id_request) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [workerCols] = await pool.execute<RowDataPacket[]>(
    `SELECT COLUMN_NAME
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'service_request_workers'
      AND column_name IN ('proposed_budget', 'counter_message', 'counter_status')`
  );
  const workerColSet = new Set(workerCols.map((c: any) => String(c.COLUMN_NAME)));
  if (!workerColSet.has('proposed_budget')) {
    await pool.execute(`ALTER TABLE service_request_workers ADD COLUMN proposed_budget DECIMAL(10,2) NULL`);
  }
  if (!workerColSet.has('counter_message')) {
    await pool.execute(`ALTER TABLE service_request_workers ADD COLUMN counter_message VARCHAR(255) NULL`);
  }
  if (!workerColSet.has('counter_status')) {
    await pool.execute(
      `ALTER TABLE service_request_workers
      ADD COLUMN counter_status ENUM('pending', 'accepted', 'declined') NULL`
    );
  }

  const [paymentCols] = await pool.execute<RowDataPacket[]>(
    `SELECT COLUMN_NAME
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'service_request_payments'
       AND column_name IN ('provider_capture_id', 'currency_code')`
  );
  const paymentColSet = new Set(paymentCols.map((c: any) => String(c.COLUMN_NAME)));
  if (!paymentColSet.has('provider_capture_id')) {
    await pool.execute(`ALTER TABLE service_request_payments ADD COLUMN provider_capture_id VARCHAR(120) NULL AFTER provider_payment_id`);
  }
  if (!paymentColSet.has('currency_code')) {
    await pool.execute(`ALTER TABLE service_request_payments ADD COLUMN currency_code VARCHAR(8) NOT NULL DEFAULT 'USD' AFTER provider_capture_id`);
  }

  await ensureCommissionEngineTables();
  await ensurePaymentLedgerTables();
  serviceRequestsTablesChecked = true;
};

const removeUploadedFiles = (files: Express.Multer.File[]) => {
  for (const file of files) {
    if (!file?.filename) continue;
    deleteUploadIfExists(file.filename, 'protected');
  }
};

const bulkInsertServiceRequestImages = async (idRequest: number, files: Express.Multer.File[]) => {
  if (files.length === 0) return;
  await pool.execute(
    `INSERT INTO service_request_images (id_request, image_url)
     VALUES ${files.map(() => '(?, ?)').join(', ')}`,
    files.flatMap((file) => [idRequest, file.filename])
  );
};

const bulkInsertRequestWorkerCandidates = async (
  executor: Pick<typeof pool, 'execute'>,
  idRequest: number,
  rows: RowDataPacket[]
) => {
  if (rows.length === 0) return;
  await executor.execute(
    `INSERT INTO service_request_workers (id_request, id_worker_profile, distance_km, status)
     VALUES ${rows.map(() => "(?, ?, ?, 'new')").join(', ')}`,
    rows.flatMap((row) => [
      idRequest,
      Number(row.id_worker_profile),
      row.distance_km != null ? Number(row.distance_km) : null,
    ])
  );
};

export const createServiceRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  const files = ((req.files as Express.Multer.File[]) || []).slice(0, 5);

  try {
    const idUser = req.user?.user_id;
    if (!idUser) {
      removeUploadedFiles(files);
      res.status(401).json({ error: 'You must be logged in to create a request.' });
      return;
    }

    await ensureServiceRequestTables();
    await ensureWorkerGeoColumns();

    const idService = Number(req.body?.id_service);
    const description = String(req.body?.description || '').trim();
    const locationText = String(req.body?.location || '').trim();
    const budgetRaw = Number(req.body?.budget);
    const budget = Number.isFinite(budgetRaw) && budgetRaw > 0 ? Math.min(budgetRaw, 1000) : 0;
    const latitudeRaw = req.body?.lat != null && req.body?.lat !== '' ? Number(req.body?.lat) : null;
    const longitudeRaw = req.body?.lng != null && req.body?.lng !== '' ? Number(req.body?.lng) : null;
    const radiusRaw = Number(req.body?.radius_km ?? 8);
    const radiusKm = Number.isFinite(radiusRaw) && radiusRaw > 0 ? Math.min(radiusRaw, 50) : 8;
    const urgencyLevel = normalizeUrgencyLevel(req.body?.urgency_level);
    let schedule;
    try {
      schedule = parseScheduledRequestTime(req.body);
    } catch (error: any) {
      removeUploadedFiles(files);
      res.status(400).json({ error: error?.message || 'Invalid scheduled visit time.' });
      return;
    }

    if (!idService || Number.isNaN(idService)) {
      removeUploadedFiles(files);
      res.status(400).json({ error: 'id_service is required.' });
      return;
    }
    const cleanDescription = sanitizeMessage(description, 1000);
    const cleanLocation = sanitizeStrictText(locationText, 255);
    if (!cleanDescription || cleanDescription.length < 10) {
      removeUploadedFiles(files);
      res.status(400).json({ error: 'Description must be between 10 and 1000 characters.' });
      return;
    }
    if (!cleanLocation) {
      removeUploadedFiles(files);
      res.status(400).json({ error: 'Location is required (max 255 chars).' });
      return;
    }

    // Re-assign sanitized values for DB insert
    const finalDescription = cleanDescription;
    const finalLocationText = cleanLocation;

    const resolvedLocation = await resolveRequestLocation(locationText, latitudeRaw, longitudeRaw);
    if (!resolvedLocation) {
      removeUploadedFiles(files);
      res.status(400).json({
        error: 'Enter a valid address, use Detect my location, or paste coordinates like 13.6841, -89.2872.',
      });
      return;
    }
    const latitude = resolvedLocation.lat;
    const longitude = resolvedLocation.lng;

    if (!Number.isFinite(budget) || budget <= 0 || budget > 1000) {
      removeUploadedFiles(files);
      res.status(400).json({ error: 'Budget must be between 0.01 and 1000.00.' });
      return;
    }
    const initialBudget = budget; // force initial_budget = budget (no mass assignment)
    if (files.length === 0) {
      res.status(400).json({ error: 'At least one problem image is required.' });
      return;
    }

    const invalidMime = files.find(
      (file) => !['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.mimetype)
    );
    if (invalidMime) {
      removeUploadedFiles(files);
      res.status(400).json({ error: 'Only PNG/JPG/WEBP images are allowed.' });
      return;
    }

    const [svcRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_service, name FROM services WHERE id_service = ? AND is_active = 1 LIMIT 1`,
      [idService]
    );
    if (svcRows.length === 0) {
      removeUploadedFiles(files);
      res.status(400).json({ error: 'Service is not available.' });
      return;
    }

    const [insertRequest] = await pool.execute<ResultSetHeader>(
      `INSERT INTO service_requests
       (
         id_user,
         id_service,
         description,
         location_text,
         latitude,
         longitude,
         initial_budget,
         budget,
         final_budget,
         radius_km,
         urgency_level,
         booking_type,
         scheduled_date,
         scheduled_time,
         scheduled_start_time,
         scheduled_end_time,
         workflow_version,
         status
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 2, 'pending')`,
      [
        idUser,
        idService,
        finalDescription,
        finalLocationText,
        latitude,
        longitude,
        initialBudget,
        budget,
        radiusKm,
        urgencyLevel,
        schedule.bookingType,
        schedule.scheduledDate,
        schedule.scheduledTime,
        schedule.scheduledStartTime,
        schedule.scheduledEndTime,
      ]
    );

    const idRequest = Number(insertRequest.insertId);

    await bulkInsertServiceRequestImages(idRequest, files);

    if (latitude != null && longitude != null) {
      const boundsFilter = getWorkerBoundsFilter(getProximityBounds(latitude, longitude, radiusKm));
      const availability = getScheduledAvailabilityLookup(schedule);
      const availabilityJoin = availability
        ? `INNER JOIN worker_availabilities wa
             ON wa.id_worker_profile = wp.id_worker_profile
            AND wa.is_active = 1
            AND wa.day_of_week = ?
            AND wa.start_time <= ?
            AND wa.end_time >= ?`
        : '';
      const availabilityParams = availability
        ? [availability.dayOfWeek, availability.startTime, availability.endTime]
        : [];

      const [nearRows] = await pool.execute<RowDataPacket[]>(
        `SELECT
           wp.id_worker_profile,
           wp.id_user AS worker_user_id,
           wp.coverage_km,
           (ST_Distance_Sphere(point(wp.longitude, wp.latitude), point(?, ?)) / 1000) AS distance_km
         FROM worker_profiles wp
         INNER JOIN users u ON u.id_user = wp.id_user
         INNER JOIN worker_services ws ON ws.id_worker_profile = wp.id_worker_profile
         ${availabilityJoin}
         WHERE u.rol = 'worker'
           AND wp.is_verified = 1
           AND ws.id_service = ?
           AND wp.latitude IS NOT NULL
           AND wp.longitude IS NOT NULL
           ${boundsFilter.sql}
         HAVING distance_km <= ? AND distance_km <= wp.coverage_km
         ORDER BY distance_km ASC
         LIMIT 50`,
        [longitude, latitude, ...availabilityParams, idService, ...boundsFilter.params, radiusKm]
      );

      await bulkInsertRequestWorkerCandidates(pool, idRequest, nearRows);
      await Promise.all(
        nearRows.map((row) =>
          createUserNotification({
            userId: Number(row.worker_user_id),
            eventType: 'request_available',
            title: 'New request nearby',
            message: `A new service request is available ${Number(row.distance_km || 0).toFixed(1)} km away.`,
            tone: 'info',
            requestId: idRequest,
            actionUrl: '/pro-dashboard',
            dedupeKey: `request-${idRequest}-available-worker-${Number(row.id_worker_profile)}`,
            metadata: {
              request_status: 'pending',
              distance_km: Number(row.distance_km || 0),
              booking_type: schedule.bookingType,
              scheduled_start_time: schedule.scheduledStartTime,
            },
          })
        )
      );
    }

    await notifyAdmins({
      eventType: 'admin_request_created',
      title: 'New service request',
      message: `Request #${idRequest} for ${svcRows[0].name || 'a service'} was created in ${locationText}.`,
      tone: 'info',
      actionUrl: `/admin-dashboard/requests?request=${idRequest}`,
      dedupeKey: `admin-request-created-${idRequest}`,
      metadata: { requestId: idRequest, serviceId: idService, urgencyLevel },
    });

    res.status(201).json({
      success: true,
      message: 'Service request created successfully.',
      request: {
        id_request: idRequest,
        id_service: idService,
        id_user: idUser,
        radius_km: radiusKm,
        budget,
        location: locationText,
        booking_type: schedule.bookingType,
        scheduled_date: schedule.scheduledDate,
        scheduled_time: schedule.scheduledTime,
        scheduled_start_time: schedule.scheduledStartTime,
        scheduled_end_time: schedule.scheduledEndTime,
        status: 'pending',
        images: files.map((f) => ({
          file_name: f.filename,
          url: buildProtectedAssetUrl(req, f.filename),
        })),
      },
    });
  } catch (error: any) {
    console.error('Error in createServiceRequest:', error);
    removeUploadedFiles(files);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getMyServiceRequests = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();

    await autoReassignStaleAssignedRequests();

    const requestedStatus = String(req.query.status || 'all').toLowerCase();
    const allowed = new Set(['all', 'pending', 'assigned', 'route_in_progress', 'arrived', 'start_pending', 'in_progress', 'finish_pending', 'payment_pending', 'paid', 'completion_pending', 'awaiting_confirmation', 'done', 'cancelled']);
    if (!allowed.has(requestedStatus)) {
      res.status(400).json({ error: 'Invalid status filter.' });
      return;
    }

    const whereParts: string[] = ['sr.id_user = ?'];
    const params: any[] = [userId];

    if (requestedStatus !== 'all') {
      if (requestedStatus === 'pending') {
        whereParts.push(`sr.status IN ('pending', 'open')`);
      } else {
        whereParts.push(`sr.status = ?`);
        params.push(requestedStatus);
      }
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         sr.id_request,
         sr.id_service,
         sr.description,
         sr.location_text,
         sr.latitude,
         sr.longitude,
         sr.initial_budget,
         sr.budget,
         sr.final_budget,
         sr.radius_km,
         sr.urgency_level,
         sr.booking_type,
         sr.scheduled_date,
         sr.scheduled_time,
         sr.scheduled_start_time,
         sr.scheduled_end_time,
         sr.workflow_version,
         sr.client_approved_at,
         sr.route_started_at,
         sr.worker_arrived_at,
         sr.work_started_at,
         sr.work_finished_at,
         sr.completed_at,
         sr.status,
         sr.workflow_version,
         sr.created_at,
         s.name AS service_name,
         s.icon AS service_icon,
         wp.id_worker_profile AS assigned_worker_profile,
         wp.latitude AS worker_latitude,
         wp.longitude AS worker_longitude,
         wp.is_online AS worker_is_online,
         wp.bio AS worker_bio,
         u2.name AS worker_name,
         u2.lastname AS worker_lastname,
         u2.phone_number AS worker_phone_number,
         u2.profile_image AS worker_profile_image,
         srp.provider AS payment_provider,
         srp.checkout_reference,
         srp.currency_code AS payment_currency_code,
         srp.amount AS payment_amount,
         srp.platform_fee AS payment_platform_fee,
         srp.worker_payout AS payment_worker_payout,
         srp.commission_rate AS payment_commission_rate,
         srp.commission_snapshot_json AS payment_commission_snapshot_json,
         srp.promo_code AS payment_promo_code,
         srp.payment_status,
         srp.paid_at,
         srp.released_at,
         srw_assigned.proposed_budget,
         srw_assigned.counter_message,
         srw_assigned.counter_status,
         MAX(CASE WHEN sra.action = 'start_work' AND sra.actor_role = 'client' THEN sra.approved_at END) AS start_client_approved_at,
         MAX(CASE WHEN sra.action = 'start_work' AND sra.actor_role = 'worker' THEN sra.approved_at END) AS start_worker_approved_at,
         MAX(CASE WHEN sra.action = 'finish_work' AND sra.actor_role = 'client' THEN sra.approved_at END) AS finish_client_approved_at,
         MAX(CASE WHEN sra.action = 'finish_work' AND sra.actor_role = 'worker' THEN sra.approved_at END) AS finish_worker_approved_at,
         MAX(CASE WHEN sra.action = 'complete_service' AND sra.actor_role = 'client' THEN sra.approved_at END) AS complete_client_approved_at,
         MAX(CASE WHEN sra.action = 'complete_service' AND sra.actor_role = 'worker' THEN sra.approved_at END) AS complete_worker_approved_at,
         GROUP_CONCAT(DISTINCT sri.image_url ORDER BY sri.id_image ASC SEPARATOR '||') AS image_urls
       FROM service_requests sr
       INNER JOIN services s ON s.id_service = sr.id_service
       LEFT JOIN worker_profiles wp ON wp.id_worker_profile = sr.assigned_worker_profile
       LEFT JOIN users u2 ON u2.id_user = wp.id_user
       LEFT JOIN service_request_payments srp ON srp.id_request = sr.id_request
       LEFT JOIN service_request_workers srw_assigned
        ON srw_assigned.id_request = sr.id_request
       AND srw_assigned.id_worker_profile = sr.assigned_worker_profile
       LEFT JOIN service_request_workflow_approvals sra ON sra.id_request = sr.id_request
       LEFT JOIN service_request_images sri ON sri.id_request = sr.id_request
       WHERE ${whereParts.join(' AND ')}
       GROUP BY
         sr.id_request, sr.id_service, sr.description, sr.location_text, sr.latitude, sr.longitude,
         sr.initial_budget, sr.budget, sr.final_budget, sr.radius_km, sr.urgency_level, sr.status, sr.created_at, s.name, s.icon, wp.id_worker_profile, wp.latitude, wp.longitude, wp.is_online, wp.bio, u2.name, u2.lastname, u2.phone_number, u2.profile_image,
         sr.booking_type, sr.scheduled_date, sr.scheduled_time, sr.scheduled_start_time, sr.scheduled_end_time,
         sr.workflow_version, sr.client_approved_at, sr.route_started_at, sr.worker_arrived_at,
         sr.work_started_at, sr.work_finished_at, sr.completed_at,
        srp.provider, srp.checkout_reference, srp.currency_code, srp.amount, srp.platform_fee, srp.worker_payout, srp.commission_rate, srp.commission_snapshot_json, srp.promo_code, srp.payment_status, srp.paid_at, srp.released_at,
         srw_assigned.proposed_budget, srw_assigned.counter_message, srw_assigned.counter_status
       ORDER BY sr.created_at DESC
       LIMIT 100`,
      params
    );

    const requests = rows.map((row: any) => ({
      id_request: Number(row.id_request),
      id_service: Number(row.id_service),
      service_name: row.service_name,
      service_icon: row.service_icon || null,
      description: row.description,
      location_text: row.location_text,
      latitude: row.latitude != null ? Number(row.latitude) : null,
      longitude: row.longitude != null ? Number(row.longitude) : null,
      initial_budget: row.initial_budget != null ? Number(row.initial_budget) : Number(row.budget || 0),
      budget: Number(row.budget || 0),
      final_budget: row.final_budget != null ? Number(row.final_budget) : null,
      radius_km: Number(row.radius_km || 8),
      urgency_level: normalizeUrgencyLevel(row.urgency_level),
      booking_type: normalizeBookingType(row.booking_type),
      scheduled_date: row.scheduled_date || null,
      scheduled_time: row.scheduled_time || null,
      scheduled_start_time: row.scheduled_start_time || null,
      scheduled_end_time: row.scheduled_end_time || null,
      workflow_version: Number(row.workflow_version || 1),
      client_approved_at: row.client_approved_at || null,
      route_started_at: row.route_started_at || null,
      worker_arrived_at: row.worker_arrived_at || null,
      work_started_at: row.work_started_at || null,
      work_finished_at: row.work_finished_at || null,
      completed_at: row.completed_at || null,
      approvals: {
        start_work: {
          client: Boolean(row.start_client_approved_at),
          worker: Boolean(row.start_worker_approved_at),
        },
        finish_work: {
          client: Boolean(row.finish_client_approved_at),
          worker: Boolean(row.finish_worker_approved_at),
        },
        complete_service: {
          client: Boolean(row.complete_client_approved_at),
          worker: Boolean(row.complete_worker_approved_at),
        },
      },
      status: toPublicRequestStatus(row.status),
      created_at: row.created_at,
      assigned_worker:
        row.assigned_worker_profile != null
          ? {
              id_worker_profile: Number(row.assigned_worker_profile),
              name: `${row.worker_name || ''} ${row.worker_lastname || ''}`.trim(),
              phone_number: row.worker_phone_number || null,
              bio: row.worker_bio || '',
              latitude: row.worker_latitude != null ? Number(row.worker_latitude) : null,
              longitude: row.worker_longitude != null ? Number(row.worker_longitude) : null,
              is_online: row.worker_is_online != null ? Boolean(Number(row.worker_is_online)) : null,
              profile_image_url: buildAssetUrl(req, row.worker_profile_image || null),
            }
          : null,
      proposed_budget: row.proposed_budget != null ? Number(row.proposed_budget) : null,
      counter_message: row.counter_message || null,
      counter_status: row.counter_status || null,
      payment:
        row.payment_provider || row.payment_status || row.checkout_reference
          ? {
              provider: row.payment_provider || 'sandbox',
              checkout_reference: row.checkout_reference || null,
              currency_code: row.payment_currency_code || 'USD',
              amount: row.payment_amount != null ? Number(row.payment_amount) : getRequestChargeAmount(row),
              platform_fee: row.payment_platform_fee != null ? Number(row.payment_platform_fee) : null,
              worker_payout: row.payment_worker_payout != null ? Number(row.payment_worker_payout) : null,
              commission_rate: row.payment_commission_rate != null ? Number(row.payment_commission_rate) : null,
              commission_snapshot: parseCommissionSnapshot(row.payment_commission_snapshot_json),
              promo_code: row.payment_promo_code ? normalizePromoCode(row.payment_promo_code) : null,
              status: row.payment_status || 'pending',
              paid_at: row.paid_at || null,
              released_at: row.released_at || null,
            }
          : null,
      images:
        typeof row.image_urls === 'string' && row.image_urls.length > 0
          ? String(row.image_urls)
              .split('||')
              .filter(Boolean)
              .map((name: string) => ({
                file_name: name,
                url: buildProtectedAssetUrl(req, name),
              }))
          : [],
    }));

    res.json({ success: true, requests });
  } catch (error: any) {
    console.error('Error in getMyServiceRequests:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getRequestAssignedWorkerProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();

    const idRequest = Number(req.params.idRequest);
    if (!idRequest || Number.isNaN(idRequest)) {
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }

    const [requestRows] = await pool.execute<RowDataPacket[]>(
      `SELECT sr.id_request, sr.assigned_worker_profile
       FROM service_requests sr
       WHERE sr.id_request = ? AND sr.id_user = ?
       LIMIT 1`,
      [idRequest, userId]
    );

    if (requestRows.length === 0) {
      res.status(404).json({ error: 'Request not found.' });
      return;
    }

    const assignedWorkerProfile = requestRows[0].assigned_worker_profile != null
      ? Number(requestRows[0].assigned_worker_profile)
      : null;

    if (!assignedWorkerProfile) {
      res.status(409).json({ error: 'This request does not have an assigned worker yet.' });
      return;
    }

    const [workerRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         wp.id_worker_profile,
         wp.bio,
         wp.is_online,
         u.name,
         u.lastname,
         u.phone_number,
         u.profile_image,
         u.created_at
       FROM worker_profiles wp
       INNER JOIN users u ON u.id_user = wp.id_user
       WHERE wp.id_worker_profile = ?
       LIMIT 1`,
      [assignedWorkerProfile]
    );

    if (workerRows.length === 0) {
      res.status(404).json({ error: 'Assigned worker profile not found.' });
      return;
    }

    const worker = workerRows[0];

    const [serviceRows] = await pool.execute<RowDataPacket[]>(
      `SELECT s.name
       FROM worker_services ws
       INNER JOIN services s ON s.id_service = ws.id_service
       WHERE ws.id_worker_profile = ?
       ORDER BY s.name ASC`,
      [assignedWorkerProfile]
    );

    const createdAt = worker.created_at ? new Date(worker.created_at) : null;
    const now = new Date();
    const diffMs = createdAt ? now.getTime() - createdAt.getTime() : null;
    const approxYears = diffMs != null && diffMs > 0
      ? Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365.25))
      : null;
    const experienceLabel =
      approxYears == null
        ? 'Experience not available'
        : approxYears < 1
          ? 'Less than 1 year'
          : `${approxYears}+ year${approxYears === 1 ? '' : 's'}`;

    const [portfolioRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_photo, image_url, description, uploaded_at
       FROM worker_portfolio
       WHERE id_worker_profile = ?
       ORDER BY uploaded_at DESC
       LIMIT 10`,
      [assignedWorkerProfile]
    );

    const [statsRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         COALESCE(AVG((rr.punctuality + rr.quality + rr.price_fairness) / 3), NULL) AS rating_average,
         COUNT(DISTINCT rr.id_rating) AS rating_count,
         COUNT(DISTINCT CASE WHEN sr.status = 'done' THEN sr.id_request END) AS completed_jobs
       FROM worker_profiles wp
       LEFT JOIN service_request_ratings rr
         ON rr.id_worker_profile = wp.id_worker_profile
       LEFT JOIN service_requests sr
         ON sr.assigned_worker_profile = wp.id_worker_profile
       WHERE wp.id_worker_profile = ?
       GROUP BY wp.id_worker_profile
       LIMIT 1`,
      [assignedWorkerProfile]
    );
    const workerStats = statsRows[0] || null;

    res.json({
      success: true,
      worker: {
        id_worker_profile: assignedWorkerProfile,
        name: `${worker.name || ''} ${worker.lastname || ''}`.trim(),
        phone_number: worker.phone_number || null,
        bio: worker.bio || '',
        is_online: worker.is_online != null ? Boolean(Number(worker.is_online)) : null,
        profile_image_url: buildAssetUrl(req, worker.profile_image || null),
        years_of_experience: approxYears != null && approxYears >= 1 ? approxYears : null,
        experience_label: experienceLabel,
        rating_average: workerStats?.rating_average != null ? Number(workerStats.rating_average) : null,
        rating_count: workerStats?.rating_count != null ? Number(workerStats.rating_count) : 0,
        completed_jobs: workerStats?.completed_jobs != null ? Number(workerStats.completed_jobs) : 0,
        services_offered: serviceRows
          .map((item) => String(item.name || '').trim())
          .filter(Boolean),
      },
      portfolio: portfolioRows.map((item) => ({
        id_photo: Number(item.id_photo),
        description: item.description || '',
        uploaded_at: item.uploaded_at || null,
        image_url: buildAssetUrl(req, item.image_url || null),
      })),
    });
  } catch (error: any) {
    console.error('Error in getRequestAssignedWorkerProfile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const cancelServiceRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();

    const idRequest = Number(req.params.idRequest);
    if (!idRequest || Number.isNaN(idRequest)) {
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }

    await connection.beginTransaction();

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT id_request, status
       FROM service_requests
       WHERE id_request = ? AND id_user = ?
       LIMIT 1
       FOR UPDATE`,
      [idRequest, userId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      res.status(404).json({ error: 'Request not found.' });
      return;
    }

    const currentStatus = String(rows[0].status || '').toLowerCase();

    if (currentStatus === 'cancelled') {
      await connection.rollback();
      res.status(409).json({ error: 'This request is already cancelled.' });
      return;
    }

    if (currentStatus === 'done') {
      await connection.rollback();
      res.status(409).json({ error: 'Completed requests cannot be cancelled.' });
      return;
    }

    if (currentStatus === 'in_progress') {
      await connection.rollback();
      res.status(409).json({ error: 'This request is already in progress and can no longer be cancelled.' });
      return;
    }

    if (!['open', 'pending', 'assigned', 'payment_pending'].includes(currentStatus)) {
      await connection.rollback();
      res.status(409).json({ error: 'This request cannot be cancelled in its current state.' });
      return;
    }

    await connection.execute(
      `UPDATE service_requests
       SET status = 'cancelled',
           assigned_worker_profile = NULL,
           assigned_at = NULL,
           worker_arrived_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ?`,
      [idRequest]
    );

    await connection.execute(
      `UPDATE service_request_workers
       SET status = CASE WHEN status = 'rejected' THEN 'rejected' ELSE 'expired' END,
           counter_status = CASE WHEN counter_status = 'pending' THEN 'declined' ELSE counter_status END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ?`,
      [idRequest]
    );

    await connection.execute(
      `UPDATE service_request_payments
       SET payment_status = CASE WHEN payment_status = 'paid' THEN payment_status ELSE 'cancelled' END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ?`,
      [idRequest]
    );

    await connection.commit();

    await recordSystemEvent({
      level: 'info',
      component: 'services',
      eventType: 'request_cancelled',
      message: 'Service request cancelled by client.',
      metadata: { requestId: idRequest, userId },
    }).catch(() => undefined);

    res.json({
      success: true,
      message: 'Request cancelled successfully.',
      id_request: idRequest,
      status: 'cancelled',
    });
  } catch (error: any) {
    try {
      await connection.rollback();
    } catch {
      // ignore rollback errors
    }
    console.error('Error in cancelServiceRequest:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

export const autoReassignStaleAssignedRequests = async () => {
  await ensureServiceRequestTables();
  await ensureWorkerGeoColumns();

  const timeoutMinutes = Math.max(1, Number(process.env.WORKER_RESPONSE_TIMEOUT_MINUTES || 10));
  const [staleRows] = await pool.execute<RowDataPacket[]>(
    `SELECT id_request, id_service, latitude, longitude, radius_km, assigned_worker_profile
     FROM service_requests
     WHERE status = 'assigned'
       AND COALESCE(booking_type, 'express') = 'express'
       AND assigned_worker_profile IS NOT NULL
       AND assigned_at IS NOT NULL
       AND assigned_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? MINUTE)
     ORDER BY assigned_at ASC
     LIMIT 50`,
    [timeoutMinutes]
  );

  for (const stale of staleRows) {
    const idRequest = Number(stale.id_request);
    const prevWorker = Number(stale.assigned_worker_profile);
    const idService = Number(stale.id_service);
    const lat = stale.latitude != null ? Number(stale.latitude) : null;
    const lng = stale.longitude != null ? Number(stale.longitude) : null;
    const radiusKm = Number(stale.radius_km || 8);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [lockRows] = await connection.execute<RowDataPacket[]>(
        `SELECT id_request, status, assigned_worker_profile
         FROM service_requests
         WHERE id_request = ?
         LIMIT 1
         FOR UPDATE`,
        [idRequest]
      );
      if (lockRows.length === 0 || lockRows[0].status !== 'assigned') {
        await connection.rollback();
        continue;
      }

      await connection.execute(
        `UPDATE service_request_workers
         SET status = 'expired',
             counter_status = CASE WHEN counter_status = 'pending' THEN 'declined' ELSE counter_status END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id_request = ? AND id_worker_profile = ?`,
        [idRequest, prevWorker]
      );

      await connection.execute(
        `UPDATE service_requests
         SET status = 'pending',
             assigned_worker_profile = NULL,
             assigned_at = NULL,
             worker_arrived_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id_request = ?`,
        [idRequest]
      );

      if (lat != null && lng != null && idService > 0) {
        const boundsFilter = getWorkerBoundsFilter(getProximityBounds(lat, lng, radiusKm));
        const [nearRows] = await connection.execute<RowDataPacket[]>(
          `SELECT
             wp.id_worker_profile,
             wp.coverage_km,
             (ST_Distance_Sphere(point(wp.longitude, wp.latitude), point(?, ?)) / 1000) AS distance_km
           FROM worker_profiles wp
           INNER JOIN users u ON u.id_user = wp.id_user
           INNER JOIN worker_services ws ON ws.id_worker_profile = wp.id_worker_profile
           LEFT JOIN service_request_workers srw
             ON srw.id_request = ? AND srw.id_worker_profile = wp.id_worker_profile
           WHERE u.rol = 'worker'
             AND wp.is_verified = 1
             AND ws.id_service = ?
             AND wp.latitude IS NOT NULL
             AND wp.longitude IS NOT NULL
             ${boundsFilter.sql}
             AND wp.id_worker_profile <> ?
             AND srw.id_request IS NULL
           HAVING distance_km <= ? AND distance_km <= wp.coverage_km
           ORDER BY distance_km ASC
           LIMIT 50`,
          [lng, lat, idRequest, idService, ...boundsFilter.params, prevWorker, radiusKm]
        );

        await bulkInsertRequestWorkerCandidates(connection, idRequest, nearRows);
      }

      await connection.commit();
    } catch {
      await connection.rollback();
    } finally {
      connection.release();
    }
  }
};

const resolveRequestParticipant = async (idRequest: number, userId: number) => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       sr.id_request,
       sr.id_user AS client_user_id,
       sr.status AS request_status,
       sr.assigned_worker_profile,
       wp.id_user AS worker_user_id
     FROM service_requests sr
     INNER JOIN users active_user
       ON active_user.id_user = ?
      AND active_user.is_active = 1
     LEFT JOIN worker_profiles wp ON wp.id_worker_profile = sr.assigned_worker_profile
     WHERE sr.id_request = ?
     LIMIT 1`,
    [userId, idRequest]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  if (Number(row.client_user_id) === userId) {
    return {
      role: 'client' as const,
      clientUserId: Number(row.client_user_id),
      workerUserId: row.worker_user_id != null ? Number(row.worker_user_id) : null,
      assignedWorkerProfile: row.assigned_worker_profile != null ? Number(row.assigned_worker_profile) : null,
      requestStatus: String(row.request_status || '').toLowerCase(),
    };
  }
  if (row.worker_user_id != null && Number(row.worker_user_id) === userId) {
    return {
      role: 'worker' as const,
      clientUserId: Number(row.client_user_id),
      workerUserId: Number(row.worker_user_id),
      assignedWorkerProfile: row.assigned_worker_profile != null ? Number(row.assigned_worker_profile) : null,
      requestStatus: String(row.request_status || '').toLowerCase(),
    };
  }
  return null;
};

const mapRequestChatRow = (req: Request, row: any) => ({
  id_message: Number(row.id_message),
  id_request: Number(row.id_request),
  sender_role: row.sender_role,
  id_user: Number(row.id_user),
  id_worker_profile: row.id_worker_profile != null ? Number(row.id_worker_profile) : null,
  message: row.message || null,
  image_url: buildProtectedAssetUrl(req, row.image_url || null),
  created_at: row.created_at,
});

export const getRequestChat = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    await ensureServiceRequestTables();

    const idRequest = Number(req.params.idRequest);
    if (!idRequest) {
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }

    const participant = await resolveRequestParticipant(idRequest, userId);
    if (!participant) {
      await recordSystemEvent({
        level: 'warning',
        component: 'services',
        eventType: 'chat_access_denied',
        message: 'Chat access denied (ownership failed).',
        metadata: { requestId: idRequest, userId },
      }).catch(() => undefined);
      res.status(403).json({ error: 'Access denied for this request chat.' });
      return;
    }
    if (!participant.assignedWorkerProfile || !CHAT_ENABLED_REQUEST_STATUSES.includes(participant.requestStatus)) {
      res.status(409).json({ error: 'Chat is available only after a worker accepts the request.' });
      return;
    }

    const afterId = Math.max(0, Number(req.query?.after_id || 0));
    const limit = afterId > 0 ? 200 : 500;

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_message, id_request, sender_role, id_user, id_worker_profile, message, image_url, created_at
       FROM service_request_chat_messages
       WHERE id_request = ?
         AND (? = 0 OR id_message > ?)
       ORDER BY created_at ASC, id_message ASC
       LIMIT ${limit}`,
      [idRequest, afterId, afterId]
    );

    const latestMessageId =
      rows.length > 0
        ? Number(rows[rows.length - 1].id_message)
        : afterId;

    res.json({
      success: true,
      latest_message_id: latestMessageId,
      incremental: afterId > 0,
      chat: rows.map((row: any) => mapRequestChatRow(req, row)),
    });
  } catch (error: any) {
    console.error('Error in getRequestChat:', error);
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(500).json({ error: isDev ? String(error?.message || error) : 'Internal server error' });
  }
};

export const postRequestChatMessage = async (req: AuthRequest, res: Response): Promise<void> => {
  const files = ((req.files as Express.Multer.File[]) || []).slice(0, 3);
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      removeUploadedFiles(files);
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    await ensureServiceRequestTables();

    const idRequest = Number(req.params.idRequest);
    const rawMessage = String(req.body?.message || '').trim();
    const message = rawMessage ? sanitizeMessage(rawMessage) : null;
    if (!idRequest) {
      removeUploadedFiles(files);
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }
    if (rawMessage.length > 500) {
      removeUploadedFiles(files);
      res.status(400).json({ error: 'Chat messages cannot exceed 500 characters.' });
      return;
    }
    if (!message && files.length === 0) {
      res.status(400).json({ error: 'Message or image is required.' });
      return;
    }

    const participant = await resolveRequestParticipant(idRequest, userId);
    if (!participant) {
      await recordSystemEvent({
        level: 'warning',
        component: 'services',
        eventType: 'chat_access_denied',
        message: 'Chat send access denied (ownership failed).',
        metadata: { requestId: idRequest, userId },
      }).catch(() => undefined);
      removeUploadedFiles(files);
      res.status(403).json({ error: 'Access denied for this request chat.' });
      return;
    }
    if (!participant.assignedWorkerProfile || !CHAT_ENABLED_REQUEST_STATUSES.includes(participant.requestStatus)) {
      removeUploadedFiles(files);
      res.status(409).json({ error: 'Chat is available only after a worker accepts the request.' });
      return;
    }

    let workerProfileId: number | null = null;
    if (participant.role === 'worker') {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT id_worker_profile FROM worker_profiles WHERE id_user = ? LIMIT 1`,
        [userId]
      );
      workerProfileId = rows.length > 0 ? Number(rows[0].id_worker_profile) : null;
    }

    const uploads: string[] = [];
    const insertedMessageIds: number[] = [];
    const firstImage = files[0] || null;
    const chatRows = [
      {
        message,
        image: firstImage ? firstImage.filename : null,
      },
      ...files.slice(1).map((file) => ({ message: null, image: file.filename })),
    ];

    const [insertResult] = await pool.execute<ResultSetHeader>(
      chatRows.length === 1
        ? `INSERT INTO service_request_chat_messages
           (id_request, sender_role, id_user, id_worker_profile, message, image_url)
           VALUES (?, ?, ?, ?, ?, ?)`
        : `INSERT INTO service_request_chat_messages
           (id_request, sender_role, id_user, id_worker_profile, message, image_url)
           VALUES ${chatRows.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')}`,
      chatRows.flatMap((row) => [
        idRequest,
        participant.role,
        userId,
        workerProfileId,
        row.message,
        row.image,
      ])
    );
    const primaryMessageId = Number(insertResult.insertId || 0);
    for (let offset = 0; offset < Number(insertResult.affectedRows || 0); offset += 1) {
      insertedMessageIds.push(primaryMessageId + offset);
    }
    uploads.push(...files.map((file) => file.filename));

    let createdMessages: any[] = [];
    if (insertedMessageIds.length > 0) {
      const placeholders = insertedMessageIds.map(() => '?').join(', ');
      const [createdRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id_message, id_request, sender_role, id_user, id_worker_profile, message, image_url, created_at
         FROM service_request_chat_messages
         WHERE id_message IN (${placeholders})
         ORDER BY created_at ASC, id_message ASC`,
        insertedMessageIds
      );
      createdMessages = createdRows.map((row: any) => mapRequestChatRow(req, row));
    }

    const recipientUserId =
      participant.role === 'client' ? participant.workerUserId : participant.clientUserId;

    if (recipientUserId) {
      const senderLabel = participant.role === 'client' ? 'client' : 'worker';
      const notificationMessage = message
        ? message.slice(0, 120)
        : `A new image was shared in request #${idRequest}.`;

      await createUserNotification({
        userId: recipientUserId,
        eventType: 'chat_new_message',
        title: participant.role === 'client' ? 'New client message' : 'New worker message',
        message: notificationMessage,
        tone: 'info',
        requestId: idRequest,
        actionUrl: participant.role === 'client' ? '/pro-dashboard' : '/app',
        dedupeKey: primaryMessageId
          ? `chat-message-${primaryMessageId}`
          : `chat-message-${idRequest}-${userId}-${Date.now()}`,
        metadata: {
          sender_role: senderLabel,
          has_image: files.length > 0,
        },
      });
    }

    // Push SSE to both sides so they receive the new message without polling
    const chatPayload = { id_request: idRequest, latest_message_id: createdMessages[createdMessages.length - 1]?.id_message ?? primaryMessageId };
    emitToUser(userId, 'chat_message', chatPayload);
    if (recipientUserId) emitToUser(recipientUserId, 'chat_message', chatPayload);
    emitChatMessage({
      ...chatPayload,
      messages: createdMessages,
      sender_user_id: userId,
      recipient_user_id: recipientUserId,
    });

    res.status(201).json({
      success: true,
      message: 'Chat message sent.',
      id_request: idRequest,
      latest_message_id: createdMessages[createdMessages.length - 1]?.id_message ?? primaryMessageId,
      messages: createdMessages,
      uploads: uploads.map((name) => buildProtectedAssetUrl(req, name)),
    });
  } catch (error: any) {
    console.error('Error in postRequestChatMessage:', error);
    removeUploadedFiles(files);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createRequestPaymentCheckout = async (req: AuthRequest, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();

    const idRequest = Number(req.params.idRequest);
    const requestedPaymentMethod = parseRequestedPaymentMethod(req.body?.payment_method);
    if (req.body?.payment_method != null && !requestedPaymentMethod) {
      res.status(400).json({ error: 'Unsupported payment method.' });
      return;
    }
    const paymentMethod: SupportedPaymentMethod = requestedPaymentMethod || 'paypal';
    const payerFullName = sanitizePaymentValue(req.body?.payer?.full_name, 120);
    const payerEmail = sanitizePaymentValue(req.body?.payer?.email, 140);
    const returnUrlInput = sanitizePaymentValue(req.body?.return_url, 500);
    const cancelUrlInput = sanitizePaymentValue(req.body?.cancel_url, 500);
    if (!idRequest) {
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }
    if (paymentMethod === 'wompi') {
      res.status(409).json({ error: 'Wompi will be enabled soon. Please use PayPal for now.' });
      return;
    }

    await connection.beginTransaction();

    const requestPromoCode = normalizePromoCode(req.body?.promo_code);

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT
         sr.id_request,
         sr.id_user,
         sr.id_service,
         sr.urgency_level,
         sr.status,
         sr.assigned_worker_profile,
         sr.budget,
         sr.final_budget,
         wp.membership_tier AS worker_membership_tier,
         wp.is_verified AS worker_is_verified
       FROM service_requests sr
       LEFT JOIN worker_profiles wp ON wp.id_worker_profile = sr.assigned_worker_profile
       WHERE sr.id_request = ? AND sr.id_user = ?
       LIMIT 1
       FOR UPDATE`,
      [idRequest, userId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      res.status(404).json({ error: 'Request not found.' });
      return;
    }

    const requestRow = rows[0];
    const status = String(requestRow.status || '').toLowerCase();
    if (!requestRow.assigned_worker_profile) {
      await connection.rollback();
      res.status(409).json({ error: 'No worker assigned to this request yet.' });
      return;
    }
    if (status !== 'payment_pending') {
      await connection.rollback();
      res.status(409).json({ error: 'This request is not waiting for payment.' });
      return;
    }

    const commission = await calculateCommissionBreakdown({
      amount: getRequestChargeAmount(requestRow),
      idService: requestRow.id_service != null ? Number(requestRow.id_service) : null,
      urgencyLevel: normalizeUrgencyLevel(requestRow.urgency_level),
      workerTier: resolveRequestWorkerTier(requestRow),
      promoCode: requestPromoCode || null,
      executor: connection,
    });
    if (requestPromoCode && !commission.snapshot.applied_rules.some((rule) => rule.rule_type === 'promo')) {
      await connection.rollback();
      res.status(400).json({ error: 'Promo code is invalid or inactive.' });
      return;
    }
    const { amount, platformFee, workerPayout } = commission;
    const commissionSnapshotJson = JSON.stringify(commission.snapshot);
    const checkoutReference = buildCheckoutReference(idRequest);
    const frontendUrl = getDefaultFrontendUrl();
    const defaultReturnUrl = `${frontendUrl}/checkout/${idRequest}?paypal=success`;
    const defaultCancelUrl = `${frontendUrl}/checkout/${idRequest}?paypal=cancel`;
    const returnUrl = sanitizeRedirectUrl(returnUrlInput, defaultReturnUrl);
    const cancelUrl = sanitizeRedirectUrl(cancelUrlInput, defaultCancelUrl);

    let paypalOrderId: string | null = null;
    let paypalApproveUrl: string | null = null;

    if (paymentMethod === 'paypal') {
      try {
        const order = await createPaypalOrder({
          amount,
          checkoutReference,
          payerName: payerFullName || undefined,
          payerEmail: payerEmail || undefined,
          returnUrl,
          cancelUrl,
        });
        paypalOrderId = order.orderId;
        paypalApproveUrl = order.approveUrl;
      } catch (paypalError: any) {
        await connection.rollback();
        res.status(502).json({ error: paypalError?.message || 'Could not initialize PayPal checkout.' });
        return;
      }
    }

    await connection.execute(
      `INSERT INTO service_request_payments
       (id_request, provider, checkout_reference, provider_payment_id, provider_capture_id, currency_code, amount, platform_fee, worker_payout, commission_rate, commission_snapshot_json, promo_code, payment_status)
       VALUES (?, ?, ?, ?, NULL, 'USD', ?, ?, ?, ?, ?, ?, 'pending')
       ON DUPLICATE KEY UPDATE
         provider = VALUES(provider),
         checkout_reference = VALUES(checkout_reference),
         provider_payment_id = VALUES(provider_payment_id),
         provider_capture_id = VALUES(provider_capture_id),
         currency_code = VALUES(currency_code),
         amount = VALUES(amount),
         platform_fee = VALUES(platform_fee),
         worker_payout = VALUES(worker_payout),
         commission_rate = VALUES(commission_rate),
         commission_snapshot_json = VALUES(commission_snapshot_json),
         promo_code = VALUES(promo_code),
         payment_status = CASE WHEN payment_status = 'paid' THEN payment_status ELSE 'pending' END,
         updated_at = CURRENT_TIMESTAMP`,
      [idRequest, paymentMethod, checkoutReference, paypalOrderId, amount, platformFee, workerPayout, commission.commissionRate, commissionSnapshotJson, requestPromoCode || null]
    );

    await connection.commit();
    res.json({
      success: true,
      message: 'Checkout session created.',
      checkout: {
        id_request: idRequest,
        provider: paymentMethod,
        provider_payment_id: paypalOrderId,
        approval_url: paypalApproveUrl,
        checkout_reference: checkoutReference,
        amount,
        platform_fee: platformFee,
        worker_payout: workerPayout,
        commission_rate: commission.commissionRate,
        commission_snapshot: commission.snapshot,
        promo_code: requestPromoCode || null,
      },
    });
  } catch (error: any) {
    await connection.rollback();
    console.error('Error in createRequestPaymentCheckout:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

export const confirmRequestPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();

    const idRequest = Number(req.params.idRequest);
    const requestedPaymentMethod = parseRequestedPaymentMethod(req.body?.payment_method);
    if (req.body?.payment_method != null && !requestedPaymentMethod) {
      res.status(400).json({ error: 'Unsupported payment method.' });
      return;
    }
    const payerFullName = sanitizePaymentValue(req.body?.payer?.full_name, 120);
    const payerEmail = sanitizePaymentValue(req.body?.payer?.email, 140);
    const paypalOrderIdFromBody = sanitizePaymentValue(req.body?.paypal_order_id, 120);
    if (requestedPaymentMethod === 'wompi') {
      res.status(409).json({ error: 'Wompi checkout will be available soon. Please complete this payment with PayPal.' });
      return;
    }
    if (!idRequest) {
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }

    await connection.beginTransaction();

    const [requestRows] = await connection.execute<RowDataPacket[]>(
      `SELECT
         sr.id_request,
         sr.id_user,
         sr.id_service,
         sr.urgency_level,
         sr.status,
         sr.budget,
         sr.final_budget,
         sr.location_text,
         sr.assigned_worker_profile,
         s.name AS service_name,
         cu.name AS client_name,
         cu.lastname AS client_lastname,
         cu.email AS client_email,
         wp.membership_tier AS worker_membership_tier,
         wp.is_verified AS worker_is_verified,
         wu.name AS worker_name,
         wu.lastname AS worker_lastname,
         wu.email AS worker_email
       FROM service_requests sr
       INNER JOIN services s ON s.id_service = sr.id_service
       INNER JOIN users cu ON cu.id_user = sr.id_user
       LEFT JOIN worker_profiles wp ON wp.id_worker_profile = sr.assigned_worker_profile
       LEFT JOIN users wu ON wu.id_user = wp.id_user
       WHERE sr.id_request = ? AND sr.id_user = ?
       LIMIT 1
       FOR UPDATE`,
      [idRequest, userId]
    );

    if (requestRows.length === 0) {
      await connection.rollback();
      res.status(404).json({ error: 'Request not found.' });
      return;
    }

    const requestRow = requestRows[0];
    const currentStatus = String(requestRow.status || '').toLowerCase();
    if (currentStatus !== 'payment_pending') {
      await connection.rollback();
      res.status(409).json({ error: 'This request is not waiting for payment.' });
      return;
    }

    const [paymentRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id_payment, provider, payment_status, amount, platform_fee, worker_payout, commission_rate, commission_snapshot_json, promo_code, checkout_reference, provider_payment_id, provider_capture_id, currency_code
       FROM service_request_payments
       WHERE id_request = ?
       LIMIT 1
       FOR UPDATE`,
      [idRequest]
    );

    const requestPromoCode = normalizePromoCode(req.body?.promo_code);
    const commission = await calculateCommissionBreakdown({
      amount: getRequestChargeAmount(requestRow),
      idService: requestRow.id_service != null ? Number(requestRow.id_service) : null,
      urgencyLevel: normalizeUrgencyLevel(requestRow.urgency_level),
      workerTier: resolveRequestWorkerTier(requestRow),
      promoCode: requestPromoCode || null,
      executor: connection,
    });
    const { amount, platformFee, workerPayout } = commission;
    const storedPaymentRow = paymentRows.length > 0 ? paymentRows[0] : null;
    const storedPaymentMethod = storedPaymentRow ? parseRequestedPaymentMethod(storedPaymentRow.provider) : null;
    const paymentMethod: SupportedPaymentMethod = requestedPaymentMethod || storedPaymentMethod || 'paypal';

    if (storedPaymentMethod && requestedPaymentMethod && storedPaymentMethod !== requestedPaymentMethod) {
      await connection.rollback();
      res.status(409).json({ error: 'Payment method mismatch for this checkout session.' });
      return;
    }

    const checkoutReferenceForPayment =
      storedPaymentRow && storedPaymentRow.checkout_reference
        ? String(storedPaymentRow.checkout_reference)
        : buildCheckoutReference(idRequest);
    const storedPaypalOrderId =
      storedPaymentRow && storedPaymentRow.provider_payment_id
        ? String(storedPaymentRow.provider_payment_id)
        : '';
    if (storedPaypalOrderId && paypalOrderIdFromBody && storedPaypalOrderId !== paypalOrderIdFromBody) {
      await connection.rollback();
      res.status(409).json({ error: 'PayPal order mismatch for this checkout session.' });
      return;
    }

    const paypalOrderId = storedPaypalOrderId || paypalOrderIdFromBody;
    const expectedAmount = storedPaymentRow?.amount != null ? Number(storedPaymentRow.amount) : amount;
    const expectedPlatformFee = storedPaymentRow?.platform_fee != null ? Number(storedPaymentRow.platform_fee) : platformFee;
    const expectedWorkerPayout = storedPaymentRow?.worker_payout != null ? Number(storedPaymentRow.worker_payout) : workerPayout;
    const expectedCommissionRate =
      storedPaymentRow?.commission_rate != null ? Number(storedPaymentRow.commission_rate) : commission.commissionRate;
    const expectedPromoCode = storedPaymentRow?.promo_code
      ? normalizePromoCode(storedPaymentRow.promo_code)
      : requestPromoCode || null;
    if (requestPromoCode && requestPromoCode !== expectedPromoCode) {
      await connection.rollback();
      res.status(409).json({ error: 'Promo code mismatch for this checkout session.' });
      return;
    }
    if (requestPromoCode && !commission.snapshot.applied_rules.some((rule) => rule.rule_type === 'promo') && !storedPaymentRow?.promo_code) {
      await connection.rollback();
      res.status(400).json({ error: 'Promo code is invalid or inactive.' });
      return;
    }
    const expectedCommissionSnapshot =
      typeof storedPaymentRow?.commission_snapshot_json === 'string' && storedPaymentRow.commission_snapshot_json
        ? storedPaymentRow.commission_snapshot_json
        : JSON.stringify(commission.snapshot);
    const resolvedCommissionSnapshot = parseCommissionSnapshot(expectedCommissionSnapshot) || commission.snapshot;
    const expectedCurrencyCode = storedPaymentRow?.currency_code ? String(storedPaymentRow.currency_code).toUpperCase() : 'USD';
    let providerCaptureId: string | null = storedPaymentRow?.provider_capture_id ? String(storedPaymentRow.provider_capture_id) : null;

    if (paymentRows.length > 0 && String(paymentRows[0].payment_status || '').toLowerCase() === 'paid') {
      await connection.rollback();
      res.json({
        success: true,
        message: 'Payment already confirmed.',
        id_request: idRequest,
        payment: {
          provider: String(paymentRows[0].provider || paymentMethod || 'paypal'),
          amount: paymentRows[0].amount != null ? Number(paymentRows[0].amount) : expectedAmount,
          platform_fee: paymentRows[0].platform_fee != null ? Number(paymentRows[0].platform_fee) : expectedPlatformFee,
          worker_payout: paymentRows[0].worker_payout != null ? Number(paymentRows[0].worker_payout) : expectedWorkerPayout,
          commission_rate:
            paymentRows[0].commission_rate != null ? Number(paymentRows[0].commission_rate) : expectedCommissionRate,
          commission_snapshot: parseCommissionSnapshot(paymentRows[0].commission_snapshot_json) || commission.snapshot,
          promo_code: paymentRows[0].promo_code ? normalizePromoCode(paymentRows[0].promo_code) : expectedPromoCode,
          status: 'paid',
          checkout_reference: String(paymentRows[0].checkout_reference || checkoutReferenceForPayment),
          currency_code: String(paymentRows[0].currency_code || expectedCurrencyCode),
        },
        request_status: 'paid',
      });
      return;
    }

    if (paymentMethod === 'paypal') {
      if (!paypalOrderId) {
        await connection.rollback();
        res.status(400).json({ error: 'Missing PayPal order id for capture.' });
        return;
      }
      try {
        const paypalCapture = await capturePaypalOrder(paypalOrderId);
        const validatedCapture = assertPaypalCaptureMatchesRequest(paypalCapture, {
          orderId: paypalOrderId,
          checkoutReference: checkoutReferenceForPayment,
          amount: expectedAmount,
          currencyCode: expectedCurrencyCode,
        });
        providerCaptureId = validatedCapture.captureId || providerCaptureId;
      } catch (paypalError: any) {
        await connection.rollback();
        res.status(502).json({ error: paypalError?.message || 'PayPal capture failed.' });
        return;
      }
    }

    if (paymentRows.length === 0) {
      await connection.execute(
        `INSERT INTO service_request_payments
         (id_request, provider, checkout_reference, provider_payment_id, provider_capture_id, currency_code, amount, platform_fee, worker_payout, commission_rate, commission_snapshot_json, promo_code, payment_status, paid_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', CURRENT_TIMESTAMP)`,
        [idRequest, paymentMethod, checkoutReferenceForPayment, paypalOrderId || null, providerCaptureId, expectedCurrencyCode, expectedAmount, expectedPlatformFee, expectedWorkerPayout, expectedCommissionRate, expectedCommissionSnapshot, expectedPromoCode]
      );
    } else {
      if (String(paymentRows[0].payment_status || '').toLowerCase() === 'paid') {
        await connection.rollback();
        res.status(409).json({ error: 'This request is already paid.' });
        return;
      }

      await connection.execute(
        `UPDATE service_request_payments
         SET provider = ?,
             provider_payment_id = COALESCE(?, provider_payment_id),
             provider_capture_id = COALESCE(?, provider_capture_id),
             currency_code = ?,
             amount = ?,
             platform_fee = ?,
             worker_payout = ?,
             commission_rate = ?,
             commission_snapshot_json = ?,
             promo_code = ?,
             payment_status = 'paid',
             paid_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id_request = ?`,
        [paymentMethod, paypalOrderId || null, providerCaptureId, expectedCurrencyCode, expectedAmount, expectedPlatformFee, expectedWorkerPayout, expectedCommissionRate, expectedCommissionSnapshot, expectedPromoCode, idRequest]
      );
    }

    await connection.execute(
      `UPDATE service_requests
       SET status = 'paid',
           final_budget = COALESCE(final_budget, budget),
           updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ?`,
      [idRequest]
    );

    const [persistedPaymentRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id_payment
       FROM service_request_payments
       WHERE id_request = ?
       LIMIT 1`,
      [idRequest]
    );
    const persistedPaymentId = persistedPaymentRows[0]?.id_payment != null ? Number(persistedPaymentRows[0].id_payment) : null;
    if (persistedPaymentId) {
      await recordConfirmedPaymentLedger(connection, {
        idRequest,
        idPayment: persistedPaymentId,
        idWorkerProfile: requestRow.assigned_worker_profile != null ? Number(requestRow.assigned_worker_profile) : null,
        amount: expectedAmount,
        platformFee: expectedPlatformFee,
        workerPayout: expectedWorkerPayout,
        currencyCode: expectedCurrencyCode,
        checkoutReference: checkoutReferenceForPayment,
        promoCode: expectedPromoCode,
        commissionSnapshot: resolvedCommissionSnapshot,
      });
    }

    await connection.commit();

    const workerUserId = await getWorkerUserIdByProfileId(
      requestRow.assigned_worker_profile != null ? Number(requestRow.assigned_worker_profile) : null
    );
    const serviceName = sanitizePaymentValue(requestRow.service_name, 150) || 'Fixlife service';
    const checkoutReference = checkoutReferenceForPayment;
    const invoiceNumber = buildInvoiceNumber(idRequest);
    const clientFirstName = sanitizePaymentValue(requestRow.client_name, 80);
    const clientLastName = sanitizePaymentValue(requestRow.client_lastname, 80);
    const workerFirstName = sanitizePaymentValue(requestRow.worker_name, 80);
    const workerLastName = sanitizePaymentValue(requestRow.worker_lastname, 80);
    const clientEmail = sanitizePaymentValue(requestRow.client_email, 140) || payerEmail;
    const workerEmail = sanitizePaymentValue(requestRow.worker_email, 140);
    const paidAt = new Date();
    const customerName = [clientFirstName, clientLastName].filter(Boolean).join(' ').trim() || payerFullName || 'Fixlife customer';
    const workerName = [workerFirstName, workerLastName].filter(Boolean).join(' ').trim() || 'Pro worker';

    await createUserNotification({
      userId,
      eventType: 'payment_secured',
      title: 'Payment secured',
      message: `Payment completed for request #${idRequest}. Final service approval is now available.`,
      tone: 'success',
      requestId: idRequest,
      actionUrl: '/app',
      dedupeKey: `request-${idRequest}-payment-secured-client`,
      metadata: { request_status: 'paid' },
    });

    if (workerUserId) {
      await createUserNotification({
        userId: workerUserId,
        eventType: 'payment_secured',
        title: 'Client payment completed',
        message: `The payment of your recent service was completed successfully for request #${idRequest}.`,
        tone: 'success',
        requestId: idRequest,
        actionUrl: '/pro-dashboard',
        dedupeKey: `request-${idRequest}-payment-secured-worker`,
        metadata: { request_status: 'paid' },
      });
    }

    await notifyAdmins({
      eventType: 'admin_payment_secured',
      title: 'Request payment secured',
      message: `${expectedAmount.toLocaleString('en-US', { style: 'currency', currency: expectedCurrencyCode })} was secured for request #${idRequest}.`,
      tone: 'success',
      actionUrl: `/admin-dashboard/requests?request=${idRequest}`,
      dedupeKey: `admin-payment-secured-${idRequest}`,
      metadata: { requestId: idRequest, amount: expectedAmount, currency: expectedCurrencyCode },
    });

    if (clientEmail) {
      await enqueueBackgroundJob({
        jobType: 'send_payment_invoice_email',
        jobKey: `invoice-email-${idRequest}-${checkoutReference}`,
        payload: {
          to: clientEmail,
          customerName,
          requestId: idRequest,
          serviceName,
          amount: expectedAmount,
          platformFee: expectedPlatformFee,
          workerPayout: expectedWorkerPayout,
          checkoutReference,
          invoiceNumber,
          provider: paymentMethod,
          currencyCode: expectedCurrencyCode,
          locationText: sanitizePaymentValue(requestRow.location_text, 180) || null,
          urgencyLevel: sanitizePaymentValue(requestRow.urgency_level, 40) || 'standard',
          commissionRatePercent: Number((expectedCommissionRate * 100).toFixed(2)),
          policyLabel: resolvedCommissionSnapshot?.policy_label || null,
          promoCode: expectedPromoCode || null,
          paidAt,
        },
      });
    }

    if (workerEmail) {
      await enqueueBackgroundJob({
        jobType: 'send_worker_payment_secured_email',
        jobKey: `worker-secured-email-${idRequest}-${checkoutReference}`,
        payload: {
          to: workerEmail,
          workerName,
          requestId: idRequest,
          serviceName,
          amount: expectedWorkerPayout,
          checkoutReference,
        },
      });
    }

    await recordSystemEvent({
      level: 'info',
      component: 'services',
      eventType: 'payment_confirmed',
      message: 'Service request payment confirmed.',
      metadata: { requestId: idRequest, userId, amount: expectedAmount },
    }).catch(() => undefined);

    res.json({
      success: true,
      message: 'Payment confirmed. Final service approval is now available.',
      id_request: idRequest,
      payment: {
        provider: paymentMethod,
        amount: expectedAmount,
        platform_fee: expectedPlatformFee,
        worker_payout: expectedWorkerPayout,
        commission_rate: expectedCommissionRate,
        commission_snapshot: resolvedCommissionSnapshot,
        promo_code: expectedPromoCode,
        status: 'paid',
        checkout_reference: checkoutReference,
        currency_code: expectedCurrencyCode,
        invoice_number: invoiceNumber,
      },
      request_status: 'paid',
    });
  } catch (error: any) {
    await connection.rollback();
    console.error('Error in confirmRequestPayment:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

export const handlePaypalWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureServiceRequestTables();

    const payload = req.body || {};
    const verification = await verifyPaypalWebhookSignature({
      headers: req.headers as Record<string, string | string[] | undefined>,
      payload,
    });

    if (!verification.verified && !verification.skipped) {
      await recordSystemEvent({
        level: 'warning',
        component: 'paypal_webhook',
        eventType: 'signature_rejected',
        message: 'Rejected PayPal webhook with invalid signature.',
        metadata: {
          paypal_event_id: payload?.id || null,
          reason: verification.reason || null,
        },
      });
      res.status(401).json({ error: 'Invalid webhook signature.' });
      return;
    }

    const paypalEventId = await storePaypalWebhookEvent({
      payload,
      verified: verification.verified,
      skipped: verification.skipped,
    });

    res.json({
      success: true,
      queued: true,
      paypal_event_id: paypalEventId,
      verification: verification.verified ? 'verified' : verification.skipped ? 'skipped' : 'rejected',
    });
  } catch (error: any) {
    console.error('Error in handlePaypalWebhook:', error);
    await recordSystemEvent({
      level: 'error',
      component: 'paypal_webhook',
      eventType: 'webhook_error',
      message: 'PayPal webhook handler failed.',
      metadata: {
        error: String(error?.message || 'Unknown webhook error.').slice(0, 600),
      },
    }).catch(() => undefined);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const confirmServiceCompletion = async (req: AuthRequest, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();

    const idRequest = Number(req.params.idRequest);
    if (!idRequest) {
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }

    await connection.beginTransaction();

    const [requestRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id_request, id_user, status, assigned_worker_profile
       FROM service_requests
       WHERE id_request = ? AND id_user = ?
       LIMIT 1
       FOR UPDATE`,
      [idRequest, userId]
    );

    if (requestRows.length === 0) {
      await connection.rollback();
      res.status(404).json({ error: 'Request not found.' });
      return;
    }

    const status = String(requestRows[0].status || '').toLowerCase();
    if (status !== 'awaiting_confirmation') {
      await connection.rollback();
      res.status(409).json({ error: 'This request is not waiting for customer confirmation.' });
      return;
    }

    await connection.execute(
      `UPDATE service_requests
       SET status = 'done',
           updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ?`,
      [idRequest]
    );

    await connection.execute(
      `UPDATE service_request_payments
       SET payment_status = CASE WHEN payment_status = 'paid' THEN 'released' ELSE payment_status END,
           released_at = CASE WHEN payment_status = 'paid' THEN CURRENT_TIMESTAMP ELSE released_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ?`,
      [idRequest]
    );

    let scheduledWorkerPayout: {
      id_worker_payout: number;
      net_amount: number;
      scheduled_for: string;
    } | null = null;
    if (requestRows[0].assigned_worker_profile != null) {
      const [paymentRows] = await connection.execute<RowDataPacket[]>(
        `SELECT id_payment, amount, platform_fee, worker_payout, currency_code, payment_status, released_at
         FROM service_request_payments
         WHERE id_request = ?
         LIMIT 1`,
        [idRequest]
      );
      const paymentRow = paymentRows[0];
      if (paymentRow && String(paymentRow.payment_status || '').toLowerCase() === 'released') {
        const payout = await scheduleWorkerPayoutForReleasedRequest(connection, {
          idRequest,
          idPayment: Number(paymentRow.id_payment),
          idWorkerProfile: Number(requestRows[0].assigned_worker_profile),
          grossAmount: Number(paymentRow.amount || 0),
          platformFee: Number(paymentRow.platform_fee || 0),
          netAmount: Number(paymentRow.worker_payout || 0),
          currencyCode: String(paymentRow.currency_code || 'USD'),
          releasedAt: paymentRow.released_at ? new Date(paymentRow.released_at) : new Date(),
        });
        scheduledWorkerPayout = payout
          ? {
              id_worker_payout: Number(payout.id_worker_payout),
              net_amount: Number(payout.net_amount || 0),
              scheduled_for: String(payout.scheduled_for),
            }
          : null;
      }
    }

    await connection.commit();

    const workerUserId = await getWorkerUserIdByProfileId(
      requestRows[0].assigned_worker_profile != null ? Number(requestRows[0].assigned_worker_profile) : null
    );

    await createUserNotification({
      userId,
      eventType: 'job_completed',
      title: 'Service completed',
      message: `Request #${idRequest} is complete and your review is now unlocked.`,
      tone: 'success',
      requestId: idRequest,
      actionUrl: '/app',
      dedupeKey: `request-${idRequest}-completed-client`,
      metadata: { request_status: 'done' },
    });

    if (workerUserId) {
      await createUserNotification({
        userId: workerUserId,
        eventType: 'job_completed',
        title: 'Job completed',
        message: `The client confirmed request #${idRequest}. Payment is marked for release.`,
        tone: 'success',
        requestId: idRequest,
        actionUrl: '/pro-dashboard',
        dedupeKey: `request-${idRequest}-completed-worker`,
        metadata: { request_status: 'done' },
      });

      if (scheduledWorkerPayout) {
        await createUserNotification({
          userId: workerUserId,
          eventType: 'payout_scheduled',
          title: 'Worker payout scheduled',
          message: `Your base payout of $${Number(scheduledWorkerPayout.net_amount || 0).toFixed(2)} is scheduled for ${scheduledWorkerPayout.scheduled_for ? new Date(scheduledWorkerPayout.scheduled_for).toLocaleDateString() : 'the next cycle'}.`,
          tone: 'success',
          requestId: idRequest,
          actionUrl: '/pro-dashboard',
          dedupeKey: `worker-base-payout-scheduled-${scheduledWorkerPayout.id_worker_payout}`,
          metadata: {
            payout_type: 'worker_payout',
            scheduled_for: scheduledWorkerPayout.scheduled_for,
            payout_amount: Number(scheduledWorkerPayout.net_amount || 0),
          },
        });
      }

      const workerProfileId = requestRows[0].assigned_worker_profile != null ? Number(requestRows[0].assigned_worker_profile) : null;
      if (workerProfileId) {
        const settings = await getWorkerRewardsSettings();
        await syncWorkerBonusPayouts(workerProfileId, settings);
        const payoutRows = await getWorkerBonusPayouts(workerProfileId);
        const matchingPayouts = payoutRows.filter((row: any) => {
          if (String(row.payout_status || '').toLowerCase() !== 'scheduled') return false;
          if (row.source_request_id != null && Number(row.source_request_id) === idRequest) return true;
          return false;
        });

        await Promise.all(
          matchingPayouts.map((row: any) =>
            createUserNotification({
              userId: workerUserId,
              eventType: 'payout_scheduled',
              title: String(row.bonus_type || '').toLowerCase() === 'royalty' ? 'Royalty payout scheduled' : 'Commission payout scheduled',
              message: `A $${Number(row.bonus_amount || 0).toFixed(2)} payout is scheduled for ${row.scheduled_for ? new Date(row.scheduled_for).toLocaleDateString() : 'the next cycle'}.`,
              tone: 'success',
              bonusPayoutId: Number(row.id_bonus_payout),
              requestId: row.source_request_id != null ? Number(row.source_request_id) : null,
              actionUrl: '/pro-dashboard',
              dedupeKey: `worker-payout-scheduled-${Number(row.id_bonus_payout)}`,
              metadata: {
                bonus_type: row.bonus_type,
                scheduled_for: row.scheduled_for,
                bonus_amount: Number(row.bonus_amount || 0),
              },
            })
          )
        );
      }

      await processAutomaticWorkerTierPromotion(
        requestRows[0].assigned_worker_profile != null ? Number(requestRows[0].assigned_worker_profile) : null
      );
    }


    await notifyAdmins({
      eventType: 'admin_job_completed',
      title: 'Service request completed',
      message: `Request #${idRequest} was completed and payment release processing started.`,
      tone: 'success',
      actionUrl: `/admin-dashboard/requests?request=${idRequest}`,
      dedupeKey: `admin-job-completed-${idRequest}`,
      metadata: { requestId: idRequest, payoutScheduled: Boolean(scheduledWorkerPayout) },
    });

    res.json({
      success: true,
      message: 'Work confirmed. Payment will be released to the worker.',
      id_request: idRequest,
      request_status: 'done',
    });
  } catch (error: any) {
    await connection.rollback();
    console.error('Error in confirmServiceCompletion:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

type WorkflowAction = 'start_work' | 'finish_work' | 'complete_service';
type WorkflowActorRole = 'client' | 'worker';

const WORKFLOW_ACTIONS = new Set<WorkflowAction>(['start_work', 'finish_work', 'complete_service']);
const MINIMUM_WORK_DURATION_MS = 1 * 60 * 1000;

export const approveServiceWorkflowAction = async (req: AuthRequest, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const userId = Number(req.user?.user_id || 0);
    const idRequest = Number(req.params.idRequest);
    const action = String(req.body?.action || '').toLowerCase() as WorkflowAction;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!Number.isSafeInteger(idRequest) || idRequest <= 0 || !WORKFLOW_ACTIONS.has(action)) {
      res.status(400).json({ error: 'Invalid workflow action.' });
      return;
    }

    await ensureServiceRequestTables();
    await ensurePaymentLedgerTables();
    await connection.beginTransaction();

    const [requestRows] = await connection.execute<RowDataPacket[]>(
      `SELECT sr.id_request, sr.id_user, sr.status, sr.workflow_version, sr.assigned_worker_profile,
              sr.worker_arrived_at, sr.work_started_at, sr.work_finished_at,
              wp.id_user AS worker_user_id
       FROM service_requests sr
       LEFT JOIN worker_profiles wp ON wp.id_worker_profile = sr.assigned_worker_profile
       WHERE sr.id_request = ?
       LIMIT 1
       FOR UPDATE`,
      [idRequest]
    );
    if (requestRows.length === 0) {
      await connection.rollback();
      res.status(404).json({ error: 'Request not found.' });
      return;
    }

    const request = requestRows[0];
    if (Number(request.workflow_version || 1) < 2) {
      await connection.rollback();
      res.status(409).json({ error: 'This request uses the legacy workflow.' });
      return;
    }

    let actorRole: WorkflowActorRole | null = null;
    if (Number(request.id_user || 0) === userId) actorRole = 'client';
    if (Number(request.worker_user_id || 0) === userId) actorRole = 'worker';
    if (!actorRole) {
      await connection.rollback();
      res.status(403).json({ error: 'Only the assigned client and worker can approve this action.' });
      return;
    }

    const status = String(request.status || '').toLowerCase();
    const [existingApprovalRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id_approval FROM service_request_workflow_approvals
       WHERE id_request = ? AND action = ? AND actor_role = ? LIMIT 1`,
      [idRequest, action, actorRole]
    );
    const completedStatuses: Record<WorkflowAction, string[]> = {
      start_work: ['in_progress', 'finish_pending', 'payment_pending', 'paid', 'completion_pending', 'done'],
      finish_work: ['payment_pending', 'paid', 'completion_pending', 'done'],
      complete_service: ['done'],
    };
    if (existingApprovalRows.length > 0 && completedStatuses[action].includes(status)) {
      await connection.rollback();
      res.json({
        success: true,
        id_request: idRequest,
        action,
        actor_role: actorRole,
        request_status: status,
        already_approved: true,
        message: 'Your approval was already saved.',
      });
      return;
    }
    const allowedStatuses: Record<WorkflowAction, string[]> = {
      start_work: ['arrived', 'start_pending'],
      finish_work: ['in_progress', 'finish_pending'],
      complete_service: ['paid', 'completion_pending'],
    };
    if (!allowedStatuses[action].includes(status)) {
      await connection.rollback();
      res.status(409).json({ error: 'This action is not available in the current service state.' });
      return;
    }
    if (action === 'start_work' && !request.worker_arrived_at) {
      await connection.rollback();
      res.status(409).json({ error: 'Verified arrival is required before work can start.' });
      return;
    }
    if (action === 'finish_work') {
      const startedAt = request.work_started_at ? new Date(request.work_started_at).getTime() : NaN;
      const unlockAt = startedAt + MINIMUM_WORK_DURATION_MS;
      if (!Number.isFinite(startedAt) || Date.now() < unlockAt) {
        await connection.rollback();
        res.status(409).json({
          error: 'Finish work unlocks 1 minute after both parties approve the start.',
          code: 'MINIMUM_WORK_TIME',
          unlock_at: Number.isFinite(unlockAt) ? new Date(unlockAt).toISOString() : null,
        });
        return;
      }
    }

    await connection.execute(
      `INSERT INTO service_request_workflow_approvals (id_request, action, actor_role, id_user)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id_user = VALUES(id_user)`,
      [idRequest, action, actorRole, userId]
    );
    const [approvalRows] = await connection.execute<RowDataPacket[]>(
      `SELECT actor_role FROM service_request_workflow_approvals WHERE id_request = ? AND action = ?`,
      [idRequest, action]
    );
    const approvedRoles = new Set(approvalRows.map((row) => String(row.actor_role)));
    const bothApproved = approvedRoles.has('client') && approvedRoles.has('worker');

    let nextStatus = status;
    if (action === 'start_work') {
      nextStatus = bothApproved ? 'in_progress' : 'start_pending';
      await connection.execute(
        `UPDATE service_requests
         SET status = ?, work_started_at = CASE WHEN ? THEN COALESCE(work_started_at, CURRENT_TIMESTAMP) ELSE work_started_at END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id_request = ?`,
        [nextStatus, bothApproved ? 1 : 0, idRequest]
      );
    } else if (action === 'finish_work') {
      nextStatus = bothApproved ? 'payment_pending' : 'finish_pending';
      await connection.execute(
        `UPDATE service_requests
         SET status = ?, work_finished_at = CASE WHEN ? THEN COALESCE(work_finished_at, CURRENT_TIMESTAMP) ELSE work_finished_at END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id_request = ?`,
        [nextStatus, bothApproved ? 1 : 0, idRequest]
      );
    } else {
      nextStatus = bothApproved ? 'done' : 'completion_pending';
      await connection.execute(
        `UPDATE service_requests
         SET status = ?, completed_at = CASE WHEN ? THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE completed_at END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id_request = ?`,
        [nextStatus, bothApproved ? 1 : 0, idRequest]
      );
      if (bothApproved) {
        await connection.execute(
          `UPDATE service_request_payments
           SET payment_status = CASE WHEN payment_status = 'paid' THEN 'released' ELSE payment_status END,
               released_at = CASE WHEN payment_status = 'paid' THEN CURRENT_TIMESTAMP ELSE released_at END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id_request = ?`,
          [idRequest]
        );
        if (request.assigned_worker_profile != null) {
          const [paymentRows] = await connection.execute<RowDataPacket[]>(
            `SELECT id_payment, amount, platform_fee, worker_payout, currency_code, payment_status, released_at
             FROM service_request_payments WHERE id_request = ? LIMIT 1`,
            [idRequest]
          );
          const payment = paymentRows[0];
          if (payment && String(payment.payment_status) === 'released') {
            await scheduleWorkerPayoutForReleasedRequest(connection, {
              idRequest,
              idPayment: Number(payment.id_payment),
              idWorkerProfile: Number(request.assigned_worker_profile),
              grossAmount: Number(payment.amount || 0),
              platformFee: Number(payment.platform_fee || 0),
              netAmount: Number(payment.worker_payout || 0),
              currencyCode: String(payment.currency_code || 'USD'),
              releasedAt: payment.released_at ? new Date(payment.released_at) : new Date(),
            });
          }
        }
      }
    }

    await connection.commit();

    const counterpartUserId = actorRole === 'client' ? Number(request.worker_user_id || 0) : Number(request.id_user || 0);
    const actionLabels: Record<WorkflowAction, string> = {
      start_work: 'start the work',
      finish_work: 'finish the work',
      complete_service: 'complete the service',
    };
    if (counterpartUserId) {
      await createUserNotification({
        userId: counterpartUserId,
        eventType: bothApproved ? `workflow_${action}_approved` : `workflow_${action}_requested`,
        title: bothApproved ? 'Both approvals received' : 'Approval requested',
        message: bothApproved
          ? `Both parties approved ${actionLabels[action]} for request #${idRequest}.`
          : `${actorRole === 'client' ? 'Client' : 'Worker'} wants to ${actionLabels[action]} for request #${idRequest}.`,
        tone: bothApproved ? 'success' : 'info',
        requestId: idRequest,
        actionUrl: actorRole === 'client' ? '/pro-dashboard' : '/app',
        dedupeKey: `request-${idRequest}-${action}-${actorRole}-${bothApproved ? 'complete' : 'pending'}`,
        metadata: { request_status: nextStatus, action, actor_role: actorRole },
      });
    }
    if (action === 'complete_service' && bothApproved) {
      await processAutomaticWorkerTierPromotion(
        request.assigned_worker_profile != null ? Number(request.assigned_worker_profile) : null
      );
    }
    emitToUser(Number(request.id_user || 0), 'request_updated', { id_request: idRequest, request_status: nextStatus });
    if (request.worker_user_id) {
      emitToUser(Number(request.worker_user_id), 'request_updated', { id_request: idRequest, request_status: nextStatus });
    }

    res.json({
      success: true,
      id_request: idRequest,
      action,
      actor_role: actorRole,
      both_approved: bothApproved,
      request_status: nextStatus,
      approvals: { client: approvedRoles.has('client'), worker: approvedRoles.has('worker') },
      message: bothApproved ? 'Both approvals received.' : 'Your approval was saved. Waiting for the other party.',
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error in approveServiceWorkflowAction:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

export const submitRequestRating = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    await ensureServiceRequestTables();

    const idRequest = Number(req.params.idRequest);
    const punctuality = Number(req.body?.punctuality);
    const quality = Number(req.body?.quality);
    const priceFairness = Number(req.body?.price_fairness);
    const comment = req.body?.comment != null ? String(req.body.comment).trim().slice(0, 255) : null;

    if (!idRequest) {
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }
    const metrics = [punctuality, quality, priceFairness];
    if (metrics.some((m) => !Number.isInteger(m) || m < 1 || m > 5)) {
      res.status(400).json({ error: 'Ratings must be integers between 1 and 5.' });
      return;
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_request, id_user, assigned_worker_profile, status
       FROM service_requests
       WHERE id_request = ? AND id_user = ?
       LIMIT 1`,
      [idRequest, userId]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Request not found.' });
      return;
    }
    const row = rows[0];
    const workerProfileId = row.assigned_worker_profile != null ? Number(row.assigned_worker_profile) : null;
    if (!workerProfileId) {
      res.status(409).json({ error: 'No assigned worker to rate.' });
      return;
    }
    if (String(row.status) !== 'done') {
      res.status(409).json({ error: 'Rating is available only when the job is completed.' });
      return;
    }

    await pool.execute(
      `INSERT INTO service_request_ratings
       (id_request, id_client_user, id_worker_profile, punctuality, quality, price_fairness, comment)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         punctuality = VALUES(punctuality),
         quality = VALUES(quality),
         price_fairness = VALUES(price_fairness),
         comment = VALUES(comment),
         updated_at = CURRENT_TIMESTAMP`,
      [idRequest, userId, workerProfileId, punctuality, quality, priceFairness, comment]
    );

    res.json({ success: true, message: 'Rating submitted successfully.', id_request: idRequest });
  } catch (error: any) {
    console.error('Error in submitRequestRating:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const acceptAssignedWorker = async (req: AuthRequest, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();

    const idRequest = Number(req.params.idRequest);
    if (!idRequest) {
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }

    await connection.beginTransaction();

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT
         sr.id_request,
         sr.id_user,
         sr.status,
         sr.workflow_version,
         sr.assigned_worker_profile,
         sr.budget,
         sr.final_budget,
         srw_assigned.proposed_budget,
         srw_assigned.counter_status
       FROM service_requests sr
       LEFT JOIN service_request_workers srw_assigned
         ON srw_assigned.id_request = sr.id_request
        AND srw_assigned.id_worker_profile = sr.assigned_worker_profile
       WHERE sr.id_request = ? AND sr.id_user = ?
       LIMIT 1
       FOR UPDATE`,
      [idRequest, userId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      res.status(404).json({ error: 'Request not found.' });
      return;
    }

    const row = rows[0];
    const workerProfileId = row.assigned_worker_profile != null ? Number(row.assigned_worker_profile) : null;
    if (!workerProfileId || String(row.status || '').toLowerCase() !== 'assigned' || row.proposed_budget != null) {
      await connection.rollback();
      res.status(409).json({ error: 'No worker approval is pending for this request.' });
      return;
    }

    const nextBudget = row.final_budget != null ? Number(row.final_budget) : Number(row.budget || 0);
    const nextStatus = Number(row.workflow_version || 1) >= 2 ? 'assigned' : 'payment_pending';

    await connection.execute(
      `UPDATE service_requests
       SET status = CASE WHEN workflow_version >= 2 THEN 'assigned' ELSE 'payment_pending' END,
           final_budget = ?,
           client_approved_at = CASE WHEN workflow_version >= 2 THEN CURRENT_TIMESTAMP ELSE client_approved_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ?`,
      [nextBudget, idRequest]
    );

    await connection.commit();

    const workerUserId = await getWorkerUserIdByProfileId(workerProfileId);
    if (workerUserId) {
      await createUserNotification({
        userId: workerUserId,
        eventType: 'worker_approved',
        title: 'Client approved you',
        message: `The client approved you for request #${idRequest}. You can now start the route.`,
        tone: 'success',
        requestId: idRequest,
        actionUrl: '/pro-dashboard',
        dedupeKey: `request-${idRequest}-worker-approved-worker`,
        metadata: { request_status: 'assigned' },
      });
    }

    await createUserNotification({
      userId,
      eventType: 'worker_approved',
      title: 'Worker approved',
      message: `You approved the pro for request #${idRequest}. Waiting for route start.`,
      tone: 'success',
      requestId: idRequest,
      actionUrl: '/app',
      dedupeKey: `request-${idRequest}-worker-approved-client`,
      metadata: { request_status: 'assigned' },
    });

    res.json({
      success: true,
      message: 'Worker approved. Route can now begin.',
      id_request: idRequest,
      request_status: nextStatus,
      final_budget: nextBudget,
    });
  } catch (error: any) {
    await connection.rollback();
    console.error('Error in acceptAssignedWorker:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

export const declineAssignedWorker = async (req: AuthRequest, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();
    await ensureWorkerGeoColumns();

    const idRequest = Number(req.params.idRequest);
    if (!idRequest) {
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }

    await connection.beginTransaction();

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT
         sr.id_request,
         sr.id_user,
         sr.id_service,
         sr.status,
         sr.workflow_version,
         sr.latitude,
         sr.longitude,
         sr.radius_km,
         sr.assigned_worker_profile,
         srw_assigned.proposed_budget
       FROM service_requests sr
       LEFT JOIN service_request_workers srw_assigned
         ON srw_assigned.id_request = sr.id_request
        AND srw_assigned.id_worker_profile = sr.assigned_worker_profile
       WHERE sr.id_request = ? AND sr.id_user = ?
       LIMIT 1
       FOR UPDATE`,
      [idRequest, userId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      res.status(404).json({ error: 'Request not found.' });
      return;
    }

    const row = rows[0];
    const assignedWorker = row.assigned_worker_profile != null ? Number(row.assigned_worker_profile) : null;
    if (!assignedWorker || String(row.status || '').toLowerCase() !== 'assigned' || row.proposed_budget != null) {
      await connection.rollback();
      res.status(409).json({ error: 'No worker approval is pending for this request.' });
      return;
    }

    await requeueAssignedRequest(connection, {
      idRequest,
      idService: row.id_service != null ? Number(row.id_service) : null,
      latitude: row.latitude != null ? Number(row.latitude) : null,
      longitude: row.longitude != null ? Number(row.longitude) : null,
      radiusKm: row.radius_km != null ? Number(row.radius_km) : null,
      assignedWorkerProfile: assignedWorker,
    });

    await connection.commit();

    const workerUserId = await getWorkerUserIdByProfileId(assignedWorker);
    if (workerUserId) {
      await createUserNotification({
        userId: workerUserId,
        eventType: 'worker_declined',
        title: 'Client chose another pro',
        message: `The client declined your assignment for request #${idRequest}.`,
        tone: 'warning',
        requestId: idRequest,
        actionUrl: '/pro-dashboard',
        dedupeKey: `request-${idRequest}-worker-declined-worker`,
        metadata: { request_status: 'pending' },
      });
    }

    await createUserNotification({
      userId,
      eventType: 'worker_declined',
      title: 'Worker declined',
      message: `You declined the assigned pro for request #${idRequest}. We are looking for another worker.`,
      tone: 'info',
      requestId: idRequest,
      actionUrl: '/app',
      dedupeKey: `request-${idRequest}-worker-declined-client`,
      metadata: { request_status: 'pending' },
    });

    res.json({
      success: true,
      message: 'Worker declined. Looking for another worker.',
      id_request: idRequest,
      request_status: 'pending',
    });
  } catch (error: any) {
    await connection.rollback();
    console.error('Error in declineAssignedWorker:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

export const acceptCounterOffer = async (req: AuthRequest, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();

    const idRequest = Number(req.params.idRequest);
    if (!idRequest) {
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }

    await connection.beginTransaction();

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT
         sr.id_request,
         sr.id_user,
         sr.status,
         sr.workflow_version,
         sr.assigned_worker_profile,
         srw_assigned.proposed_budget,
         srw_assigned.counter_status
       FROM service_requests sr
       LEFT JOIN service_request_workers srw_assigned
         ON srw_assigned.id_request = sr.id_request
        AND srw_assigned.id_worker_profile = sr.assigned_worker_profile
       WHERE sr.id_request = ? AND sr.id_user = ?
       LIMIT 1
       FOR UPDATE`,
      [idRequest, userId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      res.status(404).json({ error: 'Request not found.' });
      return;
    }

    const row = rows[0];
    if (!row.assigned_worker_profile || row.proposed_budget == null) {
      await connection.rollback();
      res.status(409).json({ error: 'No pending counter offer for this request.' });
      return;
    }

    const finalBudget = Number(row.proposed_budget);
    const nextStatus = Number(row.workflow_version || 1) >= 2 ? 'assigned' : 'payment_pending';
    await connection.execute(
      `UPDATE service_requests
       SET budget = ?, final_budget = ?,
           status = CASE WHEN workflow_version >= 2 THEN 'assigned' ELSE 'payment_pending' END,
           client_approved_at = CASE WHEN workflow_version >= 2 THEN CURRENT_TIMESTAMP ELSE client_approved_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ?`,
      [finalBudget, finalBudget, idRequest]
    );

    await connection.execute(
      `UPDATE service_request_workers
       SET counter_status = 'accepted', updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ? AND id_worker_profile = ?`,
      [idRequest, Number(row.assigned_worker_profile)]
    );

    await connection.commit();

    const workerProfileId = Number(row.assigned_worker_profile);
    const workerUserId = await getWorkerUserIdByProfileId(workerProfileId);

    if (workerUserId) {
      await createUserNotification({
        userId: workerUserId,
        eventType: 'counter_offer_accepted',
        title: 'Counter offer accepted',
        message: `The client accepted your counter offer for request #${idRequest}. You can now start the route.`,
        tone: 'success',
        requestId: idRequest,
        actionUrl: '/pro-dashboard',
        dedupeKey: `request-${idRequest}-counter-accepted-worker`,
        metadata: { request_status: 'assigned' },
      });
    }

    await createUserNotification({
      userId,
      eventType: 'counter_offer_accepted',
      title: 'Counter offer accepted',
      message: `Request #${idRequest} is agreed. Waiting for route start.`,
      tone: 'info',
      requestId: idRequest,
      actionUrl: '/app',
      dedupeKey: `request-${idRequest}-counter-accepted-client`,
      metadata: { request_status: 'assigned' },
    });

    res.json({
      success: true,
      message: 'Counter offer accepted. Route can now begin.',
      id_request: idRequest,
      final_budget: finalBudget,
      request_status: nextStatus,
    });
  } catch (error: any) {
    await connection.rollback();
    console.error('Error in acceptCounterOffer:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

export const declineCounterOffer = async (req: AuthRequest, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();
    await ensureWorkerGeoColumns();

    const idRequest = Number(req.params.idRequest);
    if (!idRequest) {
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }

    await connection.beginTransaction();

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT
         sr.id_request,
         sr.id_user,
         sr.id_service,
         sr.latitude,
         sr.longitude,
         sr.radius_km,
         sr.assigned_worker_profile,
         srw_assigned.proposed_budget
       FROM service_requests sr
       LEFT JOIN service_request_workers srw_assigned
         ON srw_assigned.id_request = sr.id_request
        AND srw_assigned.id_worker_profile = sr.assigned_worker_profile
       WHERE sr.id_request = ? AND sr.id_user = ?
       LIMIT 1
       FOR UPDATE`,
      [idRequest, userId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      res.status(404).json({ error: 'Request not found.' });
      return;
    }

    const row = rows[0];
    const assignedWorker = row.assigned_worker_profile != null ? Number(row.assigned_worker_profile) : null;
    if (!assignedWorker || row.proposed_budget == null) {
      await connection.rollback();
      res.status(409).json({ error: 'No pending counter offer for this request.' });
      return;
    }

    await connection.execute(
      `UPDATE service_request_workers
       SET status = 'rejected',
           counter_status = 'declined',
           updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ? AND id_worker_profile = ?`,
      [idRequest, assignedWorker]
    );

    await connection.execute(
      `UPDATE service_requests
       SET status = 'pending',
           assigned_worker_profile = NULL,
           assigned_at = NULL,
           worker_arrived_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ?`,
      [idRequest]
    );

    if (row.latitude != null && row.longitude != null && row.id_service != null) {
      const lat = Number(row.latitude);
      const lng = Number(row.longitude);
      const radiusKm = Number(row.radius_km || 8);
      const idService = Number(row.id_service);
      const boundsFilter = getWorkerBoundsFilter(getProximityBounds(lat, lng, radiusKm));

      const [nearRows] = await connection.execute<RowDataPacket[]>(
        `SELECT
           wp.id_worker_profile,
           wp.coverage_km,
           (ST_Distance_Sphere(point(wp.longitude, wp.latitude), point(?, ?)) / 1000) AS distance_km
         FROM worker_profiles wp
         INNER JOIN users u ON u.id_user = wp.id_user
         INNER JOIN worker_services ws ON ws.id_worker_profile = wp.id_worker_profile
         LEFT JOIN service_request_workers srw
           ON srw.id_request = ? AND srw.id_worker_profile = wp.id_worker_profile
         WHERE u.rol = 'worker'
           AND wp.is_verified = 1
           AND ws.id_service = ?
           AND wp.latitude IS NOT NULL
           AND wp.longitude IS NOT NULL
           ${boundsFilter.sql}
           AND wp.id_worker_profile <> ?
           AND srw.id_request IS NULL
         HAVING distance_km <= ? AND distance_km <= wp.coverage_km
         ORDER BY distance_km ASC
         LIMIT 50`,
        [lng, lat, idRequest, idService, ...boundsFilter.params, assignedWorker, radiusKm]
      );

      await bulkInsertRequestWorkerCandidates(connection, idRequest, nearRows);
    }

    await connection.commit();
    res.json({
      success: true,
      message: 'Counter offer declined. Looking for another worker.',
      id_request: idRequest,
    });
  } catch (error: any) {
    await connection.rollback();
    console.error('Error in declineCounterOffer:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};
