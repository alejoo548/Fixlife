import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import pool from '../config/db';

type DbExecutor = Pick<Pool | PoolConnection, 'execute'>;

export type PenaltyAppealStatus = 'open' | 'accepted' | 'rejected' | 'needs_more_info';

const cleanText = (value: unknown, maxLen: number) =>
  String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLen);

export const ensureAccountPenaltyAppealsTable = async (executor: DbExecutor = pool) => {
  await executor.execute(`
    CREATE TABLE IF NOT EXISTS account_penalty_appeals (
      id_appeal INT NOT NULL AUTO_INCREMENT,
      id_penalty INT NOT NULL,
      id_user INT NOT NULL,
      explanation TEXT NOT NULL,
      evidence_json JSON NULL,
      status ENUM('open','accepted','rejected','needs_more_info') NOT NULL DEFAULT 'open',
      admin_note VARCHAR(500) NULL,
      reviewed_by_user_id INT NULL,
      reviewed_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_appeal),
      KEY idx_penalty_appeals_penalty (id_penalty, created_at),
      KEY idx_penalty_appeals_user (id_user, status, created_at),
      CONSTRAINT fk_penalty_appeals_penalty FOREIGN KEY (id_penalty) REFERENCES account_penalties(id_penalty) ON DELETE CASCADE,
      CONSTRAINT fk_penalty_appeals_user FOREIGN KEY (id_user) REFERENCES users(id_user) ON DELETE CASCADE,
      CONSTRAINT fk_penalty_appeals_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id_user) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

export const createPenaltyAppeal = async (
  input: {
    penaltyId: number;
    userId: number;
    explanation: string;
    evidenceFiles?: string[];
  },
  executor: DbExecutor = pool
) => {
  await ensureAccountPenaltyAppealsTable(executor);
  const explanation = cleanText(input.explanation, 1800);
  if (explanation.length < 20) {
    throw new Error('Write a clear appeal explanation with at least 20 characters.');
  }

  const [penalties] = await executor.execute<RowDataPacket[]>(
    `SELECT id_penalty, id_user, status
     FROM account_penalties
     WHERE id_penalty = ? AND id_user = ?
     LIMIT 1`,
    [input.penaltyId, input.userId]
  );
  if (!penalties[0]) {
    throw new Error('Penalty not found for this account.');
  }
  if (!['pending', 'disputed'].includes(String(penalties[0].status))) {
    throw new Error('Only pending or disputed penalties can be appealed.');
  }

  const [openAppeals] = await executor.execute<RowDataPacket[]>(
    `SELECT id_appeal
     FROM account_penalty_appeals
     WHERE id_penalty = ? AND status IN ('open','needs_more_info')
     LIMIT 1`,
    [input.penaltyId]
  );
  if (openAppeals[0]) {
    throw new Error('This penalty already has an open appeal.');
  }

  const evidence = JSON.stringify((input.evidenceFiles || []).slice(0, 3));
  const [result] = await executor.execute<ResultSetHeader>(
    `INSERT INTO account_penalty_appeals (id_penalty, id_user, explanation, evidence_json)
     VALUES (?, ?, ?, CAST(? AS JSON))`,
    [input.penaltyId, input.userId, explanation, evidence]
  );

  await executor.execute(
    `UPDATE account_penalties
     SET status = 'disputed', description = ?
     WHERE id_penalty = ? AND status = 'pending'`,
    [`User appeal opened: ${explanation.slice(0, 450)}`, input.penaltyId]
  );

  return Number(result.insertId);
};

export const getPenaltyAppealsForPenalty = async (penaltyId: number, executor: DbExecutor = pool) => {
  await ensureAccountPenaltyAppealsTable(executor);
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT
       a.id_appeal, a.id_penalty, a.id_user, a.explanation, a.evidence_json,
       a.status, a.admin_note, a.reviewed_by_user_id, a.reviewed_at, a.created_at,
       reviewer.name AS reviewer_name, reviewer.lastname AS reviewer_lastname, reviewer.email AS reviewer_email
     FROM account_penalty_appeals a
     LEFT JOIN users reviewer ON reviewer.id_user = a.reviewed_by_user_id
     WHERE a.id_penalty = ?
     ORDER BY a.created_at DESC, a.id_appeal DESC`,
    [penaltyId]
  );

  return rows.map((row) => {
    let evidence: string[] = [];
    try {
      evidence = Array.isArray(row.evidence_json) ? row.evidence_json : JSON.parse(String(row.evidence_json || '[]'));
    } catch {
      evidence = [];
    }
    return {
      id_appeal: Number(row.id_appeal),
      id_penalty: Number(row.id_penalty),
      id_user: Number(row.id_user),
      explanation: String(row.explanation || ''),
      evidence,
      status: String(row.status),
      admin_note: row.admin_note || null,
      reviewed_by_user_id: row.reviewed_by_user_id != null ? Number(row.reviewed_by_user_id) : null,
      reviewed_at: row.reviewed_at || null,
      created_at: row.created_at,
      reviewer_name: row.reviewer_name || null,
      reviewer_lastname: row.reviewer_lastname || null,
      reviewer_email: row.reviewer_email || null,
    };
  });
};

export const getPenaltyAppealsForUser = async (userId: number, executor: DbExecutor = pool) => {
  await ensureAccountPenaltyAppealsTable(executor);
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT
       a.id_appeal, a.id_penalty, a.id_user, a.explanation, a.evidence_json,
       a.status, a.admin_note, a.reviewed_by_user_id, a.reviewed_at, a.created_at,
       p.reason, p.amount, p.currency_code, p.status AS penalty_status
     FROM account_penalty_appeals a
     INNER JOIN account_penalties p ON p.id_penalty = a.id_penalty
     WHERE a.id_user = ?
     ORDER BY a.created_at DESC, a.id_appeal DESC
     LIMIT 10`,
    [userId]
  );

  return rows.map((row) => ({
    id_appeal: Number(row.id_appeal),
    id_penalty: Number(row.id_penalty),
    status: String(row.status),
    explanation: String(row.explanation || ''),
    admin_note: row.admin_note || null,
    reviewed_at: row.reviewed_at || null,
    created_at: row.created_at,
    reason: String(row.reason || 'other'),
    amount: Number(row.amount || 0),
    currency_code: String(row.currency_code || 'USD'),
    penalty_status: String(row.penalty_status || 'pending'),
  }));
};

export const reviewPenaltyAppeal = async (
  input: {
    appealId: number;
    status: PenaltyAppealStatus;
    adminNote: string;
    reviewedByUserId: number;
  },
  executor: DbExecutor = pool
) => {
  await ensureAccountPenaltyAppealsTable(executor);
  const adminNote = cleanText(input.adminNote, 500);
  if (adminNote.length < 8) throw new Error('A clear admin note is required.');
  if (!['accepted', 'rejected', 'needs_more_info'].includes(input.status)) {
    throw new Error('Invalid appeal status.');
  }

  const [result] = await executor.execute<ResultSetHeader>(
    `UPDATE account_penalty_appeals
     SET status = ?, admin_note = ?, reviewed_by_user_id = ?, reviewed_at = CURRENT_TIMESTAMP
     WHERE id_appeal = ?`,
    [input.status, adminNote, input.reviewedByUserId, input.appealId]
  );
  return Number(result.affectedRows || 0);
};
