import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import pool from '../config/db';
import { createAccountPenalty, PenaltyRole, PenaltyReason } from './accountPenalties.service';
import { createUserNotification, notifyAdmins } from '../utils/notifications';
import { getPolicySettings, type PolicySettings } from './policySettings.service';
import { captureCaseEvidenceSnapshot } from './caseEvidence.service';

type DbExecutor = Pick<Pool | PoolConnection, 'execute'>;

export type IncidentSeverity = 'low' | 'medium' | 'high';
export type RestrictionStatus = 'active' | 'expired' | 'lifted';

const INCIDENT_LOOKBACK_DAYS = 90;

const policyForCount = (count: number, settings: PolicySettings) => {
  if (count >= settings.admin_review_incident_count) return { action: 'review_required' as const, penaltyAmount: 0, blockHours: 0 };
  if (count >= settings.temporary_block_incident_count) return { action: 'temporary_block' as const, penaltyAmount: 0, blockHours: settings.temporary_block_hours };
  if (count >= settings.penalty_incident_count) return { action: 'penalty' as const, penaltyAmount: settings.repeated_incident_penalty_amount, blockHours: 0 };
  return { action: 'warning' as const, penaltyAmount: 0, blockHours: 0 };
};

export const ensureAccountEnforcementTables = async (executor: DbExecutor = pool) => {
  await executor.execute(`
    CREATE TABLE IF NOT EXISTS account_incidents (
      id_incident INT NOT NULL AUTO_INCREMENT,
      id_user INT NOT NULL,
      actor_role ENUM('client','worker') NOT NULL,
      incident_type VARCHAR(60) NOT NULL,
      severity ENUM('low','medium','high') NOT NULL DEFAULT 'low',
      source_type VARCHAR(60) NULL,
      source_id INT NULL,
      id_request INT NULL,
      id_worker_profile INT NULL,
      description VARCHAR(500) NULL,
      action_taken ENUM('warning','penalty','temporary_block','review_required') NOT NULL DEFAULT 'warning',
      id_penalty INT NULL,
      case_status ENUM('open','reviewing','resolved','dismissed') NOT NULL DEFAULT 'open',
      resolution_note VARCHAR(500) NULL,
      reviewed_by_user_id INT NULL,
      reviewed_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_incident),
      KEY idx_account_incidents_user_date (id_user, created_at),
      KEY idx_account_incidents_source (source_type, source_id),
      KEY idx_account_incidents_request (id_request),
      KEY idx_account_incidents_worker (id_worker_profile),
      KEY idx_account_incidents_case_status (case_status, created_at),
      CONSTRAINT fk_account_incidents_user FOREIGN KEY (id_user) REFERENCES users(id_user) ON DELETE CASCADE,
      CONSTRAINT fk_account_incidents_penalty FOREIGN KEY (id_penalty) REFERENCES account_penalties(id_penalty) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const ensureIncidentColumn = async (column: string, definition: string) => {
    const [rows] = await executor.execute<RowDataPacket[]>(
      `SELECT COLUMN_NAME
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'account_incidents'
         AND column_name = ?
       LIMIT 1`,
      [column]
    );
    if (rows.length === 0) {
      await executor.execute(`ALTER TABLE account_incidents ADD COLUMN ${column} ${definition}`);
    }
  };

  await ensureIncidentColumn('id_worker_profile', 'INT NULL AFTER id_request');
  await ensureIncidentColumn('case_status', "ENUM('open','reviewing','resolved','dismissed') NOT NULL DEFAULT 'open' AFTER id_penalty");
  await ensureIncidentColumn('resolution_note', 'VARCHAR(500) NULL AFTER case_status');
  await ensureIncidentColumn('reviewed_by_user_id', 'INT NULL AFTER resolution_note');
  await ensureIncidentColumn('reviewed_at', 'TIMESTAMP NULL AFTER reviewed_by_user_id');

  const [workerIdxRows] = await executor.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'account_incidents'
       AND index_name = 'idx_account_incidents_worker'`
  );
  if (Number(workerIdxRows[0]?.total || 0) === 0) {
    await executor.execute(`ALTER TABLE account_incidents ADD KEY idx_account_incidents_worker (id_worker_profile)`);
  }

  const [caseStatusIdxRows] = await executor.execute<RowDataPacket[]>(
    `SELECT COLUMN_NAME
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'account_incidents'
       AND index_name = 'idx_account_incidents_case_status'
     LIMIT 1`
  );
  if (caseStatusIdxRows.length === 0) {
    await executor.execute(`ALTER TABLE account_incidents ADD KEY idx_account_incidents_case_status (case_status, created_at)`);
  }

  await executor.execute(`
    CREATE TABLE IF NOT EXISTS account_restrictions (
      id_restriction INT NOT NULL AUTO_INCREMENT,
      id_user INT NOT NULL,
      restriction_type ENUM('temporary_block','admin_review') NOT NULL,
      reason VARCHAR(500) NOT NULL,
      starts_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ends_at TIMESTAMP NULL,
      status ENUM('active','expired','lifted') NOT NULL DEFAULT 'active',
      created_by_incident_id INT NULL,
      lifted_by_user_id INT NULL,
      lifted_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_restriction),
      KEY idx_account_restrictions_user_status (id_user, status, ends_at),
      CONSTRAINT fk_account_restrictions_user FOREIGN KEY (id_user) REFERENCES users(id_user) ON DELETE CASCADE,
      CONSTRAINT fk_account_restrictions_incident FOREIGN KEY (created_by_incident_id) REFERENCES account_incidents(id_incident) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await executor.execute(`
    CREATE TABLE IF NOT EXISTS account_incident_notes (
      id_note INT NOT NULL AUTO_INCREMENT,
      id_incident INT NOT NULL,
      id_admin_user INT NULL,
      note_type ENUM('internal_note','evidence_note','resolution_note') NOT NULL DEFAULT 'internal_note',
      note VARCHAR(1000) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_note),
      KEY idx_account_incident_notes_incident (id_incident, created_at),
      CONSTRAINT fk_account_incident_notes_incident FOREIGN KEY (id_incident) REFERENCES account_incidents(id_incident) ON DELETE CASCADE,
      CONSTRAINT fk_account_incident_notes_admin FOREIGN KEY (id_admin_user) REFERENCES users(id_user) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

const countRecentIncidents = async (userId: number, executor: DbExecutor) => {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM account_incidents
     WHERE id_user = ?
       AND created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? DAY)
       AND COALESCE(case_status, 'open') NOT IN ('resolved','dismissed')`,
    [userId, INCIDENT_LOOKBACK_DAYS]
  );
  return Number(rows[0]?.total || 0);
};

const insertRestriction = async (
  input: { userId: number; type: 'temporary_block' | 'admin_review'; reason: string; incidentId: number; blockHours?: number },
  executor: DbExecutor
) => {
  await executor.execute<ResultSetHeader>(
    `INSERT INTO account_restrictions
       (id_user, restriction_type, reason, ends_at, created_by_incident_id)
     VALUES (?, ?, ?, ?, ?)`,
    [
      input.userId,
      input.type,
      input.reason.slice(0, 500),
      input.type === 'temporary_block' ? new Date(Date.now() + Math.max(1, input.blockHours || 72) * 60 * 60 * 1000) : null,
      input.incidentId,
    ]
  );
};

export const recordAccountIncident = async (
  input: {
    userId: number;
    actorRole: PenaltyRole;
    incidentType: string;
    severity?: IncidentSeverity;
    sourceType?: string | null;
    sourceId?: number | null;
    requestId?: number | null;
    description?: string | null;
    penaltyReason?: PenaltyReason;
    workerProfileId?: number | null;
    createdByUserId?: number | null;
    evidenceSnapshot?: {
      before?: unknown;
      after?: unknown;
      metadata?: unknown;
    };
  },
  executor: DbExecutor = pool
) => {
  await ensureAccountEnforcementTables(executor);
  const settings = await getPolicySettings(executor);
  const recentCount = (await countRecentIncidents(input.userId, executor)) + 1;
  const policy = policyForCount(recentCount, settings);
  let penaltyId: number | null = null;

  if (policy.action === 'penalty') {
    penaltyId = await createAccountPenalty({
      userId: input.userId,
      actorRole: input.actorRole,
      reason: input.penaltyReason || 'other',
      amount: policy.penaltyAmount,
      workerProfileId: input.workerProfileId ?? null,
      requestId: input.requestId ?? null,
      description: input.description || 'Automatic penalty for repeated policy incidents.',
      createdByUserId: input.createdByUserId ?? null,
    }, executor);
  }

  const [result] = await executor.execute<ResultSetHeader>(
    `INSERT INTO account_incidents
       (id_user, actor_role, incident_type, severity, source_type, source_id, id_request, id_worker_profile, description, action_taken, id_penalty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      input.actorRole,
      String(input.incidentType || 'policy_incident').slice(0, 60),
      input.severity || 'low',
      input.sourceType ? String(input.sourceType).slice(0, 60) : null,
      input.sourceId ?? null,
      input.requestId ?? null,
      input.workerProfileId ?? null,
      input.description ? String(input.description).slice(0, 500) : null,
      policy.action,
      penaltyId,
    ]
  );
  const incidentId = Number(result.insertId);

  if (input.requestId) {
    await captureCaseEvidenceSnapshot({
      incidentId,
      requestId: input.requestId,
      userId: input.userId,
      actorRole: input.actorRole,
      incidentType: input.incidentType,
      before: input.evidenceSnapshot?.before,
      after: input.evidenceSnapshot?.after,
      metadata: input.evidenceSnapshot?.metadata,
    }, executor).catch((error) => {
      console.error('captureCaseEvidenceSnapshot error:', error);
    });
  }

  if (policy.action === 'temporary_block') {
    await insertRestriction({
      userId: input.userId,
      type: 'temporary_block',
      reason: 'Temporary block after repeated Fixlife policy incidents.',
      incidentId,
      blockHours: policy.blockHours,
    }, executor);
  }

  if (policy.action === 'review_required') {
    await insertRestriction({
      userId: input.userId,
      type: 'admin_review',
      reason: 'Admin review required after repeated Fixlife policy incidents.',
      incidentId,
    }, executor);
  }

  await createUserNotification({
    userId: input.userId,
    eventType: 'account_policy_incident',
    title: policy.action === 'warning' ? 'Fixlife policy warning' : policy.action === 'penalty' ? 'Account penalty created' : policy.action === 'temporary_block' ? 'Account temporarily blocked' : 'Account under review',
    message: policy.action === 'warning'
      ? 'We noticed a policy issue. Repeated incidents can create penalties or account restrictions.'
      : policy.action === 'penalty'
        ? 'A repeated policy issue created an account penalty.'
        : policy.action === 'temporary_block'
          ? 'Your account is temporarily blocked because of repeated policy issues.'
          : 'Your account requires admin review before using Fixlife services again.',
    tone: 'warning',
    requestId: input.requestId ?? undefined,
    dedupeKey: `account_incident_${incidentId}`,
  }).catch(() => undefined);

  if (policy.action === 'temporary_block' || policy.action === 'review_required') {
    notifyAdmins({
      eventType: 'account_enforcement_escalated',
      title: policy.action === 'temporary_block' ? 'Account temporarily blocked' : 'Account requires review',
      message: `User #${input.userId} reached ${recentCount} policy incident(s).`,
      tone: 'warning',
      actionUrl: '/admin-dashboard/trust-safety',
      dedupeKey: `account_enforcement_${incidentId}`,
      metadata: { userId: input.userId, incidentId, action: policy.action, recentCount },
    }).catch(() => undefined);
  }

  return { incidentId, action: policy.action, recentCount, penaltyId };
};

