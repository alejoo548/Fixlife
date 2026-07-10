import path from 'path';
import bcrypt from 'bcrypt';
import { Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { AuthRequest } from '../middlewares/auth.middleware';
import { sendEmailChangeToken, sendProfileChangeNotice } from '../utils/email';
import {
  getCycleEnd as rewardsGetCycleEnd,
  getCycleStart as rewardsGetCycleStart,
  getNextPayoutWeekday,
  REWARDS_PROGRAM_START_SQL,
  getWorkerBonusPayouts,
  getWorkerRewardsSettings,
  syncWorkerBonusPayouts,
} from '../utils/workerRewards';
import { createUserNotification } from '../utils/notifications';
import { emitToUser } from '../services/socketManager';
import { buildProtectedAssetUrl, buildPublicAssetUrl, deleteUploadIfExists } from '../utils/assets';
import { shouldRunRuntimeSchemaSync } from '../config/schemaSync';
import { getWorkerPayouts } from '../services/paymentLedger.service';
import { getWorkerTierBenefits } from '../services/workerTier.service';
import {
  queueWorkerPayoutStatementEmail,
} from '../services/workerPayoutStatement.service';
import { sanitizeMessage, sanitizeStrictText } from '../utils/sanitize';

const servicesController = require(path.join(__dirname, './services.controller'));
const {
  autoReassignStaleAssignedRequests,
  ensureServiceRequestTables,
  ensureWorkerGeoColumns,
} = servicesController;

const ACTIVE_WORKER_REQUEST_STATUSES = ['assigned', 'route_in_progress', 'arrived', 'start_pending', 'in_progress', 'finish_pending', 'payment_pending', 'paid', 'completion_pending', 'awaiting_confirmation'];
const SCHEDULE_CONFLICT_STATUSES = [...ACTIVE_WORKER_REQUEST_STATUSES];
const SCHEDULE_BUFFER_TIME_MINUTES = Math.max(
  0,
  Math.min(Number(process.env.BUFFER_TIME_MINUTES || 60), 240)
);
const SCHEDULED_REQUEST_DURATION_MINUTES = Math.max(
  60,
  Math.min(Number(process.env.SCHEDULED_REQUEST_DURATION_MINUTES || 120), 7 * 60)
);
const SCHEDULED_START_EARLY_MINUTES = Math.max(
  0,
  Math.min(Number(process.env.SCHEDULED_START_EARLY_MINUTES || 120), 360)
);

const toPublicRequestStatus = (status: string | null | undefined) => {
  if (!status) return 'pending';
  return status === 'open' ? 'pending' : status;
};

const allowedImageMimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

const deletePublicUploadIfUnreferenced = async (fileName: string | null | undefined) => {
  if (!fileName) return;

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE profile_image = ?) +
         (SELECT COUNT(*) FROM worker_portfolio WHERE image_url = ?) AS total`,
      [fileName, fileName]
    );

    if (Number(rows[0]?.total || 0) === 0) {
      deleteUploadIfExists(fileName, 'public');
    }
  } catch (error) {
    console.error('[worker-images] Could not verify upload references:', error);
  }
};

const cleanupUnreferencedWorkerUploads = async (files: Express.Multer.File[]) => {
  await Promise.all(files.map((file) => deletePublicUploadIfUnreferenced(file.filename)));
};

let pendingEmailChecked = false;

const ensurePendingEmailColumn = async () => {
  if (pendingEmailChecked) return;
  if (!shouldRunRuntimeSchemaSync()) {
    pendingEmailChecked = true;
    return;
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'users'
       AND column_name = 'pending_email'`
  );

  const exists = Number(rows[0]?.total || 0) > 0;
  if (!exists) {
    await pool.execute(`ALTER TABLE users ADD COLUMN pending_email VARCHAR(100) NULL`);
  }

  pendingEmailChecked = true;
};

const buildAssetUrl = (req: AuthRequest, fileName: string | null) => {
  return buildPublicAssetUrl(req, fileName);
};

const toSqlDateTime = (date: Date) => date.toISOString().slice(0, 19).replace('T', ' ');

const formatMonthLabel = (anchor = new Date()) =>
  anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

const normalizeSqlTime = (value: unknown) => {
  const raw = String(value || '').trim();
  return raw.length === 5 ? `${raw}:00` : raw;
};

const isValidAvailabilityRange = (startTime: string, endTime: string) => {
  return /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(startTime)
    && /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(endTime)
    && startTime < endTime;
};

type WorkerAvailabilityInput = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
};

const ensureWorkerProfile = async (userId: number) => {
  const [profiles] = await pool.execute<RowDataPacket[]>(
    `SELECT id_worker_profile FROM worker_profiles WHERE id_user = ? LIMIT 1`,
    [userId]
  );

  if (profiles.length > 0) return profiles[0].id_worker_profile as number;

  const [insertResult] = await pool.execute<ResultSetHeader>(
    `INSERT INTO worker_profiles (id_user, is_verified) VALUES (?, 0)`,
    [userId]
  );
  return insertResult.insertId;
};

const getUserCore = async (userId: number) => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id_user, name, lastname, email, phone_number, profile_image, rol, username
     FROM users
     WHERE id_user = ?
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
};

const getWorkerActiveRequest = async (
  executor: Pick<typeof pool, 'execute'>,
  profileId: number,
  excludeRequestId?: number
) => {
  const params: any[] = [profileId, ...ACTIVE_WORKER_REQUEST_STATUSES];
  let excludeSql = '';
  if (excludeRequestId != null) {
    excludeSql = ' AND id_request <> ?';
    params.push(excludeRequestId);
  }

  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT id_request, status
     FROM service_requests
     WHERE assigned_worker_profile = ?
       AND (
         (COALESCE(booking_type, 'express') = 'express' AND status IN (${ACTIVE_WORKER_REQUEST_STATUSES.map(() => '?').join(', ')}))
         OR (booking_type = 'scheduled' AND status = 'in_progress')
       )
       ${excludeSql}
     ORDER BY updated_at DESC
     LIMIT 1`,
    params
  );

  if (rows.length === 0) return null;
  return {
    id_request: Number(rows[0].id_request),
    status: String(rows[0].status || '').toLowerCase(),
  };
};

const getScheduledConflict = async (
  executor: Pick<typeof pool, 'execute'>,
  input: {
    profileId: number;
    idRequest: number;
    scheduledStartTime: string | Date | null;
    scheduledEndTime: string | Date | null;
  }
) => {
  if (!input.scheduledStartTime || !input.scheduledEndTime) return null;

  const start = new Date(input.scheduledStartTime);
  const end = new Date(input.scheduledEndTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const bufferedStart = new Date(start.getTime() - SCHEDULE_BUFFER_TIME_MINUTES * 60_000);
  const bufferedEnd = new Date(end.getTime() + SCHEDULE_BUFFER_TIME_MINUTES * 60_000);

  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT id_request, scheduled_start_time, scheduled_end_time
     FROM service_requests
     WHERE assigned_worker_profile = ?
       AND id_request <> ?
       AND booking_type = 'scheduled'
       AND status IN (${SCHEDULE_CONFLICT_STATUSES.map(() => '?').join(', ')})
       AND scheduled_start_time IS NOT NULL
       AND scheduled_end_time IS NOT NULL
       AND scheduled_start_time < ?
       AND scheduled_end_time > ?
     ORDER BY scheduled_start_time ASC
     LIMIT 1
     FOR UPDATE`,
    [
      input.profileId,
      input.idRequest,
      ...SCHEDULE_CONFLICT_STATUSES,
      toSqlDateTime(bufferedEnd),
      toSqlDateTime(bufferedStart),
    ]
  );

  if (rows.length === 0) return null;
  return {
    id_request: Number(rows[0].id_request),
    scheduled_start_time: rows[0].scheduled_start_time,
    scheduled_end_time: rows[0].scheduled_end_time,
  };
};

