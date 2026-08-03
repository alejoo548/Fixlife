import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import pool from '../config/db';

type DbExecutor = Pick<Pool | PoolConnection, 'execute'>;

export type PolicySettings = {
  client_no_show_grace_minutes: number;
  worker_client_no_show_grace_minutes: number;
  late_cancel_window_minutes: number;
  warning_incident_count: number;
  penalty_incident_count: number;
  temporary_block_incident_count: number;
  admin_review_incident_count: number;
  repeated_incident_penalty_amount: number;
  temporary_block_hours: number;
};

export const DEFAULT_POLICY_SETTINGS: PolicySettings = {
  client_no_show_grace_minutes: 30,
  worker_client_no_show_grace_minutes: 20,
  late_cancel_window_minutes: 120,
  warning_incident_count: 1,
  penalty_incident_count: 2,
  temporary_block_incident_count: 3,
  admin_review_incident_count: 4,
  repeated_incident_penalty_amount: 10,
  temporary_block_hours: 72,
};

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
};

const clampMoney = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Number(Math.max(min, Math.min(max, n)).toFixed(2));
};

let checked = false;
let cache: { settings: PolicySettings; expiresAt: number } | null = null;

export const ensurePolicySettingsTable = async (executor: DbExecutor = pool) => {
  if (!checked) {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS policy_settings (
        id_settings INT NOT NULL,
        client_no_show_grace_minutes INT NOT NULL DEFAULT 30,
        worker_client_no_show_grace_minutes INT NOT NULL DEFAULT 20,
        late_cancel_window_minutes INT NOT NULL DEFAULT 120,
        warning_incident_count INT NOT NULL DEFAULT 1,
        penalty_incident_count INT NOT NULL DEFAULT 2,
        temporary_block_incident_count INT NOT NULL DEFAULT 3,
        admin_review_incident_count INT NOT NULL DEFAULT 4,
        repeated_incident_penalty_amount DECIMAL(10,2) NOT NULL DEFAULT 10.00,
        temporary_block_hours INT NOT NULL DEFAULT 72,
        updated_by_user_id INT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id_settings)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    checked = true;
  }

  await executor.execute(
    `INSERT INTO policy_settings (id_settings) VALUES (1)
     ON DUPLICATE KEY UPDATE id_settings = id_settings`
  );
};

const normalizeSettings = (row: any): PolicySettings => {
  const defaults = DEFAULT_POLICY_SETTINGS;
  const warning = clamp(row?.warning_incident_count, 1, 10, defaults.warning_incident_count);
  const penalty = Math.max(warning + 1, clamp(row?.penalty_incident_count, 2, 20, defaults.penalty_incident_count));
  const block = Math.max(penalty + 1, clamp(row?.temporary_block_incident_count, 3, 30, defaults.temporary_block_incident_count));
  const review = Math.max(block + 1, clamp(row?.admin_review_incident_count, 4, 40, defaults.admin_review_incident_count));

  return {
    client_no_show_grace_minutes: clamp(row?.client_no_show_grace_minutes, 5, 180, defaults.client_no_show_grace_minutes),
    worker_client_no_show_grace_minutes: clamp(row?.worker_client_no_show_grace_minutes, 5, 180, defaults.worker_client_no_show_grace_minutes),
    late_cancel_window_minutes: clamp(row?.late_cancel_window_minutes, 15, 1440, defaults.late_cancel_window_minutes),
    warning_incident_count: warning,
    penalty_incident_count: penalty,
    temporary_block_incident_count: block,
    admin_review_incident_count: review,
    repeated_incident_penalty_amount: clampMoney(row?.repeated_incident_penalty_amount, 0, 500, defaults.repeated_incident_penalty_amount),
    temporary_block_hours: clamp(row?.temporary_block_hours, 1, 720, defaults.temporary_block_hours),
  };
};

export const getPolicySettings = async (executor: DbExecutor = pool): Promise<PolicySettings> => {
  if (executor === pool && cache && cache.expiresAt > Date.now()) return cache.settings;
  await ensurePolicySettingsTable(executor);
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT * FROM policy_settings WHERE id_settings = 1 LIMIT 1`
  );
  const settings = normalizeSettings(rows[0] || {});
  if (executor === pool) cache = { settings, expiresAt: Date.now() + 15_000 };
  return settings;
};

export const updatePolicySettings = async (
  input: Partial<PolicySettings> & { updatedByUserId?: number | null },
  executor: DbExecutor = pool
) => {
  await ensurePolicySettingsTable(executor);
  const settings = normalizeSettings({ ...DEFAULT_POLICY_SETTINGS, ...input });
  await executor.execute(
    `UPDATE policy_settings
     SET client_no_show_grace_minutes = ?,
         worker_client_no_show_grace_minutes = ?,
         late_cancel_window_minutes = ?,
         warning_incident_count = ?,
         penalty_incident_count = ?,
         temporary_block_incident_count = ?,
         admin_review_incident_count = ?,
         repeated_incident_penalty_amount = ?,
         temporary_block_hours = ?,
         updated_by_user_id = ?
     WHERE id_settings = 1`,
    [
      settings.client_no_show_grace_minutes,
      settings.worker_client_no_show_grace_minutes,
      settings.late_cancel_window_minutes,
      settings.warning_incident_count,
      settings.penalty_incident_count,
      settings.temporary_block_incident_count,
      settings.admin_review_incident_count,
      settings.repeated_incident_penalty_amount,
      settings.temporary_block_hours,
      input.updatedByUserId ?? null,
    ]
  );
  cache = null;
  return settings;
};
