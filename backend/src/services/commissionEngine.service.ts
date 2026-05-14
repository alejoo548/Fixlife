import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { isDatabaseSchemaReady } from './schemaState.service';

type SqlExecutor = {
  execute: (sql: string, values?: any[]) => Promise<any>;
};

export const URGENCY_LEVELS = ['standard', 'urgent', 'emergency'] as const;
export const WORKER_TIERS = ['standard', 'verified', 'trusted', 'elite'] as const;

export type CommissionUrgencyLevel = (typeof URGENCY_LEVELS)[number];
export type CommissionWorkerTier = (typeof WORKER_TIERS)[number];
type CommissionRuleType = 'global' | 'service' | 'urgency' | 'worker_tier' | 'promo';
type CommissionAdjustmentMode = 'set_rate' | 'add_rate' | 'subtract_rate';

type CommissionRuleRow = RowDataPacket & {
  id_rule: number;
  name: string;
  rule_type: CommissionRuleType;
  id_service: number | null;
  urgency_level: CommissionUrgencyLevel | null;
  worker_tier: CommissionWorkerTier | null;
  promo_code: string | null;
  adjustment_mode: CommissionAdjustmentMode;
  rate_percent: number;
  priority: number;
  is_active: number;
  notes: string | null;
  service_name?: string | null;
};

export interface AppliedCommissionRule {
  id_rule: number;
  name: string;
  rule_type: CommissionRuleType;
  id_service: number | null;
  urgency_level: CommissionUrgencyLevel | null;
  worker_tier: CommissionWorkerTier | null;
  promo_code: string | null;
  adjustment_mode: CommissionAdjustmentMode;
  rate_percent: number;
  priority: number;
  service_name?: string | null;
}

export interface CommissionContext {
  idService?: number | null;
  urgencyLevel?: CommissionUrgencyLevel | null;
  workerTier?: CommissionWorkerTier | null;
  promoCode?: string | null;
}

export interface CommissionBreakdown {
  amount: number;
  commissionRate: number;
  platformFee: number;
  workerPayout: number;
  snapshot: {
    commission_rate: number;
    policy_label: string;
    context: {
      id_service: number | null;
      urgency_level: CommissionUrgencyLevel;
      worker_tier: CommissionWorkerTier;
      promo_code: string | null;
    };
    applied_rules: AppliedCommissionRule[];
  };
}

export interface CommissionAdminOverrideInput {
  id_service: number;
  rate_percent: number;
  is_active?: boolean;
}

export interface CommissionAdminUrgencyInput {
  urgency_level: CommissionUrgencyLevel;
  rate_percent: number;
  is_active?: boolean;
}

export interface CommissionAdminTierInput {
  worker_tier: CommissionWorkerTier;
  rate_percent: number;
  is_active?: boolean;
}

export interface CommissionAdminPromoInput {
  promo_code: string;
  rate_percent: number;
  is_active?: boolean;
}

type CommissionAdminRuleItem = {
  id_rule: number;
  rate_percent: number;
  is_active: boolean;
  priority: number;
  adjustment_mode: CommissionAdjustmentMode;
};

export interface CommissionAdminConfig {
  global_rate_percent: number;
  service_overrides: Array<
    CommissionAdminRuleItem & {
      id_service: number;
      service_name: string | null;
    }
  >;
  urgency_adjustments: Array<
    CommissionAdminRuleItem & {
      urgency_level: CommissionUrgencyLevel;
    }
  >;
  worker_tier_adjustments: Array<
    CommissionAdminRuleItem & {
      worker_tier: CommissionWorkerTier;
    }
  >;
  promo_codes: Array<
    CommissionAdminRuleItem & {
      promo_code: string;
    }
  >;
  summary: {
    effective_default_rate_percent: number;
    service_override_count: number;
    urgency_rule_count: number;
    worker_tier_rule_count: number;
    promo_rule_count: number;
  };
}

let commissionTablesChecked = false;

