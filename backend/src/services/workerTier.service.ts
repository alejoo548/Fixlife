import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { WORKER_TIERS, ensureCommissionEngineTables, normalizeWorkerTier } from './commissionEngine.service';

export type WorkerTier = (typeof WORKER_TIERS)[number];

type WorkerTierBenefitRow = RowDataPacket & {
  tier: WorkerTier;
  priority_weight: number;
  featured_profile_boost: number;
  max_active_leads: number;
  support_level: string;
  badge_label: string;
  monthly_fee: number;
  min_completed_jobs: number;
  benefits_summary: string | null;
  updated_at: string;
};

type WorkerTierHistoryRow = RowDataPacket & {
  id_history: number;
  id_worker_profile: number;
  previous_tier: WorkerTier | null;
  next_tier: WorkerTier;
  reason: string | null;
  changed_by_user_id: number | null;
  changed_by_name: string | null;
  changed_by_lastname: string | null;
  worker_name: string | null;
  worker_lastname: string | null;
  created_at: string;
};

const clampLimit = (value: unknown, fallback: number, max: number) => {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
};

let workerTierTablesChecked = false;

const DEFAULT_TIER_BENEFITS: Record<WorkerTier, {
  priority_weight: number;
  featured_profile_boost: number;
  max_active_leads: number;
  support_level: string;
  badge_label: string;
  monthly_fee: number;
  min_completed_jobs: number;
  benefits_summary: string;
}> = {
  standard: {
    priority_weight: 1,
    featured_profile_boost: 1,
    max_active_leads: 5,
    support_level: 'standard',
    badge_label: 'Standard Pro',
    monthly_fee: 0,
    min_completed_jobs: 0,
    benefits_summary: 'Entry tier for new or regular workers while they build history on Fixlife.',
  },
  verified: {
    priority_weight: 2,
    featured_profile_boost: 1.1,
    max_active_leads: 8,
    support_level: 'priority-email',
    badge_label: 'Verified Pro',
    monthly_fee: 0,
    min_completed_jobs: 5,
    benefits_summary: 'Earned after Fixlife approves identity documents, profile quality and service information.',
  },
  trusted: {
    priority_weight: 3,
    featured_profile_boost: 1.25,
    max_active_leads: 12,
    support_level: 'priority-email',
    badge_label: 'Trusted Pro',
    monthly_fee: 0,
    min_completed_jobs: 15,
    benefits_summary: 'Earned by strong ratings, completed jobs, low cancellations and time active on Fixlife.',
  },
  elite: {
    priority_weight: 4,
    featured_profile_boost: 1.45,
    max_active_leads: 16,
    support_level: 'priority-support',
    badge_label: 'Elite Pro',
    monthly_fee: 0,
    min_completed_jobs: 40,
    benefits_summary: 'Earned by consistent excellence over time, high ratings and a reliable completion record.',
  },
};

const WORKER_TIER_RANK: Record<WorkerTier, number> = {
  standard: 0,
  verified: 1,
  trusted: 2,
  elite: 3,
};

const resolveHighestEligibleTier = (
  completedJobs: number,
  benefits: Array<{
    tier: WorkerTier;
    min_completed_jobs: number;
  }>
): WorkerTier => {
  let nextTier: WorkerTier = 'standard';

  for (const tier of WORKER_TIERS) {
    const config = benefits.find((item) => item.tier === tier);
    const minCompletedJobs = Math.max(0, Math.floor(Number(config?.min_completed_jobs || 0)));
    if (completedJobs >= minCompletedJobs && WORKER_TIER_RANK[tier] >= WORKER_TIER_RANK[nextTier]) {
      nextTier = tier;
    }
  }

  return nextTier;
};