export const getAccountEnforcementProfile = async (userId: number, executor: DbExecutor = pool) => {
  await ensureAccountEnforcementTables(executor);
  await executor.execute(
    `UPDATE account_restrictions
     SET status = 'expired'
     WHERE id_user = ? AND status = 'active' AND ends_at IS NOT NULL AND ends_at <= CURRENT_TIMESTAMP`,
    [userId]
  );
  await executor.execute(
    `UPDATE account_incidents ai
     LEFT JOIN upload_moderation_reviews r
       ON ai.source_type = 'upload_moderation_review'
      AND ai.source_id = r.id_review
     SET ai.case_status = 'dismissed',
         ai.resolution_note = 'Dismissed because the moderation provider did not return a policy signal.',
         ai.reviewed_at = CURRENT_TIMESTAMP
     WHERE ai.id_user = ?
       AND ai.incident_type = 'suspicious_upload'
       AND COALESCE(ai.case_status, 'open') NOT IN ('resolved','dismissed')
       AND (
         LOWER(COALESCE(ai.description, '')) LIKE '%too many requests%'
         OR LOWER(COALESCE(ai.description, '')) LIKE '%provider failed%'
         OR LOWER(COALESCE(ai.description, '')) LIKE '%timed out%'
         OR LOWER(COALESCE(ai.description, '')) LIKE '%api moderation failed%'
         OR (
           r.provider = 'openai'
           AND JSON_LENGTH(COALESCE(r.scores_json, JSON_OBJECT())) = 0
           AND JSON_LENGTH(COALESCE(r.categories_json, JSON_OBJECT())) = 0
         )
       )`,
    [userId]
  );
  await executor.execute(
    `UPDATE account_restrictions r
     INNER JOIN account_incidents ai ON ai.id_incident = r.created_by_incident_id
     SET r.status = 'lifted',
         r.lifted_at = CURRENT_TIMESTAMP,
         r.reason = CONCAT(r.reason, ' | Lifted after case resolution.')
     WHERE r.id_user = ?
       AND r.status = 'active'
       AND COALESCE(ai.case_status, 'open') IN ('resolved','dismissed')`,
    [userId]
  );
  const [incidents] = await executor.execute<RowDataPacket[]>(
    `SELECT id_incident, actor_role, incident_type, severity, source_type, source_id, id_request, id_worker_profile,
            description, action_taken, id_penalty, case_status, resolution_note, reviewed_at, created_at
     FROM account_incidents
     WHERE id_user = ?
       AND COALESCE(case_status, 'open') NOT IN ('resolved','dismissed')
     ORDER BY created_at DESC, id_incident DESC
     LIMIT 20`,
    [userId]
  );
  const [restrictions] = await executor.execute<RowDataPacket[]>(
    `SELECT id_restriction, restriction_type, reason, starts_at, ends_at, status, created_at
     FROM account_restrictions
     WHERE id_user = ?
       AND status = 'active'
       AND (ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP)
     ORDER BY created_at DESC`,
    [userId]
  );
  const [debtRows] = await executor.execute<RowDataPacket[]>(
    `SELECT
       COALESCE(SUM(CASE WHEN status IN ('pending','disputed') THEN amount ELSE 0 END), 0) AS debt,
       COUNT(CASE WHEN status IN ('pending','disputed') THEN 1 END) AS debt_count
     FROM account_penalties
     WHERE id_user = ?`,
    [userId]
  );
  const [completedRows] = await executor.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS completed_count
     FROM service_requests sr
     LEFT JOIN worker_profiles wp ON wp.id_worker_profile = sr.assigned_worker_profile
     WHERE sr.status IN ('completed','paid','done')
       AND (sr.id_user = ? OR wp.id_user = ?)`,
    [userId, userId]
  );
  const debt = Number(debtRows[0]?.debt || 0);
  const debtCount = Number(debtRows[0]?.debt_count || 0);
  const completedCount = Number(completedRows[0]?.completed_count || 0);
  const incidentPenalty = incidents.reduce((total, row) => total + (row.severity === 'high' ? 18 : row.severity === 'medium' ? 10 : 5), 0);
  const restrictionPenalty = restrictions.length * 25;
  const trustScore = Math.max(0, Math.min(100, 100 + Math.min(completedCount, 20) - incidentPenalty - restrictionPenalty - debtCount * 8 - Math.min(debt, 50)));
  const standing = restrictions.length > 0
    ? (restrictions[0].restriction_type === 'admin_review' ? 'under_review' : 'restricted')
    : trustScore < 70 || debt > 0
      ? 'warning'
      : 'good_standing';
  return {
    trust_score: Math.round(trustScore),
    standing,
    completed_services: completedCount,
    incident_count: incidents.length,
    active_restrictions: restrictions.map((row) => ({
      id_restriction: Number(row.id_restriction),
      restriction_type: String(row.restriction_type),
      reason: String(row.reason || ''),
      starts_at: row.starts_at,
      ends_at: row.ends_at || null,
      status: String(row.status),
    })),
    incidents: incidents.map((row) => ({
      id_incident: Number(row.id_incident),
      actor_role: String(row.actor_role),
      incident_type: String(row.incident_type),
      severity: String(row.severity),
      source_type: row.source_type || null,
      source_id: row.source_id != null ? Number(row.source_id) : null,
      id_request: row.id_request != null ? Number(row.id_request) : null,
      id_worker_profile: row.id_worker_profile != null ? Number(row.id_worker_profile) : null,
      description: row.description || null,
      action_taken: String(row.action_taken),
      id_penalty: row.id_penalty != null ? Number(row.id_penalty) : null,
      case_status: row.case_status || 'open',
      resolution_note: row.resolution_note || null,
      reviewed_at: row.reviewed_at || null,
      created_at: row.created_at,
    })),
  };
};

export const assertAccountNotRestricted = async (userId: number, executor: DbExecutor = pool) => {
  const profile = await getAccountEnforcementProfile(userId, executor);
  const active = profile.active_restrictions[0];
  if (active) {
    const error = new Error(active.restriction_type === 'admin_review'
      ? 'This account requires admin review before using Fixlife.'
      : 'This account is temporarily blocked by Fixlife policy.');
    (error as any).code = 'ACCOUNT_RESTRICTED';
    (error as any).restriction = active;
    (error as any).enforcement = profile;
    throw error;
  }
  return profile;
};

export const liftAccountRestrictions = async (
  input: { userId: number; liftedByUserId?: number | null; reason?: string | null },
  executor: DbExecutor = pool
) => {
  await ensureAccountEnforcementTables(executor);
  const [result] = await executor.execute<ResultSetHeader>(
    `UPDATE account_restrictions
     SET status = 'lifted', lifted_by_user_id = ?, lifted_at = CURRENT_TIMESTAMP,
         reason = CONCAT(reason, ' | Lifted: ', ?)
     WHERE id_user = ? AND status = 'active'`,
    [input.liftedByUserId ?? null, String(input.reason || 'Admin review resolved.').slice(0, 180), input.userId]
  );
  return Number(result.affectedRows || 0);
};
