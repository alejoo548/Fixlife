import { Response } from 'express';
import PDFDocument from 'pdfkit';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { AuthRequest } from '../middlewares/auth.middleware';
import {getAllBonusPayoutsForAdmin,getWorkerRewardsSettings,markWorkerBonusPayoutAsPaid,syncAllWorkerBonusPayouts,updateWorkerRewardsSettings,} from '../utils/workerRewards';
import { createUserNotification } from '../utils/notifications';
import { emitToUser } from '../services/socketManager';
import { emitAdminActivity } from '../services/supportSocket.service';
import { recordSystemEvent } from '../services/systemEvents.service';
import { ensureServiceCardsTable, ensureServiceRequestTables } from './services.controller';
import { ensureUsersActiveColumn, ensureUsersPendingWorkerColumn } from '../utils/users';
import { buildProtectedAssetUrl, buildPublicAssetUrl, deleteUploadIfExists } from '../utils/assets';
import { shouldRunRuntimeSchemaSync } from '../config/schemaSync';
import {
  getCommissionRulesAdminConfig,
  updateCommissionRulesAdminConfig,
} from '../services/commissionEngine.service';
import {
  getAllWorkerPayoutsForAdmin,
  getRecentPaymentLedger,
  markWorkerPayoutAsPaid,
  recordBonusPayoutPaidLedger,
} from '../services/paymentLedger.service';
import { buildFinanceSettlementCsv, getFinanceSettlementReport } from '../services/financeReports.service';
import {
  getWorkerTierBenefits,
  getWorkerTierHistory,
  updateWorkerMembershipTier,
  updateWorkerTierBenefits,
} from '../services/workerTier.service';
import {
  createFinanceCase,
  getFinanceCases,
  getFinanceClosureReport,
  resolveFinanceCase,
} from '../services/financeOperations.service';
import { getSystemEvents } from '../services/systemEvents.service';
import { enqueueBackgroundJob, getBackgroundJobsAdmin } from '../services/backgroundJobs.service';
import { queueWorkerPayoutStatementEmail } from '../services/workerPayoutStatement.service';

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

const FILLER_TEXT_PATTERN =
  /\b(lorem|ipsum|dolor|sit\s+amet|consectetur|adipiscing|asdf|qwerty|test\s*test|dummy|placeholder|sample)\b/i;

const validateMeaningfulFaqText = (value: string, fieldName: string, minWords: number) => {
  const normalized = value.trim().toLowerCase();
  if (FILLER_TEXT_PATTERN.test(normalized)) {
    throw new Error(`${fieldName} cannot contain placeholder or lorem ipsum text.`);
  }

  const words = normalized.match(/[\p{L}\p{N}]+/gu) || [];
  if (words.length < minWords) {
    throw new Error(`${fieldName} must contain at least ${minWords} meaningful words.`);
  }

  const uniqueWords = new Set(words.filter((word) => word.length > 2));
  if (words.length >= 6 && uniqueWords.size < 3) {
    throw new Error(`${fieldName} looks repetitive. Write a clear real ${fieldName.toLowerCase()}.`);
  }

  const compact = normalized.replace(/\s+/g, '');
  if (compact.length >= 12 && /(.)\1{7,}/u.test(compact)) {
    throw new Error(`${fieldName} contains too many repeated characters.`);
  }
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

export const ensurePublicFaqItemsTable = async () => {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS public_faq_items (
      id_faq INT NOT NULL AUTO_INCREMENT,
      question VARCHAR(180) NOT NULL,
      answer TEXT NOT NULL,
      icon VARCHAR(500) NULL,
      audience ENUM('clients', 'professionals', 'all') NOT NULL DEFAULT 'all',
      sort_order INT NOT NULL DEFAULT 1,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_faq),
      KEY idx_public_faq_items_active (is_active, audience, sort_order),
      KEY idx_public_faq_items_sort (sort_order, id_faq)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

const serializeFaqItem = (row: RowDataPacket) => ({
  id_faq: Number(row.id_faq),
  question: String(row.question || ''),
  answer: String(row.answer || ''),
  icon: row.icon ? String(row.icon) : null,
  audience: String(row.audience || 'all'),
  sort_order: Number(row.sort_order || 1),
  is_active: Boolean(row.is_active),
  created_at: row.created_at || null,
  updated_at: row.updated_at || null,
});

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

const isServiceCardSortConflict = (error: any) =>
  error?.code === 'ER_DUP_ENTRY' &&
  String(error?.message || '').includes('ux_service_cards_sort');

const toPublicRequestStatus = (status: string | null | undefined) => {
  if (!status) return 'pending';
  return status === 'open' ? 'pending' : status;
};

const ALLOWED_USER_ROLES = new Set(['client', 'worker', 'admin', 'root']);
const ASSIGNABLE_USER_ROLES = new Set(['client', 'admin']);

const formatMoneyUsd = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

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
  if (!shouldRunRuntimeSchemaSync()) {
    adminActivityTableChecked = true;
    return;
  }

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

const mapActivityRow = (row: AdminActivityRow) => {
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

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO admin_activity_log (id_admin, action_type, entity_type, entity_id, summary, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [adminId, action.toLowerCase(), entity.toLowerCase(), entityId ?? null, safeSummary, payload]
    );

    const [rows] = await pool.execute<AdminActivityRow[]>(
      `SELECT
         a.id_activity, a.id_admin, a.action_type, a.entity_type, a.entity_id,
         a.summary, a.metadata, a.created_at,
         u.name AS admin_name, u.lastname AS admin_lastname, u.email AS admin_email
       FROM admin_activity_log a
       LEFT JOIN users u ON u.id_user = a.id_admin
       WHERE a.id_activity = ? LIMIT 1`,
      [result.insertId]
    );

    if (rows[0]) emitAdminActivity(mapActivityRow(rows[0]));
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
  if (!shouldRunRuntimeSchemaSync()) {
    heroSlidesTableChecked = true;
    return;
  }

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

const toSlidesDto = (req: AuthRequest, rows: HeroSlideRow[]) =>
  rows.map((row) => ({
    id: Number(row.id_slide),
    image: buildPublicAssetUrl(req, row.image_url) || row.image_url,
    tag: row.tag,
    title: row.title,
    description: row.description,
    cta: row.cta,
  }));

export const getHeroSlidesPublic = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureHeroSlidesTable();
    const [rows] = await pool.execute<HeroSlideRow[]>(
      `SELECT id_slide, sort_order, image_url, tag, title, description, cta
       FROM hero_slides
       ORDER BY sort_order ASC`
    );
    res.json({ success: true, slides: toSlidesDto(req, rows) });
  } catch (error) {
    console.error('Error in getHeroSlidesPublic:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getAllServices = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureServiceRequestTables();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT s.id_service, s.name, s.description, s.icon, s.is_active, s.created_at,
         COUNT(DISTINCT sr.id_request) AS request_count,
         COUNT(DISTINCT CASE WHEN sr.status = 'done' THEN sr.id_request END) AS completed_count,
         COUNT(DISTINCT CASE WHEN sr.status = 'cancelled' THEN sr.id_request END) AS cancelled_count,
         COALESCE(SUM(CASE WHEN p.payment_status IN ('paid','released') THEN p.amount ELSE 0 END), 0) AS paid_volume,
         MAX(sr.created_at) AS last_request_at
       FROM services s
       LEFT JOIN service_requests sr ON sr.id_service = s.id_service
       LEFT JOIN service_request_payments p ON p.id_request = sr.id_request
       GROUP BY s.id_service, s.name, s.description, s.icon, s.is_active, s.created_at
       ORDER BY s.created_at DESC`
    );
    res.json({ success: true, services: rows.map((row: any) => ({
      ...row,
      id_service: Number(row.id_service),
      request_count: Number(row.request_count || 0),
      completed_count: Number(row.completed_count || 0),
      cancelled_count: Number(row.cancelled_count || 0),
      paid_volume: Number(row.paid_volume || 0),
    })) });
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
    await ensureServiceRequestTables();
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

    const [[usage]] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS request_count FROM service_requests WHERE id_service = ?`,
      [idService]
    );
    if (Number(usage?.request_count || 0) > 0) {
      res.status(409).json({ error: 'Service has request history and cannot be deleted. Deactivate it instead.' });
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
    if (isServiceCardSortConflict(error)) {
      res.status(409).json({ error: 'Another service card already uses this sort_order.' });
      return;
    }
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
    if (isServiceCardSortConflict(error)) {
      res.status(409).json({ error: 'Another service card already uses this sort_order.' });
      return;
    }
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

export const getPublicFaqItems = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensurePublicFaqItemsTable();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_faq, question, answer, icon, audience, sort_order, is_active, created_at, updated_at
       FROM public_faq_items
       WHERE is_active = 1
       ORDER BY sort_order ASC, id_faq ASC`
    );
    res.json({ success: true, faqs: rows.map(serializeFaqItem) });
  } catch (error) {
    console.error('Error in getPublicFaqItems:', error);
    res.status(500).json({ error: 'Could not load FAQ items.' });
  }
};

export const getFaqItemsAdmin = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensurePublicFaqItemsTable();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_faq, question, answer, icon, audience, sort_order, is_active, created_at, updated_at
       FROM public_faq_items
       ORDER BY sort_order ASC, id_faq ASC`
    );
    res.json({ success: true, faqs: rows.map(serializeFaqItem) });
  } catch (error) {
    console.error('Error in getFaqItemsAdmin:', error);
    res.status(500).json({ error: 'Could not load FAQ items.' });
  }
};

export const createFaqItemAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensurePublicFaqItemsTable();
    const question = sanitizeText(req.body?.question, 180);
    const answer = sanitizeText(req.body?.answer, 1200);
    const icon = sanitizeOptionalText(req.body?.icon, 500);
    const audience = ['clients', 'professionals', 'all'].includes(String(req.body?.audience || 'all'))
      ? String(req.body?.audience || 'all')
      : 'all';
    const isActive = parseBooleanFlag(req.body?.is_active ?? true, 'is_active') ?? 1;
    let sortOrder = req.body?.sort_order != null
      ? parsePositiveInt(req.body.sort_order, 'sort_order', 5000)
      : null;

    if (question.length < 6 || answer.length < 12) {
      res.status(400).json({ error: 'Question and answer are required.' });
      return;
    }
    validateMeaningfulFaqText(question, 'Question', 3);
    validateMeaningfulFaqText(answer, 'Answer', 8);

    if (!sortOrder) {
      const [maxRows] = await pool.execute<RowDataPacket[]>(
        `SELECT COALESCE(MAX(sort_order), 0) AS maxSort FROM public_faq_items`
      );
      sortOrder = Number(maxRows[0]?.maxSort || 0) + 1;
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO public_faq_items (question, answer, icon, audience, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [question, answer, icon, audience, sortOrder, isActive]
    );

    await recordSystemEvent({
      component: 'admin_content',
      eventType: 'admin_faq_created',
      message: `FAQ item #${result.insertId} created.`,
      metadata: { actor_user_id: req.user?.user_id, id_faq: result.insertId, question, audience },
    });

    res.status(201).json({ success: true, id_faq: result.insertId });
  } catch (error: any) {
    console.error('Error in createFaqItemAdmin:', error);
    res.status(400).json({ error: error?.message || 'Could not create FAQ item.' });
  }
};

