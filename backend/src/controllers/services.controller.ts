import { Request, Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { AuthRequest } from '../middlewares/auth.middleware';
import fs from 'fs';
import path from 'path';

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

const toPublicRequestStatus = (status: string | null | undefined) => {
  if (!status) return 'pending';
  return status === 'open' ? 'pending' : status;
};

const defaultImageForService = (serviceName: string) => {
  const name = serviceName.toLowerCase();
  if (name.includes('plumb')) return 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?q=80&w=1400&auto=format&fit=crop';
  if (name.includes('electric')) return 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?q=80&w=1400&auto=format&fit=crop';
  if (name.includes('carp')) return 'https://images.unsplash.com/photo-1610557892470-55d9e80c0bce?q=80&w=1400&auto=format&fit=crop';
  if (name.includes('clean')) return 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=1400&auto=format&fit=crop';
  if (name.includes('mechan')) return 'https://images.unsplash.com/photo-1530046339160-71153320c072?q=80&w=1400&auto=format&fit=crop';
  return 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?q=80&w=1400&auto=format&fit=crop';
};

export const ensureServiceCardsTable = async () => {
  if (serviceCardsTableChecked) return;

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

  serviceCardsTableChecked = true;
};

export const getActiveServices = async (_req: Request, res: Response): Promise<void> => {
  try {
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

  workerGeoColumnsChecked = true;
};

export const getNearbyWorkers = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureWorkerGeoColumns();

    const idService = Number(req.query.id_service);
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKmRaw = Number(req.query.radius_km ?? 8);
    const radiusKm = Number.isFinite(radiusKmRaw) && radiusKmRaw > 0 ? Math.min(radiusKmRaw, 50) : 8;

    if (!idService || Number.isNaN(idService)) {
      res.status(400).json({ error: 'id_service is required.' });
      return;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: 'lat and lng are required.' });
      return;
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         u.id_user,
         u.name,
         u.lastname,
         u.profile_image,
         wp.id_worker_profile,
         wp.bio,
         wp.latitude,
         wp.longitude,
         (
           6371 * ACOS(
             COS(RADIANS(?)) * COS(RADIANS(wp.latitude)) *
             COS(RADIANS(wp.longitude) - RADIANS(?)) +
             SIN(RADIANS(?)) * SIN(RADIANS(wp.latitude))
           )
         ) AS distance_km
       FROM worker_profiles wp
       INNER JOIN users u ON u.id_user = wp.id_user
       INNER JOIN worker_services ws ON ws.id_worker_profile = wp.id_worker_profile
       WHERE u.rol = 'worker'
         AND wp.is_verified = 1
         AND wp.is_online = 1
         AND ws.id_service = ?
         AND wp.latitude IS NOT NULL
         AND wp.longitude IS NOT NULL
       HAVING distance_km <= ?
       ORDER BY distance_km ASC
       LIMIT 20`,
      [lat, lng, lat, idService, radiusKm]
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

export const ensureServiceRequestTables = async () => {
  if (serviceRequestsTablesChecked) return;

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
      assigned_worker_profile INT NULL,
      assigned_at TIMESTAMP NULL,
      status ENUM('open', 'pending', 'assigned', 'in_progress', 'done', 'cancelled') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_request),
      KEY idx_service_requests_service (id_service),
      KEY idx_service_requests_status_created (status, created_at),
      KEY idx_service_requests_user (id_user),
      KEY idx_service_requests_assigned_worker (assigned_worker_profile),
      CONSTRAINT fk_service_requests_service FOREIGN KEY (id_service) REFERENCES services(id_service) ON DELETE CASCADE,
      CONSTRAINT fk_service_requests_user FOREIGN KEY (id_user) REFERENCES users(id_user) ON DELETE SET NULL,
      CONSTRAINT fk_service_requests_assigned_worker FOREIGN KEY (assigned_worker_profile) REFERENCES worker_profiles(id_worker_profile) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    ALTER TABLE service_requests
    MODIFY COLUMN status ENUM('open', 'pending', 'assigned', 'in_progress', 'done', 'cancelled')
    NOT NULL DEFAULT 'pending'
  `);

  const [assignedColRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'service_requests'
       AND column_name IN ('assigned_worker_profile', 'initial_budget', 'final_budget', 'assigned_at')`
  );
  const requestColsCount = Number(assignedColRows[0]?.total || 0);
  if (requestColsCount < 4) {
    const [requestCols] = await pool.execute<RowDataPacket[]>(
      `SELECT COLUMN_NAME
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'service_requests'
         AND column_name IN ('assigned_worker_profile', 'initial_budget', 'final_budget', 'assigned_at')`
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
  }

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

  serviceRequestsTablesChecked = true;
};

const removeUploadedFiles = (files: Express.Multer.File[]) => {
  for (const file of files) {
    if (!file?.filename) continue;
    const filePath = path.join(__dirname, '../../uploads', file.filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // ignore cleanup failures
      }
    }
  }
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
    const budget = Number(req.body?.budget);
    const latitude = req.body?.lat != null && req.body?.lat !== '' ? Number(req.body?.lat) : null;
    const longitude = req.body?.lng != null && req.body?.lng !== '' ? Number(req.body?.lng) : null;
    const radiusRaw = Number(req.body?.radius_km ?? 8);
    const radiusKm = Number.isFinite(radiusRaw) && radiusRaw > 0 ? Math.min(radiusRaw, 50) : 8;

    if (!idService || Number.isNaN(idService)) {
      removeUploadedFiles(files);
      res.status(400).json({ error: 'id_service is required.' });
      return;
    }
    if (!description || description.length < 10 || description.length > 1000) {
      removeUploadedFiles(files);
      res.status(400).json({ error: 'Description must be between 10 and 1000 characters.' });
      return;
    }
    if (!locationText || locationText.length > 255) {
      removeUploadedFiles(files);
      res.status(400).json({ error: 'Location is required (max 255 chars).' });
      return;
    }
    if (!Number.isFinite(budget) || budget <= 0 || budget > 100000) {
      removeUploadedFiles(files);
      res.status(400).json({ error: 'Budget must be greater than 0 and less than 100000.' });
      return;
    }
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
      `SELECT id_service FROM services WHERE id_service = ? AND is_active = 1 LIMIT 1`,
      [idService]
    );
    if (svcRows.length === 0) {
      removeUploadedFiles(files);
      res.status(400).json({ error: 'Service is not available.' });
      return;
    }

    const [activeRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_request
       FROM service_requests
       WHERE id_user = ?
         AND status IN ('open', 'pending', 'assigned', 'in_progress')
       ORDER BY created_at DESC
       LIMIT 1`,
      [idUser]
    );
    if (activeRows.length > 0) {
      removeUploadedFiles(files);
      res.status(409).json({
        error: 'You already have an active request. Complete or cancel it before creating another one.',
        id_request: Number(activeRows[0].id_request),
      });
      return;
    }

    const [insertRequest] = await pool.execute<ResultSetHeader>(
      `INSERT INTO service_requests
       (id_user, id_service, description, location_text, latitude, longitude, initial_budget, budget, final_budget, radius_km, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'pending')`,
      [idUser, idService, description, locationText, latitude, longitude, budget, budget, radiusKm]
    );

    const idRequest = Number(insertRequest.insertId);

    for (const file of files) {
      await pool.execute(
        `INSERT INTO service_request_images (id_request, image_url) VALUES (?, ?)`,
        [idRequest, file.filename]
      );
    }

    if (latitude != null && longitude != null) {
      const [nearRows] = await pool.execute<RowDataPacket[]>(
        `SELECT
           wp.id_worker_profile,
           (
             6371 * ACOS(
               COS(RADIANS(?)) * COS(RADIANS(wp.latitude)) *
               COS(RADIANS(wp.longitude) - RADIANS(?)) +
               SIN(RADIANS(?)) * SIN(RADIANS(wp.latitude))
             )
           ) AS distance_km
         FROM worker_profiles wp
         INNER JOIN users u ON u.id_user = wp.id_user
         INNER JOIN worker_services ws ON ws.id_worker_profile = wp.id_worker_profile
         WHERE u.rol = 'worker'
           AND wp.is_verified = 1
           AND ws.id_service = ?
           AND wp.latitude IS NOT NULL
           AND wp.longitude IS NOT NULL
         HAVING distance_km <= ?
         ORDER BY distance_km ASC
         LIMIT 50`,
        [latitude, longitude, latitude, idService, radiusKm]
      );

      for (const row of nearRows) {
        await pool.execute(
          `INSERT INTO service_request_workers (id_request, id_worker_profile, distance_km, status)
           VALUES (?, ?, ?, 'new')`,
          [idRequest, Number(row.id_worker_profile), row.distance_km != null ? Number(row.distance_km) : null]
        );
      }
    }

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
        status: 'pending',
        images: files.map((f) => ({
          file_name: f.filename,
          url: `${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(f.filename)}`,
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
    const allowed = new Set(['all', 'pending', 'assigned', 'in_progress', 'done', 'cancelled']);
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
         sr.status,
         sr.created_at,
         s.name AS service_name,
         s.icon AS service_icon,
         wp.id_worker_profile AS assigned_worker_profile,
         u2.name AS worker_name,
         u2.lastname AS worker_lastname,
         srw_assigned.proposed_budget,
         srw_assigned.counter_message,
         srw_assigned.counter_status,
         GROUP_CONCAT(DISTINCT sri.image_url ORDER BY sri.id_image ASC SEPARATOR '||') AS image_urls
       FROM service_requests sr
       INNER JOIN services s ON s.id_service = sr.id_service
       LEFT JOIN worker_profiles wp ON wp.id_worker_profile = sr.assigned_worker_profile
       LEFT JOIN users u2 ON u2.id_user = wp.id_user
       LEFT JOIN service_request_workers srw_assigned
         ON srw_assigned.id_request = sr.id_request
        AND srw_assigned.id_worker_profile = sr.assigned_worker_profile
       LEFT JOIN service_request_images sri ON sri.id_request = sr.id_request
       WHERE ${whereParts.join(' AND ')}
       GROUP BY
         sr.id_request, sr.id_service, sr.description, sr.location_text, sr.latitude, sr.longitude,
         sr.initial_budget, sr.budget, sr.final_budget, sr.radius_km, sr.status, sr.created_at, s.name, s.icon, wp.id_worker_profile, u2.name, u2.lastname,
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
      status: toPublicRequestStatus(row.status),
      created_at: row.created_at,
      assigned_worker:
        row.assigned_worker_profile != null
          ? {
              id_worker_profile: Number(row.assigned_worker_profile),
              name: `${row.worker_name || ''} ${row.worker_lastname || ''}`.trim(),
            }
          : null,
      proposed_budget: row.proposed_budget != null ? Number(row.proposed_budget) : null,
      counter_message: row.counter_message || null,
      counter_status: row.counter_status || null,
      images:
        typeof row.image_urls === 'string' && row.image_urls.length > 0
          ? String(row.image_urls)
              .split('||')
              .filter(Boolean)
              .map((name: string) => ({
                file_name: name,
                url: `${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(name)}`,
              }))
          : [],
    }));

    res.json({ success: true, requests });
  } catch (error: any) {
    console.error('Error in getMyServiceRequests:', error);
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

    if (!['open', 'pending', 'assigned'].includes(currentStatus)) {
      await connection.rollback();
      res.status(409).json({ error: 'This request cannot be cancelled in its current state.' });
      return;
    }

    await connection.execute(
      `UPDATE service_requests
       SET status = 'cancelled',
           assigned_worker_profile = NULL,
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

    await connection.commit();
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
             updated_at = CURRENT_TIMESTAMP
         WHERE id_request = ?`,
        [idRequest]
      );

      if (lat != null && lng != null && idService > 0) {
        const [nearRows] = await connection.execute<RowDataPacket[]>(
          `SELECT
             wp.id_worker_profile,
             (
               6371 * ACOS(
                 COS(RADIANS(?)) * COS(RADIANS(wp.latitude)) *
                 COS(RADIANS(wp.longitude) - RADIANS(?)) +
                 SIN(RADIANS(?)) * SIN(RADIANS(wp.latitude))
               )
             ) AS distance_km
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
             AND wp.id_worker_profile <> ?
             AND srw.id_request IS NULL
           HAVING distance_km <= ?
           ORDER BY distance_km ASC
           LIMIT 50`,
          [lat, lng, lat, idRequest, idService, prevWorker, radiusKm]
        );

        for (const row of nearRows) {
          await connection.execute(
            `INSERT INTO service_request_workers (id_request, id_worker_profile, distance_km, status)
             VALUES (?, ?, ?, 'new')`,
            [idRequest, Number(row.id_worker_profile), row.distance_km != null ? Number(row.distance_km) : null]
          );
        }
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
     LEFT JOIN worker_profiles wp ON wp.id_worker_profile = sr.assigned_worker_profile
     WHERE sr.id_request = ?
     LIMIT 1`,
    [idRequest]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  if (Number(row.client_user_id) === userId) {
    return {
      role: 'client' as const,
      assignedWorkerProfile: row.assigned_worker_profile != null ? Number(row.assigned_worker_profile) : null,
      requestStatus: String(row.request_status || '').toLowerCase(),
    };
  }
  if (row.worker_user_id != null && Number(row.worker_user_id) === userId) {
    return {
      role: 'worker' as const,
      assignedWorkerProfile: row.assigned_worker_profile != null ? Number(row.assigned_worker_profile) : null,
      requestStatus: String(row.request_status || '').toLowerCase(),
    };
  }
  return null;
};

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
      res.status(403).json({ error: 'Access denied for this request chat.' });
      return;
    }
    if (!participant.assignedWorkerProfile || !['assigned', 'in_progress', 'done'].includes(participant.requestStatus)) {
      res.status(409).json({ error: 'Chat is available only after a worker accepts the request.' });
      return;
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_message, id_request, sender_role, id_user, id_worker_profile, message, image_url, created_at
       FROM service_request_chat_messages
       WHERE id_request = ?
       ORDER BY created_at ASC, id_message ASC
       LIMIT 500`,
      [idRequest]
    );

    res.json({
      success: true,
      chat: rows.map((row: any) => ({
        id_message: Number(row.id_message),
        id_request: Number(row.id_request),
        sender_role: row.sender_role,
        id_user: Number(row.id_user),
        id_worker_profile: row.id_worker_profile != null ? Number(row.id_worker_profile) : null,
        message: row.message || null,
        image_url: row.image_url ? `${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(row.image_url)}` : null,
        created_at: row.created_at,
      })),
    });
  } catch (error: any) {
    console.error('Error in getRequestChat:', error);
    res.status(500).json({ error: 'Internal server error' });
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
    const message = rawMessage ? rawMessage.slice(0, 500) : null;
    if (!idRequest) {
      removeUploadedFiles(files);
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }
    if (!message && files.length === 0) {
      res.status(400).json({ error: 'Message or image is required.' });
      return;
    }

    const participant = await resolveRequestParticipant(idRequest, userId);
    if (!participant) {
      removeUploadedFiles(files);
      res.status(403).json({ error: 'Access denied for this request chat.' });
      return;
    }
    if (!participant.assignedWorkerProfile || !['assigned', 'in_progress', 'done'].includes(participant.requestStatus)) {
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

    const inserts: any[] = [];
    const firstImage = files[0] || null;
    await pool.execute(
      `INSERT INTO service_request_chat_messages
       (id_request, sender_role, id_user, id_worker_profile, message, image_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [idRequest, participant.role, userId, workerProfileId, message, firstImage ? firstImage.filename : null]
    );
    if (firstImage) inserts.push(firstImage.filename);

    for (let i = 1; i < files.length; i += 1) {
      const file = files[i];
      await pool.execute(
        `INSERT INTO service_request_chat_messages
         (id_request, sender_role, id_user, id_worker_profile, message, image_url)
         VALUES (?, ?, ?, ?, NULL, ?)`,
        [idRequest, participant.role, userId, workerProfileId, file.filename]
      );
      inserts.push(file.filename);
    }

    res.status(201).json({
      success: true,
      message: 'Chat message sent.',
      id_request: idRequest,
      uploads: inserts.map((name) => `${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(name)}`),
    });
  } catch (error: any) {
    console.error('Error in postRequestChatMessage:', error);
    removeUploadedFiles(files);
    res.status(500).json({ error: 'Internal server error' });
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
    await connection.execute(
      `UPDATE service_requests
       SET budget = ?, final_budget = ?, status = 'assigned', updated_at = CURRENT_TIMESTAMP
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
    res.json({
      success: true,
      message: 'Counter offer accepted.',
      id_request: idRequest,
      final_budget: finalBudget,
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
           updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ?`,
      [idRequest]
    );

    if (row.latitude != null && row.longitude != null && row.id_service != null) {
      const lat = Number(row.latitude);
      const lng = Number(row.longitude);
      const radiusKm = Number(row.radius_km || 8);
      const idService = Number(row.id_service);

      const [nearRows] = await connection.execute<RowDataPacket[]>(
        `SELECT
           wp.id_worker_profile,
           (
             6371 * ACOS(
               COS(RADIANS(?)) * COS(RADIANS(wp.latitude)) *
               COS(RADIANS(wp.longitude) - RADIANS(?)) +
               SIN(RADIANS(?)) * SIN(RADIANS(wp.latitude))
             )
           ) AS distance_km
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
           AND wp.id_worker_profile <> ?
           AND srw.id_request IS NULL
         HAVING distance_km <= ?
         ORDER BY distance_km ASC
         LIMIT 50`,
        [lat, lng, lat, idRequest, idService, assignedWorker, radiusKm]
      );

      for (const candidate of nearRows) {
        await connection.execute(
          `INSERT INTO service_request_workers (id_request, id_worker_profile, distance_km, status)
           VALUES (?, ?, ?, 'new')`,
          [idRequest, Number(candidate.id_worker_profile), candidate.distance_km != null ? Number(candidate.distance_km) : null]
        );
      }
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