export const ensureWorkerTierTables = async () => {
  if (workerTierTablesChecked) return;

  await ensureCommissionEngineTables();
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS worker_tier_benefits (
      tier ENUM('standard', 'verified', 'trusted', 'premium', 'elite') NOT NULL,
      priority_weight INT NOT NULL DEFAULT 1,
      featured_profile_boost DECIMAL(6,2) NOT NULL DEFAULT 1.00,
      max_active_leads INT NOT NULL DEFAULT 5,
      support_level VARCHAR(30) NOT NULL DEFAULT 'standard',
      badge_label VARCHAR(60) NOT NULL,
      monthly_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      min_completed_jobs INT NOT NULL DEFAULT 0,
      benefits_summary VARCHAR(255) NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (tier)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS worker_tier_history (
      id_history INT NOT NULL AUTO_INCREMENT,
      id_worker_profile INT NOT NULL,
      previous_tier ENUM('standard', 'verified', 'trusted', 'premium', 'elite') NULL,
      next_tier ENUM('standard', 'verified', 'trusted', 'premium', 'elite') NOT NULL,
      reason VARCHAR(255) NULL,
      changed_by_user_id INT NULL,
      previous_benefits_json LONGTEXT NULL,
      next_benefits_json LONGTEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_history),
      KEY idx_worker_tier_history_profile (id_worker_profile, created_at),
      KEY idx_worker_tier_history_actor (changed_by_user_id, created_at),
      CONSTRAINT fk_worker_tier_history_profile FOREIGN KEY (id_worker_profile) REFERENCES worker_profiles(id_worker_profile) ON DELETE CASCADE,
      CONSTRAINT fk_worker_tier_history_actor FOREIGN KEY (changed_by_user_id) REFERENCES users(id_user) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    ALTER TABLE worker_tier_benefits
    MODIFY COLUMN tier ENUM('standard', 'verified', 'trusted', 'premium', 'elite') NOT NULL
  `);
  await pool.execute(`
    ALTER TABLE worker_tier_history
    MODIFY COLUMN previous_tier ENUM('standard', 'verified', 'trusted', 'premium', 'elite') NULL
  `);
  await pool.execute(`
    ALTER TABLE worker_tier_history
    MODIFY COLUMN next_tier ENUM('standard', 'verified', 'trusted', 'premium', 'elite') NOT NULL
  `);
  const [tierBenefitColumns] = await pool.execute<RowDataPacket[]>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'worker_tier_benefits'
      AND column_name = 'min_completed_jobs'
  `);
  if (tierBenefitColumns.length === 0) {
    await pool.execute(`
      ALTER TABLE worker_tier_benefits
      ADD COLUMN min_completed_jobs INT NOT NULL DEFAULT 0 AFTER monthly_fee
    `);
  }
  await pool.execute(`
    INSERT INTO worker_tier_benefits (
      tier,
      priority_weight,
      featured_profile_boost,
      max_active_leads,
      support_level,
      badge_label,
      monthly_fee,
      min_completed_jobs,
      benefits_summary
    )
    SELECT
      'trusted',
      priority_weight,
      LEAST(featured_profile_boost, 1.25),
      LEAST(max_active_leads, 12),
      support_level,
      CASE WHEN badge_label = 'Premium Pro' THEN 'Trusted Pro' ELSE badge_label END,
      0,
      15,
      COALESCE(benefits_summary, 'Earned by strong ratings, completed jobs, low cancellations and time active on Fixlife.')
    FROM worker_tier_benefits
    WHERE tier = 'premium'
    ON DUPLICATE KEY UPDATE
      monthly_fee = 0,
      badge_label = VALUES(badge_label)
  `);
  await pool.execute(`DELETE FROM worker_tier_benefits WHERE tier = 'premium'`);
  await pool.execute(`
    UPDATE worker_tier_history SET previous_tier = 'trusted' WHERE previous_tier = 'premium'
  `);
  await pool.execute(`
    UPDATE worker_tier_history SET next_tier = 'trusted' WHERE next_tier = 'premium'
  `);

  for (const tier of WORKER_TIERS) {
    const seed = DEFAULT_TIER_BENEFITS[tier];
    await pool.execute(
      `INSERT INTO worker_tier_benefits (
         tier,
         priority_weight,
         featured_profile_boost,
         max_active_leads,
         support_level,
         badge_label,
         monthly_fee,
         min_completed_jobs,
         benefits_summary
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         tier = tier`,
      [
        tier,
        seed.priority_weight,
        seed.featured_profile_boost,
        seed.max_active_leads,
        seed.support_level,
        seed.badge_label,
        seed.monthly_fee,
        seed.min_completed_jobs,
        seed.benefits_summary,
      ]
    );
  }

  workerTierTablesChecked = true;
};