const DEFAULT_COMMISSION_RATE = (() => {
  const raw = Number(process.env.PLATFORM_FEE_RATE || 0.12);
  if (!Number.isFinite(raw)) return 0.12;
  return Math.min(Math.max(raw, 0), 0.5);
})();

const roundMoney = (value: number) => Number(Number(value || 0).toFixed(2));
const roundRate = (value: number) => Number(Number(value || 0).toFixed(4));
const clampRate = (value: number) => Math.min(Math.max(roundRate(value), 0), 0.5);

export const normalizePromoCode = (value: unknown) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .slice(0, 40);

export const normalizeUrgencyLevel = (value: unknown): CommissionUrgencyLevel => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'urgent') return 'urgent';
  if (normalized === 'emergency') return 'emergency';
  return 'standard';
};

export const normalizeWorkerTier = (value: unknown): CommissionWorkerTier => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'verified') return 'verified';
  if (normalized === 'trusted' || normalized === 'premium') return 'trusted';
  if (normalized === 'elite') return 'elite';
  return 'standard';
};

export const resolveWorkerTier = (input: {
  membershipTier?: unknown;
  isVerified?: unknown;
}): CommissionWorkerTier => {
  const rawMembershipTier = String(input.membershipTier ?? '').trim();
  if (rawMembershipTier) {
    return normalizeWorkerTier(rawMembershipTier);
  }
  return Number(input.isVerified || 0) === 1 ? 'verified' : 'standard';
};

const applyRateAdjustment = (
  currentRate: number,
  mode: CommissionAdjustmentMode,
  ruleRate: number
) => {
  const safeRuleRate = clampRate(ruleRate);
  if (mode === 'add_rate') return clampRate(currentRate + safeRuleRate);
  if (mode === 'subtract_rate') return clampRate(currentRate - safeRuleRate);
  return safeRuleRate;
};

const normalizeRule = (row: CommissionRuleRow): AppliedCommissionRule => ({
  id_rule: Number(row.id_rule),
  name: String(row.name || 'Commission rule'),
  rule_type:
    row.rule_type === 'service' ||
    row.rule_type === 'urgency' ||
    row.rule_type === 'worker_tier' ||
    row.rule_type === 'promo'
      ? row.rule_type
      : 'global',
  id_service: row.id_service != null ? Number(row.id_service) : null,
  urgency_level: row.urgency_level ? normalizeUrgencyLevel(row.urgency_level) : null,
  worker_tier: row.worker_tier ? normalizeWorkerTier(row.worker_tier) : null,
  promo_code: row.promo_code ? normalizePromoCode(row.promo_code) : null,
  adjustment_mode:
    row.adjustment_mode === 'add_rate' || row.adjustment_mode === 'subtract_rate'
      ? row.adjustment_mode
      : 'set_rate',
  rate_percent: clampRate(Number(row.rate_percent || 0)),
  priority: Number(row.priority || 100),
  service_name: row.service_name ? String(row.service_name) : null,
});

const readCommissionRuleRows = async (executor: SqlExecutor) =>
  (await executor.execute(
    `SELECT
       cr.id_rule,
       cr.name,
       cr.rule_type,
       cr.id_service,
       cr.urgency_level,
       cr.worker_tier,
       cr.promo_code,
       cr.adjustment_mode,
       cr.rate_percent,
       cr.priority,
       cr.is_active,
       cr.notes,
       s.name AS service_name
     FROM commission_rules cr
     LEFT JOIN services s ON s.id_service = cr.id_service
     ORDER BY cr.rule_type ASC, cr.priority ASC, cr.id_rule ASC`
  )) as [CommissionRuleRow[], any];