export const getWorkerMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await getUserCore(userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const profileId = await ensureWorkerProfile(userId);
    const [profiles] = await pool.execute<RowDataPacket[]>(
      `SELECT id_worker_profile, id_user, bio, banner_image, dui_document, cert_document, is_verified,
              is_online, latitude, longitude, coverage_km, last_seen_at, membership_tier
       FROM worker_profiles
       WHERE id_worker_profile = ?
       LIMIT 1`,
      [profileId]
    );

    const [portfolio] = await pool.execute<RowDataPacket[]>(
      `SELECT id_photo, id_worker_profile, image_url, description, uploaded_at
       FROM worker_portfolio
       WHERE id_worker_profile = ?
       ORDER BY uploaded_at DESC`,
      [profileId]
    );
    const [serviceRows] = await pool.execute<RowDataPacket[]>(
      `SELECT s.id_service, s.name, s.icon
       FROM worker_services ws
       INNER JOIN services s ON s.id_service = ws.id_service
       WHERE ws.id_worker_profile = ?
       ORDER BY s.name ASC`,
      [profileId]
    );

    const workerProfile = profiles[0];
    const tierBenefits = await getWorkerTierBenefits();
    const currentTier = String(workerProfile?.membership_tier || 'standard');
    const currentTierBenefits = tierBenefits.find((item) => item.tier === currentTier) || null;
    res.json({
      success: true,
      user: {
        ...user,
        profile_image_url: buildAssetUrl(req, user.profile_image || null),
      },
      worker_profile: workerProfile,
      current_tier_benefits: currentTierBenefits,
      services_offered: serviceRows.map((row) => ({
        id_service: Number(row.id_service),
        name: String(row.name || 'Service'),
        icon: row.icon ? String(row.icon) : null,
      })),
      portfolio: portfolio.map((item) => ({
        ...item,
        image_full_url: buildAssetUrl(req, item.image_url),
      })),
    });
  } catch (error: any) {
    console.error('Error in getWorkerMe:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getWorkerAvailability = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();
    const profileId = await ensureWorkerProfile(userId);

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_availability, day_of_week, start_time, end_time, is_active
       FROM worker_availabilities
       WHERE id_worker_profile = ?
       ORDER BY day_of_week ASC, start_time ASC`,
      [profileId]
    );

    res.json({
      success: true,
      slots: rows.map((row: any) => ({
        id_availability: Number(row.id_availability),
        day_of_week: Number(row.day_of_week),
        start_time: String(row.start_time || '').slice(0, 8),
        end_time: String(row.end_time || '').slice(0, 8),
        is_active: Number(row.is_active || 0) === 1,
      })),
    });
  } catch (error: any) {
    console.error('Error in getWorkerAvailability:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateWorkerAvailability = async (req: AuthRequest, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();
    const profileId = await ensureWorkerProfile(userId);
    const incoming = Array.isArray(req.body?.slots) ? req.body.slots : [];
    const slots: WorkerAvailabilityInput[] = incoming
      .map((slot: any) => ({
        dayOfWeek: Number(slot.day_of_week),
        startTime: normalizeSqlTime(slot.start_time),
        endTime: normalizeSqlTime(slot.end_time),
        isActive: slot.is_active !== false,
      }))
      .filter((slot: WorkerAvailabilityInput) => slot.isActive);

    for (const slot of slots) {
      if (
        !Number.isInteger(slot.dayOfWeek)
        || slot.dayOfWeek < 0
        || slot.dayOfWeek > 6
        || !isValidAvailabilityRange(slot.startTime, slot.endTime)
      ) {
        res.status(400).json({ error: 'Invalid availability slot.' });
        return;
      }
    }

    await connection.beginTransaction();
    await connection.execute(
      `DELETE FROM worker_availabilities WHERE id_worker_profile = ?`,
      [profileId]
    );

    if (slots.length > 0) {
      await connection.execute(
        `INSERT INTO worker_availabilities (id_worker_profile, day_of_week, start_time, end_time, is_active)
         VALUES ${slots.map(() => '(?, ?, ?, ?, 1)').join(', ')}`,
        slots.flatMap((slot) => [profileId, slot.dayOfWeek, slot.startTime, slot.endTime])
      );
    }

    await connection.commit();

    res.json({
      success: true,
      slots: slots.map((slot) => ({
        day_of_week: slot.dayOfWeek,
        start_time: slot.startTime,
        end_time: slot.endTime,
        is_active: true,
      })),
    });
  } catch (error: any) {
    await connection.rollback();
    console.error('Error in updateWorkerAvailability:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

export const getWorkerRewardsDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();

    const [profileRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_worker_profile
       FROM worker_profiles
       WHERE id_user = ?
       LIMIT 1`,
      [userId]
    );

    if (profileRows.length === 0) {
      res.status(404).json({ error: 'Worker profile not found.' });
      return;
    }

    const profileId = Number(profileRows[0].id_worker_profile);
    const settings = await getWorkerRewardsSettings();
    await syncWorkerBonusPayouts(profileId, settings);

    const now = new Date();
    const cycleStart = rewardsGetCycleStart(now);
    const cycleEnd = rewardsGetCycleEnd(now);
    const currentCycleKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const cycleStartSql = toSqlDateTime(cycleStart);
    const cycleEndSql = toSqlDateTime(cycleEnd);

    const [lifetimeRows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS total
       FROM service_requests
       WHERE assigned_worker_profile = ?
         AND status = 'done'
         AND COALESCE(updated_at, created_at) >= ?`,
      [profileId, REWARDS_PROGRAM_START_SQL]
    );

    const [cycleCompletedRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         sr.id_request,
         sr.location_text,
         sr.description,
         sr.final_budget,
         sr.budget,
         s.name AS service_name,
         COALESCE(srp.worker_payout, sr.final_budget, sr.budget, 0) AS worker_payout,
         srp.payment_status,
         srp.released_at,
         srp.paid_at,
         COALESCE(srp.released_at, sr.updated_at, sr.created_at) AS completed_at
       FROM service_requests sr
       INNER JOIN services s ON s.id_service = sr.id_service
       LEFT JOIN service_request_payments srp ON srp.id_request = sr.id_request
       WHERE sr.assigned_worker_profile = ?
         AND sr.status = 'done'
         AND COALESCE(srp.released_at, sr.updated_at, sr.created_at) >= ?
         AND COALESCE(srp.released_at, sr.updated_at, sr.created_at) BETWEEN ? AND ?
       ORDER BY completed_at DESC`,
      [profileId, REWARDS_PROGRAM_START_SQL, cycleStartSql, cycleEndSql]
    );

    const [cycleCancelledRows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS total
       FROM service_requests
       WHERE assigned_worker_profile = ?
         AND status = 'cancelled'
         AND COALESCE(updated_at, created_at) >= ?
         AND COALESCE(updated_at, created_at) BETWEEN ? AND ?`,
      [profileId, REWARDS_PROGRAM_START_SQL, cycleStartSql, cycleEndSql]
    );

    const [pendingWorkerPayoutRows] = await pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(COALESCE(srp.worker_payout, sr.final_budget, sr.budget, 0)), 0) AS total
       FROM service_requests sr
       INNER JOIN service_request_payments srp ON srp.id_request = sr.id_request
       WHERE sr.assigned_worker_profile = ?
         AND srp.payment_status = 'paid'`,
      [profileId]
    );

    const [releasedWorkerPayoutRows] = await pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(COALESCE(srp.worker_payout, sr.final_budget, sr.budget, 0)), 0) AS total
       FROM service_requests sr
       INNER JOIN service_request_payments srp ON srp.id_request = sr.id_request
       WHERE sr.assigned_worker_profile = ?
         AND srp.payment_status = 'released'`,
      [profileId]
    );

    const [historyRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         sr.id_request,
         sr.location_text,
         sr.description,
         s.name AS service_name,
         COALESCE(srp.worker_payout, sr.final_budget, sr.budget, 0) AS worker_payout,
         srp.payment_status,
         srp.released_at,
         srp.paid_at,
         COALESCE(srp.released_at, sr.updated_at, sr.created_at) AS completed_at,
         u.name AS client_name,
         u.lastname AS client_lastname
       FROM service_requests sr
       INNER JOIN services s ON s.id_service = sr.id_service
       LEFT JOIN service_request_payments srp ON srp.id_request = sr.id_request
       LEFT JOIN users u ON u.id_user = sr.id_user
       WHERE sr.assigned_worker_profile = ?
         AND sr.status = 'done'
         AND COALESCE(srp.released_at, sr.updated_at, sr.created_at) >= ?
       ORDER BY completed_at DESC
       LIMIT 60`,
      [profileId, REWARDS_PROGRAM_START_SQL]
    );

    const bonusPayoutRows = await getWorkerBonusPayouts(profileId);
    const workerPayoutRows = await getWorkerPayouts(profileId);

    await Promise.all(
      bonusPayoutRows
        .filter((row: any) => String(row.payout_status || '').toLowerCase() === 'scheduled')
        .map((row: any) =>
          createUserNotification({
            userId,
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
    const cycleBonusItems = bonusPayoutRows.filter(
      (row) =>
        String(row.cycle_key || '') === currentCycleKey &&
        String(row.payout_status || '').toLowerCase() !== 'cancelled'
    );

    const lifetimeCompletedJobs = Number(lifetimeRows[0]?.total || 0);
    const currentCycleCompletedJobs = cycleCompletedRows.length;
    const currentCycleCancelledJobs = Number(cycleCancelledRows[0]?.total || 0);
    const currentCycleClosedJobs = currentCycleCompletedJobs + currentCycleCancelledJobs;
    const completionRate = currentCycleClosedJobs > 0
      ? Number(((currentCycleCompletedJobs / currentCycleClosedJobs) * 100).toFixed(1))
      : currentCycleCompletedJobs > 0
        ? 100
        : 0;

    const trialUnlocked = lifetimeCompletedJobs >= settings.trial_min_completed_jobs;
    const royaltyUnlocked =
      currentCycleCompletedJobs >= settings.royalty_min_jobs &&
      completionRate >= settings.royalty_min_completion_rate;

    const cycleGrossEarnings = cycleCompletedRows.reduce(
      (sum, row) => sum + Number(row.worker_payout || 0),
      0
    );
    const pendingReleaseWorkerPayout = Number(pendingWorkerPayoutRows[0]?.total || 0);
    const releasedToPayoutWorkerAmount = Number(releasedWorkerPayoutRows[0]?.total || 0);
    const scheduledBaseWorkerPayout = workerPayoutRows
      .filter((row: any) => String(row.payout_status || '').toLowerCase() === 'scheduled')
      .reduce((sum: number, row: any) => sum + Number(row.net_amount || 0), 0);
    const paidBaseWorkerPayout = workerPayoutRows
      .filter((row: any) => String(row.payout_status || '').toLowerCase() === 'paid')
      .reduce((sum: number, row: any) => sum + Number(row.net_amount || 0), 0);
    const scheduledBonusPayout = bonusPayoutRows
      .filter((row: any) => String(row.payout_status || '').toLowerCase() === 'scheduled')
      .reduce((sum: number, row: any) => sum + Number(row.bonus_amount || 0), 0);
    const paidBonusPayout = bonusPayoutRows
      .filter((row: any) => String(row.payout_status || '').toLowerCase() === 'paid')
      .reduce((sum: number, row: any) => sum + Number(row.bonus_amount || 0), 0);

    const groupedCalendar = new Map<
      string,
      {
        date: string;
        label: string;
        type: 'worker_payout' | 'commission' | 'royalty' | 'combined';
        amount: number;
        jobs_count: number;
        base_amount: number;
        commission_amount: number;
        performance_bonus_amount: number;
      }
    >();

    const upsertCalendarItem = (
      key: string,
      type: 'worker_payout' | 'commission' | 'royalty',
      amount: number,
      jobsCount: number
    ) => {
      const baseLabel =
        type === 'worker_payout'
          ? 'Base worker payout'
          : type === 'royalty'
            ? 'Royalty payout'
            : 'Commission payout';
      const existing = groupedCalendar.get(key);

      if (existing) {
        existing.amount = Number((existing.amount + amount).toFixed(2));
        existing.jobs_count += jobsCount;
        if (type === 'worker_payout') {
          existing.base_amount = Number((existing.base_amount + amount).toFixed(2));
        } else if (type === 'commission') {
          existing.commission_amount = Number((existing.commission_amount + amount).toFixed(2));
        } else if (type === 'royalty') {
          existing.performance_bonus_amount = Number((existing.performance_bonus_amount + amount).toFixed(2));
        }
        if (existing.type !== type) {
          existing.type = 'combined';
          existing.label = 'Mixed payout batch';
        } else {
          existing.label = baseLabel;
        }
        return;
      }

      groupedCalendar.set(key, {
        date: key,
        label: baseLabel,
        type,
        amount: Number(amount.toFixed(2)),
        jobs_count: jobsCount,
        base_amount: type === 'worker_payout' ? Number(amount.toFixed(2)) : 0,
        commission_amount: type === 'commission' ? Number(amount.toFixed(2)) : 0,
        performance_bonus_amount: type === 'royalty' ? Number(amount.toFixed(2)) : 0,
      });
    };

    workerPayoutRows.forEach((row: any) => {
      if (String(row.payout_status || '').toLowerCase() === 'cancelled') return;
      const key = row.scheduled_for ? new Date(row.scheduled_for).toISOString().slice(0, 10) : null;
      if (!key) return;
      upsertCalendarItem(
        key,
        'worker_payout',
        Number(row.net_amount || 0),
        row.id_request != null ? 1 : 0
      );
    });

    bonusPayoutRows.forEach((row: any) => {
      if (String(row.payout_status || '').toLowerCase() === 'cancelled') return;
      const key = row.scheduled_for ? new Date(row.scheduled_for).toISOString().slice(0, 10) : null;
      if (!key) return;
      const type = String(row.bonus_type || 'commission').toLowerCase() === 'royalty' ? 'royalty' : 'commission';
      upsertCalendarItem(
        key,
        type,
        Number(row.bonus_amount || 0),
        type === 'commission' && row.source_request_id ? 1 : 0
      );
    });

    const currentMonthCommission = cycleBonusItems
      .filter((row) => String(row.bonus_type || '').toLowerCase() === 'commission' && String(row.payout_status || '').toLowerCase() !== 'cancelled')
      .reduce((sum, row) => sum + Number(row.bonus_amount || 0), 0);
    const royaltyBonus = cycleBonusItems
      .filter((row) => String(row.bonus_type || '').toLowerCase() === 'royalty' && String(row.payout_status || '').toLowerCase() !== 'cancelled')
      .reduce((sum, row) => sum + Number(row.bonus_amount || 0), 0);

    const upcomingCalendar = [...groupedCalendar.values()].sort((left, right) => left.date.localeCompare(right.date));
    const nextScheduledCalendar = upcomingCalendar.filter((item) => {
      const matchingWorkerPayout = workerPayoutRows.some((row: any) => {
        const rowDate = row.scheduled_for ? new Date(row.scheduled_for).toISOString().slice(0, 10) : null;
        return rowDate === item.date && String(row.payout_status || '').toLowerCase() === 'scheduled';
      });
      const matchingBonusPayout = bonusPayoutRows.some((row: any) => {
        const rowDate = row.scheduled_for ? new Date(row.scheduled_for).toISOString().slice(0, 10) : null;
        return rowDate === item.date && String(row.payout_status || '').toLowerCase() === 'scheduled';
      });
      return matchingWorkerPayout || matchingBonusPayout;
    });

    let nextPayout: { date: string | null; amount: number; label: string | null } | null = null;
    if (nextScheduledCalendar.length > 0) {
      const nextItem = nextScheduledCalendar[0];
      const nextDateKey = nextItem.date;
      const sameDateWorkerPayouts = workerPayoutRows.filter((row: any) => {
        const rowKey = row.scheduled_for ? new Date(row.scheduled_for).toISOString().slice(0, 10) : null;
        return rowKey === nextDateKey && String(row.payout_status || '').toLowerCase() === 'scheduled';
      });
      const sameDateBonusRows = bonusPayoutRows.filter((row: any) => {
        const rowKey = row.scheduled_for ? new Date(row.scheduled_for).toISOString().slice(0, 10) : null;
        return rowKey === nextDateKey && String(row.payout_status || '').toLowerCase() === 'scheduled';
      });
      const hasWorkerPayout = sameDateWorkerPayouts.length > 0;
      const hasCommission = sameDateBonusRows.some((row) => String(row.bonus_type || '').toLowerCase() === 'commission');
      const hasRoyalty = sameDateBonusRows.some((row) => String(row.bonus_type || '').toLowerCase() === 'royalty');
      nextPayout = {
        date: nextDateKey,
        amount: Number(
          (
            sameDateWorkerPayouts.reduce((sum: number, row: any) => sum + Number(row.net_amount || 0), 0) +
            sameDateBonusRows.reduce((sum: number, row: any) => sum + Number(row.bonus_amount || 0), 0)
          ).toFixed(2)
        ),
        label: hasWorkerPayout && (hasCommission || hasRoyalty)
          ? 'Mixed payout batch'
          : hasWorkerPayout
            ? 'Base worker payout'
            : hasCommission && hasRoyalty
              ? 'Mixed payout batch'
              : hasRoyalty
            ? 'Royalty payout'
            : 'Commission payout',
      };
    }

    const history = historyRows.map((row) => {
      const completedAt = row.completed_at ? new Date(row.completed_at) : now;
      const workerPayout = Number(row.worker_payout || 0);
      const basePayout = workerPayoutRows.find(
        (payout: any) =>
          payout.id_request != null && Number(payout.id_request) === Number(row.id_request)
      );
      const commissionPayout = bonusPayoutRows.find(
        (payout: any) =>
          String(payout.bonus_type || '').toLowerCase() === 'commission' &&
          payout.source_request_id != null &&
          Number(payout.source_request_id) === Number(row.id_request)
      );
      const commissionBonus = commissionPayout ? Number(commissionPayout.bonus_amount || 0) : 0;
      const payoutDates = [
        basePayout?.scheduled_for ? new Date(basePayout.scheduled_for) : null,
        commissionPayout?.scheduled_for ? new Date(commissionPayout.scheduled_for) : null,
      ].filter((value): value is Date => Boolean(value));
      const payoutDate = payoutDates.length > 0
        ? payoutDates.sort((left, right) => left.getTime() - right.getTime())[0]
        : getNextPayoutWeekday(completedAt, settings.payout_weekday);

      return {
        id_request: Number(row.id_request),
        service_name: String(row.service_name || 'Service'),
        location_text: String(row.location_text || ''),
        description: String(row.description || ''),
        client_name: `${row.client_name || ''} ${row.client_lastname || ''}`.trim(),
        completed_at: completedAt.toISOString(),
        worker_payout: workerPayout,
        payment_status: String(row.payment_status || 'pending'),
        worker_payout_status: basePayout ? String(basePayout.payout_status || 'scheduled') : String(row.payment_status || 'pending'),
        worker_payout_paid_at: basePayout?.paid_at ? new Date(basePayout.paid_at).toISOString() : null,
        commission_bonus: commissionBonus,
        royalty_bonus: 0,
        total_bonus: commissionBonus,
        scheduled_payout_date: payoutDate.toISOString(),
        bonus_status: commissionPayout ? String(commissionPayout.payout_status || 'scheduled') : 'not_eligible',
        paid_at: commissionPayout?.paid_at ? new Date(commissionPayout.paid_at).toISOString() : null,
      };
    });

    const jobsUntilTrial = Math.max(settings.trial_min_completed_jobs - lifetimeCompletedJobs, 0);
    const jobsUntilRoyalty = Math.max(settings.royalty_min_jobs - currentCycleCompletedJobs, 0);
    const completionRateGap = Math.max(settings.royalty_min_completion_rate - completionRate, 0);
    const payoutWeekdayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(
      getNextPayoutWeekday(now, settings.payout_weekday)
    );

    res.json({
      success: true,
      program: {
        trial_min_completed_jobs: settings.trial_min_completed_jobs,
        commission_rate: settings.commission_rate,
        royalty_rate: settings.royalty_rate,
        royalty_min_jobs: settings.royalty_min_jobs,
        royalty_min_completion_rate: settings.royalty_min_completion_rate,
        payout_day_label: payoutWeekdayLabel,
      },
      summary: {
        lifetime_completed_jobs: lifetimeCompletedJobs,
        current_cycle_completed_jobs: currentCycleCompletedJobs,
        current_cycle_closed_jobs: currentCycleClosedJobs,
        completion_rate: completionRate,
        cycle_gross_earnings: Number(cycleGrossEarnings.toFixed(2)),
        released_worker_payout: Number(paidBaseWorkerPayout.toFixed(2)),
        pending_worker_payout: Number(scheduledBaseWorkerPayout.toFixed(2)),
        pending_release_worker_payout: Number(pendingReleaseWorkerPayout.toFixed(2)),
        released_to_payout_amount: Number(releasedToPayoutWorkerAmount.toFixed(2)),
        scheduled_bonus_payout: Number(scheduledBonusPayout.toFixed(2)),
        paid_bonus_payout: Number(paidBonusPayout.toFixed(2)),
        current_month_commission: Number(currentMonthCommission.toFixed(2)),
        royalty_bonus: Number(royaltyBonus.toFixed(2)),
        total_bonus: Number((currentMonthCommission + royaltyBonus).toFixed(2)),
        next_payout_date: nextPayout?.date || null,
        next_payout_amount: nextPayout?.amount || 0,
        next_payout_label: nextPayout?.label || null,
        trial_unlocked: trialUnlocked,
        royalty_unlocked: royaltyUnlocked,
      },
      progress: {
        jobs_until_trial: jobsUntilTrial,
        jobs_until_royalty: jobsUntilRoyalty,
        completion_rate_gap: Number(completionRateGap.toFixed(1)),
        trial_progress_percent: Math.min(100, Math.round((lifetimeCompletedJobs / settings.trial_min_completed_jobs) * 100)),
        royalty_jobs_progress_percent: Math.min(100, Math.round((currentCycleCompletedJobs / settings.royalty_min_jobs) * 100)),
        completion_rate_progress_percent: Math.min(
          100,
          Math.round((completionRate / settings.royalty_min_completion_rate) * 100)
        ),
      },
      calendar: {
        month_label: formatMonthLabel(now),
        anchor_date: now.toISOString(),
        items: upcomingCalendar,
      },
      history,
    });
  } catch (error: any) {
    console.error('Error in getWorkerRewardsDashboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const downloadWorkerRewardsStatementPdf = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const queuedStatement = await queueWorkerPayoutStatementEmail(userId, {
      period: req.query.period ? String(req.query.period) : null,
      status: req.query.status ? String(req.query.status) : null,
      from: req.query.from ? String(req.query.from) : null,
      to: req.query.to ? String(req.query.to) : null,
    });
    const fileName = queuedStatement.fileName;
    const pdfBuffer = queuedStatement.pdfBuffer;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(pdfBuffer.length));
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error in downloadWorkerRewardsStatementPdf:', error);
    res.status(500).json({ error: 'Could not generate worker payout statement.' });
  }
};