export const getWorkerTierBenefits = async () => {
  await ensureWorkerTierTables();
  const [rows] = await pool.execute<WorkerTierBenefitRow[]>(
    `SELECT
       tier,
       priority_weight,
       featured_profile_boost,
       max_active_leads,
       support_level,
       badge_label,
       monthly_fee,
       min_completed_jobs,
       benefits_summary,
       updated_at
     FROM worker_tier_benefits
     WHERE tier <> 'premium'
     ORDER BY FIELD(tier, 'standard', 'verified', 'trusted', 'elite')`
  );

  return rows.map((row) => ({
    tier: normalizeWorkerTier(row.tier),
    priority_weight: Number(row.priority_weight || 0),
    featured_profile_boost: Number(row.featured_profile_boost || 0),
    max_active_leads: Number(row.max_active_leads || 0),
    support_level: String(row.support_level || 'standard'),
    badge_label: String(row.badge_label || ''),
    monthly_fee: Number(row.monthly_fee || 0),
    min_completed_jobs: Number(row.min_completed_jobs || 0),
    benefits_summary: row.benefits_summary || null,
    updated_at: row.updated_at,
  }));
};

export const updateWorkerTierBenefits = async (input: Array<{
  tier: WorkerTier;
  priority_weight: number;
  featured_profile_boost: number;
  max_active_leads: number;
  support_level: string;
  badge_label: string;
  monthly_fee: number;
  min_completed_jobs: number;
  benefits_summary?: string | null;
}>) => {
  await ensureWorkerTierTables();

  for (const item of input) {
    const tier = normalizeWorkerTier(item.tier);
    await pool.execute(
      `UPDATE worker_tier_benefits
       SET priority_weight = ?,
           featured_profile_boost = ?,
           max_active_leads = ?,
           support_level = ?,
           badge_label = ?,
           monthly_fee = ?,
           min_completed_jobs = ?,
           benefits_summary = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE tier = ?`,
      [
        Math.max(1, Math.floor(Number(item.priority_weight || 1))),
        Number(Number(item.featured_profile_boost || 1).toFixed(2)),
        Math.max(1, Math.floor(Number(item.max_active_leads || 1))),
        String(item.support_level || 'standard').slice(0, 30),
        String(item.badge_label || tier).slice(0, 60),
        Number(Number(item.monthly_fee || 0).toFixed(2)),
        Math.max(0, Math.floor(Number(item.min_completed_jobs || 0))),
        item.benefits_summary ? String(item.benefits_summary).slice(0, 255) : null,
        tier,
      ]
    );
  }

  return getWorkerTierBenefits();
};

export const updateWorkerMembershipTier = async (input: {
  userId: number;
  membershipTier: WorkerTier;
  changedByUserId?: number | null;
  reason?: string | null;
}) => {
  await ensureWorkerTierTables();

  const nextTier = normalizeWorkerTier(input.membershipTier);
  const [workerRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       wp.id_worker_profile,
       wp.membership_tier,
       wp.is_verified,
       u.name,
       u.lastname
     FROM worker_profiles wp
     INNER JOIN users u ON u.id_user = wp.id_user
     WHERE wp.id_user = ?
     LIMIT 1`,
    [input.userId]
  );

  const workerRow = workerRows[0];
  if (!workerRow) {
    return null;
  }

  const previousTier = normalizeWorkerTier(workerRow.membership_tier);
  if (previousTier === nextTier) {
    return {
      id_worker_profile: Number(workerRow.id_worker_profile),
      previous_tier: previousTier,
      next_tier: nextTier,
      changed: false,
    };
  }

  const benefits = await getWorkerTierBenefits();
  const previousBenefits = benefits.find((item) => item.tier === previousTier) || null;
  const nextBenefits = benefits.find((item) => item.tier === nextTier) || null;

  await pool.execute(
    `UPDATE worker_profiles
     SET membership_tier = ?,
         is_verified = CASE
           WHEN ? IN ('verified', 'trusted', 'premium', 'elite') AND is_verified = 0 THEN 1
           ELSE is_verified
         END
     WHERE id_user = ?`,
    [nextTier, nextTier, input.userId]
  );

  await pool.execute<ResultSetHeader>(
    `INSERT INTO worker_tier_history (
       id_worker_profile,
       previous_tier,
       next_tier,
       reason,
       changed_by_user_id,
       previous_benefits_json,
       next_benefits_json
     )
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      Number(workerRow.id_worker_profile),
      previousTier,
      nextTier,
      input.reason ? String(input.reason).slice(0, 255) : null,
      input.changedByUserId ?? null,
      previousBenefits ? JSON.stringify(previousBenefits) : null,
      nextBenefits ? JSON.stringify(nextBenefits) : null,
    ]
  );

  return {
    id_worker_profile: Number(workerRow.id_worker_profile),
    worker_name: `${workerRow.name || ''} ${workerRow.lastname || ''}`.trim() || 'Worker',
    previous_tier: previousTier,
    next_tier: nextTier,
    changed: true,
  };
};

