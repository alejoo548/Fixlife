import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { shouldRunRuntimeSchemaSync } from '../config/schemaSync';
import { isDatabaseSchemaReady } from '../services/schemaState.service';

export const DEFAULT_COMMISSION_TRIAL_MIN_JOBS = 3;
export const DEFAULT_COMMISSION_BONUS_RATE = 0.07;
export const DEFAULT_ROYALTY_MIN_JOBS = 8;
export const DEFAULT_ROYALTY_TARGET_COMPLETION_RATE = 85;
export const DEFAULT_ROYALTY_BONUS_RATE = 0.04;
export const DEFAULT_PAYOUT_WEEKDAY = 5;
export const REWARDS_PROGRAM_START = new Date(2026, 0, 1, 0, 0, 0, 0);
export const REWARDS_PROGRAM_START_SQL = '2026-01-01 00:00:00';

export interface WorkerRewardsSettings {
  id_settings: number;
  trial_min_completed_jobs: number;
  commission_rate: number;
  royalty_rate: number;
  royalty_min_jobs: number;
  royalty_min_completion_rate: number;
  payout_weekday: number;
  updated_at?: string | null;
}

type CompletedRequestRow = RowDataPacket & {
  id_request: number;
  completed_at: string;
  worker_payout: number;
};

type CancelledCycleRow = RowDataPacket & {
  cycle_key: string;
  total: number;
};

let workerRewardsTablesChecked = false;

const getCycleKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const getDateFromCycleKey = (cycleKey: string) => {
  const [yearRaw, monthRaw] = cycleKey.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  return new Date(year, Math.max(month - 1, 0), 1, 0, 0, 0, 0);
};

const toSqlDate = (date: Date) => date.toISOString().slice(0, 10);

const toSqlDateTime = (date: Date) => date.toISOString().slice(0, 19).replace('T', ' ');

export const getCycleStart = (anchor = new Date()) =>
  new Date(anchor.getFullYear(), anchor.getMonth(), 1, 0, 0, 0, 0);

export const getCycleEnd = (anchor = new Date()) =>
  new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999);

export const getNextPayoutWeekday = (date: Date, payoutWeekday = DEFAULT_PAYOUT_WEEKDAY) => {
  const payoutDate = new Date(date);
  payoutDate.setHours(0, 0, 0, 0);
  const day = payoutDate.getDay();
  let diff = (payoutWeekday - day + 7) % 7;
  if (diff === 0) diff = 7;
  payoutDate.setDate(payoutDate.getDate() + diff);
  return payoutDate;
};

export const getCycleRoyaltyPayoutDate = (cycleKey: string, payoutWeekday = DEFAULT_PAYOUT_WEEKDAY) => {
  const cycleStart = getDateFromCycleKey(cycleKey);
  const lastDay = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, 0, 0, 0, 0, 0);
  while (lastDay.getDay() !== payoutWeekday) {
    lastDay.setDate(lastDay.getDate() - 1);
  }
  return lastDay;
};