export const updateFaqItemAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensurePublicFaqItemsTable();
    const idFaq = parsePositiveInt(req.params.idFaq, 'idFaq');
    assertAllowedFields(req.body, ['question', 'answer', 'icon', 'audience', 'sort_order', 'is_active']);

    const updates: string[] = [];
    const params: any[] = [];

    if (req.body.question !== undefined) {
      const question = sanitizeText(req.body.question, 180);
      if (question.length < 6) throw new Error('Question must contain at least 6 characters.');
      validateMeaningfulFaqText(question, 'Question', 3);
      updates.push('question = ?');
      params.push(question);
    }
    if (req.body.answer !== undefined) {
      const answer = sanitizeText(req.body.answer, 1200);
      if (answer.length < 12) throw new Error('Answer must contain at least 12 characters.');
      validateMeaningfulFaqText(answer, 'Answer', 8);
      updates.push('answer = ?');
      params.push(answer);
    }
    if (req.body.icon !== undefined) {
      updates.push('icon = ?');
      params.push(sanitizeOptionalText(req.body.icon, 500));
    }
    if (req.body.audience !== undefined) {
      const audience = String(req.body.audience || 'all');
      if (!['clients', 'professionals', 'all'].includes(audience)) throw new Error('Invalid audience value.');
      updates.push('audience = ?');
      params.push(audience);
    }
    if (req.body.sort_order !== undefined) {
      updates.push('sort_order = ?');
      params.push(parsePositiveInt(req.body.sort_order, 'sort_order', 5000));
    }
    if (req.body.is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(parseBooleanFlag(req.body.is_active, 'is_active'));
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No changes provided.' });
      return;
    }

    params.push(idFaq);
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE public_faq_items SET ${updates.join(', ')} WHERE id_faq = ?`,
      params
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'FAQ item not found.' });
      return;
    }

    await recordSystemEvent({
      component: 'admin_content',
      eventType: 'admin_faq_updated',
      message: `FAQ item #${idFaq} updated.`,
      metadata: { actor_user_id: req.user?.user_id, id_faq: idFaq, fields: updates.map((item) => item.split(' ')[0]) },
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error in updateFaqItemAdmin:', error);
    res.status(400).json({ error: error?.message || 'Could not update FAQ item.' });
  }
};