export const evaluateAutomaticWorkerTier = async (input: {
  workerProfileId: number;
  reason?: string | null;
}) => {
  await ensureWorkerTierTables();

  const [workerRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       wp.id_worker_profile,
       wp.id_user,
       wp.membership_tier,
       COUNT(DISTINCT CASE WHEN sr.status = 'done' THEN sr.id_request END) AS completed_jobs
     FROM worker_profiles wp
     LEFT JOIN service_requests sr ON sr.assigned_worker_profile = wp.id_worker_profile
     WHERE wp.id_worker_profile = ?
     GROUP BY wp.id_worker_profile, wp.id_user, wp.membership_tier
     LIMIT 1`,
    [input.workerProfileId]
  );

  const worker = workerRows[0];
  if (!worker) return null;

  const currentTier = normalizeWorkerTier(worker.membership_tier);
  const completedJobs = Number(worker.completed_jobs || 0);
  const benefits = await getWorkerTierBenefits();
  const nextTier = resolveHighestEligibleTier(completedJobs, benefits);

  if (WORKER_TIER_RANK[nextTier] <= WORKER_TIER_RANK[currentTier]) {
    return {
      changed: false,
      id_worker_profile: Number(worker.id_worker_profile),
      user_id: Number(worker.id_user),
      previous_tier: currentTier,
      next_tier: currentTier,
      completed_jobs: completedJobs,
      benefit: benefits.find((item) => item.tier === currentTier) || null,
      reason: input.reason?.trim() || null,
    };
  }

  const reason =
    input.reason?.trim()
      ? input.reason.trim()
      : `Auto-promoted after reaching ${completedJobs} completed jobs.`;

  const updated = await updateWorkerMembershipTier({
    userId: Number(worker.id_user),
    membershipTier: nextTier,
    changedByUserId: null,
    reason,
  });

  return {
    ...(updated || {}),
    changed: Boolean(updated?.changed),
    user_id: Number(worker.id_user),
    completed_jobs: completedJobs,
    benefit: benefits.find((item) => item.tier === nextTier) || null,
    reason,
  };
};

export const getWorkerTierHistory = async (input?: { limit?: number; idWorkerProfile?: number | null }) => {
  await ensureWorkerTierTables();

  const whereParts = ['1=1'];
  const params: any[] = [];
  if (input?.idWorkerProfile != null) {
    whereParts.push('wth.id_worker_profile = ?');
    params.push(Number(input.idWorkerProfile));
  }

  const safeLimit = clampLimit(input?.limit, 40, 100);
  const [rows] = await pool.execute<WorkerTierHistoryRow[]>(
    `SELECT
       wth.id_history,
       wth.id_worker_profile,
       wth.previous_tier,
       wth.next_tier,
       wth.reason,
       wth.changed_by_user_id,
       actor.name AS changed_by_name,
       actor.lastname AS changed_by_lastname,
       worker_user.name AS worker_name,
       worker_user.lastname AS worker_lastname,
       wth.created_at
     FROM worker_tier_history wth
     INNER JOIN worker_profiles wp ON wp.id_worker_profile = wth.id_worker_profile
     INNER JOIN users worker_user ON worker_user.id_user = wp.id_user
     LEFT JOIN users actor ON actor.id_user = wth.changed_by_user_id
     WHERE ${whereParts.join(' AND ')}
     ORDER BY wth.created_at DESC, wth.id_history DESC
     LIMIT ${safeLimit}`,
    params
  );

  return rows.map((row) => ({
    id_history: Number(row.id_history),
    id_worker_profile: Number(row.id_worker_profile),
    previous_tier: row.previous_tier ? normalizeWorkerTier(row.previous_tier) : null,
    next_tier: normalizeWorkerTier(row.next_tier),
    reason: row.reason || null,
    changed_by_user_id: row.changed_by_user_id != null ? Number(row.changed_by_user_id) : null,
    changed_by_name: `${row.changed_by_name || ''} ${row.changed_by_lastname || ''}`.trim() || null,
    worker_name: `${row.worker_name || ''} ${row.worker_lastname || ''}`.trim() || 'Worker',
    created_at: row.created_at,
  }));
};