export const ensureWorkerRewardsTables = async () => {
  if (workerRewardsTablesChecked) return;
  if (isDatabaseSchemaReady()) {
    workerRewardsTablesChecked = true;
    return;
  }
  if (!shouldRunRuntimeSchemaSync()) {
    workerRewardsTablesChecked = true;
    return;
  }

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS worker_rewards_settings (
      id_settings INT NOT NULL,
      trial_min_completed_jobs INT NOT NULL DEFAULT ${DEFAULT_COMMISSION_TRIAL_MIN_JOBS},
      commission_rate DECIMAL(6,4) NOT NULL DEFAULT ${DEFAULT_COMMISSION_BONUS_RATE.toFixed(4)},
      royalty_rate DECIMAL(6,4) NOT NULL DEFAULT ${DEFAULT_ROYALTY_BONUS_RATE.toFixed(4)},
      royalty_min_jobs INT NOT NULL DEFAULT ${DEFAULT_ROYALTY_MIN_JOBS},
      royalty_min_completion_rate DECIMAL(6,2) NOT NULL DEFAULT ${DEFAULT_ROYALTY_TARGET_COMPLETION_RATE.toFixed(2)},
      payout_weekday TINYINT NOT NULL DEFAULT ${DEFAULT_PAYOUT_WEEKDAY},
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_settings)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    INSERT INTO worker_rewards_settings (
      id_settings,
      trial_min_completed_jobs,
      commission_rate,
      royalty_rate,
      royalty_min_jobs,
      royalty_min_completion_rate,
      payout_weekday
    )
    VALUES (
      1,
      ${DEFAULT_COMMISSION_TRIAL_MIN_JOBS},
      ${DEFAULT_COMMISSION_BONUS_RATE.toFixed(4)},
      ${DEFAULT_ROYALTY_BONUS_RATE.toFixed(4)},
      ${DEFAULT_ROYALTY_MIN_JOBS},
      ${DEFAULT_ROYALTY_TARGET_COMPLETION_RATE.toFixed(2)},
      ${DEFAULT_PAYOUT_WEEKDAY}
    )
    ON DUPLICATE KEY UPDATE id_settings = id_settings
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS worker_bonus_payouts (
      id_bonus_payout INT NOT NULL AUTO_INCREMENT,
      id_worker_profile INT NOT NULL,
      source_request_id INT NULL,
      cycle_key VARCHAR(20) NOT NULL,
      payout_key VARCHAR(80) NULL,
      bonus_type ENUM('commission', 'royalty') NOT NULL,
      base_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      bonus_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      payout_status ENUM('scheduled', 'paid', 'cancelled') NOT NULL DEFAULT 'scheduled',
      scheduled_for DATE NOT NULL,
      paid_at TIMESTAMP NULL,
      notes VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_bonus_payout),
      UNIQUE KEY uniq_bonus_request_type (source_request_id, bonus_type),
      UNIQUE KEY uniq_bonus_payout_key (payout_key),
      KEY idx_bonus_worker_status_date (id_worker_profile, payout_status, scheduled_for),
      CONSTRAINT fk_bonus_worker_profile FOREIGN KEY (id_worker_profile) REFERENCES worker_profiles(id_worker_profile) ON DELETE CASCADE,
      CONSTRAINT fk_bonus_request FOREIGN KEY (source_request_id) REFERENCES service_requests(id_request) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [payoutKeyColumnRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'worker_bonus_payouts'
       AND column_name = 'payout_key'`
  );
  if (Number(payoutKeyColumnRows[0]?.total || 0) === 0) {
    await pool.execute(`ALTER TABLE worker_bonus_payouts ADD COLUMN payout_key VARCHAR(80) NULL AFTER cycle_key`);
  }

  const [legacyIndexRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'worker_bonus_payouts'
       AND index_name = 'uniq_bonus_cycle_worker_type'`
  );
  if (Number(legacyIndexRows[0]?.total || 0) > 0) {
    await pool.execute(`ALTER TABLE worker_bonus_payouts DROP INDEX uniq_bonus_cycle_worker_type`);
  }

  const [payoutKeyIndexRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'worker_bonus_payouts'
       AND index_name = 'uniq_bonus_payout_key'`
  );
  if (Number(payoutKeyIndexRows[0]?.total || 0) === 0) {
    await pool.execute(`ALTER TABLE worker_bonus_payouts ADD UNIQUE INDEX uniq_bonus_payout_key (payout_key)`);
  }

  await pool.execute(`
    UPDATE worker_bonus_payouts
    SET payout_key = CASE
      WHEN bonus_type = 'commission' AND source_request_id IS NOT NULL THEN CONCAT('commission-request-', source_request_id)
      WHEN bonus_type = 'royalty' THEN CONCAT('royalty-cycle-', id_worker_profile, '-', cycle_key)
      ELSE payout_key
    END
    WHERE payout_key IS NULL
  `);

  workerRewardsTablesChecked = true;
};

export const getWorkerRewardsSettings = async (): Promise<WorkerRewardsSettings> => {
  await ensureWorkerRewardsTables();

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       id_settings,
       trial_min_completed_jobs,
       commission_rate,
       royalty_rate,
       royalty_min_jobs,
       royalty_min_completion_rate,
       payout_weekday,
       updated_at
     FROM worker_rewards_settings
     WHERE id_settings = 1
     LIMIT 1`
  );

  const row = rows[0];
  return {
    id_settings: Number(row.id_settings),
    trial_min_completed_jobs: Number(row.trial_min_completed_jobs || DEFAULT_COMMISSION_TRIAL_MIN_JOBS),
    commission_rate: Number(row.commission_rate || DEFAULT_COMMISSION_BONUS_RATE),
    royalty_rate: Number(row.royalty_rate || DEFAULT_ROYALTY_BONUS_RATE),
    royalty_min_jobs: Number(row.royalty_min_jobs || DEFAULT_ROYALTY_MIN_JOBS),
    royalty_min_completion_rate: Number(row.royalty_min_completion_rate || DEFAULT_ROYALTY_TARGET_COMPLETION_RATE),
    payout_weekday: Number(row.payout_weekday || DEFAULT_PAYOUT_WEEKDAY),
    updated_at: row.updated_at || null,
  };
};

