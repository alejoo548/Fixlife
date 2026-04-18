import { Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { AuthRequest } from '../middlewares/auth.middleware';
import {
  getAllBonusPayoutsForAdmin,
  getWorkerRewardsSettings,
  markWorkerBonusPayoutAsPaid,
  syncAllWorkerBonusPayouts,
  updateWorkerRewardsSettings,
} from '../utils/workerRewards';
import { createUserNotification } from '../utils/notifications';
import { pushToUser } from '../services/sseManager';
import { ensureServiceCardsTable, ensureServiceRequestTables } from './services.controller';
import { ensureUsersActiveColumn, ensureUsersPendingWorkerColumn } from '../utils/users';

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

const assertAllowedFields = (payload: any, allowed: string[]) => {
  if (!payload || typeof payload !== 'object') return;
  const allowedSet = new Set(allowed);
  const extras = Object.keys(payload).filter((key) => !allowedSet.has(key));
  if (extras.length > 0) {
    throw new Error(`Unexpected fields: ${extras.join(', ')}`);
  }
};

const parseBooleanFlag = (value: unknown, fieldName: string): 0 | 1 | undefined => {
  if (value === undefined) return undefined;
  if (value === true || value === 1 || value === '1') return 1;
  if (value === false || value === 0 || value === '0') return 0;
  throw new Error(`Invalid ${fieldName} value.`);
};

const parsePositiveInt = (value: unknown, fieldName: string, max = 10000): number => {
  const parsed = Number(value);
  if (!parsed || Number.isNaN(parsed) || parsed < 1 || !Number.isFinite(parsed) || parsed > max) {
    throw new Error(`Invalid ${fieldName} value.`);
  }
  return Math.floor(parsed);
};

const toPublicRequestStatus = (status: string | null | undefined) => {
  if (!status) return 'pending';
  return status === 'open' ? 'pending' : status;
};

const ALLOWED_USER_ROLES = new Set(['client', 'worker', 'admin', 'root']);
const ASSIGNABLE_USER_ROLES = new Set(['client', 'admin']);

type AdminActivityRow = RowDataPacket & {
  id_activity: number;
  id_admin: number;
  action_type: string;
  entity_type: string;
  entity_id: number | null;
  summary: string;
  metadata: string | null;
  created_at: string;
  admin_name: string | null;
  admin_lastname: string | null;
  admin_email: string | null;
};

let adminActivityTableChecked = false;

const ensureAdminActivityTable = async () => {
  if (adminActivityTableChecked) return;

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS admin_activity_log (
      id_activity INT NOT NULL AUTO_INCREMENT,
      id_admin INT NOT NULL,
      action_type VARCHAR(40) NOT NULL,
      entity_type VARCHAR(40) NOT NULL,
      entity_id INT NULL,
      summary VARCHAR(255) NOT NULL,
      metadata TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_activity),
      INDEX idx_admin_created (id_admin, created_at),
      INDEX idx_entity (entity_type, entity_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  adminActivityTableChecked = true;
};

const logAdminActivity = async (
  req: AuthRequest,
  action: string,
  entity: string,
  summary: string,
  entityId?: number | null,
  metadata?: Record<string, any> | null
) => {
  try {
    const adminId = req.user?.user_id;
    if (!adminId) return;
    await ensureAdminActivityTable();

    const safeSummary = sanitizeText(summary, 255);
    const payload = metadata ? JSON.stringify(metadata).slice(0, 2000) : null;

    await pool.execute<ResultSetHeader>(
      `INSERT INTO admin_activity_log (id_admin, action_type, entity_type, entity_id, summary, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [adminId, action.toLowerCase(), entity.toLowerCase(), entityId ?? null, safeSummary, payload]
    );
  } catch (error) {
    console.error('Error in logAdminActivity:', error);
  }
};

// ─── Services CRUD ───────────────────────────────────────────────────────────

export const createService = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    assertAllowedFields(req.body, ['name', 'description', 'icon']);
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

    await logAdminActivity(
      req,
      'create',
      'service',
      `Created service "${trimmedName}"`,
      result.insertId,
      { name: trimmedName }
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
    assertAllowedFields(req.body, ['name', 'description', 'icon', 'is_active']);
    const idService = Number(req.params.id);
    if (!idService || isNaN(idService)) {
      res.status(400).json({ error: 'Invalid service ID.' });
      return;
    }

    const { name, description, icon, is_active } = req.body;
    const updates: string[] = [];
    const values: any[] = [];
    const changedFields: string[] = [];
    let nextName: string | undefined;
    let parsedActive: 0 | 1 | undefined;

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
      changedFields.push('name');
      nextName = trimmedName;
    }

    if (description !== undefined) {
      updates.push('description = ?');
      values.push(sanitizeOptionalText(description, 500));
      changedFields.push('description');
    }

    if (icon !== undefined) {
      updates.push('icon = ?');
      values.push(sanitizeOptionalText(icon, 255));
      changedFields.push('icon');
    }

    try {
      parsedActive = parseBooleanFlag(is_active, 'is_active');
      if (parsedActive !== undefined) {
        updates.push('is_active = ?');
        values.push(parsedActive);
        changedFields.push('is_active');
      }
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Invalid is_active value.' });
      return;
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

    const label = nextName ? `"${nextName}"` : `service #${idService}`;
    let action = 'update';
    let summary = `Updated ${label}`;
    if (changedFields.length === 1 && changedFields[0] === 'is_active') {
      action = parsedActive === 1 ? 'activate' : 'deactivate';
      summary = parsedActive === 1 ? `Activated ${label}` : `Deactivated ${label}`;
    }

    await logAdminActivity(req, action, 'service', summary, idService, { fields: changedFields });

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

    const [serviceRows] = await pool.execute<RowDataPacket[]>(
      `SELECT name FROM services WHERE id_service = ?`,
      [idService]
    );
    const serviceName = serviceRows[0]?.name ? String(serviceRows[0].name) : null;

    const [result] = await pool.execute<ResultSetHeader>(
      `DELETE FROM services WHERE id_service = ?`,
      [idService]
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Service not found.' });
      return;
    }

    const label = serviceName ? `service "${serviceName}"` : `service #${idService}`;
    await logAdminActivity(req, 'delete', 'service', `Deleted ${label}`, idService, { name: serviceName });

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
    assertAllowedFields(req.body, [
      'id_service',
      'image_url',
      'badge',
      'headline',
      'summary',
      'cta_label',
      'sort_order',
      'is_active',
    ]);
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
    let isActive: 0 | 1 = 1;
    try {
      const parsedActive = parseBooleanFlag(req.body?.is_active, 'is_active');
      if (parsedActive !== undefined) isActive = parsedActive;
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Invalid is_active value.' });
      return;
    }

    let sortOrder: number;
    if (req.body?.sort_order !== undefined) {
      try {
        sortOrder = parsePositiveInt(req.body.sort_order, 'sort_order', 5000);
      } catch (error: any) {
        res.status(400).json({ error: error?.message || 'Invalid sort_order value.' });
        return;
      }
    } else {
      const [maxRows] = await pool.execute<RowDataPacket[]>(`SELECT COALESCE(MAX(sort_order), 0) AS maxSort FROM service_cards`);
      sortOrder = Number(maxRows[0]?.maxSort || 0) + 1;
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO service_cards (id_service, image_url, badge, headline, summary, cta_label, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [idService, imageUrl, badge, headline, summary || null, ctaLabel, sortOrder, isActive]
    );

    await logAdminActivity(
      req,
      'create',
      'service_card',
      `Created homepage card for "${service.name}"`,
      result.insertId,
      { id_service: idService, service_name: service.name }
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
    assertAllowedFields(req.body, [
      'id_service',
      'image_url',
      'badge',
      'headline',
      'summary',
      'cta_label',
      'sort_order',
      'is_active',
    ]);
    await ensureServiceCardsTable();

    const idCard = Number(req.params.idCard);
    if (!idCard || Number.isNaN(idCard)) {
      res.status(400).json({ error: 'Invalid card id.' });
      return;
    }

    const updates: string[] = [];
    const values: any[] = [];
    const changedFields: string[] = [];

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
      changedFields.push('id_service');
    }

    if (req.body?.image_url !== undefined) {
      updates.push('image_url = ?');
      values.push(sanitizeImageUrl(req.body.image_url));
      changedFields.push('image_url');
    }

    if (req.body?.badge !== undefined) {
      updates.push('badge = ?');
      values.push(sanitizeOptionalText(req.body.badge, 40) || 'POPULAR');
      changedFields.push('badge');
    }

    if (req.body?.headline !== undefined) {
      updates.push('headline = ?');
      values.push(sanitizeOptionalText(req.body.headline, 120));
      changedFields.push('headline');
    }

    if (req.body?.summary !== undefined) {
      updates.push('summary = ?');
      values.push(sanitizeOptionalText(req.body.summary, 255));
      changedFields.push('summary');
    }

    if (req.body?.cta_label !== undefined) {
      updates.push('cta_label = ?');
      values.push(sanitizeOptionalText(req.body.cta_label, 60) || 'Learn More');
      changedFields.push('cta_label');
    }

    if (req.body?.sort_order !== undefined) {
      let sortOrder: number;
      try {
        sortOrder = parsePositiveInt(req.body.sort_order, 'sort_order', 5000);
      } catch (error: any) {
        res.status(400).json({ error: error?.message || 'sort_order must be a positive number.' });
        return;
      }
      updates.push('sort_order = ?');
      values.push(sortOrder);
      changedFields.push('sort_order');
    }

    if (req.body?.is_active !== undefined) {
      try {
        const parsedActive = parseBooleanFlag(req.body.is_active, 'is_active');
        if (parsedActive !== undefined) {
          updates.push('is_active = ?');
          values.push(parsedActive);
          changedFields.push('is_active');
        }
      } catch (error: any) {
        res.status(400).json({ error: error?.message || 'Invalid is_active value.' });
        return;
      }
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

    await logAdminActivity(
      req,
      'update',
      'service_card',
      `Updated homepage card #${idCard}`,
      idCard,
      { fields: changedFields }
    );

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

    await logAdminActivity(
      req,
      'delete',
      'service_card',
      `Deleted homepage card #${idCard}`,
      idCard
    );

    res.json({ success: true, message: 'Service card deleted.' });
  } catch (error: any) {
    console.error('Error in deleteServiceCard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPendingWorkers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureUsersPendingWorkerColumn();

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT 
        u.id_user, u.name, u.lastname, u.email, u.phone_number, u.username, u.profile_image, u.created_at,
        wp.id_worker_profile, wp.bio, wp.dui_document, wp.cert_document, wp.is_verified
       FROM users u
       INNER JOIN worker_profiles wp ON wp.id_user = u.id_user
       WHERE u.pending_worker = 1
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
    await ensureUsersPendingWorkerColumn();

    const userId = Number(req.params.id);
    if (!userId || isNaN(userId)) {
      res.status(400).json({ error: 'Invalid user ID.' });
      return;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [userRows] = await connection.execute<RowDataPacket[]>(
        `SELECT u.id_user, u.pending_worker, u.rol, u.name, u.lastname, wp.is_verified
         FROM users u
         INNER JOIN worker_profiles wp ON wp.id_user = u.id_user
         WHERE u.id_user = ?
         FOR UPDATE`,
        [userId]
      );
      if (userRows.length === 0) {
        await connection.rollback();
        res.status(404).json({ error: 'Worker not found.' });
        return;
      }
      const pendingWorker = Number(userRows[0]?.pending_worker || 0) === 1;
      const currentRole = String(userRows[0]?.rol || '').toLowerCase();
      const isVerified = Number(userRows[0]?.is_verified || 0);
      if (!pendingWorker || isVerified !== 0 || currentRole === 'admin' || currentRole === 'root') {
        await connection.rollback();
        res.status(409).json({ error: 'Worker not in a pending state.' });
        return;
      }

      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE worker_profiles SET is_verified = 1 WHERE id_user = ? AND is_verified = 0`,
        [userId]
      );

      if (result.affectedRows === 0) {
        await connection.rollback();
        res.status(404).json({ error: 'Worker not found or already processed.' });
        return;
      }

      await connection.execute(
        `UPDATE users SET rol = 'worker', pending_worker = 0 WHERE id_user = ?`,
        [userId]
      );

      const workerName = `${userRows[0]?.name || ''} ${userRows[0]?.lastname || ''}`.trim();
      await connection.commit();
      pushToUser(userId, 'worker_status', { is_verified: 1 });
      await logAdminActivity(
        req,
        'approve',
        'worker',
        workerName ? `Approved worker "${workerName}"` : `Approved worker #${userId}`,
        userId,
        { name: workerName || null }
      );
      res.json({ success: true, message: 'Worker approved successfully.' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error: any) {
    console.error('Error in approveWorker:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const rejectWorker = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureUsersPendingWorkerColumn();

    const userId = Number(req.params.id);
    if (!userId || isNaN(userId)) {
      res.status(400).json({ error: 'Invalid user ID.' });
      return;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [userRows] = await connection.execute<RowDataPacket[]>(
        `SELECT u.id_user, u.pending_worker, u.rol, u.name, u.lastname, wp.is_verified
         FROM users u
         INNER JOIN worker_profiles wp ON wp.id_user = u.id_user
         WHERE u.id_user = ?
         FOR UPDATE`,
        [userId]
      );
      if (userRows.length === 0) {
        await connection.rollback();
        res.status(404).json({ error: 'Worker not found.' });
        return;
      }
      const pendingWorker = Number(userRows[0]?.pending_worker || 0) === 1;
      const currentRole = String(userRows[0]?.rol || '').toLowerCase();
      const isVerified = Number(userRows[0]?.is_verified || 0);
      if (!pendingWorker || isVerified !== 0 || currentRole === 'admin' || currentRole === 'root') {
        await connection.rollback();
        res.status(409).json({ error: 'Worker not in a pending state.' });
        return;
      }

      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE worker_profiles SET is_verified = 2 WHERE id_user = ? AND is_verified = 0`,
        [userId]
      );

      if (result.affectedRows === 0) {
        await connection.rollback();
        res.status(404).json({ error: 'Worker not found or already processed.' });
        return;
      }

      await connection.execute(
        `UPDATE users SET pending_worker = 0 WHERE id_user = ?`,
        [userId]
      );

      const workerName = `${userRows[0]?.name || ''} ${userRows[0]?.lastname || ''}`.trim();
      await connection.commit();
      pushToUser(userId, 'worker_status', { is_verified: 2 });
      await logAdminActivity(
        req,
        'reject',
        'worker',
        workerName ? `Rejected worker "${workerName}"` : `Rejected worker #${userId}`,
        userId,
        { name: workerName || null }
      );
      res.json({ success: true, message: 'Worker rejected successfully.' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error: any) {
    console.error('Error in rejectWorker:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Users Management ────────────────────────────────────────────────────

export const getUsersAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureUsersActiveColumn();

    const rawSearch = req.query.search ? sanitizeText(req.query.search, 120) : '';
    const search = rawSearch.trim();

    const roleFilter = req.query.role ? String(req.query.role).toLowerCase() : '';
    if (roleFilter && !ALLOWED_USER_ROLES.has(roleFilter)) {
      res.status(400).json({ error: 'Invalid role filter.' });
      return;
    }

    const statusFilter = req.query.status ? String(req.query.status).toLowerCase() : '';
    if (statusFilter && statusFilter !== 'active' && statusFilter !== 'inactive') {
      res.status(400).json({ error: 'Invalid status filter.' });
      return;
    }

    const whereParts: string[] = [];
    const params: any[] = [];

    if (search) {
      whereParts.push(`(u.name LIKE ? OR u.lastname LIKE ? OR u.email LIKE ? OR u.username LIKE ?)`);
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }

    if (roleFilter) {
      whereParts.push(`u.rol = ?`);
      params.push(roleFilter);
    }

    if (statusFilter) {
      whereParts.push(`u.is_active = ?`);
      params.push(statusFilter === 'active' ? 1 : 0);
    }

    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         u.id_user,
         u.name,
         u.lastname,
         u.email,
         u.phone_number,
         u.username,
         u.profile_image,
         u.rol,
         u.created_at,
         u.last_login,
         u.is_active
       FROM users u
       ${whereSql}
       ORDER BY u.created_at DESC
       LIMIT 500`,
      params
    );

    const users = rows.map((row: any) => ({
      id_user: Number(row.id_user),
      name: row.name,
      lastname: row.lastname,
      email: row.email,
      phone_number: row.phone_number,
      username: row.username,
      profile_image: row.profile_image,
      rol: row.rol,
      created_at: row.created_at,
      last_login: row.last_login,
      is_active: row.is_active ? 1 : 0,
    }));

    res.json({ success: true, users });
  } catch (error: any) {
    console.error('Error in getUsersAdmin:', error);
    if (typeof error?.message === 'string' && error.message.toLowerCase().includes('invalid')) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateUserRole = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    assertAllowedFields(req.body, ['rol']);
    await ensureUsersActiveColumn();

    const userId = Number(req.params.id);
    if (!userId || isNaN(userId)) {
      res.status(400).json({ error: 'Invalid user ID.' });
      return;
    }

    const newRole = String(req.body?.rol || '').toLowerCase();
    if (!ALLOWED_USER_ROLES.has(newRole)) {
      res.status(400).json({ error: 'Invalid role value.' });
      return;
    }
    if (!ASSIGNABLE_USER_ROLES.has(newRole)) {
      res.status(400).json({ error: 'Role change not allowed.' });
      return;
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_user, rol, name, lastname FROM users WHERE id_user = ?`,
      [userId]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const currentRole = String(rows[0].rol || '').toLowerCase();
    if (currentRole === 'root') {
      res.status(403).json({ error: 'Root user cannot be modified.' });
      return;
    }
    if (currentRole === 'worker') {
      res.status(400).json({ error: 'Worker role cannot be changed.' });
      return;
    }

    if (currentRole === newRole) {
      res.json({ success: true, message: 'Role unchanged.' });
      return;
    }

    await pool.execute<ResultSetHeader>(
      `UPDATE users SET rol = ? WHERE id_user = ?`,
      [newRole, userId]
    );

    const userName = `${rows[0]?.name || ''} ${rows[0]?.lastname || ''}`.trim();
    await logAdminActivity(
      req,
      'role_change',
      'user',
      userName
        ? `Changed role for "${userName}" to ${newRole}`
        : `Changed role for user #${userId} to ${newRole}`,
      userId,
      { from: currentRole, to: newRole }
    );

    res.json({ success: true, message: 'Role updated successfully.' });
  } catch (error: any) {
    console.error('Error in updateUserRole:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateUserStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    assertAllowedFields(req.body, ['is_active']);
    await ensureUsersActiveColumn();

    const userId = Number(req.params.id);
    if (!userId || isNaN(userId)) {
      res.status(400).json({ error: 'Invalid user ID.' });
      return;
    }

    let desiredActive: 0 | 1 = 1;
    try {
      const parsedActive = parseBooleanFlag(req.body?.is_active, 'is_active');
      if (parsedActive === undefined) {
        res.status(400).json({ error: 'is_active is required.' });
        return;
      }
      desiredActive = parsedActive;
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Invalid is_active value.' });
      return;
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_user, rol, name, lastname FROM users WHERE id_user = ?`,
      [userId]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const currentRole = String(rows[0].rol || '').toLowerCase();
    if (currentRole === 'root') {
      res.status(403).json({ error: 'Root user cannot be modified.' });
      return;
    }

    if (req.user?.user_id === userId && desiredActive === 0) {
      res.status(400).json({ error: 'You cannot deactivate your own account.' });
      return;
    }

    await pool.execute<ResultSetHeader>(
      `UPDATE users SET is_active = ? WHERE id_user = ?`,
      [desiredActive, userId]
    );

    const userName = `${rows[0]?.name || ''} ${rows[0]?.lastname || ''}`.trim();
    await logAdminActivity(
      req,
      'status_change',
      'user',
      userName
        ? `${desiredActive === 1 ? 'Activated' : 'Deactivated'} "${userName}"`
        : `${desiredActive === 1 ? 'Activated' : 'Deactivated'} user #${userId}`,
      userId,
      { is_active: desiredActive }
    );

    res.json({ success: true, message: 'User status updated successfully.' });
  } catch (error: any) {
    console.error('Error in updateUserStatus:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export const getDashboardStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureUsersPendingWorkerColumn();
    await ensureServiceRequestTables();

    const requestedServiceIdRaw = req.query.service_id;
    let requestedServiceId: number | null = null;
    if (requestedServiceIdRaw !== undefined) {
      const parsed = Number(requestedServiceIdRaw);
      if (!parsed || Number.isNaN(parsed) || parsed < 1) {
        res.status(400).json({ error: 'Invalid service filter.' });
        return;
      }
      requestedServiceId = parsed;
    }

    const [[{ total_services }]] = await pool.execute<RowDataPacket[]>(`SELECT COUNT(*) as total_services FROM services`);
    
    const [[{ total_pros }]] = await pool.execute<RowDataPacket[]>(`
      SELECT COUNT(*) as total_pros FROM users u
      INNER JOIN worker_profiles wp ON u.id_user = wp.id_user
      WHERE u.rol = 'worker' AND wp.is_verified = 1
    `);
    
    const [[{ pending_pros }]] = await pool.execute<RowDataPacket[]>(`
      SELECT COUNT(*) as pending_pros FROM users u
      INNER JOIN worker_profiles wp ON u.id_user = wp.id_user
      WHERE u.pending_worker = 1 AND wp.is_verified = 0 AND u.verification_token IS NULL
    `);
    
    const [[{ total_users }]] = await pool.execute<RowDataPacket[]>(`SELECT COUNT(*) as total_users FROM users WHERE rol = 'client'`);
    const [[{ total_admins }]] = await pool.execute<RowDataPacket[]>(`SELECT COUNT(*) as total_admins FROM users WHERE rol IN ('admin', 'root')`);

    const [trafficRows] = await pool.execute<RowDataPacket[]>(`
      SELECT 
        DATE_FORMAT(created_at, '%a') as name,
        SUM(CASE WHEN rol = 'client' THEN 1 ELSE 0 END) as Users,
        SUM(CASE WHEN rol = 'worker' THEN 1 ELSE 0 END) as Pros,
        SUM(CASE WHEN rol IN ('admin', 'root') THEN 1 ELSE 0 END) as Admins
      FROM users
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY DATE(created_at), DATE_FORMAT(created_at, '%a')
      ORDER BY DATE(created_at) ASC
    `);

    const [serviceCategoryRows] = await pool.execute<RowDataPacket[]>(`
      SELECT
        s.name as name,
        COUNT(sr.id_request) as value
      FROM services s
      LEFT JOIN service_requests sr
        ON sr.id_service = s.id_service
       AND sr.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY s.id_service
      ORDER BY value DESC, s.name ASC
      LIMIT 5
    `);

    const completedWhereParts: string[] = [
      `status = 'done'`,
      `updated_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)`,
    ];
    const completedParams: any[] = [];
    if (requestedServiceId != null) {
      completedWhereParts.push(`id_service = ?`);
      completedParams.push(requestedServiceId);
    }

    const [completedRows] = await pool.execute<RowDataPacket[]>(`
      SELECT
        DATE(updated_at) as day,
        COUNT(*) as value
      FROM service_requests
      WHERE ${completedWhereParts.join(' AND ')}
      GROUP BY DATE(updated_at)
      ORDER BY day ASC
    `, completedParams);

    const completedPrevWhereParts: string[] = [
      `status = 'done'`,
      `updated_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)`,
      `updated_at < DATE_SUB(CURDATE(), INTERVAL 6 DAY)`,
    ];
    const completedPrevParams: any[] = [];
    if (requestedServiceId != null) {
      completedPrevWhereParts.push(`id_service = ?`);
      completedPrevParams.push(requestedServiceId);
    }

    const [[{ completed_prev_total }]] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as completed_prev_total
       FROM service_requests
       WHERE ${completedPrevWhereParts.join(' AND ')}`,
      completedPrevParams
    );

    const locationWhereParts: string[] = [
      `created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
    ];
    const locationParams: any[] = [];
    if (requestedServiceId != null) {
      locationWhereParts.push(`id_service = ?`);
      locationParams.push(requestedServiceId);
    }

    const [locationRows] = await pool.execute<RowDataPacket[]>(`
      SELECT
        location_text as name,
        COUNT(*) as value
      FROM service_requests
      WHERE ${locationWhereParts.join(' AND ')}
      GROUP BY location_text
      ORDER BY value DESC, location_text ASC
      LIMIT 5
    `, locationParams);

    const revenueWhereParts: string[] = [
      `srp.payment_status IN ('paid', 'released')`,
      `srp.paid_at >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH)`,
    ];
    const revenueParams: any[] = [];
    if (requestedServiceId != null) {
      revenueWhereParts.push(`sr.id_service = ?`);
      revenueParams.push(requestedServiceId);
    }

    const [revenueRows] = await pool.execute<RowDataPacket[]>(`
      SELECT
        DATE_FORMAT(srp.paid_at, '%Y-%m-01') as month_start,
        SUM(srp.platform_fee) as uv
      FROM service_request_payments srp
      INNER JOIN service_requests sr ON sr.id_request = srp.id_request
      WHERE ${revenueWhereParts.join(' AND ')}
      GROUP BY month_start
      ORDER BY month_start ASC
    `, revenueParams);

    const formatYmd = (date: Date) => {
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
    const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short' });

    const completedMap = new Map<string, number>();
    for (const row of completedRows as any[]) {
      completedMap.set(String(row.day), Number(row.value || 0));
    }

    const completedServicesWeekly: Array<{ name: string; value: number }> = [];
    const today = new Date();
    for (let offset = 6; offset >= 0; offset -= 1) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
      const key = formatYmd(d);
      completedServicesWeekly.push({
        name: weekdayFormatter.format(d),
        value: Number(completedMap.get(key) || 0),
      });
    }

    const revenueMap = new Map<string, number>();
    for (const row of revenueRows as any[]) {
      revenueMap.set(String(row.month_start), Number(row.uv || 0));
    }

    const revenueData: Array<{ name: string; uv: number; pv: number; amt?: number }> = [];
    const firstMonth = new Date(today.getFullYear(), today.getMonth() - 5, 1);
    for (let idx = 0; idx < 6; idx += 1) {
      const d = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + idx, 1);
      const key = formatYmd(d);
      revenueData.push({
        name: monthFormatter.format(d),
        uv: Number(revenueMap.get(key) || 0),
        pv: 0,
      });
    }
    for (let idx = 0; idx < revenueData.length; idx += 1) {
      revenueData[idx].pv = idx === 0 ? revenueData[idx].uv : revenueData[idx - 1].uv;
    }

    const trafficData = (trafficRows as any[]).map((row) => ({
      name: String(row.name),
      Users: Number(row.Users || 0),
      Pros: Number(row.Pros || 0),
      Admins: Number(row.Admins || 0),
    }));

    res.json({
      success: true,
      stats: {
        total_services: Number(total_services),
        total_pros: Number(total_pros),
        pending_pros: Number(pending_pros),
        total_users: Number(total_users),
        total_admins: Number(total_admins),
        trafficData,
        selected_service_id: requestedServiceId,
        serviceCategoryStats: (serviceCategoryRows as any[]).map((row) => ({
          name: String(row.name),
          value: Number(row.value || 0),
        })),
        completedServicesWeekly,
        completedServicesPrevTotal: Number(completed_prev_total || 0),
        popularLocations: (locationRows as any[]).map((row) => ({
          name: String(row.name),
          value: Number(row.value || 0),
        })),
        revenueData,
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
    const requestedServiceIdRaw = req.query.service_id;

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

    if (requestedServiceIdRaw !== undefined) {
      const serviceId = Number(requestedServiceIdRaw);
      if (!serviceId || Number.isNaN(serviceId) || serviceId < 1) {
        res.status(400).json({ error: 'Invalid service filter.' });
        return;
      }
      whereParts.push(`sr.id_service = ?`);
      params.push(serviceId);
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

export const getAdminActivity = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureAdminActivityTable();

    const rawLimit = Number(req.query.limit ?? 100);
    const rawOffset = Number(req.query.offset ?? 0);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 200) : 100;
    const offset = Number.isFinite(rawOffset) ? Math.max(Math.floor(rawOffset), 0) : 0;

    const actionFilter = req.query.action ? sanitizeText(req.query.action, 40).toLowerCase() : '';
    const entityFilter = req.query.entity ? sanitizeText(req.query.entity, 40).toLowerCase() : '';

    let adminId: number | null = null;
    if (req.query.admin_id !== undefined) {
      const parsed = Number(req.query.admin_id);
      if (!parsed || Number.isNaN(parsed)) {
        res.status(400).json({ error: 'Invalid admin_id filter.' });
        return;
      }
      adminId = parsed;
    }

    const whereParts: string[] = [];
    const params: any[] = [];

    if (actionFilter) {
      whereParts.push('a.action_type = ?');
      params.push(actionFilter);
    }

    if (entityFilter) {
      whereParts.push('a.entity_type = ?');
      params.push(entityFilter);
    }

    if (adminId !== null) {
      whereParts.push('a.id_admin = ?');
      params.push(adminId);
    }

    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    const [rows] = await pool.execute<AdminActivityRow[]>(
      `SELECT
         a.id_activity,
         a.id_admin,
         a.action_type,
         a.entity_type,
         a.entity_id,
         a.summary,
         a.metadata,
         a.created_at,
         u.name AS admin_name,
         u.lastname AS admin_lastname,
         u.email AS admin_email
       FROM admin_activity_log a
       LEFT JOIN users u ON u.id_user = a.id_admin
       ${whereSql}
       ORDER BY a.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    const activities = rows.map((row) => {
      let metadata: any = null;
      if (row.metadata) {
        try {
          metadata = JSON.parse(String(row.metadata));
        } catch {
          metadata = null;
        }
      }
      return {
        id_activity: Number(row.id_activity),
        action: String(row.action_type),
        entity: String(row.entity_type),
        entity_id: row.entity_id != null ? Number(row.entity_id) : null,
        summary: row.summary,
        created_at: row.created_at,
        admin: row.id_admin
          ? {
              id_user: Number(row.id_admin),
              name: `${row.admin_name || ''} ${row.admin_lastname || ''}`.trim() || 'Admin',
              email: row.admin_email || null,
            }
          : null,
        metadata,
      };
    });

    res.json({ success: true, activities });
  } catch (error: any) {
    console.error('Error in getAdminActivity:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateHeroSlides = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    assertAllowedFields(req.body, ['slides']);
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

    await logAdminActivity(
      req,
      'update',
      'hero_slide',
      `Updated homepage carousel (${slides.length} slides)`,
      null,
      { slides: slides.length }
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

    await logAdminActivity(
      req,
      'upload',
      'hero_slide',
      `Updated image for slide #${idSlide}`,
      idSlide
    );

    res.json({ success: true, image: imageUrl, slides: toSlidesDto(rows) });
  } catch (error: any) {
    console.error('Error in uploadHeroSlideImage:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getWorkerRewardsAdminOverview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureServiceRequestTables();

    const status = String(req.query.status || 'all').toLowerCase();
    const settings = await getWorkerRewardsSettings();
    await syncAllWorkerBonusPayouts(settings);
    const payouts = await getAllBonusPayoutsForAdmin(status);

    const summary = payouts.reduce(
      (acc, row) => {
        const normalizedStatus = String(row.payout_status || '').toLowerCase();
        const amount = Number(row.bonus_amount || 0);
        acc.total_bonus_amount += amount;
        acc.total_rows += 1;
        if (normalizedStatus === 'scheduled') {
          acc.scheduled_amount += amount;
          acc.scheduled_count += 1;
        } else if (normalizedStatus === 'paid') {
          acc.paid_amount += amount;
          acc.paid_count += 1;
        } else if (normalizedStatus === 'cancelled') {
          acc.cancelled_amount += amount;
          acc.cancelled_count += 1;
        }
        return acc;
      },
      {
        total_rows: 0,
        total_bonus_amount: 0,
        scheduled_count: 0,
        scheduled_amount: 0,
        paid_count: 0,
        paid_amount: 0,
        cancelled_count: 0,
        cancelled_amount: 0,
      }
    );

    res.json({
      success: true,
      settings,
      summary: {
        ...summary,
        total_bonus_amount: Number(summary.total_bonus_amount.toFixed(2)),
        scheduled_amount: Number(summary.scheduled_amount.toFixed(2)),
        paid_amount: Number(summary.paid_amount.toFixed(2)),
        cancelled_amount: Number(summary.cancelled_amount.toFixed(2)),
      },
      payouts: payouts.map((row) => ({
        id_bonus_payout: Number(row.id_bonus_payout),
        id_worker_profile: Number(row.id_worker_profile),
        worker_name: `${row.name || ''} ${row.lastname || ''}`.trim() || 'Worker',
        bonus_type: String(row.bonus_type || 'commission'),
        cycle_key: String(row.cycle_key || ''),
        base_amount: Number(row.base_amount || 0),
        bonus_amount: Number(row.bonus_amount || 0),
        payout_status: String(row.payout_status || 'scheduled'),
        scheduled_for: row.scheduled_for,
        paid_at: row.paid_at || null,
        notes: row.notes || null,
        source_request_id: row.source_request_id != null ? Number(row.source_request_id) : null,
        location_text: row.location_text || null,
        service_name: row.service_name || null,
      })),
    });
  } catch (error: any) {
    console.error('Error in getWorkerRewardsAdminOverview:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateWorkerRewardsProgram = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const trialMinCompletedJobs = Number(req.body?.trial_min_completed_jobs);
    const commissionRatePercent = Number(req.body?.commission_rate_percent);
    const royaltyRatePercent = Number(req.body?.royalty_rate_percent);
    const royaltyMinJobs = Number(req.body?.royalty_min_jobs);
    const royaltyMinCompletionRate = Number(req.body?.royalty_min_completion_rate);

    if (
      !Number.isFinite(trialMinCompletedJobs) ||
      !Number.isFinite(commissionRatePercent) ||
      !Number.isFinite(royaltyRatePercent) ||
      !Number.isFinite(royaltyMinJobs) ||
      !Number.isFinite(royaltyMinCompletionRate)
    ) {
      res.status(400).json({ error: 'All rewards settings are required.' });
      return;
    }

    if (trialMinCompletedJobs < 1 || trialMinCompletedJobs > 100) {
      res.status(400).json({ error: 'Trial jobs must be between 1 and 100.' });
      return;
    }
    if (commissionRatePercent < 0 || commissionRatePercent > 100) {
      res.status(400).json({ error: 'Commission rate must be between 0 and 100.' });
      return;
    }
    if (royaltyRatePercent < 0 || royaltyRatePercent > 100) {
      res.status(400).json({ error: 'Royalty rate must be between 0 and 100.' });
      return;
    }
    if (royaltyMinJobs < 1 || royaltyMinJobs > 500) {
      res.status(400).json({ error: 'Royalty minimum jobs must be between 1 and 500.' });
      return;
    }
    if (royaltyMinCompletionRate < 0 || royaltyMinCompletionRate > 100) {
      res.status(400).json({ error: 'Royalty completion rate must be between 0 and 100.' });
      return;
    }

    const updatedSettings = await updateWorkerRewardsSettings({
      trial_min_completed_jobs: Math.round(trialMinCompletedJobs),
      commission_rate: Number((commissionRatePercent / 100).toFixed(4)),
      royalty_rate: Number((royaltyRatePercent / 100).toFixed(4)),
      royalty_min_jobs: Math.round(royaltyMinJobs),
      royalty_min_completion_rate: Number(royaltyMinCompletionRate.toFixed(2)),
    });

    await syncAllWorkerBonusPayouts(updatedSettings);

    res.json({
      success: true,
      message: 'Worker rewards program updated. Existing earned payouts were preserved.',
      settings: updatedSettings,
    });
  } catch (error: any) {
    console.error('Error in updateWorkerRewardsProgram:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const markWorkerBonusPayoutPaidController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const idBonusPayout = Number(req.params.idBonusPayout);
    if (!idBonusPayout || Number.isNaN(idBonusPayout)) {
      res.status(400).json({ error: 'Invalid bonus payout ID.' });
      return;
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         wbp.id_bonus_payout,
         wbp.id_worker_profile,
         wbp.source_request_id,
         wbp.bonus_type,
         wbp.bonus_amount,
         wbp.scheduled_for,
         wp.id_user
       FROM worker_bonus_payouts wbp
       INNER JOIN worker_profiles wp ON wp.id_worker_profile = wbp.id_worker_profile
       WHERE wbp.id_bonus_payout = ?
       LIMIT 1`,
      [idBonusPayout]
    );

    const payoutRow = rows[0];
    const updated = await markWorkerBonusPayoutAsPaid(idBonusPayout);
    if (!updated) {
      res.status(404).json({ error: 'Bonus payout not found or not scheduled for payment.' });
      return;
    }

    if (payoutRow?.id_user) {
      await createUserNotification({
        userId: Number(payoutRow.id_user),
        eventType: 'payout_paid',
        title: 'Payout released',
        message: `Your ${String(payoutRow.bonus_type || 'bonus')} payout of $${Number(payoutRow.bonus_amount || 0).toFixed(2)} was marked as paid.`,
        tone: 'success',
        bonusPayoutId: Number(payoutRow.id_bonus_payout),
        requestId: payoutRow.source_request_id != null ? Number(payoutRow.source_request_id) : null,
        actionUrl: '/pro-dashboard',
        dedupeKey: `worker-payout-paid-${idBonusPayout}`,
        metadata: {
          bonus_type: payoutRow.bonus_type,
          scheduled_for: payoutRow.scheduled_for,
          bonus_amount: Number(payoutRow.bonus_amount || 0),
        },
      });
    }

    res.json({
      success: true,
      message: 'Bonus payout marked as paid.',
    });
  } catch (error: any) {
    console.error('Error in markWorkerBonusPayoutPaidController:', error);
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