export const deleteFaqItemAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensurePublicFaqItemsTable();
    const idFaq = parsePositiveInt(req.params.idFaq, 'idFaq');
    const [result] = await pool.execute<ResultSetHeader>(
      `DELETE FROM public_faq_items WHERE id_faq = ?`,
      [idFaq]
    );
    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'FAQ item not found.' });
      return;
    }

    await recordSystemEvent({
      component: 'admin_content',
      eventType: 'admin_faq_deleted',
      message: `FAQ item #${idFaq} deleted.`,
      metadata: { actor_user_id: req.user?.user_id, id_faq: idFaq },
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error in deleteFaqItemAdmin:', error);
    res.status(400).json({ error: error?.message || 'Could not delete FAQ item.' });
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
    const result = workersWithServices.map((w: any) => ({
      ...w,
      dui_document_url: buildProtectedAssetUrl(req, w.dui_document),
      cert_document_url: buildProtectedAssetUrl(req, w.cert_document),
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
    const reason = sanitizeText(req.body.reason, 500);

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
        `UPDATE worker_profiles
         SET is_verified = 1,
             membership_tier = 'verified'
         WHERE id_user = ? AND is_verified = 0`,
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
      emitToUser(userId, 'worker_status', { is_verified: 1 });
      await logAdminActivity(
        req,
        'approve',
        'worker',
        workerName ? `Approved worker "${workerName}"` : `Approved worker #${userId}`,
        userId,
        { name: workerName || null, reason }
      );
      await recordSystemEvent({
        level: 'info',
        component: 'admin',
        eventType: 'worker_approved',
        message: 'Worker profile approved.',
        metadata: { targetUserId: userId, actor: req.user?.user_id },
      }).catch(() => undefined);

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
    const reason = sanitizeText(req.body.reason, 500);

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
      emitToUser(userId, 'worker_status', { is_verified: 2 });
      await logAdminActivity(
        req,
        'reject',
        'worker',
        workerName ? `Rejected worker "${workerName}"` : `Rejected worker #${userId}`,
        userId,
        { name: workerName || null, reason }
      );

      await recordSystemEvent({
        level: 'warning',
        component: 'admin',
        eventType: 'worker_rejected',
        message: 'Worker profile rejected.',
        metadata: { targetUserId: userId, actor: req.user?.user_id, reason },
      }).catch(() => undefined);

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

    if (roleFilter === 'admin') {
      // The "Admins" section lists every staff account: admins plus the root.
      whereParts.push(`u.rol IN ('admin', 'root')`);
    } else if (roleFilter) {
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
         u.is_active,
         wp.id_worker_profile,
         wp.is_verified,
         wp.membership_tier,
         DATEDIFF(CURRENT_DATE, DATE(u.created_at)) AS days_active,
         COALESCE(worker_stats.completed_jobs, 0) AS completed_jobs,
         worker_stats.rating_average,
         COALESCE(worker_stats.rating_count, 0) AS rating_count
       FROM users u
       LEFT JOIN worker_profiles wp ON wp.id_user = u.id_user
       LEFT JOIN (
         SELECT
           wp_stats.id_worker_profile,
           COUNT(DISTINCT CASE WHEN sr.status = 'done' THEN sr.id_request END) AS completed_jobs,
           COALESCE(AVG((rr.punctuality + rr.quality + rr.price_fairness) / 3), NULL) AS rating_average,
           COUNT(DISTINCT rr.id_rating) AS rating_count
         FROM worker_profiles wp_stats
         LEFT JOIN service_requests sr
           ON sr.assigned_worker_profile = wp_stats.id_worker_profile
         LEFT JOIN service_request_ratings rr
           ON rr.id_worker_profile = wp_stats.id_worker_profile
         GROUP BY wp_stats.id_worker_profile
       ) worker_stats ON worker_stats.id_worker_profile = wp.id_worker_profile
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
      id_worker_profile: row.id_worker_profile != null ? Number(row.id_worker_profile) : null,
      is_verified: row.is_verified != null ? Number(row.is_verified) : null,
      membership_tier: row.membership_tier === 'premium' ? 'trusted' : row.membership_tier ? String(row.membership_tier) : null,
      days_active: row.days_active != null ? Number(row.days_active) : null,
      completed_jobs: row.completed_jobs != null ? Number(row.completed_jobs) : 0,
      rating_average: row.rating_average != null ? Number(row.rating_average) : null,
      rating_count: row.rating_count != null ? Number(row.rating_count) : 0,
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

export const getUserDetailAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureUsersActiveColumn();
    await ensureServiceRequestTables();
    const userId = parsePositiveInt(req.params.id, 'user id', 2_000_000_000);

    const [userRows] = await pool.execute<RowDataPacket[]>(
      `SELECT u.id_user, u.name, u.lastname, u.email, u.phone_number, u.username,
         u.profile_image, u.rol, u.is_active, u.created_at, u.last_login,
         wp.id_worker_profile, wp.bio, wp.is_verified, wp.membership_tier,
         wp.dui_document, wp.cert_document
       FROM users u
       LEFT JOIN worker_profiles wp ON wp.id_user = u.id_user
       WHERE u.id_user = ? LIMIT 1`,
      [userId]
    );
    if (userRows.length === 0) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    const user: any = userRows[0];

    const [requestRows] = await pool.execute<RowDataPacket[]>(
      `SELECT sr.id_request, sr.status, sr.description, sr.location_text, sr.budget,
         sr.created_at, sr.updated_at, s.name AS service_name,
         p.payment_status, p.amount AS payment_amount
       FROM service_requests sr
       INNER JOIN services s ON s.id_service = sr.id_service
       LEFT JOIN service_request_payments p ON p.id_request = sr.id_request
       WHERE sr.id_user = ? OR sr.assigned_worker_profile = ?
       ORDER BY sr.created_at DESC LIMIT 50`,
      [userId, user.id_worker_profile || 0]
    );

    const [serviceRows] = user.id_worker_profile
      ? await pool.execute<RowDataPacket[]>(
          `SELECT s.id_service, s.name
           FROM worker_services ws
           INNER JOIN services s ON s.id_service = ws.id_service
           WHERE ws.id_worker_profile = ? ORDER BY s.name`,
          [user.id_worker_profile]
        )
      : [[] as unknown as RowDataPacket[]];

    const [ratingRows] = user.id_worker_profile
      ? await pool.execute<RowDataPacket[]>(
          `SELECT COUNT(*) AS rating_count,
             AVG((punctuality + quality + price_fairness) / 3) AS rating_average,
             AVG(punctuality) AS punctuality_average,
             AVG(quality) AS quality_average,
             AVG(price_fairness) AS price_average
           FROM service_request_ratings WHERE id_worker_profile = ?`,
          [user.id_worker_profile]
        )
      : [[] as unknown as RowDataPacket[]];

    const [activityRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_activity, action_type, entity_type, summary, metadata, created_at
       FROM admin_activity_log
       WHERE (entity_type = 'user' OR entity_type = 'worker') AND entity_id = ?
       ORDER BY created_at DESC LIMIT 30`,
      [userId]
    ).catch(() => [[] as unknown as RowDataPacket[], []] as any);

    const requests = requestRows.map((row: any) => ({
      id_request: Number(row.id_request),
      service_name: row.service_name,
      status: toPublicRequestStatus(row.status),
      description: row.description,
      location_text: row.location_text,
      budget: Number(row.budget || 0),
      payment_status: row.payment_status || 'unpaid',
      payment_amount: row.payment_amount != null ? Number(row.payment_amount) : null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
    const completedRequests = requests.filter((request) => request.status === 'done');
    const cancelledRequests = requests.filter((request) => request.status === 'cancelled');
    const paidVolume = requests.reduce((sum, request) => sum + (['paid', 'released'].includes(request.payment_status) ? Number(request.payment_amount || 0) : 0), 0);
    const ratings: any = ratingRows[0] || {};

    res.json({
      success: true,
      data: {
        id_user: Number(user.id_user),
        name: `${user.name || ''} ${user.lastname || ''}`.trim(),
        email: user.email,
        phone_number: user.phone_number,
        username: user.username,
        profile_image: buildProtectedAssetUrl(req, user.profile_image),
        role: user.rol,
        is_active: Boolean(user.is_active),
        created_at: user.created_at,
        last_login: user.last_login,
        professional: user.id_worker_profile ? {
          id_worker_profile: Number(user.id_worker_profile),
          bio: user.bio,
          is_verified: Number(user.is_verified || 0),
          membership_tier: user.membership_tier || 'standard',
          dui_document_url: buildProtectedAssetUrl(req, user.dui_document),
          cert_document_url: buildProtectedAssetUrl(req, user.cert_document),
          services: serviceRows.map((service: any) => ({ id_service: Number(service.id_service), name: service.name })),
          rating: {
            count: Number(ratings.rating_count || 0),
            average: ratings.rating_average != null ? Number(ratings.rating_average) : null,
            punctuality: ratings.punctuality_average != null ? Number(ratings.punctuality_average) : null,
            quality: ratings.quality_average != null ? Number(ratings.quality_average) : null,
            price: ratings.price_average != null ? Number(ratings.price_average) : null,
          },
        } : null,
        summary: {
          request_count: requests.length,
          completed_count: completedRequests.length,
          cancelled_count: cancelledRequests.length,
          paid_volume: Number(paidVolume.toFixed(2)),
        },
        requests,
        admin_activity: activityRows.map((activity: any) => ({
          id_activity: Number(activity.id_activity),
          action: activity.action_type,
          entity: activity.entity_type,
          summary: activity.summary,
          metadata: activity.metadata ? JSON.parse(activity.metadata) : null,
          created_at: activity.created_at,
        })),
      },
    });
  } catch (error: any) {
    console.error('Error in getUserDetailAdmin:', error);
    res.status(500).json({ error: 'Could not load user detail.' });
  }
};

export const updateUserRole = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    assertAllowedFields(req.body, ['rol', 'reason']);
    await ensureUsersActiveColumn();

    const userId = Number(req.params.id);
    if (!userId || isNaN(userId)) {
      res.status(400).json({ error: 'Invalid user ID.' });
      return;
    }

    const newRole = String(req.body?.rol || '').toLowerCase();
    const reason = sanitizeText(req.body.reason, 500);
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
    const actorRole = String(req.user?.rol || '').toLowerCase();
    const actorId = Number(req.user?.user_id || 0);

    if (actorId === userId) {
      res.status(403).json({ error: 'You cannot change your own role.' });
      return;
    }
    if (currentRole === 'root') {
      res.status(403).json({ error: 'Root user cannot be modified.' });
      return;
    }
    if (currentRole === 'admin' && actorRole !== 'root') {
      res.status(403).json({ error: 'Only the root administrator can modify other admins.' });
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
      { from: currentRole, to: newRole, reason }
    );

    await recordSystemEvent({
      level: 'warning',
      component: 'admin',
      eventType: 'user_role_changed',
      message: `User role changed to ${newRole}.`,
      metadata: { targetUserId: userId, from: currentRole, to: newRole, actor: req.user?.user_id },
    }).catch(() => undefined);

    res.json({ success: true, message: 'Role updated successfully.' });
  } catch (error: any) {
    console.error('Error in updateUserRole:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateUserStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    assertAllowedFields(req.body, ['is_active', 'reason']);
    await ensureUsersActiveColumn();

    const userId = Number(req.params.id);
    if (!userId || isNaN(userId)) {
      res.status(400).json({ error: 'Invalid user ID.' });
      return;
    }

    let desiredActive: 0 | 1 = 1;
    const reason = sanitizeText(req.body.reason, 500);
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
    const actorRole = String(req.user?.rol || '').toLowerCase();
    const actorId = Number(req.user?.user_id || 0);

    if (currentRole === 'root') {
      res.status(403).json({ error: 'Root user cannot be modified.' });
      return;
    }
    if (actorId === userId) {
      res.status(403).json({ error: 'You cannot change your own account status.' });
      return;
    }
    if (currentRole === 'admin' && actorRole !== 'root') {
      res.status(403).json({ error: 'Only the root administrator can modify other admins.' });
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
      { is_active: desiredActive, reason }
    );

    await recordSystemEvent({
      level: 'warning',
      component: 'admin',
      eventType: 'user_status_changed',
      message: `User status changed to ${desiredActive === 1 ? 'active' : 'inactive'}.`,
      metadata: { targetUserId: userId, is_active: desiredActive, actor: req.user?.user_id },
    }).catch(() => undefined);

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

    const requestHealthWhere = requestedServiceId != null ? 'AND id_service = ?' : '';
    const requestHealthParams = requestedServiceId != null ? [requestedServiceId] : [];
    const [[requestHealth]] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS created_count,
         SUM(status IN ('assigned','in_progress','awaiting_confirmation','done')) AS assigned_count,
         SUM(status IN ('paid','assigned','in_progress','awaiting_confirmation','done')) AS paid_count,
         SUM(status = 'done') AS done_count,
         SUM(status = 'cancelled') AS cancelled_count,
         AVG(CASE WHEN assigned_at IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, created_at, assigned_at) END) AS avg_assignment_minutes
       FROM service_requests
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) ${requestHealthWhere}`,
      requestHealthParams
    );

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
        request_health: {
          created: Number(requestHealth?.created_count || 0),
          assigned: Number(requestHealth?.assigned_count || 0),
          paid: Number(requestHealth?.paid_count || 0),
          completed: Number(requestHealth?.done_count || 0),
          cancelled: Number(requestHealth?.cancelled_count || 0),
          cancellation_rate: Number(requestHealth?.created_count || 0) > 0
            ? Number(((Number(requestHealth?.cancelled_count || 0) / Number(requestHealth.created_count)) * 100).toFixed(1))
            : 0,
          avg_assignment_minutes: requestHealth?.avg_assignment_minutes != null
            ? Number(Number(requestHealth.avg_assignment_minutes).toFixed(1))
            : null,
        },
      }
    });

  } catch (error: any) {
    console.error('Error in getDashboardStats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const searchAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const query = sanitizeText(req.query.q || '', 80).trim();
    if (query.length < 2) { res.json({ success: true, results: [] }); return; }
    const like = `%${query}%`;
    const [requests, users, services] = await Promise.all([
      pool.execute<RowDataPacket[]>(
        `SELECT sr.id_request, s.name AS service_name, sr.location_text, sr.status
         FROM service_requests sr INNER JOIN services s ON s.id_service = sr.id_service
         LEFT JOIN users u ON u.id_user = sr.id_user
         WHERE CAST(sr.id_request AS CHAR) LIKE ? OR sr.description LIKE ? OR sr.location_text LIKE ?
           OR s.name LIKE ? OR CONCAT_WS(' ', u.name, u.lastname) LIKE ? OR u.email LIKE ?
         ORDER BY sr.updated_at DESC LIMIT 6`, [like, like, like, like, like, like]),
      pool.execute<RowDataPacket[]>(
        `SELECT id_user, name, lastname, email, rol FROM users
         WHERE CONCAT_WS(' ', name, lastname) LIKE ? OR email LIKE ? OR username LIKE ?
         ORDER BY created_at DESC LIMIT 6`, [like, like, like]),
      pool.execute<RowDataPacket[]>(
        `SELECT id_service, name, description FROM services
         WHERE name LIKE ? OR description LIKE ? ORDER BY name ASC LIMIT 4`, [like, like]),
    ]);
    const results = [
      ...requests[0].map((row: any) => ({ id: Number(row.id_request), type: 'request', title: `Request #${row.id_request} · ${row.service_name}`, subtitle: `${row.location_text} · ${toPublicRequestStatus(row.status)}`, url: `/admin-dashboard/requests?request=${row.id_request}` })),
      ...users[0].map((row: any) => ({ id: Number(row.id_user), type: 'user', title: `${row.name || ''} ${row.lastname || ''}`.trim() || row.email, subtitle: `${row.email} · ${row.rol}`, url: `/admin-dashboard/users?user=${row.id_user}` })),
      ...services[0].map((row: any) => ({ id: Number(row.id_service), type: 'service', title: row.name, subtitle: row.description || 'Service catalog item', url: `/admin-dashboard/services?search=${encodeURIComponent(row.name)}` })),
    ];
    res.json({ success: true, results });
  } catch (error) {
    console.error('Error in searchAdmin:', error);
    res.status(500).json({ error: 'Could not search admin records.' });
  }
};

export const exportDashboardStatsPdfAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
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

    let selectedServiceName: string | null = null;
    if (requestedServiceId != null) {
      const [serviceRows] = await pool.execute<RowDataPacket[]>(
        `SELECT name FROM services WHERE id_service = ? LIMIT 1`,
        [requestedServiceId]
      );
      selectedServiceName = serviceRows[0]?.name ? String(serviceRows[0].name) : null;
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

    const serviceParams: any[] = [];
    const serviceWhere = requestedServiceId != null ? `WHERE s.id_service = ?` : '';
    if (requestedServiceId != null) serviceParams.push(requestedServiceId);

    const [serviceRows] = await pool.execute<RowDataPacket[]>(
      `SELECT s.name, COUNT(sr.id_request) as value
       FROM services s
       LEFT JOIN service_requests sr
         ON sr.id_service = s.id_service
        AND sr.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
       ${serviceWhere}
       GROUP BY s.id_service
       ORDER BY value DESC, s.name ASC
       LIMIT 8`,
      serviceParams
    );

    const completedParams: any[] = [];
    const completedFilter = requestedServiceId != null ? `AND id_service = ?` : '';
    if (requestedServiceId != null) completedParams.push(requestedServiceId);
    const [[{ completed_total }]] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as completed_total
       FROM service_requests
       WHERE status = 'done'
         AND updated_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
         ${completedFilter}`,
      completedParams
    );

    const revenueParams: any[] = [];
    const revenueFilter = requestedServiceId != null ? `AND sr.id_service = ?` : '';
    if (requestedServiceId != null) revenueParams.push(requestedServiceId);
    const [[{ revenue_total }]] = await pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(srp.platform_fee), 0) as revenue_total
       FROM service_request_payments srp
       INNER JOIN service_requests sr ON sr.id_request = srp.id_request
       WHERE srp.payment_status IN ('paid', 'released')
         AND srp.paid_at >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 MONTH)
         ${revenueFilter}`,
      revenueParams
    );

    const locationParams: any[] = [];
    const locationFilter = requestedServiceId != null ? `AND id_service = ?` : '';
    if (requestedServiceId != null) locationParams.push(requestedServiceId);
    const [locationRows] = await pool.execute<RowDataPacket[]>(
      `SELECT location_text as name, COUNT(*) as value
       FROM service_requests
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
         ${locationFilter}
       GROUP BY location_text
       ORDER BY value DESC, location_text ASC
       LIMIT 8`,
      locationParams
    );

    const doc = new PDFDocument({ size: 'A4', margin: 42 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const generatedAt = new Date();
    const periodLabel = requestedServiceId
      ? `Filtered by ${selectedServiceName || `service #${requestedServiceId}`}`
      : 'All services';

    doc.rect(0, 0, doc.page.width, 112).fill('#0F52BA');
    doc.fillColor('#FFFFFF').fontSize(24).font('Helvetica-Bold').text('Fixlife Admin Statistics', 42, 34);
    doc
      .fillColor('#DCEAFE')
      .fontSize(10)
      .font('Helvetica')
      .text(`${periodLabel} - Generated ${generatedAt.toLocaleString('en-US')}`, 42, 66, { width: 500 });

    const cardY = 142;
    const cardWidth = 154;
    const drawMetricCard = (x: number, y: number, label: string, value: string) => {
      doc.roundedRect(x, y, cardWidth, 64, 12).fillAndStroke('#F8FAFC', '#DCE6F1');
      doc.fillColor('#64748B').fontSize(9).font('Helvetica-Bold').text(label.toUpperCase(), x + 12, y + 12);
      doc.fillColor('#0F172A').fontSize(19).font('Helvetica-Bold').text(value, x + 12, y + 30, { width: cardWidth - 24 });
    };

    drawMetricCard(42, cardY, 'Clients', String(Number(total_users || 0)));
    drawMetricCard(212, cardY, 'Active pros', String(Number(total_pros || 0)));
    drawMetricCard(382, cardY, 'Admins', String(Number(total_admins || 0)));
    drawMetricCard(42, cardY + 82, 'Pending approvals', String(Number(pending_pros || 0)));
    drawMetricCard(212, cardY + 82, 'Services', String(Number(total_services || 0)));
    drawMetricCard(382, cardY + 82, 'Platform revenue', formatMoneyUsd(Number(revenue_total || 0)));

    doc.fillColor('#0F172A').fontSize(16).font('Helvetica-Bold').text('Operational snapshot', 42, 330);
    doc
      .fontSize(11)
      .font('Helvetica')
      .fillColor('#475569')
      .text(`Completed services in the last 7 days: ${Number(completed_total || 0).toLocaleString()}`, 42, 356);

    doc.fillColor('#0F172A').fontSize(14).font('Helvetica-Bold').text('Top service demand', 42, 398);
    let rowY = 424;
    (serviceRows as any[]).forEach((row, index) => {
      doc.fillColor(index % 2 === 0 ? '#F8FAFC' : '#FFFFFF').rect(42, rowY - 4, 510, 24).fill();
      doc.fillColor('#0F172A').fontSize(10).font('Helvetica-Bold').text(String(row.name || 'Service'), 54, rowY);
      doc.fillColor('#475569').font('Helvetica').text(`${Number(row.value || 0)} requests`, 430, rowY, { width: 110, align: 'right' });
      rowY += 26;
    });
    if (serviceRows.length === 0) {
      doc.fillColor('#64748B').fontSize(10).font('Helvetica').text('No service demand data available.', 54, rowY);
      rowY += 28;
    }

    rowY += 22;
    doc.fillColor('#0F172A').fontSize(14).font('Helvetica-Bold').text('Top locations', 42, rowY);
    rowY += 26;
    (locationRows as any[]).forEach((row, index) => {
      doc.fillColor(index % 2 === 0 ? '#F8FAFC' : '#FFFFFF').rect(42, rowY - 4, 510, 24).fill();
      doc.fillColor('#0F172A').fontSize(10).font('Helvetica-Bold').text(String(row.name || 'Unknown'), 54, rowY, { width: 330 });
      doc.fillColor('#475569').font('Helvetica').text(`${Number(row.value || 0)} requests`, 430, rowY, { width: 110, align: 'right' });
      rowY += 26;
    });
    if (locationRows.length === 0) {
      doc.fillColor('#64748B').fontSize(10).font('Helvetica').text('No location data available.', 54, rowY);
    }

    doc
      .fillColor('#94A3B8')
      .fontSize(8.5)
      .font('Helvetica')
      .text('Fixlife Admin - Statistics export generated from live dashboard data.', 42, doc.page.height - 62, {
        width: 510,
        align: 'center',
      });

    doc.end();
    const pdfBuffer = await done;

    const dateCode = generatedAt.toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="fixlife-admin-stats-${dateCode}.pdf"`);
    res.status(200).send(pdfBuffer);
  } catch (error: any) {
    console.error('Error in exportDashboardStatsPdfAdmin:', error);
    res.status(500).json({ error: 'Could not export dashboard stats PDF.' });
  }
};

export const getRequestsHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureServiceRequestTables();

    const requestedStatus = String(req.query.status || 'all').toLowerCase();
    const allowed = new Set(['all', 'pending', 'payment_pending', 'paid', 'assigned', 'in_progress', 'awaiting_confirmation', 'done', 'cancelled']);
    if (!allowed.has(requestedStatus)) {
      res.status(400).json({ error: 'Invalid status filter.' });
      return;
    }
    const requestedServiceIdRaw = req.query.service_id;
    const paymentStatus = String(req.query.payment_status || 'all').toLowerCase();
    const allowedPaymentStatuses = new Set(['all', 'pending', 'paid', 'released', 'refunded', 'failed', 'cancelled']);
    if (!allowedPaymentStatuses.has(paymentStatus)) {
      res.status(400).json({ error: 'Invalid payment status filter.' });
      return;
    }
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
    const limit = Math.min(100, Math.max(10, Math.floor(Number(req.query.limit) || 25)));
    const offset = (page - 1) * limit;
    const search = sanitizeText(req.query.search || '', 120);
    const dateFrom = String(req.query.date_from || '').trim();
    const dateTo = String(req.query.date_to || '').trim();

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

    if (paymentStatus !== 'all') {
      whereParts.push(`srp.payment_status = ?`);
      params.push(paymentStatus);
    }

    if (search) {
      const like = `%${search}%`;
      whereParts.push(`(
        CAST(sr.id_request AS CHAR) LIKE ? OR sr.description LIKE ? OR sr.location_text LIKE ? OR
        s.name LIKE ? OR CONCAT_WS(' ', u.name, u.lastname) LIKE ? OR
        CONCAT_WS(' ', uw.name, uw.lastname) LIKE ? OR u.email LIKE ?
      )`);
      params.push(like, like, like, like, like, like, like);
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
      whereParts.push(`sr.created_at >= ?`);
      params.push(`${dateFrom} 00:00:00`);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      whereParts.push(`sr.created_at < DATE_ADD(?, INTERVAL 1 DAY)`);
      params.push(`${dateTo} 00:00:00`);
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
         sr.updated_at,
         sr.assigned_worker_profile,
         s.name AS service_name,
         u.name AS client_name,
         u.lastname AS client_lastname,
         u.email AS client_email,
         uw.name AS worker_name,
         uw.lastname AS worker_lastname,
         srw_assigned.proposed_budget,
         srw_assigned.counter_message,
         srp.payment_status,
         srp.amount AS payment_amount,
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
       LEFT JOIN service_request_payments srp ON srp.id_request = sr.id_request
       ${whereSql}
       GROUP BY
         sr.id_request, sr.id_user, sr.id_service, sr.description, sr.location_text,
         sr.latitude, sr.longitude, sr.budget, sr.radius_km, sr.status, sr.created_at, sr.updated_at,
         sr.assigned_worker_profile, s.name, u.name, u.lastname, u.email, uw.name, uw.lastname,
         srw_assigned.proposed_budget, srw_assigned.counter_message, srp.payment_status, srp.amount
       ORDER BY sr.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    const [countRows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(DISTINCT sr.id_request) AS total
       FROM service_requests sr
       INNER JOIN services s ON s.id_service = sr.id_service
       LEFT JOIN users u ON u.id_user = sr.id_user
       LEFT JOIN worker_profiles wp ON wp.id_worker_profile = sr.assigned_worker_profile
       LEFT JOIN users uw ON uw.id_user = wp.id_user
       LEFT JOIN service_request_payments srp ON srp.id_request = sr.id_request
       ${whereSql}`,
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
      updated_at: row.updated_at,
      images_count: Number(row.images_count || 0),
      payment_status: row.payment_status || 'unpaid',
      payment_amount: row.payment_amount != null ? Number(row.payment_amount) : null,
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

    const total = Number(countRows[0]?.total || 0);
    const pagination = { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) };
    res.json({ success: true, data: requests, requests, pagination });
  } catch (error: any) {
    console.error('Error in getRequestsHistory:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getRequestDetailAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureServiceRequestTables();
    const idRequest = parsePositiveInt(req.params.idRequest, 'request ID', 2_000_000_000);
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT sr.*, s.name AS service_name,
         u.name AS client_name, u.lastname AS client_lastname, u.email AS client_email, u.phone_number AS client_phone,
         uw.name AS worker_name, uw.lastname AS worker_lastname, uw.email AS worker_email, uw.phone_number AS worker_phone,
         srw.proposed_budget, srw.counter_message, srw.counter_status,
         p.id_payment, p.provider, p.checkout_reference, p.currency_code, p.amount AS payment_amount,
         p.platform_fee, p.worker_payout, p.payment_status, p.paid_at, p.released_at,
         r.punctuality, r.quality, r.price_fairness, r.comment AS rating_comment, r.created_at AS rated_at
       FROM service_requests sr
       INNER JOIN services s ON s.id_service = sr.id_service
       LEFT JOIN users u ON u.id_user = sr.id_user
       LEFT JOIN worker_profiles wp ON wp.id_worker_profile = sr.assigned_worker_profile
       LEFT JOIN users uw ON uw.id_user = wp.id_user
       LEFT JOIN service_request_workers srw ON srw.id_request = sr.id_request AND srw.id_worker_profile = sr.assigned_worker_profile
       LEFT JOIN service_request_payments p ON p.id_request = sr.id_request
       LEFT JOIN service_request_ratings r ON r.id_request = sr.id_request
       WHERE sr.id_request = ? LIMIT 1`,
      [idRequest]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Request not found.' });
      return;
    }
    const row: any = rows[0];
    const [images] = await pool.execute<RowDataPacket[]>(
      `SELECT id_image, image_url, created_at FROM service_request_images WHERE id_request = ? ORDER BY id_image`,
      [idRequest]
    );
    const [messages] = await pool.execute<RowDataPacket[]>(
      `SELECT id_message, sender_role, message, image_url, created_at
       FROM service_request_chat_messages WHERE id_request = ? ORDER BY created_at ASC LIMIT 100`,
      [idRequest]
    );
    const [workers] = await pool.execute<RowDataPacket[]>(
      `SELECT srw.id_worker_profile, srw.distance_km, srw.status, srw.proposed_budget,
         srw.counter_message, srw.counter_status, srw.notified_at, srw.updated_at,
         CONCAT_WS(' ', u.name, u.lastname) AS worker_name
       FROM service_request_workers srw
       INNER JOIN worker_profiles wp ON wp.id_worker_profile = srw.id_worker_profile
       INNER JOIN users u ON u.id_user = wp.id_user
       WHERE srw.id_request = ? ORDER BY srw.notified_at ASC`,
      [idRequest]
    );
    const detail = {
      id_request: Number(row.id_request), id_user: row.id_user != null ? Number(row.id_user) : null,
      id_service: Number(row.id_service), service_name: row.service_name, description: row.description,
      location_text: row.location_text, latitude: row.latitude != null ? Number(row.latitude) : null,
      longitude: row.longitude != null ? Number(row.longitude) : null,
      initial_budget: row.initial_budget != null ? Number(row.initial_budget) : null,
      budget: Number(row.budget || 0), final_budget: row.final_budget != null ? Number(row.final_budget) : null,
      radius_km: Number(row.radius_km || 0), status: toPublicRequestStatus(row.status),
      created_at: row.created_at, updated_at: row.updated_at, assigned_at: row.assigned_at,
      client: row.id_user ? { id_user: Number(row.id_user), name: `${row.client_name || ''} ${row.client_lastname || ''}`.trim(), email: row.client_email, phone: row.client_phone } : null,
      assigned_worker: row.assigned_worker_profile ? { id_worker_profile: Number(row.assigned_worker_profile), name: `${row.worker_name || ''} ${row.worker_lastname || ''}`.trim(), email: row.worker_email, phone: row.worker_phone } : null,
      offer: { proposed_budget: row.proposed_budget != null ? Number(row.proposed_budget) : null, counter_message: row.counter_message, counter_status: row.counter_status },
      payment: row.id_payment ? { id_payment: Number(row.id_payment), provider: row.provider, checkout_reference: row.checkout_reference, currency_code: row.currency_code, amount: Number(row.payment_amount || 0), platform_fee: Number(row.platform_fee || 0), worker_payout: Number(row.worker_payout || 0), status: row.payment_status, paid_at: row.paid_at, released_at: row.released_at } : null,
      rating: row.punctuality != null ? { punctuality: Number(row.punctuality), quality: Number(row.quality), price_fairness: Number(row.price_fairness), comment: row.rating_comment, created_at: row.rated_at } : null,
      images: images.map((image: any) => ({ id_image: Number(image.id_image), url: buildProtectedAssetUrl(req, image.image_url), created_at: image.created_at })),
      messages: messages.map((message: any) => ({ id_message: Number(message.id_message), sender_role: message.sender_role, message: message.message, image_url: buildProtectedAssetUrl(req, message.image_url), created_at: message.created_at })),
      worker_responses: workers.map((worker: any) => ({ ...worker, id_worker_profile: Number(worker.id_worker_profile), distance_km: worker.distance_km != null ? Number(worker.distance_km) : null, proposed_budget: worker.proposed_budget != null ? Number(worker.proposed_budget) : null })),
    };
    res.json({ success: true, data: detail });
  } catch (error: any) {
    console.error('Error in getRequestDetailAdmin:', error);
    res.status(500).json({ error: 'Could not load request detail.' });
  }
};

export const updateRequestAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    await ensureServiceRequestTables();
    const idRequest = parsePositiveInt(req.params.idRequest, 'request ID', 2_000_000_000);
    const action = sanitizeText(req.body?.action, 40).toLowerCase();
    const reason = sanitizeText(req.body?.reason, 500);
    if (reason.length < 8) {
      res.status(400).json({ error: 'Reason must contain at least 8 characters.' });
      return;
    }
    if (!new Set(['cancel', 'reassign', 'escalate', 'resolve']).has(action)) {
      res.status(400).json({ error: 'Unsupported admin action.' });
      return;
    }
    await connection.beginTransaction();
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT sr.id_request, sr.status, sr.assigned_worker_profile,
              sr.id_user AS client_id,
              wp.id_user AS worker_user_id
       FROM service_requests sr
       LEFT JOIN worker_profiles wp ON wp.id_worker_profile = sr.assigned_worker_profile
       WHERE sr.id_request = ? FOR UPDATE`,
      [idRequest]
    );
    if (rows.length === 0) {
      await connection.rollback();
      res.status(404).json({ error: 'Request not found.' });
      return;
    }
    const before = { status: String(rows[0].status), assigned_worker_profile: rows[0].assigned_worker_profile };
    const clientId: number | null = rows[0].client_id || null;
    const workerUserId: number | null = rows[0].worker_user_id || null;

    if (action === 'cancel') {
      if (['done', 'cancelled'].includes(before.status)) throw new Error('Closed requests cannot be cancelled.');
      await connection.execute(`UPDATE service_requests SET status = 'cancelled' WHERE id_request = ?`, [idRequest]);
    } else if (action === 'reassign') {
      if (['done', 'cancelled'].includes(before.status)) throw new Error('Closed requests cannot be reassigned.');
      await connection.execute(`UPDATE service_requests SET status = 'pending', assigned_worker_profile = NULL, assigned_at = NULL WHERE id_request = ?`, [idRequest]);
    } else if (action === 'resolve') {
      if (!['awaiting_confirmation', 'in_progress'].includes(before.status)) throw new Error('Only active requests can be resolved.');
      await connection.execute(`UPDATE service_requests SET status = 'done' WHERE id_request = ?`, [idRequest]);
    }
    await connection.commit();
    const after = action === 'cancel' ? { status: 'cancelled', assigned_worker_profile: before.assigned_worker_profile }
      : action === 'reassign' ? { status: 'pending', assigned_worker_profile: null }
      : action === 'resolve' ? { status: 'done', assigned_worker_profile: before.assigned_worker_profile }
      : before;
    await logAdminActivity(req, action, 'request', `${action} request #${idRequest}: ${reason}`, idRequest, { reason, before, after });

    // Notify affected parties after commit (fire-and-forget, non-blocking)
    const notifyParties = async () => {
      const notifications: Array<{ userId: number; eventType: string; title: string; message: string; tone: 'info' | 'warning' | 'success' }> = [];
      if (action === 'cancel') {
        if (clientId) notifications.push({ userId: clientId, eventType: 'request_cancelled_admin', title: 'Service request cancelled', message: `Your request #${idRequest} was cancelled by an administrator.`, tone: 'warning' });
        if (workerUserId) notifications.push({ userId: workerUserId, eventType: 'request_cancelled_admin', title: 'Assignment cancelled', message: `Request #${idRequest} was cancelled by an administrator.`, tone: 'warning' });
      } else if (action === 'reassign') {
        if (workerUserId) notifications.push({ userId: workerUserId, eventType: 'request_reassigned_admin', title: 'Assignment removed', message: `You have been unassigned from request #${idRequest} by an administrator.`, tone: 'warning' });
        if (clientId) notifications.push({ userId: clientId, eventType: 'request_reassigned_admin', title: 'Professional reassigned', message: `Your request #${idRequest} is being reassigned to a new professional.`, tone: 'info' });
      } else if (action === 'resolve') {
        if (clientId) notifications.push({ userId: clientId, eventType: 'request_resolved_admin', title: 'Service marked as complete', message: `Your request #${idRequest} has been marked as complete by an administrator.`, tone: 'success' });
        if (workerUserId) notifications.push({ userId: workerUserId, eventType: 'request_resolved_admin', title: 'Job marked as complete', message: `Request #${idRequest} has been marked as complete by an administrator.`, tone: 'success' });
      }
      await Promise.allSettled(notifications.map(async (n) => {
        await createUserNotification({ userId: n.userId, eventType: n.eventType, title: n.title, message: n.message, tone: n.tone, requestId: idRequest, dedupeKey: `admin_${action}_${idRequest}_${n.userId}` });
        emitToUser(n.userId, 'notification', { eventType: n.eventType, title: n.title, message: n.message });
      }));
    };
    notifyParties().catch(() => undefined);

    res.json({ success: true, data: { id_request: idRequest, action, before, after } });
  } catch (error: any) {
    await connection.rollback().catch(() => undefined);
    const message = error?.message || 'Could not update request.';
    res.status(message.includes('cannot') || message.includes('Only') ? 409 : 500).json({ error: message });
  } finally {
    connection.release();
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

    const activities = rows.map(mapActivityRow);

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

      const sanitizedSlides = slides.map((slide: any, idx: number) => {
        const sortOrder = idx + 1;
        const image = String(slide?.image || '').trim();
        const tag = String(slide?.tag || '').trim().slice(0, 50);
        const title = String(slide?.title || '').trim().slice(0, 120);
        const description = String(slide?.description || '').trim().slice(0, 255);
        const cta = String(slide?.cta || '').trim().slice(0, 80);

        if (!image || !tag || !title || !description || !cta) {
          throw new Error(`Invalid slide payload at index ${idx}`);
        }

        return [sortOrder, image, tag, title, description, cta];
      });

      await connection.execute<ResultSetHeader>(
        `INSERT INTO hero_slides (sort_order, image_url, tag, title, description, cta)
         VALUES ${sanitizedSlides.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')}`,
        sanitizedSlides.flat()
      );

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

    res.json({ success: true, slides: toSlidesDto(req, rows) });
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
      deleteUploadIfExists(file.filename, 'public');
      res.status(400).json({ error: 'Only PNG/JPG/WEBP images are allowed.' });
      return;
    }

    const imageUrl = buildPublicAssetUrl(req, file.filename);
    if (!imageUrl) {
      deleteUploadIfExists(file.filename, 'public');
      res.status(400).json({ error: 'Invalid uploaded image.' });
      return;
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE hero_slides SET image_url = ? WHERE id_slide = ?`,
      [imageUrl, idSlide]
    );

    if (result.affectedRows === 0) {
      deleteUploadIfExists(file.filename, 'public');
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

    res.json({ success: true, image: imageUrl, slides: toSlidesDto(req, rows) });
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
        id_user: row.id_user != null ? Number(row.id_user) : null,
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
    const previousSettings = await getWorkerRewardsSettings();
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
    await logAdminActivity(req, 'update', 'worker_rewards', 'Updated worker rewards program settings.', null, {
      before: previousSettings,
      after: updatedSettings,
    });

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

export const getCommissionRulesAdmin = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureServiceRequestTables();
    const config = await getCommissionRulesAdminConfig();
    res.json({
      success: true,
      ...config,
    });
  } catch (error: any) {
    console.error('Error in getCommissionRulesAdmin:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateCommissionRulesAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureServiceRequestTables();
    const previousConfig = await getCommissionRulesAdminConfig();

    const globalRatePercent = Number(req.body?.global_rate_percent);
    const serviceOverrides = Array.isArray(req.body?.service_overrides) ? req.body.service_overrides : [];
    const urgencyAdjustments = Array.isArray(req.body?.urgency_adjustments) ? req.body.urgency_adjustments : [];
    const workerTierAdjustments = Array.isArray(req.body?.worker_tier_adjustments)
      ? req.body.worker_tier_adjustments
      : [];

    if (!Number.isFinite(globalRatePercent) || globalRatePercent < 0 || globalRatePercent > 50) {
      res.status(400).json({ error: 'Default commission rate must be between 0 and 50.' });
      return;
    }

    const config = await updateCommissionRulesAdminConfig({
      global_rate_percent: globalRatePercent,
      service_overrides: serviceOverrides,
      urgency_adjustments: urgencyAdjustments,
      worker_tier_adjustments: workerTierAdjustments,
    });
    await logAdminActivity(req, 'update', 'commission_rules', 'Updated commission engine rules.', null, {
      before: previousConfig,
      after: config,
    });

    res.json({
      success: true,
      message: 'Commission engine updated.',
      ...config,
    });
  } catch (error: any) {
    console.error('Error in updateCommissionRulesAdmin:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const markWorkerBonusPayoutPaidController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureServiceRequestTables();
    const reason = sanitizeText(req.body.reason, 500);

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
         wp.id_user,
         u.email,
         u.name,
         u.lastname,
         s.name AS service_name
       FROM worker_bonus_payouts wbp
       INNER JOIN worker_profiles wp ON wp.id_worker_profile = wbp.id_worker_profile
       INNER JOIN users u ON u.id_user = wp.id_user
       LEFT JOIN service_requests sr ON sr.id_request = wbp.source_request_id
       LEFT JOIN services s ON s.id_service = sr.id_service
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

    if (payoutRow) {
      await recordBonusPayoutPaidLedger({
        idBonusPayout: Number(payoutRow.id_bonus_payout),
        idWorkerProfile: Number(payoutRow.id_worker_profile),
        idRequest: payoutRow.source_request_id != null ? Number(payoutRow.source_request_id) : null,
        amount: Number(payoutRow.bonus_amount || 0),
      });
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

    await logAdminActivity(req, 'pay', 'bonus_payout', `Marked bonus payout #${idBonusPayout} as paid.`, idBonusPayout, {
      reason,
      amount: Number(payoutRow?.bonus_amount || 0),
      worker_user_id: payoutRow?.id_user != null ? Number(payoutRow.id_user) : null,
    });

    if (payoutRow?.email) {
      await enqueueBackgroundJob({
        jobType: 'send_worker_payout_paid_email',
        jobKey: `worker-bonus-payout-email-${idBonusPayout}`,
        payload: {
          to: String(payoutRow.email),
          workerName: `${payoutRow.name || ''} ${payoutRow.lastname || ''}`.trim() || 'Fixlife pro',
          payoutType: 'bonus',
          amount: Number(payoutRow.bonus_amount || 0),
          scheduledFor: payoutRow.scheduled_for || null,
          requestId: payoutRow.source_request_id != null ? Number(payoutRow.source_request_id) : null,
          serviceName: payoutRow.service_name || null,
          bonusType: String(payoutRow.bonus_type || 'bonus'),
          paidAt: new Date(),
        },
      });
    }

    if (payoutRow?.id_user) {
      await queuePaidWorkerStatementEmailForAdmin(
        Number(payoutRow.id_user),
        'worker-bonus-payout-paid-statement',
        String(idBonusPayout)
      );
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

export const getWorkerPayoutsAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureServiceRequestTables();

    const status = String(req.query.status || 'all').toLowerCase();
    const payouts = await getAllWorkerPayoutsForAdmin(status);

    const summary = payouts.reduce(
      (acc, row) => {
        const normalizedStatus = String(row.payout_status || '').toLowerCase();
        const amount = Number(row.net_amount || 0);
        acc.total_rows += 1;
        acc.total_amount += amount;

        if (normalizedStatus === 'scheduled') {
          acc.scheduled_count += 1;
          acc.scheduled_amount += amount;
        } else if (normalizedStatus === 'paid') {
          acc.paid_count += 1;
          acc.paid_amount += amount;
        } else if (normalizedStatus === 'cancelled') {
          acc.cancelled_count += 1;
          acc.cancelled_amount += amount;
        }

        return acc;
      },
      {
        total_rows: 0,
        total_amount: 0,
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
      summary: {
        total_rows: summary.total_rows,
        total_amount: Number(summary.total_amount.toFixed(2)),
        scheduled_count: summary.scheduled_count,
        scheduled_amount: Number(summary.scheduled_amount.toFixed(2)),
        paid_count: summary.paid_count,
        paid_amount: Number(summary.paid_amount.toFixed(2)),
        cancelled_count: summary.cancelled_count,
        cancelled_amount: Number(summary.cancelled_amount.toFixed(2)),
      },
      payouts: payouts.map((row) => ({
        id_worker_payout: Number(row.id_worker_payout),
        id_worker_profile: Number(row.id_worker_profile),
        id_user: row.id_user != null ? Number(row.id_user) : null,
        id_request: row.id_request != null ? Number(row.id_request) : null,
        id_payment: row.id_payment != null ? Number(row.id_payment) : null,
        worker_name: `${row.name || ''} ${row.lastname || ''}`.trim() || 'Worker',
        gross_amount: Number(row.gross_amount || 0),
        platform_fee: Number(row.platform_fee || 0),
        net_amount: Number(row.net_amount || 0),
        payout_status: String(row.payout_status || 'scheduled'),
        scheduled_for: row.scheduled_for,
        paid_at: row.paid_at || null,
        notes: row.notes || null,
        location_text: row.location_text || null,
        service_name: row.service_name || null,
      })),
    });
  } catch (error: any) {
    console.error('Error in getWorkerPayoutsAdmin:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const markWorkerPayoutPaidController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureServiceRequestTables();
    const reason = sanitizeText(req.body.reason, 500);

    const idWorkerPayout = Number(req.params.idWorkerPayout);
    if (!idWorkerPayout || Number.isNaN(idWorkerPayout)) {
      res.status(400).json({ error: 'Invalid worker payout ID.' });
      return;
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         wpayout.id_worker_payout,
         wpayout.id_worker_profile,
         wpayout.id_request,
         wpayout.net_amount,
         wpayout.scheduled_for,
         wp.id_user,
         u.email,
         u.name,
         u.lastname,
         s.name AS service_name
       FROM worker_payouts wpayout
       INNER JOIN worker_profiles wp ON wp.id_worker_profile = wpayout.id_worker_profile
       INNER JOIN users u ON u.id_user = wp.id_user
       LEFT JOIN service_requests sr ON sr.id_request = wpayout.id_request
       LEFT JOIN services s ON s.id_service = sr.id_service
       WHERE wpayout.id_worker_payout = ?
       LIMIT 1`,
      [idWorkerPayout]
    );

    const payoutRow = rows[0];
    const updated = await markWorkerPayoutAsPaid(idWorkerPayout);
    if (!updated) {
      res.status(404).json({ error: 'Worker payout not found or not scheduled for payment.' });
      return;
    }

    if (payoutRow?.id_user) {
      await createUserNotification({
        userId: Number(payoutRow.id_user),
        eventType: 'payout_paid',
        title: 'Worker payout released',
        message: `Your base payout of $${Number(payoutRow.net_amount || 0).toFixed(2)} was marked as paid.`,
        tone: 'success',
        requestId: payoutRow.id_request != null ? Number(payoutRow.id_request) : null,
        actionUrl: '/pro-dashboard',
        dedupeKey: `worker-base-payout-paid-${idWorkerPayout}`,
        metadata: {
          payout_type: 'worker_payout',
          scheduled_for: payoutRow.scheduled_for,
          payout_amount: Number(payoutRow.net_amount || 0),
        },
      });
    }


    await logAdminActivity(req, 'pay', 'worker_payout', `Marked worker payout #${idWorkerPayout} as paid.`, idWorkerPayout, {
      reason,
      amount: Number(payoutRow?.net_amount || 0),
      worker_user_id: payoutRow?.id_user != null ? Number(payoutRow.id_user) : null,
      request_id: payoutRow?.id_request != null ? Number(payoutRow.id_request) : null,
    });

    if (payoutRow?.email) {
      await enqueueBackgroundJob({
        jobType: 'send_worker_payout_paid_email',
        jobKey: `worker-base-payout-email-${idWorkerPayout}`,
        payload: {
          to: String(payoutRow.email),
          workerName: `${payoutRow.name || ''} ${payoutRow.lastname || ''}`.trim() || 'Fixlife pro',
          payoutType: 'base',
          amount: Number(payoutRow.net_amount || 0),
          scheduledFor: payoutRow.scheduled_for || null,
          requestId: payoutRow.id_request != null ? Number(payoutRow.id_request) : null,
          serviceName: payoutRow.service_name || null,
          paidAt: new Date(),
        },
      });
    }

    if (payoutRow?.id_user) {
      await queuePaidWorkerStatementEmailForAdmin(
        Number(payoutRow.id_user),
        'worker-base-payout-paid-statement',
        String(idWorkerPayout)
      );
    }

    res.json({
      success: true,
      message: 'Worker payout marked as paid.',
    });
  } catch (error: any) {
    console.error('Error in markWorkerPayoutPaidController:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const queuePaidWorkerStatementEmailForAdmin = async (
  userId: number,
  jobKeyPrefix: string,
  jobKeySuffix: string
) => {
  try {
    await queueWorkerPayoutStatementEmail(
      userId,
      { period: 'month', status: 'paid' },
      { jobKeyPrefix, jobKeySuffix }
    );
  } catch (error) {
    console.error('Error queueing paid worker statement email:', error);
  }
};

export const resendWorkerStatementAdminController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureServiceRequestTables();

    const idUser = Number(req.params.idUser);
    if (!idUser || Number.isNaN(idUser)) {
      res.status(400).json({ error: 'Invalid worker user ID.' });
      return;
    }

    const queuedStatement = await queueWorkerPayoutStatementEmail(
      idUser,
      {
        period: req.query.period ? String(req.query.period) : 'month',
        status: req.query.status ? String(req.query.status) : 'paid',
        from: req.query.from ? String(req.query.from) : null,
        to: req.query.to ? String(req.query.to) : null,
      },
      {
        jobKeyPrefix: 'admin-resend-worker-statement',
        jobKeySuffix: String(Date.now()),
      }
    );

    if (!queuedStatement.queued) {
      res.status(400).json({ error: queuedStatement.reason || 'Could not queue statement email.' });
      return;
    }

    res.json({
      success: true,
      message: 'Worker statement email queued.',
      statement_number: queuedStatement.payload.statementNumber,
    });
  } catch (error: any) {
    console.error('Error in resendWorkerStatementAdminController:', error);
    res.status(500).json({ error: 'Could not resend worker statement.' });
  }
};