export const updateWorkerRewardsSettings = async (
  input: Partial<Pick<
    WorkerRewardsSettings,
    'trial_min_completed_jobs' | 'commission_rate' | 'royalty_rate' | 'royalty_min_jobs' | 'royalty_min_completion_rate'
  >>
) => {
  await ensureWorkerRewardsTables();

  const updates: string[] = [];
  const params: any[] = [];

  if (input.trial_min_completed_jobs != null) {
    updates.push('trial_min_completed_jobs = ?');
    params.push(input.trial_min_completed_jobs);
  }
  if (input.commission_rate != null) {
    updates.push('commission_rate = ?');
    params.push(input.commission_rate);
  }
  if (input.royalty_rate != null) {
    updates.push('royalty_rate = ?');
    params.push(input.royalty_rate);
  }
  if (input.royalty_min_jobs != null) {
    updates.push('royalty_min_jobs = ?');
    params.push(input.royalty_min_jobs);
  }
  if (input.royalty_min_completion_rate != null) {
    updates.push('royalty_min_completion_rate = ?');
    params.push(input.royalty_min_completion_rate);
  }

  if (updates.length > 0) {
    params.push(1);
    await pool.execute(
      `UPDATE worker_rewards_settings
       SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id_settings = ?`,
      params
    );
  }

  return getWorkerRewardsSettings();
};

const getCompletedRequests = async (profileId: number) => {
  const [rows] = await pool.execute<CompletedRequestRow[]>(
    `SELECT
       sr.id_request,
       COALESCE(srp.released_at, sr.updated_at, sr.created_at) AS completed_at,
       COALESCE(srp.worker_payout, sr.final_budget, sr.budget, 0) AS worker_payout
     FROM service_requests sr
     LEFT JOIN service_request_payments srp ON srp.id_request = sr.id_request
     WHERE sr.assigned_worker_profile = ?
       AND sr.status = 'done'
       AND COALESCE(srp.released_at, sr.updated_at, sr.created_at) >= ?
     ORDER BY completed_at ASC, sr.id_request ASC`,
    [profileId, REWARDS_PROGRAM_START_SQL]
  );

  return rows.map((row) => ({
    id_request: Number(row.id_request),
    completed_at: new Date(row.completed_at),
    worker_payout: Number(row.worker_payout || 0),
    cycle_key: getCycleKey(new Date(row.completed_at)),
  }));
};

const getCancelledCycleCounts = async (profileId: number) => {
  const [rows] = await pool.execute<CancelledCycleRow[]>(
    `SELECT
       DATE_FORMAT(COALESCE(updated_at, created_at), '%Y-%m') AS cycle_key,
       COUNT(*) AS total
     FROM service_requests
     WHERE assigned_worker_profile = ?
       AND status = 'cancelled'
       AND COALESCE(updated_at, created_at) >= ?
     GROUP BY DATE_FORMAT(COALESCE(updated_at, created_at), '%Y-%m')`,
    [profileId, REWARDS_PROGRAM_START_SQL]
  );

  const map = new Map<string, number>();
  rows.forEach((row) => {
    map.set(String(row.cycle_key), Number(row.total || 0));
  });
  return map;
};

