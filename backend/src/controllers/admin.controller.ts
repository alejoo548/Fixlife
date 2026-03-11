import { Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { AuthRequest } from '../middlewares/auth.middleware';
import { ensureServiceCardsTable, ensureServiceRequestTables } from './services.controller';

const SCRIPT_PATTERN = /<\s*script|javascript:|on\w+\s*=|data:text\/html/i;

const sanitizeText = (value: unknown, maxLen: number): string => {
  const cleaned = String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim();

  if (SCRIPT_PATTERN.test(cleaned)) {
    throw new Error('Invalid content: scripts are not allowed.');
  }

  return cleaned.slice(0, maxLen);
};

const sanitizeOptionalText = (value: unknown, maxLen: number): string | null => {
  if (value === undefined || value === null) return null;
  const sanitized = sanitizeText(value, maxLen);
  return sanitized.length > 0 ? sanitized : null;
};

const sanitizeImageUrl = (value: unknown): string | null => {
  const url = sanitizeOptionalText(value, 255);
  if (!url) return null;
  const valid = /^https?:\/\/[^\s]+$/i.test(url) || /^\/uploads\/[^\s]+$/i.test(url);
  if (!valid) {
    throw new Error('Invalid image URL format.');
  }
  return url;
};

const toPublicRequestStatus = (status: string | null | undefined) => {
  if (!status) return 'pending';
  return status === 'open' ? 'pending' : status;
};

// ─── Services CRUD ───────────────────────────────────────────────────────────

export const createService = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, description, icon } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Service name is required.' });
      return;
    }

    const trimmedName = sanitizeText(name, 100);
    const trimmedDesc = sanitizeOptionalText(description, 500);
    const trimmedIcon = sanitizeOptionalText(icon, 255);

    // Check duplicate name
    const [existing] = await pool.execute<RowDataPacket[]>(
      `SELECT id_service FROM services WHERE LOWER(name) = LOWER(?) LIMIT 1`,
      [trimmedName]
    );

    if (existing.length > 0) {
      res.status(400).json({ error: 'A service with this name already exists.' });
      return;
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO services (name, description, icon, is_active) VALUES (?, ?, ?, 1)`,
      [trimmedName, trimmedDesc, trimmedIcon]
    );

    res.status(201).json({
      success: true,
      message: 'Service created successfully.',
      service: {
        id_service: result.insertId,
        name: trimmedName,
        description: trimmedDesc,
        icon: trimmedIcon,
        is_active: true,
      },
    });
  } catch (error: any) {
    console.error('Error in createService:', error);
    if (typeof error?.message === 'string' && error.message.toLowerCase().includes('invalid')) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

type HeroSlideRow = RowDataPacket & {
  id_slide: number;
  sort_order: number;
  image_url: string;
  tag: string;
  title: string;
  description: string;
  cta: string;
};

let heroSlidesTableChecked = false;

const ensureHeroSlidesTable = async () => {
  if (heroSlidesTableChecked) return;

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS hero_slides (
      id_slide INT NOT NULL AUTO_INCREMENT,
      sort_order INT NOT NULL,
      image_url VARCHAR(255) NOT NULL,
      tag VARCHAR(50) NOT NULL,
      title VARCHAR(120) NOT NULL,
      description VARCHAR(255) NOT NULL,
      cta VARCHAR(80) NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_slide),
      UNIQUE KEY ux_hero_slides_sort (sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM hero_slides`
  );
  const total = Number(rows[0]?.total || 0);

  if (total === 0) {
    await pool.execute(
      `INSERT INTO hero_slides (sort_order, image_url, tag, title, description, cta)
       VALUES
       (1, ?, ?, ?, ?, ?),
       (2, ?, ?, ?, ?, ?),
       (3, ?, ?, ?, ?, ?)`,
      [
        'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?q=80&w=2070&auto=format&fit=crop',
        'PREMIUM',
        'Home Experts',
        'Find certified electricians, plumbers, and technicians ready to solve any problem.',
        'Find Technician',
        'https://images.unsplash.com/photo-1581578731117-10d52b43cc0a?q=80&w=2070&auto=format&fit=crop',
        'RENOVATION',
        'Transform Your Space',
        'From a fresh coat of paint to complete remodels. Make your dream home a reality.',
        'Get a Quote',
        'https://images.unsplash.com/photo-1556911220-bff31c812dba?q=80&w=2668&auto=format&fit=crop',
        'CLEANING',
        'Spotless Homes',
        'Deep cleaning and regular maintenance services so you can enjoy your free time.',
        'Book Cleaning',
      ]
    );
  }

  heroSlidesTableChecked = true;
};

