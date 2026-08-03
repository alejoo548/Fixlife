import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import pool from '../config/db';

export type PenaltyReason =
  | 'no_show'
  | 'unjustified_cancel'
  | 'abusive_report'
  | 'outside_app_payment'
  | 'inappropriate_content'
  | 'unpaid_cash'
  | 'payment_dispute'
  | 'admin_adjustment'
  | 'other';

export type PenaltyRole = 'client' | 'worker';
export type PenaltyStatus = 'pending' | 'paid' | 'disputed' | 'waived';
export type PenaltyPaymentMethod = 'cash' | 'transfer' | 'card' | 'support_adjustment' | 'other';

type DbExecutor = Pick<Pool | PoolConnection, 'execute'>;

const BLOCKING_STATUSES: PenaltyStatus[] = ['pending', 'disputed'];

export const ensureAccountPenaltiesTable = async (executor: DbExecutor = pool) => {
  await executor.execute(`
    CREATE TABLE IF NOT EXISTS account_penalties (
      id_penalty INT NOT NULL AUTO_INCREMENT,
      id_user INT NOT NULL,
      id_worker_profile INT NULL,
      id_request INT NULL,
      actor_role ENUM('client','worker') NOT NULL,
      reason ENUM(
        'no_show',
        'unjustified_cancel',
        'abusive_report',
        'outside_app_payment',
        'inappropriate_content',
        'unpaid_cash',
        'payment_dispute',
        'admin_adjustment',
        'other'
      ) NOT NULL,
      amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      currency_code VARCHAR(8) NOT NULL DEFAULT 'USD',
      status ENUM('pending','paid','disputed','waived') NOT NULL DEFAULT 'pending',
      description VARCHAR(500) NULL,
      evidence_report_id INT NULL,
      payment_method ENUM('cash','transfer','card','support_adjustment','other') NULL,
      payment_reference VARCHAR(180) NULL,
      payment_recorded_by_user_id INT NULL,
      created_by_user_id INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      resolved_at TIMESTAMP NULL,
      PRIMARY KEY (id_penalty),
      KEY idx_account_penalties_user_status (id_user, status, created_at),
      KEY idx_account_penalties_worker_status (id_worker_profile, status, created_at),
      KEY idx_account_penalties_request (id_request, created_at),
      CONSTRAINT fk_account_penalties_user FOREIGN KEY (id_user) REFERENCES users(id_user) ON DELETE CASCADE,
      CONSTRAINT fk_account_penalties_worker FOREIGN KEY (id_worker_profile) REFERENCES worker_profiles(id_worker_profile) ON DELETE SET NULL,
      CONSTRAINT fk_account_penalties_request FOREIGN KEY (id_request) REFERENCES service_requests(id_request) ON DELETE SET NULL,
      CONSTRAINT fk_account_penalties_payment_recorder FOREIGN KEY (payment_recorded_by_user_id) REFERENCES users(id_user) ON DELETE SET NULL,
      CONSTRAINT fk_account_penalties_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id_user) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await ensurePenaltyColumn(executor, 'payment_method', "ENUM('cash','transfer','card','support_adjustment','other') NULL");
  await ensurePenaltyColumn(executor, 'payment_reference', 'VARCHAR(180) NULL');
  await ensurePenaltyColumn(executor, 'payment_recorded_by_user_id', 'INT NULL');
};

const ensurePenaltyColumn = async (executor: DbExecutor, column: string, definition: string) => {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'account_penalties' AND COLUMN_NAME = ?
     LIMIT 1`,
    [column]
  );
  if (rows.length === 0) {
    await executor.execute(`ALTER TABLE account_penalties ADD COLUMN ${column} ${definition}`);
  }
};

export const createAccountPenalty = async (
  input: {
    userId: number;
    actorRole: PenaltyRole;
    reason: PenaltyReason;
    amount: number;
    workerProfileId?: number | null;
    requestId?: number | null;
    description?: string | null;
    evidenceReportId?: number | null;
    createdByUserId?: number | null;
    status?: PenaltyStatus;
  },
  executor: DbExecutor = pool
) => {
  await ensureAccountPenaltiesTable(executor);
  const amount = Math.max(0, Math.min(Number(input.amount || 0), 1000));
  const [result] = await executor.execute<ResultSetHeader>(
    `INSERT INTO account_penalties
       (id_user, id_worker_profile, id_request, actor_role, reason, amount, status, description, evidence_report_id, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      input.workerProfileId ?? null,
      input.requestId ?? null,
      input.actorRole,
      input.reason,
      amount,
      input.status || 'pending',
      input.description ? String(input.description).slice(0, 500) : null,
      input.evidenceReportId ?? null,
      input.createdByUserId ?? null,
    ]
  );

  return Number(result.insertId);
};

export const getAccountPenaltyBalance = async (userId: number, executor: DbExecutor = pool) => {
  await ensureAccountPenaltiesTable(executor);
  const [summaryRows] = await executor.execute<RowDataPacket[]>(
    `SELECT
       COALESCE(SUM(CASE WHEN status IN ('pending','disputed') THEN amount ELSE 0 END), 0) AS outstanding_balance,
       COUNT(CASE WHEN status IN ('pending','disputed') THEN 1 END) AS outstanding_count,
       COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) AS pending_balance,
       COALESCE(SUM(CASE WHEN status = 'disputed' THEN amount ELSE 0 END), 0) AS disputed_balance
     FROM account_penalties
     WHERE id_user = ?`,
    [userId]
  );
  const [latestRows] = await executor.execute<RowDataPacket[]>(
    `SELECT id_penalty, reason, amount, currency_code, status, description, id_request,
            payment_method, payment_reference, created_at
     FROM account_penalties
     WHERE id_user = ? AND status IN ('pending','disputed')
     ORDER BY created_at DESC, id_penalty DESC
     LIMIT 5`,
    [userId]
  );
  const summary = summaryRows[0] || {};
  const outstandingBalance = Number(summary.outstanding_balance || 0);

  return {
    has_blocking_debt: outstandingBalance > 0,
    outstanding_balance: Number(outstandingBalance.toFixed(2)),
    outstanding_count: Number(summary.outstanding_count || 0),
    pending_balance: Number(Number(summary.pending_balance || 0).toFixed(2)),
    disputed_balance: Number(Number(summary.disputed_balance || 0).toFixed(2)),
    currency_code: 'USD',
    blocking_statuses: BLOCKING_STATUSES,
    latest: latestRows.map((row) => ({
      id_penalty: Number(row.id_penalty),
      reason: row.reason,
      amount: Number(row.amount || 0),
      currency_code: row.currency_code || 'USD',
      status: row.status,
      description: row.description || null,
      id_request: row.id_request != null ? Number(row.id_request) : null,
      payment_method: row.payment_method || null,
      payment_reference: row.payment_reference || null,
      created_at: row.created_at,
    })),
  };
};

export const assertAccountCanWork = async (userId: number, executor: DbExecutor = pool) => {
  const balance = await getAccountPenaltyBalance(userId, executor);
  if (balance.has_blocking_debt) {
    const error = new Error('This account has an outstanding Fixlife balance.');
    (error as any).code = 'ACCOUNT_DEBT_BLOCK';
    (error as any).balance = balance;
    throw error;
  }
  return balance;
};