export const ensureCommissionEngineTables = async (executor: SqlExecutor = pool) => {
  if (commissionTablesChecked) return;
  if (isDatabaseSchemaReady()) {
    commissionTablesChecked = true;
    return;
  }

  await executor.execute(`
    CREATE TABLE IF NOT EXISTS commission_rules (
      id_rule INT NOT NULL AUTO_INCREMENT,
      name VARCHAR(120) NOT NULL,
      rule_type ENUM('global', 'service', 'urgency', 'worker_tier', 'promo') NOT NULL DEFAULT 'global',
      id_service INT NULL,
      urgency_level ENUM('standard', 'urgent', 'emergency') NULL,
      worker_tier ENUM('standard', 'verified', 'trusted', 'premium', 'elite') NULL,
      promo_code VARCHAR(40) NULL,
      adjustment_mode ENUM('set_rate', 'add_rate', 'subtract_rate') NOT NULL DEFAULT 'set_rate',
      rate_percent DECIMAL(6,4) NOT NULL DEFAULT 0.1200,
      priority INT NOT NULL DEFAULT 100,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      notes VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_rule),
      KEY idx_commission_rules_type_active (rule_type, is_active, priority),
      KEY idx_commission_rules_service (id_service),
      KEY idx_commission_rules_urgency (urgency_level),
      KEY idx_commission_rules_worker_tier (worker_tier),
      KEY idx_commission_rules_promo (promo_code),
      CONSTRAINT fk_commission_rules_service FOREIGN KEY (id_service) REFERENCES services(id_service) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await executor.execute(`
    ALTER TABLE commission_rules
    MODIFY COLUMN rule_type ENUM('global', 'service', 'urgency', 'worker_tier', 'promo') NOT NULL DEFAULT 'global'
  `);

  const [commissionCols] = (await executor.execute(
    `SELECT COLUMN_NAME
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'commission_rules'
       AND column_name IN ('urgency_level', 'worker_tier', 'promo_code')`
  )) as [RowDataPacket[], any];
  const commissionColSet = new Set(commissionCols.map((column: any) => String(column.COLUMN_NAME)));

  if (!commissionColSet.has('urgency_level')) {
    await executor.execute(
      `ALTER TABLE commission_rules
       ADD COLUMN urgency_level ENUM('standard', 'urgent', 'emergency') NULL AFTER id_service`
    );
  }
  if (!commissionColSet.has('worker_tier')) {
    await executor.execute(
      `ALTER TABLE commission_rules
       ADD COLUMN worker_tier ENUM('standard', 'verified', 'trusted', 'premium', 'elite') NULL AFTER urgency_level`
    );
  } else {
    await executor.execute(`
      ALTER TABLE commission_rules
      MODIFY COLUMN worker_tier ENUM('standard', 'verified', 'trusted', 'premium', 'elite') NULL
    `);
  }
  await executor.execute(`
    UPDATE commission_rules
    SET worker_tier = 'trusted'
    WHERE worker_tier = 'premium'
  `);
  if (!commissionColSet.has('promo_code')) {
    await executor.execute(
      `ALTER TABLE commission_rules
       ADD COLUMN promo_code VARCHAR(40) NULL AFTER worker_tier`
    );
  }

  const [requestCols] = (await executor.execute(
    `SELECT COLUMN_NAME
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'service_requests'
       AND column_name IN ('urgency_level')`
  )) as [RowDataPacket[], any];
  if (!requestCols.some((column: any) => String(column.COLUMN_NAME) === 'urgency_level')) {
    await executor.execute(
      `ALTER TABLE service_requests
       ADD COLUMN urgency_level ENUM('standard', 'urgent', 'emergency') NOT NULL DEFAULT 'standard' AFTER radius_km`
    );
  }

  const [workerProfileCols] = (await executor.execute(
    `SELECT COLUMN_NAME
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'worker_profiles'
       AND column_name IN ('membership_tier', 'is_verified')`
  )) as [RowDataPacket[], any];
  const workerProfileColSet = new Set(workerProfileCols.map((column: any) => String(column.COLUMN_NAME)));
  if (!workerProfileColSet.has('membership_tier')) {
    await executor.execute(
      `ALTER TABLE worker_profiles
       ADD COLUMN membership_tier ENUM('standard', 'verified', 'trusted', 'premium', 'elite') NOT NULL DEFAULT 'standard'`
    );
  } else {
    await executor.execute(`
      ALTER TABLE worker_profiles
      MODIFY COLUMN membership_tier ENUM('standard', 'verified', 'trusted', 'premium', 'elite') NOT NULL DEFAULT 'standard'
    `);
  }

  await executor.execute(`
    UPDATE worker_profiles
    SET membership_tier = 'trusted'
    WHERE membership_tier = 'premium'
  `);
  await executor.execute(`
    UPDATE worker_profiles
    SET membership_tier = CASE
      WHEN membership_tier = 'standard' AND is_verified = 1 THEN 'verified'
      ELSE membership_tier
    END
  `);

  const [paymentCols] = (await executor.execute(
    `SELECT COLUMN_NAME
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'service_request_payments'
       AND column_name IN ('commission_rate', 'commission_snapshot_json', 'promo_code')`
  )) as [RowDataPacket[], any];
  const paymentColSet = new Set(paymentCols.map((column: any) => String(column.COLUMN_NAME)));

  if (!paymentColSet.has('commission_rate')) {
    await executor.execute(
      `ALTER TABLE service_request_payments
       ADD COLUMN commission_rate DECIMAL(6,4) NOT NULL DEFAULT 0.1200 AFTER worker_payout`
    );
  }
  if (!paymentColSet.has('commission_snapshot_json')) {
    await executor.execute(
      `ALTER TABLE service_request_payments
       ADD COLUMN commission_snapshot_json LONGTEXT NULL AFTER commission_rate`
    );
  }
  if (!paymentColSet.has('promo_code')) {
    await executor.execute(
      `ALTER TABLE service_request_payments
       ADD COLUMN promo_code VARCHAR(40) NULL AFTER commission_snapshot_json`
    );
  }

  const [globalRuleRows] = (await executor.execute(
    `SELECT id_rule
     FROM commission_rules
     WHERE rule_type = 'global'
     ORDER BY priority ASC, id_rule ASC
     LIMIT 1`
  )) as [RowDataPacket[], any];

  if (globalRuleRows.length === 0) {
    await executor.execute(
      `INSERT INTO commission_rules (
         name,
         rule_type,
         adjustment_mode,
         rate_percent,
         priority,
         is_active,
         notes
       )
       VALUES (?, 'global', 'set_rate', ?, 10, 1, ?)`,
      ['Global platform fee', DEFAULT_COMMISSION_RATE, 'Default platform fee for service payments.']
    );
  }

  commissionTablesChecked = true;
};

export const calculateCommissionBreakdown = async (input: {
  amount: number;
  idService?: number | null;
  urgencyLevel?: CommissionUrgencyLevel | null;
  workerTier?: CommissionWorkerTier | null;
  promoCode?: string | null;
  executor?: SqlExecutor;
}): Promise<CommissionBreakdown> => {
  const executor = input.executor || pool;
  await ensureCommissionEngineTables(executor);

  const normalizedAmount = roundMoney(Math.max(0, Number(input.amount || 0)));
  const targetServiceId =
    input.idService != null && Number.isFinite(Number(input.idService))
      ? Number(input.idService)
      : null;
  const urgencyLevel = normalizeUrgencyLevel(input.urgencyLevel);
  const workerTier = normalizeWorkerTier(input.workerTier);
  const promoCode = normalizePromoCode(input.promoCode);

  const [rows] = (await executor.execute(
    `SELECT
       cr.id_rule,
       cr.name,
       cr.rule_type,
       cr.id_service,
       cr.urgency_level,
       cr.worker_tier,
       cr.promo_code,
       cr.adjustment_mode,
       cr.rate_percent,
       cr.priority,
       cr.is_active,
       cr.notes,
       s.name AS service_name
     FROM commission_rules cr
     LEFT JOIN services s ON s.id_service = cr.id_service
     WHERE cr.is_active = 1
       AND (
         cr.rule_type = 'global'
         OR (cr.rule_type = 'service' AND cr.id_service = ?)
         OR (cr.rule_type = 'urgency' AND cr.urgency_level = ?)
         OR (cr.rule_type = 'worker_tier' AND cr.worker_tier = ?)
         OR (cr.rule_type = 'promo' AND cr.promo_code = ?)
       )
     ORDER BY cr.priority ASC, cr.id_rule ASC`,
    [targetServiceId ?? -1, urgencyLevel, workerTier, promoCode || '__NO_PROMO__']
  )) as [CommissionRuleRow[], any];

  const appliedRules = rows.map(normalizeRule);
  let commissionRate = DEFAULT_COMMISSION_RATE;

  for (const rule of appliedRules) {
    commissionRate = applyRateAdjustment(commissionRate, rule.adjustment_mode, rule.rate_percent);
  }

  commissionRate = clampRate(commissionRate);
  const platformFee = roundMoney(normalizedAmount * commissionRate);
  const workerPayout = roundMoney(Math.max(0, normalizedAmount - platformFee));

  const labels = [
    appliedRules.some((rule) => rule.rule_type === 'service') ? 'Service override applied' : null,
    appliedRules.some((rule) => rule.rule_type === 'urgency') ? `${urgencyLevel} urgency adjustment` : null,
    appliedRules.some((rule) => rule.rule_type === 'worker_tier') ? `${workerTier} tier adjustment` : null,
    appliedRules.some((rule) => rule.rule_type === 'promo') ? `${promoCode} promo applied` : null,
  ].filter(Boolean);

  return {
    amount: normalizedAmount,
    commissionRate,
    platformFee,
    workerPayout,
    snapshot: {
      commission_rate: commissionRate,
      policy_label: labels.length > 0 ? labels.join(' | ') : 'Global default commission',
      context: {
        id_service: targetServiceId,
        urgency_level: urgencyLevel,
        worker_tier: workerTier,
        promo_code: promoCode || null,
      },
      applied_rules: appliedRules,
    },
  };
};

export const getCommissionRulesAdminConfig = async (): Promise<CommissionAdminConfig> => {
  await ensureCommissionEngineTables();

  const [rows] = await readCommissionRuleRows(pool);
  const activeGlobalRule = rows.find(
    (row) => row.rule_type === 'global' && Number(row.is_active) === 1
  );
  const normalizedGlobalRule = activeGlobalRule ? normalizeRule(activeGlobalRule) : null;

  const activeRows = rows
    .filter((row) => Number(row.is_active) === 1)
    .map(normalizeRule);

  const serviceOverrides = activeRows
    .filter((rule) => rule.rule_type === 'service')
    .map((rule) => ({
      id_rule: rule.id_rule,
      id_service: Number(rule.id_service),
      service_name: rule.service_name || null,
      rate_percent: Number((rule.rate_percent * 100).toFixed(2)),
      is_active: true,
      priority: rule.priority,
      adjustment_mode: rule.adjustment_mode,
    }));

  const urgencyAdjustments = activeRows
    .filter((rule) => rule.rule_type === 'urgency' && rule.urgency_level)
    .map((rule) => ({
      id_rule: rule.id_rule,
      urgency_level: rule.urgency_level as CommissionUrgencyLevel,
      rate_percent: Number((rule.rate_percent * 100).toFixed(2)),
      is_active: true,
      priority: rule.priority,
      adjustment_mode: rule.adjustment_mode,
    }));

  const workerTierAdjustments = activeRows
    .filter((rule) => rule.rule_type === 'worker_tier' && rule.worker_tier)
    .map((rule) => ({
      id_rule: rule.id_rule,
      worker_tier: rule.worker_tier as CommissionWorkerTier,
      rate_percent: Number((rule.rate_percent * 100).toFixed(2)),
      is_active: true,
      priority: rule.priority,
      adjustment_mode: rule.adjustment_mode,
    }));

  const promoCodes = activeRows
    .filter((rule) => rule.rule_type === 'promo' && rule.promo_code)
    .map((rule) => ({
      id_rule: rule.id_rule,
      promo_code: rule.promo_code as string,
      rate_percent: Number((rule.rate_percent * 100).toFixed(2)),
      is_active: true,
      priority: rule.priority,
      adjustment_mode: rule.adjustment_mode,
    }));

  return {
    global_rate_percent: Number((((normalizedGlobalRule?.rate_percent ?? DEFAULT_COMMISSION_RATE) * 100)).toFixed(2)),
    service_overrides: serviceOverrides,
    urgency_adjustments: urgencyAdjustments,
    worker_tier_adjustments: workerTierAdjustments,
    promo_codes: promoCodes,
    summary: {
      effective_default_rate_percent: Number((((normalizedGlobalRule?.rate_percent ?? DEFAULT_COMMISSION_RATE) * 100)).toFixed(2)),
      service_override_count: serviceOverrides.length,
      urgency_rule_count: urgencyAdjustments.length,
      worker_tier_rule_count: workerTierAdjustments.length,
      promo_rule_count: promoCodes.length,
    },
  };
};

const upsertTypedRules = async (
  connection: { execute: (sql: string, values?: any[]) => Promise<any> },
  ruleType: CommissionRuleType,
  rows: Array<{
    key: string;
    name: string;
    rate_percent: number;
    priority: number;
    id_service?: number | null;
    urgency_level?: CommissionUrgencyLevel | null;
    worker_tier?: CommissionWorkerTier | null;
    promo_code?: string | null;
    adjustment_mode: CommissionAdjustmentMode;
  }>
) => {
  const [existingRows] = (await connection.execute(
    `SELECT
       id_rule,
       id_service,
       urgency_level,
       worker_tier,
       promo_code
     FROM commission_rules
     WHERE rule_type = ?`,
    [ruleType]
  )) as [RowDataPacket[], any];

  const existingByKey = new Map<string, number>();
  for (const row of existingRows) {
    const key =
      ruleType === 'service'
        ? `service:${Number(row.id_service || 0)}`
        : ruleType === 'urgency'
          ? `urgency:${normalizeUrgencyLevel(row.urgency_level)}`
          : ruleType === 'worker_tier'
            ? `tier:${normalizeWorkerTier(row.worker_tier)}`
            : ruleType === 'promo'
              ? `promo:${normalizePromoCode(row.promo_code)}`
              : 'global';
    existingByKey.set(key, Number(row.id_rule));
  }

  await connection.execute(
    `UPDATE commission_rules
     SET is_active = 0,
         updated_at = CURRENT_TIMESTAMP
     WHERE rule_type = ?`,
    [ruleType]
  );

  for (const row of rows) {
    const existingId = existingByKey.get(row.key);
    const values = [
      row.name,
      row.id_service ?? null,
      row.urgency_level ?? null,
      row.worker_tier ?? null,
      row.promo_code ?? null,
      row.adjustment_mode,
      clampRate(Number(row.rate_percent || 0) / 100),
      row.priority,
    ];

    if (existingId) {
      await connection.execute(
        `UPDATE commission_rules
         SET name = ?,
             id_service = ?,
             urgency_level = ?,
             worker_tier = ?,
             promo_code = ?,
             adjustment_mode = ?,
             rate_percent = ?,
             priority = ?,
             is_active = 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id_rule = ?`,
        [...values, existingId]
      );
    } else {
      await connection.execute(
        `INSERT INTO commission_rules (
           name,
           rule_type,
           id_service,
           urgency_level,
           worker_tier,
           promo_code,
           adjustment_mode,
           rate_percent,
           priority,
           is_active
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [row.name, ruleType, ...values]
      );
    }
  }
};