const toSlidesDto = (rows: HeroSlideRow[]) =>
  rows.map((row) => ({
    id: Number(row.id_slide),
    image: row.image_url,
    tag: row.tag,
    title: row.title,
    description: row.description,
    cta: row.cta,
  }));

export const getHeroSlidesPublic = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureHeroSlidesTable();
    const [rows] = await pool.execute<HeroSlideRow[]>(
      `SELECT id_slide, sort_order, image_url, tag, title, description, cta
       FROM hero_slides
       ORDER BY sort_order ASC`
    );
    res.json({ success: true, slides: toSlidesDto(rows) });
  } catch (error) {
    console.error('Error in getHeroSlidesPublic:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAllServices = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_service, name, description, icon, is_active, created_at FROM services ORDER BY created_at DESC`
    );
    res.json({ success: true, services: rows });
  } catch (error: any) {
    console.error('Error in getAllServices:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateService = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const idService = Number(req.params.id);
    if (!idService || isNaN(idService)) {
      res.status(400).json({ error: 'Invalid service ID.' });
      return;
    }

    const { name, description, icon, is_active } = req.body;
    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) {
      const trimmedName = sanitizeText(name, 100);
      if (trimmedName.length === 0) {
        res.status(400).json({ error: 'Service name cannot be empty.' });
        return;
      }
      // Check duplicate name (excluding current)
      const [existing] = await pool.execute<RowDataPacket[]>(
        `SELECT id_service FROM services WHERE LOWER(name) = LOWER(?) AND id_service != ? LIMIT 1`,
        [trimmedName, idService]
      );
      if (existing.length > 0) {
        res.status(400).json({ error: 'A service with this name already exists.' });
        return;
      }
      updates.push('name = ?');
      values.push(trimmedName);
    }

    if (description !== undefined) {
      updates.push('description = ?');
      values.push(sanitizeOptionalText(description, 500));
    }

    if (icon !== undefined) {
      updates.push('icon = ?');
      values.push(sanitizeOptionalText(icon, 255));
    }

    if (is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(is_active ? 1 : 0);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update.' });
      return;
    }

    values.push(idService);
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE services SET ${updates.join(', ')} WHERE id_service = ?`,
      values
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Service not found.' });
      return;
    }

    res.json({ success: true, message: 'Service updated successfully.' });
  } catch (error: any) {
    console.error('Error in updateService:', error);
    if (typeof error?.message === 'string' && error.message.toLowerCase().includes('invalid')) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteService = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const idService = Number(req.params.id);
    if (!idService || isNaN(idService)) {
      res.status(400).json({ error: 'Invalid service ID.' });
      return;
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `DELETE FROM services WHERE id_service = ?`,
      [idService]
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Service not found.' });
      return;
    }

    res.json({ success: true, message: 'Service deleted successfully.' });
  } catch (error: any) {
    console.error('Error in deleteService:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Worker Approval ─────────────────────────────────────────────────────────

export const getServiceCardsAdmin = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureServiceCardsTable();

    const [rows] = await pool.execute<RowDataPacket[]>(
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
         sc.created_at,
         s.name AS service_name,
         s.icon AS service_icon
       FROM service_cards sc
       INNER JOIN services s ON s.id_service = sc.id_service
       ORDER BY sc.sort_order ASC, sc.id_card ASC`
    );

    res.json({ success: true, cards: rows });
  } catch (error: any) {
    console.error('Error in getServiceCardsAdmin:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createServiceCard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureServiceCardsTable();

    const idService = Number(req.body?.id_service);
    if (!idService || Number.isNaN(idService)) {
      res.status(400).json({ error: 'id_service is required.' });
      return;
    }

    const [serviceRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_service, name, description FROM services WHERE id_service = ? AND is_active = 1 LIMIT 1`,
      [idService]
    );

    if (serviceRows.length === 0) {
      res.status(404).json({ error: 'Service not found or inactive.' });
      return;
    }

    const [dupeRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_card FROM service_cards WHERE id_service = ? LIMIT 1`,
      [idService]
    );
    if (dupeRows.length > 0) {
      res.status(409).json({ error: 'This service already has a homepage card.' });
      return;
    }

    const service = serviceRows[0];
    const imageUrl = sanitizeImageUrl(req.body?.image_url);
    const badge = sanitizeOptionalText(req.body?.badge, 40) || 'POPULAR';
    const headline = req.body?.headline
      ? sanitizeText(req.body.headline, 120)
      : String(service.name || '').slice(0, 120);
    const summary = req.body?.summary
      ? sanitizeText(req.body.summary, 255)
      : String(service.description || '').slice(0, 255);
    const ctaLabel = sanitizeOptionalText(req.body?.cta_label, 60) || 'Learn More';
    const isActive = req.body?.is_active === false || req.body?.is_active === 0 ? 0 : 1;

    const requestedOrder = Number(req.body?.sort_order);
    let sortOrder = requestedOrder;
    if (!sortOrder || Number.isNaN(sortOrder) || sortOrder < 1) {
      const [maxRows] = await pool.execute<RowDataPacket[]>(`SELECT COALESCE(MAX(sort_order), 0) AS maxSort FROM service_cards`);
      sortOrder = Number(maxRows[0]?.maxSort || 0) + 1;
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO service_cards (id_service, image_url, badge, headline, summary, cta_label, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [idService, imageUrl, badge, headline, summary || null, ctaLabel, sortOrder, isActive]
    );

    res.status(201).json({
      success: true,
      message: 'Service card created.',
      id_card: result.insertId,
    });
  } catch (error: any) {
    console.error('Error in createServiceCard:', error);
    if (typeof error?.message === 'string' && error.message.toLowerCase().includes('invalid')) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateServiceCard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureServiceCardsTable();

    const idCard = Number(req.params.idCard);
    if (!idCard || Number.isNaN(idCard)) {
      res.status(400).json({ error: 'Invalid card id.' });
      return;
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (req.body?.id_service !== undefined) {
      const idService = Number(req.body.id_service);
      if (!idService || Number.isNaN(idService)) {
        res.status(400).json({ error: 'Invalid id_service.' });
        return;
      }
      const [serviceRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id_service FROM services WHERE id_service = ? AND is_active = 1 LIMIT 1`,
        [idService]
      );
      if (serviceRows.length === 0) {
        res.status(404).json({ error: 'Service not found or inactive.' });
        return;
      }
      const [dupeRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id_card FROM service_cards WHERE id_service = ? AND id_card != ? LIMIT 1`,
        [idService, idCard]
      );
      if (dupeRows.length > 0) {
        res.status(409).json({ error: 'This service already has a homepage card.' });
        return;
      }
      updates.push('id_service = ?');
      values.push(idService);
    }

    if (req.body?.image_url !== undefined) {
      updates.push('image_url = ?');
      values.push(sanitizeImageUrl(req.body.image_url));
    }

    if (req.body?.badge !== undefined) {
      updates.push('badge = ?');
      values.push(sanitizeOptionalText(req.body.badge, 40) || 'POPULAR');
    }

    if (req.body?.headline !== undefined) {
      updates.push('headline = ?');
      values.push(sanitizeOptionalText(req.body.headline, 120));
    }

    if (req.body?.summary !== undefined) {
      updates.push('summary = ?');
      values.push(sanitizeOptionalText(req.body.summary, 255));
    }

    if (req.body?.cta_label !== undefined) {
      updates.push('cta_label = ?');
      values.push(sanitizeOptionalText(req.body.cta_label, 60) || 'Learn More');
    }

    if (req.body?.sort_order !== undefined) {
      const sortOrder = Number(req.body.sort_order);
      if (!sortOrder || Number.isNaN(sortOrder) || sortOrder < 1) {
        res.status(400).json({ error: 'sort_order must be a positive number.' });
        return;
      }
      updates.push('sort_order = ?');
      values.push(sortOrder);
    }

    if (req.body?.is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(req.body.is_active ? 1 : 0);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update.' });
      return;
    }

    values.push(idCard);
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE service_cards SET ${updates.join(', ')} WHERE id_card = ?`,
      values
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Card not found.' });
      return;
    }

    res.json({ success: true, message: 'Service card updated.' });
  } catch (error: any) {
    console.error('Error in updateServiceCard:', error);
    if (typeof error?.message === 'string' && error.message.toLowerCase().includes('invalid')) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteServiceCard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureServiceCardsTable();

    const idCard = Number(req.params.idCard);
    if (!idCard || Number.isNaN(idCard)) {
      res.status(400).json({ error: 'Invalid card id.' });
      return;
    }

    const [result] = await pool.execute<ResultSetHeader>(`DELETE FROM service_cards WHERE id_card = ?`, [idCard]);
    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Card not found.' });
      return;
    }

    res.json({ success: true, message: 'Service card deleted.' });
  } catch (error: any) {
    console.error('Error in deleteServiceCard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPendingWorkers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT 
        u.id_user, u.name, u.lastname, u.email, u.phone_number, u.username, u.profile_image, u.created_at,
        wp.id_worker_profile, wp.bio, wp.dui_document, wp.cert_document, wp.is_verified
       FROM users u
       INNER JOIN worker_profiles wp ON wp.id_user = u.id_user
       WHERE u.rol = 'worker'
         AND u.verification_token IS NULL
         AND wp.is_verified = 0
       ORDER BY u.created_at DESC`
    );

    // Also fetch selected services for each worker
    const workersWithServices = await Promise.all(
      rows.map(async (worker) => {
        const [services] = await pool.execute<RowDataPacket[]>(
          `SELECT s.id_service, s.name
           FROM worker_services ws
           INNER JOIN services s ON s.id_service = ws.id_service
           WHERE ws.id_worker_profile = ?`,
          [worker.id_worker_profile]
        );
        return { ...worker, services };
      })
    );

    // Build document URLs
    const buildUrl = (fileName: string | null) => {
      if (!fileName) return null;
      const protocol = req.protocol;
      const host = req.get('host');
      return `${protocol}://${host}/uploads/${encodeURIComponent(fileName)}`;
    };

    const result = workersWithServices.map((w: any) => ({
      ...w,
      dui_document_url: buildUrl(w.dui_document),
      cert_document_url: buildUrl(w.cert_document),
    }));

    res.json({ success: true, workers: result });
  } catch (error: any) {
    console.error('Error in getPendingWorkers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const approveWorker = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = Number(req.params.id);
    if (!userId || isNaN(userId)) {
      res.status(400).json({ error: 'Invalid user ID.' });
      return;
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE worker_profiles SET is_verified = 1 WHERE id_user = ? AND is_verified = 0`,
      [userId]
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Worker not found or already processed.' });
      return;
    }

    res.json({ success: true, message: 'Worker approved successfully.' });
  } catch (error: any) {
    console.error('Error in approveWorker:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const rejectWorker = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = Number(req.params.id);
    if (!userId || isNaN(userId)) {
      res.status(400).json({ error: 'Invalid user ID.' });
      return;
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE worker_profiles SET is_verified = 2 WHERE id_user = ? AND is_verified = 0`,
      [userId]
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Worker not found or already processed.' });
      return;
    }

    res.json({ success: true, message: 'Worker rejected successfully.' });
  } catch (error: any) {
    console.error('Error in rejectWorker:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export const getDashboardStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [[{ total_services }]] = await pool.execute<RowDataPacket[]>(`SELECT COUNT(*) as total_services FROM services`);
    
    const [[{ total_pros }]] = await pool.execute<RowDataPacket[]>(`
      SELECT COUNT(*) as total_pros FROM users u
      INNER JOIN worker_profiles wp ON u.id_user = wp.id_user
      WHERE u.rol = 'worker' AND wp.is_verified = 1
    `);
    
    const [[{ pending_pros }]] = await pool.execute<RowDataPacket[]>(`
      SELECT COUNT(*) as pending_pros FROM users u
      INNER JOIN worker_profiles wp ON u.id_user = wp.id_user
      WHERE u.rol = 'worker' AND wp.is_verified = 0 AND u.verification_token IS NULL
    `);
    
    const [[{ total_users }]] = await pool.execute<RowDataPacket[]>(`SELECT COUNT(*) as total_users FROM users WHERE rol = 'user'`);

    // Traffic Data - last 7 days of registrations
    const [trafficRows] = await pool.execute<RowDataPacket[]>(`
      SELECT 
        DATE_FORMAT(created_at, '%a') as name,
        SUM(CASE WHEN rol = 'user' THEN 1 ELSE 0 END) as Users,
        SUM(CASE WHEN rol = 'worker' THEN 1 ELSE 0 END) as Pros
      FROM users
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY DATE(created_at), DATE_FORMAT(created_at, '%a')
      ORDER BY DATE(created_at) ASC
    `);

    res.json({
      success: true,
      stats: {
        total_services: Number(total_services),
        total_pros: Number(total_pros),
        pending_pros: Number(pending_pros),
        total_users: Number(total_users),
        trafficData: trafficRows
      }
    });

  } catch (error: any) {
    console.error('Error in getDashboardStats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getRequestsHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureServiceRequestTables();

    const requestedStatus = String(req.query.status || 'all').toLowerCase();
    const allowed = new Set(['all', 'pending', 'assigned', 'in_progress', 'done', 'cancelled']);
    if (!allowed.has(requestedStatus)) {
      res.status(400).json({ error: 'Invalid status filter.' });
      return;
    }

    const whereParts: string[] = [];
    const params: any[] = [];

    if (requestedStatus !== 'all') {
      if (requestedStatus === 'pending') {
        whereParts.push(`sr.status IN ('pending', 'open')`);
      } else {
        whereParts.push(`sr.status = ?`);
        params.push(requestedStatus);
      }
    }

    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         sr.id_request,
         sr.id_user,
         sr.id_service,
         sr.description,
         sr.location_text,
         sr.latitude,
         sr.longitude,
         sr.budget,
         sr.radius_km,
         sr.status,
         sr.created_at,
         sr.assigned_worker_profile,
         s.name AS service_name,
         u.name AS client_name,
         u.lastname AS client_lastname,
         u.email AS client_email,
         uw.name AS worker_name,
         uw.lastname AS worker_lastname,
         srw_assigned.proposed_budget,
         srw_assigned.counter_message,
         COUNT(DISTINCT sri.id_image) AS images_count
       FROM service_requests sr
       INNER JOIN services s ON s.id_service = sr.id_service
       LEFT JOIN users u ON u.id_user = sr.id_user
       LEFT JOIN worker_profiles wp ON wp.id_worker_profile = sr.assigned_worker_profile
       LEFT JOIN users uw ON uw.id_user = wp.id_user
       LEFT JOIN service_request_workers srw_assigned
         ON srw_assigned.id_request = sr.id_request
        AND srw_assigned.id_worker_profile = sr.assigned_worker_profile
       LEFT JOIN service_request_images sri ON sri.id_request = sr.id_request
       ${whereSql}
       GROUP BY
         sr.id_request, sr.id_user, sr.id_service, sr.description, sr.location_text,
         sr.latitude, sr.longitude, sr.budget, sr.radius_km, sr.status, sr.created_at,
         sr.assigned_worker_profile, s.name, u.name, u.lastname, u.email, uw.name, uw.lastname,
         srw_assigned.proposed_budget, srw_assigned.counter_message
       ORDER BY sr.created_at DESC
       LIMIT 300`,
      params
    );

    const requests = rows.map((row: any) => ({
      id_request: Number(row.id_request),
      id_user: row.id_user != null ? Number(row.id_user) : null,
      id_service: Number(row.id_service),
      service_name: row.service_name,
      description: row.description,
      location_text: row.location_text,
      latitude: row.latitude != null ? Number(row.latitude) : null,
      longitude: row.longitude != null ? Number(row.longitude) : null,
      budget: Number(row.budget || 0),
      radius_km: Number(row.radius_km || 8),
      status: toPublicRequestStatus(row.status),
      created_at: row.created_at,
      images_count: Number(row.images_count || 0),
      proposed_budget: row.proposed_budget != null ? Number(row.proposed_budget) : null,
      counter_message: row.counter_message || null,
      client: row.id_user
        ? {
            id_user: Number(row.id_user),
            name: `${row.client_name || ''} ${row.client_lastname || ''}`.trim() || 'Client',
            email: row.client_email || null,
          }
        : null,
      assigned_worker:
        row.assigned_worker_profile != null
          ? {
              id_worker_profile: Number(row.assigned_worker_profile),
              name: `${row.worker_name || ''} ${row.worker_lastname || ''}`.trim() || 'Worker',
            }
          : null,
    }));

    res.json({ success: true, requests });
  } catch (error: any) {
    console.error('Error in getRequestsHistory:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateHeroSlides = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureHeroSlidesTable();

    const slides = Array.isArray(req.body?.slides) ? req.body.slides : null;
    if (!slides || slides.length === 0) {
      res.status(400).json({ error: 'slides array is required (min 1 slide)' });
      return;
    }

    if (slides.length > 10) {
      res.status(400).json({ error: 'Maximum 10 slides allowed.' });
      return;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.execute(`DELETE FROM hero_slides`);

      for (let idx = 0; idx < slides.length; idx += 1) {
        const slide = slides[idx];
        const sortOrder = idx + 1;
        const image = String(slide?.image || '').trim();
        const tag = String(slide?.tag || '').trim().slice(0, 50);
        const title = String(slide?.title || '').trim().slice(0, 120);
        const description = String(slide?.description || '').trim().slice(0, 255);
        const cta = String(slide?.cta || '').trim().slice(0, 80);

        if (!image || !tag || !title || !description || !cta) {
          throw new Error(`Invalid slide payload at index ${idx}`);
        }

        await connection.execute<ResultSetHeader>(
          `INSERT INTO hero_slides (sort_order, image_url, tag, title, description, cta)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [sortOrder, image, tag, title, description, cta]
        );
      }

      await connection.commit();
    } catch (error: any) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const [rows] = await pool.execute<HeroSlideRow[]>(
      `SELECT id_slide, sort_order, image_url, tag, title, description, cta
       FROM hero_slides
       ORDER BY sort_order ASC`
    );

    res.json({ success: true, slides: toSlidesDto(rows) });
  } catch (error: any) {
    console.error('Error in updateHeroSlides:', error);
    res.status(400).json({ error: error?.message || 'Could not update slides' });
  }
};

export const uploadHeroSlideImage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureHeroSlidesTable();

    const idSlide = Number(req.params.idSlide);
    if (!idSlide) {
      res.status(400).json({ error: 'Invalid slide id' });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Image file is required' });
      return;
    }

    const allowed = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
    if (!allowed.has(file.mimetype)) {
      res.status(400).json({ error: 'Only PNG/JPG/WEBP images are allowed.' });
      return;
    }

    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(file.filename)}`;

    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE hero_slides SET image_url = ? WHERE id_slide = ?`,
      [imageUrl, idSlide]
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Slide not found' });
      return;
    }

    const [rows] = await pool.execute<HeroSlideRow[]>(
      `SELECT id_slide, sort_order, image_url, tag, title, description, cta
       FROM hero_slides
       ORDER BY sort_order ASC`
    );

    res.json({ success: true, image: imageUrl, slides: toSlidesDto(rows) });
  } catch (error: any) {
    console.error('Error in uploadHeroSlideImage:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const uploadHeroImageAsset = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Image file is required' });
      return;
    }

    const allowed = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
    if (!allowed.has(file.mimetype)) {
      res.status(400).json({ error: 'Only PNG/JPG/WEBP images are allowed.' });
      return;
    }

    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(file.filename)}`;
    res.json({ success: true, image: imageUrl });
  } catch (error: any) {
    console.error('Error in uploadHeroImageAsset:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