const restoreEligibleBonusPayouts = async (
  profileId: number,
  bonusType: 'commission' | 'royalty',
  matchColumn: 'source_request_id' | 'cycle_key',
  matchValues: Array<number | string>
) => {
  if (matchValues.length === 0) return;

  await pool.execute(
    `UPDATE worker_bonus_payouts
     SET payout_status = 'scheduled',
         paid_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id_worker_profile = ?
       AND bonus_type = ?
       AND payout_status = 'cancelled'
       AND ${matchColumn} IN (${matchValues.map(() => '?').join(', ')})`,
    [profileId, bonusType, ...matchValues]
  );
};

const upsertCommissionBonus = async (
  profileId: number,
  settings: WorkerRewardsSettings,
  requestId: number,
  cycleKey: string,
  baseAmount: number,
  scheduledFor: Date
) => {
  const bonusAmount = Number((baseAmount * settings.commission_rate).toFixed(2));
  const payoutKey = `commission-request-${requestId}`;
  const note = `Commission bonus at ${(settings.commission_rate * 100).toFixed(2)}% after ${settings.trial_min_completed_jobs} completed jobs`;

  await pool.execute(
    `INSERT INTO worker_bonus_payouts
       (id_worker_profile, source_request_id, cycle_key, payout_key, bonus_type, base_amount, bonus_amount, payout_status, scheduled_for, notes)
     VALUES (?, ?, ?, ?, 'commission', ?, ?, 'scheduled', ?, ?)
     ON DUPLICATE KEY UPDATE
       id_worker_profile = id_worker_profile`,
    [
      profileId,
      requestId,
      cycleKey,
      payoutKey,
      baseAmount,
      bonusAmount,
      toSqlDate(scheduledFor),
      note,
    ]
  );
};

const upsertRoyaltyBonus = async (
  profileId: number,
  settings: WorkerRewardsSettings,
  cycleKey: string,
  baseAmount: number,
  scheduledFor: Date
) => {
  const bonusAmount = Number((baseAmount * settings.royalty_rate).toFixed(2));
  const payoutKey = `royalty-cycle-${profileId}-${cycleKey}`;
  const note = `Royalty bonus at ${(settings.royalty_rate * 100).toFixed(2)}% with ${settings.royalty_min_jobs}+ jobs and ${settings.royalty_min_completion_rate.toFixed(1)}% completion`;

  await pool.execute(
    `INSERT INTO worker_bonus_payouts
       (id_worker_profile, source_request_id, cycle_key, payout_key, bonus_type, base_amount, bonus_amount, payout_status, scheduled_for, notes)
     VALUES (?, NULL, ?, ?, 'royalty', ?, ?, 'scheduled', ?, ?)
     ON DUPLICATE KEY UPDATE
       id_worker_profile = id_worker_profile`,
    [
      profileId,
      cycleKey,
      payoutKey,
      baseAmount,
      bonusAmount,
      toSqlDate(scheduledFor),
      note,
    ]
  );
};

export const syncWorkerBonusPayouts = async (
  profileId: number,
  settingsInput?: WorkerRewardsSettings
) => {
  await ensureWorkerRewardsTables();
  const settings = settingsInput || (await getWorkerRewardsSettings());
  const completedRequests = await getCompletedRequests(profileId);
  const cancelledCounts = await getCancelledCycleCounts(profileId);
  const now = new Date();

  const eligibleCommissionRequestIds: number[] = [];
  const cycleStats = new Map<string, { completed_jobs: number; gross: number; cancelled_jobs: number }>();

  completedRequests.forEach((item, index) => {
    const cycleBucket = cycleStats.get(item.cycle_key) || {
      completed_jobs: 0,
      gross: 0,
      cancelled_jobs: cancelledCounts.get(item.cycle_key) || 0,
    };
    cycleBucket.completed_jobs += 1;
    cycleBucket.gross += item.worker_payout;
    cycleStats.set(item.cycle_key, cycleBucket);

    if (index + 1 >= settings.trial_min_completed_jobs) {
      eligibleCommissionRequestIds.push(item.id_request);
    }
  });

  for (const item of completedRequests) {
    if (!eligibleCommissionRequestIds.includes(item.id_request)) continue;
    const scheduledFor = getNextPayoutWeekday(item.completed_at, settings.payout_weekday);
    await upsertCommissionBonus(
      profileId,
      settings,
      item.id_request,
      item.cycle_key,
      item.worker_payout,
      scheduledFor
    );
  }

  await restoreEligibleBonusPayouts(profileId, 'commission', 'source_request_id', eligibleCommissionRequestIds);

  const eligibleRoyaltyCycleKeys: string[] = [];
  for (const [cycleKey, stats] of cycleStats.entries()) {
    const scheduledFor = getCycleRoyaltyPayoutDate(cycleKey, settings.payout_weekday);
    if (scheduledFor.getTime() > now.getTime()) {
      continue;
    }

    const closedJobs = stats.completed_jobs + (stats.cancelled_jobs || 0);
    const completionRate = closedJobs > 0 ? (stats.completed_jobs / closedJobs) * 100 : 0;
    if (
      stats.completed_jobs >= settings.royalty_min_jobs &&
      completionRate >= settings.royalty_min_completion_rate
    ) {
      eligibleRoyaltyCycleKeys.push(cycleKey);
      await upsertRoyaltyBonus(
        profileId,
        settings,
        cycleKey,
        stats.gross,
        scheduledFor
      );
    }
  }

  await restoreEligibleBonusPayouts(profileId, 'royalty', 'cycle_key', eligibleRoyaltyCycleKeys);

  return {
    settings,
    completedRequests,
    cycleStats,
  };
};