export const getPaymentLedgerAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureServiceRequestTables();
    const limit = Number(req.query.limit || 40);
    const ledger = await getRecentPaymentLedger(limit);

    res.json({
      success: true,
      entries: ledger.map((row) => ({
        id_ledger_entry: Number(row.id_ledger_entry),
        id_request: row.id_request != null ? Number(row.id_request) : null,
        id_payment: row.id_payment != null ? Number(row.id_payment) : null,
        id_worker_profile: row.id_worker_profile != null ? Number(row.id_worker_profile) : null,
        id_worker_payout: row.id_worker_payout != null ? Number(row.id_worker_payout) : null,
        entry_key: String(row.entry_key || ''),
        entry_type: String(row.entry_type || ''),
        amount: Number(row.amount || 0),
        currency_code: String(row.currency_code || 'USD'),
        entry_status: String(row.entry_status || 'posted'),
        available_on: row.available_on || null,
        metadata_json: row.metadata_json || null,
        created_at: row.created_at,
        location_text: row.location_text || null,
        service_name: row.service_name || null,
      })),
    });
  } catch (error: any) {
    console.error('Error in getPaymentLedgerAdmin:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getFinanceSettlementReportAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureServiceRequestTables();
    const report = await getFinanceSettlementReport({
      from: req.query.from,
      to: req.query.to,
    });

    res.json({
      success: true,
      range: report.range,
      summary: report.summary,
      service_breakdown: report.service_breakdown,
      invoices: report.invoices,
    });
  } catch (error: any) {
    console.error('Error in getFinanceSettlementReportAdmin:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const exportFinanceSettlementReportCsvAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureServiceRequestTables();
    const report = await getFinanceSettlementReport({
      from: req.query.from,
      to: req.query.to,
    });
    const csv = buildFinanceSettlementCsv(report);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="fixlife-finance-report-${report.range.from}-to-${report.range.to}.csv"`
    );
    res.status(200).send(csv);
  } catch (error: any) {
    console.error('Error in exportFinanceSettlementReportCsvAdmin:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getWorkerTierBenefitsAdmin = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const benefits = await getWorkerTierBenefits();
    res.json({ success: true, benefits });
  } catch (error: any) {
    console.error('Error in getWorkerTierBenefitsAdmin:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateWorkerTierBenefitsAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const benefits = Array.isArray(req.body?.benefits) ? req.body.benefits : [];
    const updatedBenefits = await updateWorkerTierBenefits(benefits);

    await logAdminActivity(
      req,
      'update',
      'worker_tier_benefits',
      'Updated worker tier benefit rules.',
      null,
      { tier_count: updatedBenefits.length }
    );

    res.json({
      success: true,
      message: 'Worker tier benefits updated.',
      benefits: updatedBenefits,
    });
  } catch (error: any) {
    console.error('Error in updateWorkerTierBenefitsAdmin:', error);
    res.status(500).json({ error: error?.message || 'Internal server error' });
  }
};

export const updateWorkerTierAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = parsePositiveInt(req.params.id, 'user id');
    const membershipTier = sanitizeText(req.body?.membership_tier, 20);
    const reason = sanitizeOptionalText(req.body?.reason, 255);

    const updated = await updateWorkerMembershipTier({
      userId,
      membershipTier: membershipTier as any,
      changedByUserId: req.user?.user_id ?? null,
      reason,
    });

    if (!updated) {
      res.status(404).json({ error: 'Worker not found.' });
      return;
    }

    if (updated.changed) {
      await logAdminActivity(
        req,
        'update',
        'worker_tier',
        `Changed worker tier to ${updated.next_tier}.`,
        Number(updated.id_worker_profile),
        {
          previous_tier: updated.previous_tier,
          next_tier: updated.next_tier,
          reason,
        }
      );

      const [userRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id_user FROM worker_profiles WHERE id_worker_profile = ? LIMIT 1`,
        [Number(updated.id_worker_profile)]
      );
      const workerUserId = userRows[0]?.id_user != null ? Number(userRows[0].id_user) : null;
      if (workerUserId) {
        await createUserNotification({
          userId: workerUserId,
          eventType: 'tier_updated',
          title: 'Membership tier updated',
          message: `Your professional tier is now ${String(updated.next_tier).toUpperCase()}.`,
          tone: 'success',
          actionUrl: '/pro-dashboard',
          dedupeKey: `worker-tier-${workerUserId}-${updated.next_tier}`,
          metadata: {
            previous_tier: updated.previous_tier,
            next_tier: updated.next_tier,
            reason,
          },
        });
        emitToUser(workerUserId, 'worker_tier_updated', {
          membership_tier: updated.next_tier,
          previous_tier: updated.previous_tier,
        });
      }
    }

    res.json({
      success: true,
      message: updated.changed ? 'Worker tier updated.' : 'Worker tier unchanged.',
      worker: updated,
    });
  } catch (error: any) {
    console.error('Error in updateWorkerTierAdmin:', error);
    res.status(400).json({ error: error?.message || 'Invalid tier update request.' });
  }
};