export const updateCommissionRulesAdminConfig = async (input: {
  global_rate_percent: number;
  service_overrides?: CommissionAdminOverrideInput[];
  urgency_adjustments?: CommissionAdminUrgencyInput[];
  worker_tier_adjustments?: CommissionAdminTierInput[];
  promo_codes?: CommissionAdminPromoInput[];
}) => {
  await ensureCommissionEngineTables();

  const globalRate = clampRate(Number(input.global_rate_percent || 0) / 100);
  const serviceOverrides = Array.isArray(input.service_overrides)
    ? input.service_overrides
        .filter((override) => override && Number.isFinite(Number(override.id_service)))
        .map((override) => ({
          id_service: Math.max(1, Math.floor(Number(override.id_service))),
          rate_percent: Number(Number(override.rate_percent || 0).toFixed(2)),
          is_active: override.is_active !== false,
        }))
        .filter((override) => override.is_active)
    : [];

  const urgencyAdjustments = Array.isArray(input.urgency_adjustments)
    ? input.urgency_adjustments
        .map((item) => ({
          urgency_level: normalizeUrgencyLevel(item.urgency_level),
          rate_percent: Number(Number(item.rate_percent || 0).toFixed(2)),
          is_active: item.is_active !== false,
        }))
        .filter((item) => item.is_active)
    : [];

  const workerTierAdjustments = Array.isArray(input.worker_tier_adjustments)
    ? input.worker_tier_adjustments
        .map((item) => ({
          worker_tier: normalizeWorkerTier(item.worker_tier),
          rate_percent: Number(Number(item.rate_percent || 0).toFixed(2)),
          is_active: item.is_active !== false,
        }))
        .filter((item) => item.is_active)
    : [];

  const promoCodes = Array.isArray(input.promo_codes)
    ? input.promo_codes
        .map((item) => ({
          promo_code: normalizePromoCode(item.promo_code),
          rate_percent: Number(Number(item.rate_percent || 0).toFixed(2)),
          is_active: item.is_active !== false,
        }))
        .filter((item) => item.is_active && item.promo_code)
    : [];

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [globalRows] = (await connection.execute(
      `SELECT id_rule
       FROM commission_rules
       WHERE rule_type = 'global'
       ORDER BY priority ASC, id_rule ASC
       LIMIT 1`
    )) as [RowDataPacket[], any];

    if (globalRows.length === 0) {
      await connection.execute(
        `INSERT INTO commission_rules (
           name,
           rule_type,
           adjustment_mode,
           rate_percent,
           priority,
           is_active,
           notes
         )
         VALUES (?, 'global', 'set_rate', ?, 10, 1, ?)`,
        ['Global platform fee', globalRate, 'Default platform fee for service payments.']
      );
    } else {
      await connection.execute(
        `UPDATE commission_rules
         SET name = ?,
             adjustment_mode = 'set_rate',
             rate_percent = ?,
             priority = 10,
             is_active = 1,
             notes = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id_rule = ?`,
        ['Global platform fee', globalRate, 'Default platform fee for service payments.', Number(globalRows[0].id_rule)]
      );
    }

    await upsertTypedRules(
      connection,
      'service',
      serviceOverrides.map((override, index) => ({
        key: `service:${override.id_service}`,
        name: `Service ${override.id_service} override`,
        id_service: override.id_service,
        rate_percent: override.rate_percent,
        priority: 100 + index,
        adjustment_mode: 'set_rate',
      }))
    );

    await upsertTypedRules(
      connection,
      'urgency',
      urgencyAdjustments.map((item, index) => ({
        key: `urgency:${item.urgency_level}`,
        name: `${item.urgency_level} urgency adjustment`,
        urgency_level: item.urgency_level,
        rate_percent: item.rate_percent,
        priority: 200 + index,
        adjustment_mode: 'add_rate',
      }))
    );

    await upsertTypedRules(
      connection,
      'worker_tier',
      workerTierAdjustments.map((item, index) => ({
        key: `tier:${item.worker_tier}`,
        name: `${item.worker_tier} tier adjustment`,
        worker_tier: item.worker_tier,
        rate_percent: item.rate_percent,
        priority: 300 + index,
        adjustment_mode: 'subtract_rate',
      }))
    );

    await upsertTypedRules(
      connection,
      'promo',
      promoCodes.map((item, index) => ({
        key: `promo:${item.promo_code}`,
        name: `${item.promo_code} promo adjustment`,
        promo_code: item.promo_code,
        rate_percent: item.rate_percent,
        priority: 400 + index,
        adjustment_mode: 'subtract_rate',
      }))
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return getCommissionRulesAdminConfig();
};