export const getWorkerRequests = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();
    await ensureWorkerGeoColumns();
    await autoReassignStaleAssignedRequests();

    const status = String(req.query.status || 'new').toLowerCase();
    const allowed = new Set(['new', 'accepted', 'rejected', 'all']);
    if (!allowed.has(status)) {
      res.status(400).json({ error: 'Invalid status filter.' });
      return;
    }

    const [profileRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_worker_profile, latitude, longitude
       FROM worker_profiles
       WHERE id_user = ?
       LIMIT 1`,
      [userId]
    );

    if (profileRows.length === 0) {
      res.status(404).json({ error: 'Worker profile not found.' });
      return;
    }

    const profileId = Number(profileRows[0].id_worker_profile);
    const workerLat = profileRows[0].latitude != null ? Number(profileRows[0].latitude) : null;
    const workerLng = profileRows[0].longitude != null ? Number(profileRows[0].longitude) : null;
    const activeRequest = await getWorkerActiveRequest(pool, profileId);

    // Backfill discovery rows so older/open requests become visible for eligible workers.
    // This covers requests created before the worker had geo/service data ready.
    await pool.execute(
      `INSERT INTO service_request_workers (id_request, id_worker_profile, distance_km, status)
       SELECT
         sr.id_request,
         ? AS id_worker_profile,
         (ST_Distance_Sphere(point(wp.longitude, wp.latitude), point(sr.longitude, sr.latitude)) / 1000) AS distance_km,
         'new' AS status
       FROM worker_profiles wp
       INNER JOIN worker_services ws ON ws.id_worker_profile = wp.id_worker_profile
       INNER JOIN service_requests sr ON sr.id_service = ws.id_service
       LEFT JOIN service_request_workers srw
         ON srw.id_request = sr.id_request
        AND srw.id_worker_profile = wp.id_worker_profile
       WHERE wp.id_worker_profile = ?
         AND wp.is_verified = 1
         AND wp.latitude IS NOT NULL
         AND wp.longitude IS NOT NULL
         AND sr.status IN ('open', 'pending')
         AND sr.latitude IS NOT NULL
         AND sr.longitude IS NOT NULL
         AND (sr.id_user IS NULL OR sr.id_user <> wp.id_user)
         AND (
           COALESCE(sr.booking_type, 'express') = 'express'
           OR NOT EXISTS (
             SELECT 1
             FROM worker_availabilities wa_any
             WHERE wa_any.id_worker_profile = wp.id_worker_profile
               AND wa_any.is_active = 1
           )
           OR EXISTS (
             SELECT 1
             FROM worker_availabilities wa
             WHERE wa.id_worker_profile = wp.id_worker_profile
               AND wa.is_active = 1
               AND wa.day_of_week = WEEKDAY(sr.scheduled_date) + 1 - CASE WHEN WEEKDAY(sr.scheduled_date) = 6 THEN 7 ELSE 0 END
               AND wa.start_time <= sr.scheduled_time
               AND wa.end_time >= TIME(COALESCE(sr.scheduled_end_time, DATE_ADD(sr.scheduled_start_time, INTERVAL ? MINUTE)))
           )
         )
         AND (ST_Distance_Sphere(point(wp.longitude, wp.latitude), point(sr.longitude, sr.latitude)) / 1000) <= LEAST(COALESCE(sr.radius_km, 8), wp.coverage_km)
         AND srw.id_request IS NULL`,
      [profileId, profileId, SCHEDULED_REQUEST_DURATION_MINUTES]
    );

    const whereParts: string[] = ['srw.id_worker_profile = ?'];
    const params: any[] = [profileId];

    if (status === 'new') {
      whereParts.push(`srw.status = 'new'`);
      whereParts.push(`sr.status IN ('open', 'pending')`);
    } else if (status === 'accepted') {
      whereParts.push(`srw.status = 'accepted'`);
      whereParts.push(`sr.assigned_worker_profile = ?`);
      params.push(profileId);
    } else if (status === 'rejected') {
      whereParts.push(`srw.status = 'rejected'`);
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         sr.id_request,
         sr.id_service,
         sr.description,
         sr.location_text,
         sr.latitude,
         sr.longitude,
         sr.budget,
         sr.radius_km,
         sr.booking_type,
         sr.selection_mode,
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
         EXISTS(SELECT 1 FROM service_request_workflow_approvals a WHERE a.id_request = sr.id_request AND a.action = 'start_work' AND a.actor_role = 'client') AS start_client_approved,
         EXISTS(SELECT 1 FROM service_request_workflow_approvals a WHERE a.id_request = sr.id_request AND a.action = 'start_work' AND a.actor_role = 'worker') AS start_worker_approved,
         EXISTS(SELECT 1 FROM service_request_workflow_approvals a WHERE a.id_request = sr.id_request AND a.action = 'finish_work' AND a.actor_role = 'client') AS finish_client_approved,
         EXISTS(SELECT 1 FROM service_request_workflow_approvals a WHERE a.id_request = sr.id_request AND a.action = 'finish_work' AND a.actor_role = 'worker') AS finish_worker_approved,
         EXISTS(SELECT 1 FROM service_request_workflow_approvals a WHERE a.id_request = sr.id_request AND a.action = 'complete_service' AND a.actor_role = 'client') AS complete_client_approved,
         EXISTS(SELECT 1 FROM service_request_workflow_approvals a WHERE a.id_request = sr.id_request AND a.action = 'complete_service' AND a.actor_role = 'worker') AS complete_worker_approved,
         sr.status AS request_status,
         sr.created_at,
         sr.assigned_worker_profile,
         s.name AS service_name,
         s.icon AS service_icon,
         srw.distance_km,
         srw.status AS worker_status,
         srw.proposed_budget,
         srw.counter_message,
         u.id_user AS client_id,
         u.name AS client_name,
         u.lastname AS client_lastname,
         u.profile_image AS client_profile_image,
         GROUP_CONCAT(DISTINCT sri.image_url ORDER BY sri.id_image ASC SEPARATOR '||') AS image_urls
       FROM service_request_workers srw
       INNER JOIN service_requests sr ON sr.id_request = srw.id_request
       INNER JOIN services s ON s.id_service = sr.id_service
       LEFT JOIN users u ON u.id_user = sr.id_user
       LEFT JOIN service_request_images sri ON sri.id_request = sr.id_request
       WHERE ${whereParts.join(' AND ')}
        GROUP BY
          sr.id_request, sr.id_service, sr.description, sr.location_text, sr.latitude, sr.longitude,
          sr.budget, sr.radius_km, sr.booking_type, sr.selection_mode, sr.scheduled_date, sr.scheduled_time,
          sr.scheduled_start_time, sr.scheduled_end_time, sr.workflow_version, sr.client_approved_at, sr.route_started_at,
          sr.worker_arrived_at, sr.work_started_at, sr.work_finished_at, sr.completed_at, sr.status, sr.created_at, sr.assigned_worker_profile,
          s.name, s.icon, srw.distance_km, srw.status, srw.proposed_budget, srw.counter_message,
          u.id_user, u.name, u.lastname, u.profile_image
       ORDER BY
         CASE WHEN srw.status = 'new' THEN 0 ELSE 1 END,
         sr.created_at DESC
       LIMIT 60`,
      params
    );

    const requests = rows.map((row: any) => {
      const exactLat = row.latitude != null ? Number(row.latitude) : null;
      const exactLng = row.longitude != null ? Number(row.longitude) : null;
      const isUnacceptedCandidate = String(row.worker_status || '').toLowerCase() === 'new';
      const lat =
        exactLat != null
          ? isUnacceptedCandidate
            ? Number(exactLat.toFixed(2))
            : exactLat
          : null;
      const lng =
        exactLng != null
          ? isUnacceptedCandidate
            ? Number(exactLng.toFixed(2))
            : exactLng
          : null;
      const routeUrl =
        !isUnacceptedCandidate &&
        lat != null &&
        lng != null &&
        workerLat != null &&
        workerLng != null
          ? `https://www.google.com/maps/dir/?api=1&origin=${workerLat},${workerLng}&destination=${lat},${lng}&travelmode=driving`
          : null;

      const images =
        typeof row.image_urls === 'string' && row.image_urls.length > 0
          ? String(row.image_urls)
              .split('||')
              .filter(Boolean)
              .map((name: string) => ({
                file_name: name,
                url: buildProtectedAssetUrl(req, name),
              }))
          : [];
      const locationParts = String(row.location_text || '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
      const approximateLocation =
        locationParts.length > 2
          ? locationParts.slice(-3).join(', ')
          : locationParts.join(', ');
      const clientFirstName = String(row.client_name || '').trim() || 'Client';

      return {
        id_request: Number(row.id_request),
        id_service: Number(row.id_service),
        service_name: row.service_name,
        service_icon: row.service_icon || null,
        description: row.description,
        location_text: isUnacceptedCandidate
          ? approximateLocation
            ? `Near ${approximateLocation}`
            : 'Approximate area available'
          : row.location_text,
        latitude: lat,
        longitude: lng,
        budget: Number(row.budget || 0),
        radius_km: Number(row.radius_km || 8),
        booking_type: String(row.booking_type || 'express'),
        selection_mode: String(row.selection_mode || 'client_review'),
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
          start_work: { client: Boolean(row.start_client_approved), worker: Boolean(row.start_worker_approved) },
          finish_work: { client: Boolean(row.finish_client_approved), worker: Boolean(row.finish_worker_approved) },
          complete_service: { client: Boolean(row.complete_client_approved), worker: Boolean(row.complete_worker_approved) },
        },
        request_status: toPublicRequestStatus(row.request_status),
        worker_status: row.worker_status,
        proposed_budget: row.proposed_budget != null ? Number(row.proposed_budget) : null,
        counter_message: row.counter_message || null,
        distance_km: row.distance_km != null ? Number(row.distance_km) : null,
        created_at: row.created_at,
        assigned_worker_profile:
          row.assigned_worker_profile != null ? Number(row.assigned_worker_profile) : null,
        client: row.client_id
          ? {
              id_user: Number(row.client_id),
              name: isUnacceptedCandidate
                ? clientFirstName
                : `${row.client_name || ''} ${row.client_lastname || ''}`.trim(),
              profile_image_url: buildAssetUrl(req, row.client_profile_image || null),
            }
          : null,
        images,
        route_url: routeUrl,
      };
    });

    res.json({
      success: true,
      status,
      worker_profile: {
        id_worker_profile: profileId,
        latitude: workerLat,
        longitude: workerLng,
        active_request_id: activeRequest?.id_request ?? null,
        active_request_status: activeRequest?.status ?? null,
      },
      requests,
    });
  } catch (error: any) {
    console.error('Error in getWorkerRequests:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getWorkerAppointments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();

    const [profileRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_worker_profile
       FROM worker_profiles
       WHERE id_user = ?
       LIMIT 1`,
      [userId]
    );

    if (profileRows.length === 0) {
      res.status(404).json({ error: 'Worker profile not found.' });
      return;
    }

    const profileId = Number(profileRows[0].id_worker_profile);
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         sr.id_request,
         sr.id_service,
         sr.description,
         sr.location_text,
         sr.latitude,
         sr.longitude,
         sr.budget,
         sr.final_budget,
         sr.status,
         sr.scheduled_date,
         sr.scheduled_time,
         sr.scheduled_start_time,
         sr.scheduled_end_time,
         sr.created_at,
         sr.assigned_at,
         s.name AS service_name,
         s.icon AS service_icon,
         u.id_user AS client_id,
         u.name AS client_name,
         u.lastname AS client_lastname,
         u.phone_number AS client_phone_number,
         srw.proposed_budget,
         srw.counter_status
       FROM service_requests sr
       INNER JOIN services s ON s.id_service = sr.id_service
       LEFT JOIN users u ON u.id_user = sr.id_user
       LEFT JOIN service_request_workers srw
         ON srw.id_request = sr.id_request
        AND srw.id_worker_profile = sr.assigned_worker_profile
       WHERE sr.assigned_worker_profile = ?
         AND sr.booking_type = 'scheduled'
         AND sr.status IN ('assigned', 'route_in_progress', 'arrived', 'start_pending', 'in_progress', 'finish_pending', 'payment_pending', 'paid', 'completion_pending', 'awaiting_confirmation')
         AND sr.scheduled_start_time IS NOT NULL
         AND sr.scheduled_start_time >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 6 HOUR)
       ORDER BY sr.scheduled_start_time ASC
       LIMIT 100`,
      [profileId]
    );

    const appointments = rows.map((row: any) => ({
      id_request: Number(row.id_request),
      id_service: Number(row.id_service),
      service_name: row.service_name,
      service_icon: row.service_icon || null,
      description: row.description,
      location_text: row.location_text,
      latitude: row.latitude != null ? Number(row.latitude) : null,
      longitude: row.longitude != null ? Number(row.longitude) : null,
      budget: Number(row.final_budget ?? row.proposed_budget ?? row.budget ?? 0),
      status: toPublicRequestStatus(row.status),
      scheduled_date: row.scheduled_date || null,
      scheduled_time: row.scheduled_time || null,
      scheduled_start_time: row.scheduled_start_time || null,
      scheduled_end_time: row.scheduled_end_time || null,
      created_at: row.created_at,
      assigned_at: row.assigned_at || null,
      counter_status: row.counter_status || null,
      client: row.client_id
        ? {
            id_user: Number(row.client_id),
            name: `${row.client_name || ''} ${row.client_lastname || ''}`.trim(),
            phone_number: row.client_phone_number || null,
          }
        : null,
    }));

    res.json({ success: true, appointments });
  } catch (error: any) {
    console.error('Error in getWorkerAppointments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getWorkerWorkspace = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();
    const [profileRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_worker_profile FROM worker_profiles WHERE id_user = ? LIMIT 1`,
      [userId]
    );
    if (profileRows.length === 0) {
      res.status(404).json({ error: 'Worker profile not found.' });
      return;
    }

    const profileId = Number(profileRows[0].id_worker_profile);
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         sr.id_request,
         sr.description,
         sr.location_text,
         sr.latitude,
         sr.longitude,
         sr.budget,
         sr.final_budget,
         sr.booking_type,
         sr.status,
         sr.scheduled_start_time,
         sr.scheduled_end_time,
         sr.created_at,
         s.name AS service_name,
         s.icon AS service_icon,
         u.name AS client_name,
         u.lastname AS client_lastname,
         srw.proposed_budget
       FROM service_requests sr
       INNER JOIN services s ON s.id_service = sr.id_service
       LEFT JOIN users u ON u.id_user = sr.id_user
       LEFT JOIN service_request_workers srw
         ON srw.id_request = sr.id_request
        AND srw.id_worker_profile = ?
       WHERE sr.assigned_worker_profile = ?
         AND sr.status IN ('assigned', 'route_in_progress', 'arrived', 'start_pending', 'in_progress', 'finish_pending', 'payment_pending', 'paid', 'completion_pending', 'awaiting_confirmation', 'done')
         AND (
           (sr.scheduled_start_time IS NOT NULL
             AND sr.scheduled_start_time >= DATE_SUB(CURDATE(), INTERVAL 1 DAY)
             AND sr.scheduled_start_time < DATE_ADD(CURDATE(), INTERVAL 8 DAY))
           OR (COALESCE(sr.booking_type, 'express') = 'express'
             AND DATE(COALESCE(sr.updated_at, sr.created_at)) = CURDATE())
         )
       ORDER BY COALESCE(sr.scheduled_start_time, sr.created_at) ASC
       LIMIT 120`,
      [profileId, profileId]
    );

    const jobs = rows.map((row: any) => {
      const start = row.scheduled_start_time ? new Date(row.scheduled_start_time) : null;
      const end = row.scheduled_end_time ? new Date(row.scheduled_end_time) : null;
      return {
        id_request: Number(row.id_request),
        service_name: String(row.service_name || 'Service'),
        service_icon: row.service_icon || null,
        description: String(row.description || ''),
        location_text: String(row.location_text || ''),
        latitude: row.latitude != null ? Number(row.latitude) : null,
        longitude: row.longitude != null ? Number(row.longitude) : null,
        amount: Number(row.final_budget ?? row.proposed_budget ?? row.budget ?? 0),
        booking_type: String(row.booking_type || 'express'),
        status: toPublicRequestStatus(row.status),
        scheduled_start_time: row.scheduled_start_time || null,
        scheduled_end_time: row.scheduled_end_time || null,
        duration_minutes:
          start && end && end > start
            ? Math.round((end.getTime() - start.getTime()) / 60_000)
            : SCHEDULED_REQUEST_DURATION_MINUTES,
        client_name: `${row.client_name || ''} ${row.client_lastname || ''}`.trim(),
      };
    });

    const todayKey = new Date().toISOString().slice(0, 10);
    const todayJobs = jobs.filter((job) => {
      if (!job.scheduled_start_time) return job.booking_type === 'express';
      return new Date(job.scheduled_start_time).toISOString().slice(0, 10) === todayKey;
    });
    const pendingStatuses = new Set([
      'assigned',
      'route_in_progress',
      'arrived',
      'start_pending',
      'payment_pending',
      'paid',
      'in_progress',
      'finish_pending',
      'completion_pending',
      'awaiting_confirmation',
    ]);
    const scheduledToday = todayJobs
      .filter((job) => job.scheduled_start_time)
      .sort(
        (left, right) =>
          new Date(left.scheduled_start_time as string).getTime() -
          new Date(right.scheduled_start_time as string).getTime()
      );
    let totalDistanceKm = 0;
    for (let index = 1; index < scheduledToday.length; index += 1) {
      const previous = scheduledToday[index - 1];
      const current = scheduledToday[index];
      if (
        previous.latitude != null &&
        previous.longitude != null &&
        current.latitude != null &&
        current.longitude != null
      ) {
        const toRad = (value: number) => (value * Math.PI) / 180;
        const dLat = toRad(current.latitude - previous.latitude);
        const dLng = toRad(current.longitude - previous.longitude);
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(previous.latitude)) *
            Math.cos(toRad(current.latitude)) *
            Math.sin(dLng / 2) ** 2;
        totalDistanceKm += 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      }
    }
    const now = Date.now();
    const nextJob =
      scheduledToday.find(
        (job) =>
          job.scheduled_start_time &&
          new Date(job.scheduled_start_time).getTime() >= now
      ) || null;

    res.json({
      success: true,
      summary: {
        estimated_earnings: Number(
          todayJobs.reduce((sum, job) => sum + job.amount, 0).toFixed(2)
        ),
        pending_jobs: todayJobs.filter((job) => pendingStatuses.has(job.status)).length,
        completed_jobs: todayJobs.filter((job) => job.status === 'done').length,
        total_distance_km: Number(totalDistanceKm.toFixed(1)),
        next_job: nextJob,
      },
      agenda: {
        buffer_minutes: SCHEDULE_BUFFER_TIME_MINUTES,
        range_start: new Date().toISOString(),
        range_end: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
        jobs,
      },
    });
  } catch (error) {
    console.error('Error in getWorkerWorkspace:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const acceptWorkerRequest = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const [profileRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id_worker_profile FROM worker_profiles WHERE id_user = ? LIMIT 1`,
      [userId]
    );
    if (profileRows.length === 0) {
      res.status(404).json({ error: 'Worker profile not found.' });
      return;
    }
    const profileId = Number(profileRows[0].id_worker_profile);
    const activeRequest = await getWorkerActiveRequest(connection as any, profileId, idRequest);
    if (activeRequest) {
      res.status(409).json({
        error: `Finish request #${activeRequest.id_request} before accepting another one.`,
        active_request_id: activeRequest.id_request,
        active_request_status: activeRequest.status,
      });
      return;
    }

    await connection.beginTransaction();

    await connection.execute(
      `SELECT id_worker_profile
       FROM worker_profiles
       WHERE id_worker_profile = ?
       FOR UPDATE`,
      [profileId]
    );

    const [requestRows] = await connection.execute<RowDataPacket[]>(
      `SELECT
         id_request,
         id_user,
         status,
         assigned_worker_profile,
         booking_type,
         selection_mode,
         scheduled_start_time,
         scheduled_end_time
       FROM service_requests
       WHERE id_request = ?
       FOR UPDATE`,
      [idRequest]
    );
    if (requestRows.length === 0) {
      await connection.rollback();
      res.status(404).json({ error: 'Request not found.' });
      return;
    }

    const request = requestRows[0];
    const reqStatus = String(request.status || "").toLowerCase();
    if (!["pending", "assigned"].includes(reqStatus)) {
      await connection.rollback();
      res.status(409).json({ error: 'Request already taken by another worker.' });
      return;
    }

    if (String(request.booking_type || 'express').toLowerCase() === 'scheduled') {
      const conflict = await getScheduledConflict(connection as any, {
        profileId,
        idRequest,
        scheduledStartTime: request.scheduled_start_time || null,
        scheduledEndTime: request.scheduled_end_time || null,
      });

      if (conflict) {
        await connection.rollback();
        res.status(409).json({
          error: `This visit overlaps with scheduled request #${conflict.id_request}.`,
          conflict_request_id: conflict.id_request,
        });
        return;
      }
    }

    const [myRow] = await connection.execute<RowDataPacket[]>(
      `SELECT status FROM service_request_workers
       WHERE id_request = ? AND id_worker_profile = ?
       LIMIT 1
       FOR UPDATE`,
      [idRequest, profileId]
    );
    if (myRow.length === 0 || myRow[0].status !== 'new') {
      await connection.rollback();
      res.status(409).json({ error: 'This request is no longer available for acceptance.' });
      return;
    }

    await connection.execute(
      `UPDATE service_requests
       SET status = 'assigned',
           assigned_worker_profile = ?,
           assigned_at = CURRENT_TIMESTAMP,
           client_approved_at = CASE WHEN selection_mode = 'auto_assign' THEN CURRENT_TIMESTAMP ELSE client_approved_at END,
           worker_arrived_at = NULL,
           final_budget = COALESCE(final_budget, budget),
           updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ?`,
      [profileId, idRequest]
    );

    await connection.execute(
      `UPDATE service_request_workers
       SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ? AND id_worker_profile = ?`,
      [idRequest, profileId]
    );

    await connection.execute(
      `UPDATE service_request_workers
       SET status = 'expired', updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ? AND id_worker_profile != ? AND status = 'new'`,
      [idRequest, profileId]
    );

    await connection.commit();

    const requestOwnerId = Number(request.id_user || 0);
    const isAutoAssignRequest = String(request.selection_mode || '').toLowerCase() === 'auto_assign';
    if (requestOwnerId) {
      await createUserNotification({
        userId: requestOwnerId,
        eventType: 'request_accepted',
        title: isAutoAssignRequest ? 'Fast Match found your Pro' : 'Worker ready for your approval',
        message: isAutoAssignRequest
          ? `Request #${idRequest} was assigned automatically to a verified Pro.`
          : `Request #${idRequest} now has a pro assigned. Review the profile and accept or decline this worker.`,
        tone: 'success',
        requestId: idRequest,
        actionUrl: '/app',
        dedupeKey: `request-${idRequest}-accepted-client`,
        metadata: { request_status: 'assigned', awaiting_client_approval: !isAutoAssignRequest },
      });
    }

    await createUserNotification({
      userId,
      eventType: 'request_accepted',
      title: isAutoAssignRequest ? 'Fast Match pre-approved' : 'Waiting for client approval',
      message: isAutoAssignRequest
        ? `You accepted request #${idRequest}. The client chose Fast Match, so you can start the route.`
        : `You accepted request #${idRequest}. The client now needs to approve you before the trip can continue.`,
      tone: 'success',
      requestId: idRequest,
      actionUrl: '/pro-dashboard',
      dedupeKey: `request-${idRequest}-accepted-worker`,
      metadata: { request_status: 'assigned', awaiting_client_approval: !isAutoAssignRequest },
    });

    res.json({
      success: true,
      message: isAutoAssignRequest
        ? 'Request accepted. You can start the route.'
        : 'Request accepted. Waiting for client approval.',
      id_request: idRequest,
      request_status: 'assigned',
      awaiting_client_approval: !isAutoAssignRequest,
    });
  } catch (error: any) {
    await connection.rollback();
    console.error('Error in acceptWorkerRequest:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

export const rejectWorkerRequest = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const [profileRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_worker_profile FROM worker_profiles WHERE id_user = ? LIMIT 1`,
      [userId]
    );
    if (profileRows.length === 0) {
      res.status(404).json({ error: 'Worker profile not found.' });
      return;
    }
    const profileId = Number(profileRows[0].id_worker_profile);

    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE service_request_workers
       SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ? AND id_worker_profile = ? AND status = 'new'`,
      [idRequest, profileId]
    );

    if (result.affectedRows === 0) {
      res.status(409).json({ error: 'Request is not available to reject.' });
      return;
    }

    res.json({ success: true, message: 'Request rejected.', id_request: idRequest });
  } catch (error: any) {
    console.error('Error in rejectWorkerRequest:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const counterOfferWorkerRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();

    const idRequest = Number(req.params.idRequest);
    const proposedBudget = Number(req.body?.proposed_budget);
    const counterMessage = sanitizeMessage(req.body?.counter_message, 255) || null;

    if (!idRequest) {
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }
    if (!Number.isFinite(proposedBudget) || proposedBudget <= 0 || proposedBudget > 1000) {
      res.status(400).json({ error: 'proposed_budget must be between 0.01 and 1000.00.' });
      return;
    }

    const [profileRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id_worker_profile FROM worker_profiles WHERE id_user = ? LIMIT 1`,
      [userId]
    );
    if (profileRows.length === 0) {
      res.status(404).json({ error: 'Worker profile not found.' });
      return;
    }
    const profileId = Number(profileRows[0].id_worker_profile);
    const activeRequest = await getWorkerActiveRequest(connection as any, profileId, idRequest);
    if (activeRequest) {
      res.status(409).json({
        error: `Finish request #${activeRequest.id_request} before taking another one.`,
        active_request_id: activeRequest.id_request,
        active_request_status: activeRequest.status,
      });
      return;
    }

    await connection.beginTransaction();

    await connection.execute(
      `SELECT id_worker_profile
       FROM worker_profiles
       WHERE id_worker_profile = ?
       FOR UPDATE`,
      [profileId]
    );

    const [requestRows] = await connection.execute<RowDataPacket[]>(
      `SELECT
         id_request,
         id_user,
         status,
         assigned_worker_profile,
         booking_type,
         scheduled_start_time,
         scheduled_end_time
       FROM service_requests
       WHERE id_request = ?
       FOR UPDATE`,
      [idRequest]
    );
    if (requestRows.length === 0) {
      await connection.rollback();
      res.status(404).json({ error: 'Request not found.' });
      return;
    }

    const request = requestRows[0];
    const reqStatus = String(request.status || "").toLowerCase();
    if (!["pending", "assigned"].includes(reqStatus)) {
      await connection.rollback();
      res.status(409).json({ error: 'Request already taken by another worker.' });
      return;
    }

    if (String(request.booking_type || 'express').toLowerCase() === 'scheduled') {
      const conflict = await getScheduledConflict(connection as any, {
        profileId,
        idRequest,
        scheduledStartTime: request.scheduled_start_time || null,
        scheduledEndTime: request.scheduled_end_time || null,
      });

      if (conflict) {
        await connection.rollback();
        res.status(409).json({
          error: `This visit overlaps with scheduled request #${conflict.id_request}.`,
          conflict_request_id: conflict.id_request,
        });
        return;
      }
    }

    const [myRow] = await connection.execute<RowDataPacket[]>(
      `SELECT status FROM service_request_workers
       WHERE id_request = ? AND id_worker_profile = ?
       LIMIT 1
       FOR UPDATE`,
      [idRequest, profileId]
    );
    if (myRow.length === 0 || myRow[0].status !== 'new') {
      await connection.rollback();
      res.status(409).json({ error: 'This request is no longer available for counter offer.' });
      return;
    }

    await connection.execute(
      `UPDATE service_requests
       SET status = 'assigned', assigned_worker_profile = ?, assigned_at = CURRENT_TIMESTAMP, worker_arrived_at = NULL, final_budget = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ?`,
      [profileId, idRequest]
    );

    await connection.execute(
      `UPDATE service_request_workers
       SET status = 'accepted', proposed_budget = ?, counter_message = ?, counter_status = 'pending', updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ? AND id_worker_profile = ?`,
      [proposedBudget, counterMessage, idRequest, profileId]
    );

    await connection.execute(
      `UPDATE service_request_workers
       SET status = 'expired', updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ? AND id_worker_profile != ? AND status = 'new'`,
      [idRequest, profileId]
    );

    await connection.commit();

    const requestOwnerId = Number(request.id_user || 0);
    if (requestOwnerId) {
      await createUserNotification({
        userId: requestOwnerId,
        eventType: 'counter_offer_received',
        title: 'Counter offer received',
        message: `Your pro sent a new quote for request #${idRequest}. Review it before paying.`,
        tone: 'warning',
        requestId: idRequest,
        actionUrl: '/app',
        dedupeKey: `request-${idRequest}-counter-client`,
        metadata: { request_status: 'assigned', proposed_budget: proposedBudget },
      });
    }

    await createUserNotification({
      userId,
      eventType: 'counter_offer_sent',
      title: 'Counter offer sent',
      message: `You sent a counter offer for request #${idRequest}. Waiting for the client response.`,
      tone: 'info',
      requestId: idRequest,
      actionUrl: '/pro-dashboard',
      dedupeKey: `request-${idRequest}-counter-worker`,
      metadata: { request_status: 'assigned', proposed_budget: proposedBudget },
    });

    res.json({
      success: true,
      message: 'Counter offer sent and request assigned.',
      id_request: idRequest,
      proposed_budget: proposedBudget,
      counter_message: counterMessage,
    });
  } catch (error: any) {
    await connection.rollback();
    console.error('Error in counterOfferWorkerRequest:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

export const startWorkerRoute = async (req: AuthRequest, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const userId = Number(req.user?.user_id || 0);
    const idRequest = Number(req.params.idRequest);
    if (!userId || !Number.isSafeInteger(idRequest) || idRequest <= 0) {
      res.status(400).json({ error: 'Invalid request.' });
      return;
    }
    await ensureServiceRequestTables();
    await connection.beginTransaction();
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT sr.id_request, sr.id_user, sr.status, sr.workflow_version, sr.client_approved_at,
              sr.assigned_worker_profile, wp.id_worker_profile
       FROM service_requests sr
       INNER JOIN worker_profiles wp ON wp.id_worker_profile = sr.assigned_worker_profile
       WHERE sr.id_request = ? AND wp.id_user = ?
       LIMIT 1 FOR UPDATE`,
      [idRequest, userId]
    );
    if (rows.length === 0) {
      await connection.rollback();
      res.status(404).json({ error: 'Assigned request not found.' });
      return;
    }
    const request = rows[0];
    if (Number(request.workflow_version || 1) < 2) {
      await connection.rollback();
      res.status(409).json({ error: 'This request uses the legacy route flow.' });
      return;
    }
    const status = String(request.status || '').toLowerCase();
    if (status === 'route_in_progress') {
      await connection.rollback();
      res.json({ success: true, request_status: status, already_started: true });
      return;
    }
    if (status !== 'assigned' || !request.client_approved_at) {
      await connection.rollback();
      res.status(409).json({ error: 'Client approval is required before starting the route.' });
      return;
    }
    await connection.execute(
      `UPDATE service_requests SET status = 'route_in_progress', route_started_at = COALESCE(route_started_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id_request = ?`,
      [idRequest]
    );
    await connection.commit();
    const clientId = Number(request.id_user || 0);
    if (clientId) {
      await createUserNotification({
        userId: clientId,
        eventType: 'worker_route_started',
        title: 'Worker is on the way',
        message: `Your professional started the route for request #${idRequest}.`,
        tone: 'info', requestId: idRequest, actionUrl: '/app',
        dedupeKey: `request-${idRequest}-route-started`, metadata: { request_status: 'route_in_progress' },
      });
      emitToUser(clientId, 'request_updated', { id_request: idRequest, request_status: 'route_in_progress' });
    }
    res.json({ success: true, id_request: idRequest, request_status: 'route_in_progress' });
  } catch (error) {
    await connection.rollback();
    console.error('Error in startWorkerRoute:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

export const arriveWorkerRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const userId = Number(req.user?.user_id || 0);
    const idRequest = Number(req.params.idRequest);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!Number.isSafeInteger(idRequest) || idRequest <= 0) {
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }

    await ensureServiceRequestTables();
    await connection.beginTransaction();
    const [profileRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id_worker_profile
       FROM worker_profiles
       WHERE id_user = ? AND is_verified = 1
       LIMIT 1
       FOR UPDATE`,
      [userId]
    );
    if (profileRows.length === 0) {
      await connection.rollback();
      res.status(403).json({ error: 'A verified worker profile is required.' });
      return;
    }

    const profileId = Number(profileRows[0].id_worker_profile);
    const [requestRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id_request, id_user, status, workflow_version, assigned_worker_profile, worker_arrived_at,
              booking_type, scheduled_start_time, latitude, longitude
       FROM service_requests
       WHERE id_request = ?
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
    if (Number(request.assigned_worker_profile || 0) !== profileId) {
      await connection.rollback();
      res.status(403).json({ error: 'This request is assigned to another worker.' });
      return;
    }
    const requestStatus = String(request.status || '').toLowerCase();
    const isV2 = Number(request.workflow_version || 1) >= 2;
    if (isV2 && request.worker_arrived_at && ['arrived', 'start_pending', 'in_progress', 'finish_pending', 'payment_pending', 'paid', 'completion_pending', 'done'].includes(requestStatus)) {
      await connection.rollback();
      res.json({ success: true, id_request: idRequest, request_status: requestStatus, worker_arrived_at: request.worker_arrived_at, already_arrived: true });
      return;
    }
    if (isV2 ? requestStatus !== 'route_in_progress' : requestStatus !== 'paid') {
      await connection.rollback();
      res.status(409).json({ error: isV2 ? 'Start the route before confirming arrival.' : 'Arrival can only be confirmed for a paid job.' });
      return;
    }

    let arrivalWarning: string | null = null;
    let distanceM: number | null = null;
    if (isV2) {
      const latitude = Number(req.body?.latitude);
      const longitude = Number(req.body?.longitude);
      const accuracyM = Number(req.body?.accuracy_m);
      const hasCoords =
        Number.isFinite(latitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        Number.isFinite(longitude) &&
        longitude >= -180 &&
        longitude <= 180;
      if (hasCoords) {
        if (request.latitude != null && request.longitude != null) {
          const [distanceRows] = await connection.execute<RowDataPacket[]>(
            `SELECT ST_Distance_Sphere(point(?, ?), point(?, ?)) AS distance_m`,
            [longitude, latitude, Number(request.longitude), Number(request.latitude)]
          );
          const measuredDistance = Number(distanceRows[0]?.distance_m);
          distanceM = Number.isFinite(measuredDistance) ? Math.round(measuredDistance) : null;
        }
        if (!Number.isFinite(accuracyM) || accuracyM <= 0 || accuracyM > 100) {
          arrivalWarning = 'GPS accuracy was low. Client approval is still required before work starts.';
        } else if (distanceM != null && distanceM > 200) {
          arrivalWarning = `GPS reports ${distanceM} m from destination. Client approval is still required before work starts.`;
        }
        await connection.execute(
          `UPDATE worker_profiles SET latitude = ?, longitude = ?, last_seen_at = CURRENT_TIMESTAMP WHERE id_worker_profile = ?`,
          [latitude, longitude, profileId]
        );
      } else {
        arrivalWarning = 'GPS was unavailable. Client approval is still required before work starts.';
      }
    }

    if (String(request.booking_type || 'express').toLowerCase() === 'scheduled' && request.scheduled_start_time) {
      const scheduledStart = new Date(request.scheduled_start_time);
      const earliestArrival = scheduledStart.getTime() - SCHEDULED_START_EARLY_MINUTES * 60_000;
      if (!Number.isNaN(scheduledStart.getTime()) && Date.now() < earliestArrival) {
        await connection.rollback();
        res.status(409).json({
          error: `You can confirm arrival closer to ${scheduledStart.toLocaleString()}.`,
          scheduled_start_time: request.scheduled_start_time,
        });
        return;
      }
    }

    if (!request.worker_arrived_at) {
      await connection.execute(
        `UPDATE service_requests
         SET worker_arrived_at = CURRENT_TIMESTAMP,
             status = CASE WHEN workflow_version >= 2 THEN 'arrived' ELSE status END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id_request = ?`,
        [idRequest]
      );
    }
    await connection.commit();

    const requestOwnerId = Number(request.id_user || 0);
    if (requestOwnerId) {
      await createUserNotification({
        userId: requestOwnerId,
        eventType: 'worker_arrived',
        title: 'Your worker has arrived',
        message: `Your professional confirmed arrival for request #${idRequest}.`,
        tone: 'info',
        requestId: idRequest,
        actionUrl: '/app',
        dedupeKey: `request-${idRequest}-worker-arrived-client`,
        metadata: { request_status: isV2 ? 'arrived' : 'paid', worker_arrived: true },
      });
    }

    res.json({
      success: true,
      message: 'Arrival confirmed.',
      id_request: idRequest,
      worker_arrived_at: request.worker_arrived_at || new Date().toISOString(),
      request_status: isV2 ? 'arrived' : requestStatus,
      warning: arrivalWarning,
      distance_m: distanceM,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error in arriveWorkerRequest:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

export const startWorkerRequest = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const [profileRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id_worker_profile
       FROM worker_profiles
       WHERE id_user = ?
       LIMIT 1
       FOR UPDATE`,
      [userId]
    );
    if (profileRows.length === 0) {
      await connection.rollback();
      res.status(404).json({ error: 'Worker profile not found.' });
      return;
    }
    const profileId = Number(profileRows[0].id_worker_profile);
    const activeRequest = await getWorkerActiveRequest(connection as any, profileId, idRequest);
    if (activeRequest) {
      await connection.rollback();
      res.status(409).json({
        error: `Finish request #${activeRequest.id_request} before accepting another one.`,
        active_request_id: activeRequest.id_request,
        active_request_status: activeRequest.status,
      });
      return;
    }

    const [requestRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id_request, id_user, status, workflow_version, assigned_worker_profile, booking_type, scheduled_start_time, worker_arrived_at
       FROM service_requests
       WHERE id_request = ?
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
    if (Number(request.assigned_worker_profile || 0) !== profileId) {
      await connection.rollback();
      res.status(403).json({ error: 'This request is assigned to another worker.' });
      return;
    }
    if (Number(request.workflow_version || 1) >= 2) {
      await connection.rollback();
      res.status(409).json({ error: 'Use the shared start-work approval for this request.' });
      return;
    }
    const currentStatus = String(request.status || '').toLowerCase();
    if (currentStatus === 'in_progress') {
      await connection.rollback();
      res.json({
        success: true,
        message: 'Trip already started.',
        id_request: idRequest,
        request_status: 'in_progress',
        already_started: true,
      });
      return;
    }
    if (currentStatus !== 'paid') {
      await connection.rollback();
      res.status(409).json({ error: 'The client must complete payment before the job can start.' });
      return;
    }
    if (!request.worker_arrived_at) {
      await connection.rollback();
      res.status(409).json({ error: 'Confirm arrival before starting the work.' });
      return;
    }

    if (String(request.booking_type || 'express').toLowerCase() === 'scheduled' && request.scheduled_start_time) {
      const scheduledStart = new Date(request.scheduled_start_time);
      const earliestStart = scheduledStart.getTime() - SCHEDULED_START_EARLY_MINUTES * 60_000;
      if (!Number.isNaN(scheduledStart.getTime()) && Date.now() < earliestStart) {
        await connection.rollback();
        res.status(409).json({
          error: `This scheduled visit can start closer to ${scheduledStart.toLocaleString()}.`,
          scheduled_start_time: request.scheduled_start_time,
        });
        return;
      }
    }

    await connection.execute(
      `UPDATE service_requests
       SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ?`,
      [idRequest]
    );

    await connection.commit();

    const requestOwnerId = Number(request.id_user || 0);
    if (requestOwnerId) {
      await createUserNotification({
        userId: requestOwnerId,
        eventType: 'job_started',
        title: 'Work has started',
        message: `Your professional started working on request #${idRequest}.`,
        tone: 'info',
        requestId: idRequest,
        actionUrl: '/app',
        dedupeKey: `request-${idRequest}-job-started-client`,
        metadata: { request_status: 'in_progress' },
      });
    }

    await createUserNotification({
      userId,
      eventType: 'job_started',
      title: 'Route started',
      message: `Request #${idRequest} is now in progress.`,
      tone: 'success',
      requestId: idRequest,
      actionUrl: '/pro-dashboard',
      dedupeKey: `request-${idRequest}-job-started-worker`,
      metadata: { request_status: 'in_progress' },
    });

    res.json({ success: true, message: 'Job started successfully.', id_request: idRequest, request_status: 'in_progress' });
  } catch (error: any) {
    await connection.rollback();
    console.error('Error in startWorkerRequest:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

export const completeWorkerRequest = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const [profileRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id_worker_profile
       FROM worker_profiles
       WHERE id_user = ?
       LIMIT 1
       FOR UPDATE`,
      [userId]
    );
    if (profileRows.length === 0) {
      await connection.rollback();
      res.status(404).json({ error: 'Worker profile not found.' });
      return;
    }
    const profileId = Number(profileRows[0].id_worker_profile);
    const activeRequest = await getWorkerActiveRequest(connection as any, profileId, idRequest);
    if (activeRequest) {
      await connection.rollback();
      res.status(409).json({
        error: `Finish request #${activeRequest.id_request} before taking another one.`,
        active_request_id: activeRequest.id_request,
        active_request_status: activeRequest.status,
      });
      return;
    }

    const [requestRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id_request, id_user, status, workflow_version, assigned_worker_profile
       FROM service_requests
       WHERE id_request = ?
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
    if (Number(request.assigned_worker_profile || 0) !== profileId) {
      await connection.rollback();
      res.status(403).json({ error: 'This request is assigned to another worker.' });
      return;
    }
    if (Number(request.workflow_version || 1) >= 2) {
      await connection.rollback();
      res.status(409).json({ error: 'Use the shared finish-work approval for this request.' });
      return;
    }
    if (String(request.status || '').toLowerCase() !== 'in_progress') {
      await connection.rollback();
      res.status(409).json({ error: 'Only jobs in progress can be marked as completed.' });
      return;
    }

    await connection.execute(
      `UPDATE service_requests
       SET status = 'awaiting_confirmation', updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ?`,
      [idRequest]
    );

    await connection.commit();

    const requestOwnerId = Number(request.id_user || 0);
    if (requestOwnerId) {
      await createUserNotification({
        userId: requestOwnerId,
        eventType: 'job_completed_pending_confirmation',
        title: 'Job completed',
        message: `Your pro marked request #${idRequest} as completed. Review it and confirm when ready.`,
        tone: 'success',
        requestId: idRequest,
        actionUrl: '/app',
        dedupeKey: `request-${idRequest}-awaiting-confirmation-client`,
        metadata: { request_status: 'awaiting_confirmation' },
      });
    }

    await createUserNotification({
      userId,
      eventType: 'job_completed_pending_confirmation',
      title: 'Waiting for client confirmation',
      message: `You marked request #${idRequest} as completed. The client must now confirm it.`,
      tone: 'info',
      requestId: idRequest,
      actionUrl: '/pro-dashboard',
      dedupeKey: `request-${idRequest}-awaiting-confirmation-worker`,
      metadata: { request_status: 'awaiting_confirmation' },
    });

    res.json({
      success: true,
      message: 'Job marked as completed. Waiting for client confirmation.',
      id_request: idRequest,
      request_status: 'awaiting_confirmation',
    });
  } catch (error: any) {
    await connection.rollback();
    console.error('Error in completeWorkerRequest:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

export const updateWorkerPresence = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureWorkerGeoColumns();

    const isOnline = req.body?.is_online === true || req.body?.is_online === 1 || req.body?.is_online === '1';
    const latRaw = req.body?.lat;
    const lngRaw = req.body?.lng;
    const coverageRaw = req.body?.coverage_km;

    const lat = latRaw != null && latRaw !== '' ? Number(latRaw) : null;
    const lng = lngRaw != null && lngRaw !== '' ? Number(lngRaw) : null;
    const coverage = coverageRaw != null && coverageRaw !== '' ? Number(coverageRaw) : null;

    if (lat != null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) {
      res.status(400).json({ error: 'Invalid latitude.' });
      return;
    }
    if (lng != null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
      res.status(400).json({ error: 'Invalid longitude.' });
      return;
    }
    if (coverage != null && (!Number.isFinite(coverage) || coverage <= 0 || coverage > 100)) {
      res.status(400).json({ error: 'Invalid coverage_km (1-100).' });
      return;
    }

    const profileId = await ensureWorkerProfile(userId);
    await pool.execute(
      `UPDATE worker_profiles
       SET is_online = ?,
           latitude = COALESCE(?, latitude),
           longitude = COALESCE(?, longitude),
           coverage_km = COALESCE(?, coverage_km),
           last_seen_at = CURRENT_TIMESTAMP
       WHERE id_worker_profile = ?`,
      [isOnline ? 1 : 0, lat, lng, coverage, profileId]
    );

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_worker_profile, is_online, latitude, longitude, coverage_km, last_seen_at
       FROM worker_profiles
       WHERE id_worker_profile = ?
       LIMIT 1`,
      [profileId]
    );

    if (isOnline && lat != null && lng != null) {
      const [activeRows] = await pool.execute<RowDataPacket[]>(
        `SELECT sr.id_request, sr.id_user, sr.status
         FROM service_requests sr
         WHERE sr.assigned_worker_profile = ?
           AND sr.status = 'in_progress'
         ORDER BY sr.updated_at DESC
         LIMIT 1`,
        [profileId]
      );

      const activeRequest = activeRows[0];
      const requestOwnerId = Number(activeRequest?.id_user || 0);
      if (requestOwnerId) {
        emitToUser(requestOwnerId, 'worker_location', {
          id_request: Number(activeRequest.id_request),
          id_worker_profile: Number(profileId),
          latitude: lat,
          longitude: lng,
          is_online: true,
          request_status: String(activeRequest.status || ''),
          updated_at: new Date().toISOString(),
        });
      }
    }

    res.json({ success: true, presence: rows[0] || null });
  } catch (error: any) {
    console.error('Error in updateWorkerPresence:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateWorkerSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { phone_number, bio } = req.body;
    const changes: string[] = [];

    if (phone_number != null) {
      const phoneRegex = /^\d{8}$/;
      if (!phoneRegex.test(String(phone_number).trim())) {
        res.status(400).json({ error: 'Phone number must be exactly 8 digits.' });
        return;
      }
    }

    const profileId = await ensureWorkerProfile(userId);
    const userBefore = await getUserCore(userId);

    if (phone_number != null && String(phone_number).trim() !== userBefore?.phone_number) {
      await pool.execute(`UPDATE users SET phone_number = ? WHERE id_user = ?`, [
        String(phone_number).trim(),
        userId,
      ]);
      changes.push('Phone number updated');
    }

    const sanitizedBio = bio != null ? sanitizeStrictText(bio, 500) : undefined;

    if (bio != null) {
      await pool.execute(`UPDATE worker_profiles SET bio = ? WHERE id_worker_profile = ?`, [
        sanitizedBio ?? null,
        profileId,
      ]);
      changes.push('Description updated');
    }

    if (changes.length > 0 && userBefore?.email) {
      await sendProfileChangeNotice(userBefore.email, userBefore.name, changes);
    }

    res.json({ success: true, message: 'Settings updated successfully.' });
  } catch (error: any) {
    console.error('Error in updateWorkerSettings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const changeWorkerPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { current_password, new_password, confirm_password } = req.body;
    if (!current_password || !new_password || !confirm_password) {
      res.status(400).json({ error: 'All password fields are required.' });
      return;
    }

    if (new_password !== confirm_password) {
      res.status(400).json({ error: 'New passwords do not match.' });
      return;
    }

    if (String(new_password).length < 8 || String(new_password).length > 128) {
      res.status(400).json({ error: 'New password must be between 8 and 128 characters.' });
      return;
    }

    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT id_user, name, email, password_hash FROM users WHERE id_user = ? LIMIT 1`,
      [userId]
    );
    if (users.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = users[0];
    const ok = await bcrypt.compare(current_password, user.password_hash);
    if (!ok) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }

    const passwordHash = await bcrypt.hash(new_password, 12);
    await pool.execute(`UPDATE users SET password_hash = ? WHERE id_user = ?`, [passwordHash, userId]);
    await sendProfileChangeNotice(user.email, user.name, ['Password changed']);

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (error: any) {
    console.error('Error in changeWorkerPassword:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const requestWorkerEmailChangeToken = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { new_email } = req.body;
    if (!new_email || typeof new_email !== 'string' || !new_email.includes('@')) {
      res.status(400).json({ error: 'Valid new email is required.' });
      return;
    }

    const normalizedEmail = new_email.trim().toLowerCase();
    const [currentUserRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_user, name, email FROM users WHERE id_user = ? LIMIT 1`,
      [userId]
    );
    if (currentUserRows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const currentUser = currentUserRows[0];
    if (currentUser.email === normalizedEmail) {
      res.status(400).json({ error: 'New email must be different from current email.' });
      return;
    }

    const [conflictRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_user FROM users WHERE email = ? LIMIT 1`,
      [normalizedEmail]
    );
    if (conflictRows.length > 0) {
      res.status(400).json({ error: 'Email is already in use.' });
      return;
    }

    await ensurePendingEmailColumn();

    const token = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await pool.execute(
      `UPDATE users SET verification_token = ?, token_expires_at = ?, pending_email = ? WHERE id_user = ?`,
      [token, expiresAt, normalizedEmail, userId]
    );

    const sent = await sendEmailChangeToken(normalizedEmail, token, currentUser.name);
    if (!sent) {
      res.status(500).json({ error: 'Could not send verification token email.' });
      return;
    }

    res.json({ success: true, message: 'Verification token sent to new email.' });
  } catch (error: any) {
    console.error('Error in requestWorkerEmailChangeToken:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const verifyWorkerEmailChangeToken = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      res.status(400).json({ error: 'Token is required.' });
      return;
    }

    await ensurePendingEmailColumn();

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_user, name, email, pending_email, verification_token, token_expires_at
       FROM users
       WHERE id_user = ?
       LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = rows[0];
    if (!user.verification_token || user.verification_token !== token) {
      res.status(400).json({ error: 'Invalid token.' });
      return;
    }

    if (!user.token_expires_at || new Date(user.token_expires_at) < new Date()) {
      res.status(400).json({ error: 'Token expired.' });
      return;
    }

    if (!user.pending_email) {
      res.status(400).json({ error: 'No pending email change found.' });
      return;
    }

    await pool.execute(
      `UPDATE users
       SET email = ?, verification_token = NULL, token_expires_at = NULL, pending_email = NULL
       WHERE id_user = ?`,
      [user.pending_email, userId]
    );

    await sendProfileChangeNotice(user.pending_email, user.name, ['Email changed']);
    res.json({
      success: true,
      message: 'Email updated successfully.',
      new_email: user.pending_email,
    });
  } catch (error: any) {
    console.error('Error in verifyWorkerEmailChangeToken:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const uploadProfileImage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Profile image is required.' });
      return;
    }

    if (!allowedImageMimeTypes.has(file.mimetype)) {
      await cleanupUnreferencedWorkerUploads([file]);
      res.status(400).json({ error: 'Only real PNG, JPG/JPEG and WEBP images are allowed.' });
      return;
    }

    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT id_user, name, email, profile_image FROM users WHERE id_user = ? LIMIT 1`,
      [userId]
    );
    if (users.length === 0) {
      await cleanupUnreferencedWorkerUploads([file]);
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = users[0];
    await pool.execute(`UPDATE users SET profile_image = ? WHERE id_user = ?`, [file.filename, userId]);

    await deletePublicUploadIfUnreferenced(user.profile_image);

    await sendProfileChangeNotice(user.email, user.name, ['Profile image updated']);
    res.json({
      success: true,
      message: 'Profile image updated.',
      profile_image: file.filename,
      profile_image_url: buildAssetUrl(req, file.filename),
    });
  } catch (error: any) {
    if (req.file) {
      await cleanupUnreferencedWorkerUploads([req.file]);
    }
    console.error('Error in uploadProfileImage:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const removeWorkerProfileImage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT id_user, name, email, profile_image FROM users WHERE id_user = ? LIMIT 1`,
      [userId]
    );
    if (users.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = users[0];
    await pool.execute(`UPDATE users SET profile_image = NULL WHERE id_user = ?`, [userId]);
    await deletePublicUploadIfUnreferenced(user.profile_image);

    await sendProfileChangeNotice(user.email, user.name, ['Profile image removed']);
    res.json({
      success: true,
      message: 'Profile image removed.',
      profile_image: null,
      profile_image_url: null,
    });
  } catch (error: any) {
    console.error('Error in removeWorkerProfileImage:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const uploadPortfolioImages = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) {
      res.status(400).json({ error: 'At least one image is required.' });
      return;
    }

    const invalid = files.find((file) => !allowedImageMimeTypes.has(file.mimetype));
    if (invalid) {
      await cleanupUnreferencedWorkerUploads(files);
      res.status(400).json({ error: 'Only real PNG, JPG/JPEG and WEBP images are allowed in portfolio.' });
      return;
    }

    const profileId = await ensureWorkerProfile(userId);
    const [countRows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM worker_portfolio WHERE id_worker_profile = ?`,
      [profileId]
    );
    const currentCount = Number(countRows[0]?.total || 0);
    if (currentCount + files.length > 10) {
      await cleanupUnreferencedWorkerUploads(files);
      res.status(400).json({ error: `You can upload up to 10 photos. Current: ${currentCount}.` });
      return;
    }

    const description = sanitizeStrictText(req.body?.description, 500) || null;
    if (files.length > 0) {
      await pool.execute(
        `INSERT INTO worker_portfolio (id_worker_profile, image_url, description)
         VALUES ${files.map(() => '(?, ?, ?)').join(', ')}`,
        files.flatMap((file) => [profileId, file.filename, description || null])
      );
    }

    const [portfolio] = await pool.execute<RowDataPacket[]>(
      `SELECT id_photo, id_worker_profile, image_url, description, uploaded_at
       FROM worker_portfolio
       WHERE id_worker_profile = ?
       ORDER BY uploaded_at DESC`,
      [profileId]
    );

    res.json({
      success: true,
      message: 'Portfolio updated.',
      portfolio: portfolio.map((item) => ({
        ...item,
        image_full_url: buildAssetUrl(req, item.image_url),
      })),
    });
  } catch (error: any) {
    await cleanupUnreferencedWorkerUploads((req.files as Express.Multer.File[]) || []);
    console.error('Error in uploadPortfolioImages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deletePortfolioImage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const idPhoto = Number(req.params.idPhoto);
    if (!idPhoto) {
      res.status(400).json({ error: 'Invalid photo id.' });
      return;
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT wp.id_photo, wp.image_url
       FROM worker_portfolio wp
       INNER JOIN worker_profiles p ON p.id_worker_profile = wp.id_worker_profile
       WHERE wp.id_photo = ? AND p.id_user = ?
       LIMIT 1`,
      [idPhoto, userId]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Photo not found.' });
      return;
    }

    const imageUrl = rows[0].image_url as string | null;
    await pool.execute(`DELETE FROM worker_portfolio WHERE id_photo = ?`, [idPhoto]);

    await deletePublicUploadIfUnreferenced(imageUrl);

    res.json({ success: true, message: 'Portfolio photo deleted.' });
  } catch (error: any) {
    console.error('Error in deletePortfolioImage:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updatePortfolioImageDescription = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const idPhoto = Number(req.params.idPhoto);
    if (!idPhoto) {
      res.status(400).json({ error: 'Invalid photo id.' });
      return;
    }

    const description = sanitizeStrictText(req.body?.description, 500) || null;
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT wp.id_photo
       FROM worker_portfolio wp
       INNER JOIN worker_profiles p ON p.id_worker_profile = wp.id_worker_profile
       WHERE wp.id_photo = ? AND p.id_user = ?
       LIMIT 1`,
      [idPhoto, userId]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Photo not found.' });
      return;
    }

    await pool.execute(
      `UPDATE worker_portfolio SET description = ? WHERE id_photo = ?`,
      [description, idPhoto]
    );

    res.json({
      success: true,
      message: 'Portfolio photo description updated.',
      photo: {
        id_photo: idPhoto,
        description,
      },
    });
  } catch (error: any) {
    console.error('Error in updatePortfolioImageDescription:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const uploadDocuments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!files || !files.dui_document) {
      res.status(400).json({ error: 'DUI Document is required for verification' });
      return;
    }

    if (!files.cert_document || files.cert_document.length === 0) {
      res.status(400).json({ error: 'Certification document is required for verification' });
      return;
    }

    const duiPath = files.dui_document[0].filename;
    const certPath =
      files.cert_document && files.cert_document.length > 0
        ? files.cert_document[0].filename
        : null;

    await pool.execute(
      `UPDATE worker_profiles 
       SET dui_document = ?, cert_document = ?
       WHERE id_user = ?`,
      [duiPath, certPath, userId]
    );

    res.json({
      success: true,
      message: 'Documents uploaded successfully. Pending admin review.',
      dui_path: duiPath,
      cert_path: certPath,
    });
  } catch (error: any) {
    console.error('Error uploading documents:', error);
    res.status(500).json({ error: 'Error processing files' });
  }
};