export const getWorkerTierHistoryAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const idWorkerProfile = req.query.id_worker_profile ? Number(req.query.id_worker_profile) : null;
    const limit = req.query.limit ? Number(req.query.limit) : 40;
    const history = await getWorkerTierHistory({
      idWorkerProfile: Number.isFinite(idWorkerProfile as number) ? idWorkerProfile : null,
      limit,
    });
    res.json({ success: true, history });
  } catch (error: any) {
    console.error('Error in getWorkerTierHistoryAdmin:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getFinanceCasesAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const cases = await getFinanceCases({
      status: req.query.status ? String(req.query.status) : 'all',
      caseType: req.query.case_type ? String(req.query.case_type) : 'all',
      limit: req.query.limit ? Number(req.query.limit) : 40,
    });
    res.json({ success: true, cases });
  } catch (error: any) {
    console.error('Error in getFinanceCasesAdmin:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createFinanceCaseAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const idCase = await createFinanceCase({
      caseType: String(req.body?.case_type || '').toLowerCase() as any,
      direction: String(req.body?.direction || '').toLowerCase() as any,
      idRequest: req.body?.id_request ? Number(req.body.id_request) : null,
      idPayment: req.body?.id_payment ? Number(req.body.id_payment) : null,
      amount: Number(req.body?.amount || 0),
      currencyCode: sanitizeOptionalText(req.body?.currency_code, 8) || 'USD',
      reason: sanitizeOptionalText(req.body?.reason, 255),
      notes: sanitizeOptionalText(req.body?.notes, 2000),
      createdByUserId: req.user?.user_id ?? null,
    });

    await logAdminActivity(
      req,
      'create',
      'finance_case',
      `Created ${String(req.body?.case_type || 'finance')} case #${idCase}.`,
      idCase,
      {
        case_type: req.body?.case_type,
        direction: req.body?.direction,
        amount: Number(req.body?.amount || 0),
      }
    );

    res.status(201).json({
      success: true,
      message: 'Finance case created.',
      id_case: idCase,
    });
  } catch (error: any) {
    console.error('Error in createFinanceCaseAdmin:', error);
    res.status(400).json({ error: error?.message || 'Invalid finance case payload.' });
  }
};