export const syncAllWorkerBonusPayouts = async (settingsInput?: WorkerRewardsSettings) => {
  await ensureWorkerRewardsTables();
  const settings = settingsInput || (await getWorkerRewardsSettings());

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id_worker_profile
     FROM worker_profiles`
  );

  for (const row of rows) {
    await syncWorkerBonusPayouts(Number(row.id_worker_profile), settings);
  }
};

export const markWorkerBonusPayoutAsPaid = async (idBonusPayout: number) => {
  await ensureWorkerRewardsTables();

  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE worker_bonus_payouts
     SET payout_status = 'paid',
         paid_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id_bonus_payout = ?
       AND payout_status = 'scheduled'`,
    [idBonusPayout]
  );

  return result.affectedRows > 0;
};

export const getWorkerBonusPayouts = async (profileId: number) => {
  await ensureWorkerRewardsTables();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       id_bonus_payout,
       id_worker_profile,
       source_request_id,
       cycle_key,
       bonus_type,
       base_amount,
       bonus_amount,
       payout_status,
       scheduled_for,
       paid_at,
       notes,
       created_at
     FROM worker_bonus_payouts
     WHERE id_worker_profile = ?
     ORDER BY scheduled_for ASC, id_bonus_payout ASC`,
    [profileId]
  );
  return rows;
};

export const getAllBonusPayoutsForAdmin = async (status: string = 'all') => {
  await ensureWorkerRewardsTables();

  const whereParts = ['1=1'];
  const params: any[] = [];
  const normalizedStatus = String(status || 'all').toLowerCase();
  if (normalizedStatus !== 'all') {
    whereParts.push('wbp.payout_status = ?');
    params.push(normalizedStatus);
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       wbp.id_bonus_payout,
       wbp.bonus_type,
       wbp.cycle_key,
       wbp.base_amount,
       wbp.bonus_amount,
       wbp.payout_status,
       wbp.scheduled_for,
       wbp.paid_at,
       wbp.notes,
       wbp.source_request_id,
       wp.id_worker_profile,
       u.name,
       u.lastname,
       sr.location_text,
       s.name AS service_name
     FROM worker_bonus_payouts wbp
     INNER JOIN worker_profiles wp ON wp.id_worker_profile = wbp.id_worker_profile
     INNER JOIN users u ON u.id_user = wp.id_user
     LEFT JOIN service_requests sr ON sr.id_request = wbp.source_request_id
     LEFT JOIN services s ON s.id_service = sr.id_service
     WHERE ${whereParts.join(' AND ')}
     ORDER BY
       CASE WHEN wbp.payout_status = 'scheduled' THEN 0 WHEN wbp.payout_status = 'paid' THEN 1 ELSE 2 END,
       wbp.scheduled_for ASC,
       wbp.id_bonus_payout ASC`,
    params
  );

  return rows;
};