export const resolveFinanceCaseAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const idCase = parsePositiveInt(req.params.idCase, 'finance case id');
    const resolutionNotes = sanitizeOptionalText(req.body?.resolution_notes, 1500);
    const applyLedger = req.body?.apply_ledger !== false;

    const resolved = await resolveFinanceCase({
      idCase,
      resolvedByUserId: req.user?.user_id ?? null,
      resolutionNotes,
      applyLedger,
    });

    if (!resolved) {
      res.status(404).json({ error: 'Finance case not found or already resolved.' });
      return;
    }

    await logAdminActivity(
      req,
      'resolve',
      'finance_case',
      `Resolved finance case #${idCase}.`,
      idCase,
      {
        case_type: resolved.case_type,
        apply_ledger: applyLedger,
      }
    );

    res.json({
      success: true,
      message: 'Finance case resolved.',
      case: resolved,
    });
  } catch (error: any) {
    console.error('Error in resolveFinanceCaseAdmin:', error);
    res.status(400).json({ error: error?.message || 'Invalid finance resolution request.' });
  }
};

export const getFinanceClosureReportAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const report = await getFinanceClosureReport({
      period: String(req.query.period || 'weekly').toLowerCase() === 'monthly' ? 'monthly' : 'weekly',
      from: req.query.from,
      to: req.query.to,
    });
    res.json({ success: true, ...report });
  } catch (error: any) {
    console.error('Error in getFinanceClosureReportAdmin:', error);
    res.status(400).json({ error: error?.message || 'Invalid finance closure report request.' });
  }
};

export const getSystemEventsAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const events = await getSystemEvents({
      limit: req.query.limit ? Number(req.query.limit) : 30,
      component: req.query.component ? String(req.query.component) : null,
      level: req.query.level ? String(req.query.level) : null,
    });
    res.json({ success: true, events });
  } catch (error: any) {
    console.error('Error in getSystemEventsAdmin:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getBackgroundJobsAdminController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const jobs = await getBackgroundJobsAdmin(req.query.limit ? Number(req.query.limit) : 30);
    res.json({ success: true, jobs });
  } catch (error: any) {
    console.error('Error in getBackgroundJobsAdminController:', error);
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
      deleteUploadIfExists(file.filename, 'public');
      res.status(400).json({ error: 'Only PNG/JPG/WEBP images are allowed.' });
      return;
    }

    const imageUrl = buildPublicAssetUrl(req, file.filename);
    if (!imageUrl) {
      deleteUploadIfExists(file.filename, 'public');
      res.status(400).json({ error: 'Invalid uploaded image.' });
      return;
    }

    res.json({ success: true, image: imageUrl });
  } catch (error: any) {
    console.error('Error in uploadHeroImageAsset:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
