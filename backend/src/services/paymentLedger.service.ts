import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { getNextPayoutWeekday, getWorkerRewardsSettings } from '../utils/workerRewards';
import { isDatabaseSchemaReady } from './schemaState.service';

type SqlExecutor = {
  execute: (sql: string, values?: any[]) => Promise<any>;
};

type WorkerPayoutStatus = 'scheduled' | 'paid' | 'cancelled';
type LedgerEntryType =
  | 'customer_charge'
  | 'platform_fee'
  | 'worker_escrow'
  | 'worker_release'
  | 'worker_payout_paid'
  | 'bonus_payout_paid'
  | 'refund'
  | 'adjustment'
  | 'dispute_hold';

let paymentLedgerTablesChecked = false;

const toSqlDate = (date: Date) => date.toISOString().slice(0, 10);
const clampLimit = (value: unknown, fallback: number, max: number) => {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
};

const insertLedgerEntry = async (
  executor: SqlExecutor,
  input: {
    idRequest?: number | null;
    idPayment?: number | null;
    idWorkerProfile?: number | null;
    idWorkerPayout?: number | null;
    entryKey: string;
    entryType: LedgerEntryType;
    amount: number;
    currencyCode: string;
    entryStatus: 'posted' | 'scheduled' | 'cancelled';
    availableOn?: Date | null;
    metadata?: Record<string, any> | null;
  }
) => {
  await executor.execute(
    `INSERT INTO service_payment_ledger (
       id_request,
       id_payment,
       id_worker_profile,
       id_worker_payout,
       entry_key,
       entry_type,
       amount,
       currency_code,
       entry_status,
       available_on,
       metadata_json
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       amount = VALUES(amount),
       currency_code = VALUES(currency_code),
       entry_status = VALUES(entry_status),
       available_on = VALUES(available_on),
       metadata_json = VALUES(metadata_json),
       updated_at = CURRENT_TIMESTAMP`,
    [
      input.idRequest ?? null,
      input.idPayment ?? null,
      input.idWorkerProfile ?? null,
      input.idWorkerPayout ?? null,
      input.entryKey,
      input.entryType,
      Number(Number(input.amount || 0).toFixed(2)),
      String(input.currencyCode || 'USD').toUpperCase(),
      input.entryStatus,
      input.availableOn ? toSqlDate(input.availableOn) : null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ]
  );
};

export const recordLedgerEntry = async (input: {
  idRequest?: number | null;
  idPayment?: number | null;
  idWorkerProfile?: number | null;
  idWorkerPayout?: number | null;
  entryKey: string;
  entryType: LedgerEntryType;
  amount: number;
  currencyCode?: string | null;
  entryStatus?: 'posted' | 'scheduled' | 'cancelled';
  availableOn?: Date | null;
  metadata?: Record<string, any> | null;
}) => {
  await ensurePaymentLedgerTables();
  await insertLedgerEntry(pool, {
    idRequest: input.idRequest ?? null,
    idPayment: input.idPayment ?? null,
    idWorkerProfile: input.idWorkerProfile ?? null,
    idWorkerPayout: input.idWorkerPayout ?? null,
    entryKey: input.entryKey,
    entryType: input.entryType,
    amount: input.amount,
    currencyCode: String(input.currencyCode || 'USD').toUpperCase(),
    entryStatus: input.entryStatus || 'posted',
    availableOn: input.availableOn ?? null,
    metadata: input.metadata ?? null,
  });
};

export const ensurePaymentLedgerTables = async (executor: SqlExecutor = pool) => {
  if (paymentLedgerTablesChecked) return;
  if (isDatabaseSchemaReady()) {
    paymentLedgerTablesChecked = true;
    return;
  }

  await executor.execute(`
    CREATE TABLE IF NOT EXISTS worker_payouts (
      id_worker_payout INT NOT NULL AUTO_INCREMENT,
      id_worker_profile INT NOT NULL,
      id_request INT NULL,
      id_payment INT NULL,
      payout_key VARCHAR(80) NOT NULL,
      gross_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      platform_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      net_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      payout_status ENUM('scheduled', 'paid', 'cancelled') NOT NULL DEFAULT 'scheduled',
      scheduled_for DATE NOT NULL,
      paid_at TIMESTAMP NULL,
      notes VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_worker_payout),
      UNIQUE KEY uniq_worker_payout_key (payout_key),
      UNIQUE KEY uniq_worker_payout_request (id_request),
      KEY idx_worker_payout_worker_status (id_worker_profile, payout_status, scheduled_for),
      CONSTRAINT fk_worker_payout_profile FOREIGN KEY (id_worker_profile) REFERENCES worker_profiles(id_worker_profile) ON DELETE CASCADE,
      CONSTRAINT fk_worker_payout_request FOREIGN KEY (id_request) REFERENCES service_requests(id_request) ON DELETE CASCADE,
      CONSTRAINT fk_worker_payout_payment FOREIGN KEY (id_payment) REFERENCES service_request_payments(id_payment) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await executor.execute(`
    CREATE TABLE IF NOT EXISTS service_payment_ledger (
      id_ledger_entry INT NOT NULL AUTO_INCREMENT,
      id_request INT NOT NULL,
      id_payment INT NULL,
      id_worker_profile INT NULL,
      id_worker_payout INT NULL,
      entry_key VARCHAR(100) NOT NULL,
      entry_type ENUM('customer_charge', 'platform_fee', 'worker_escrow', 'worker_release', 'worker_payout_paid', 'bonus_payout_paid', 'refund', 'adjustment', 'dispute_hold') NOT NULL,
      amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      currency_code VARCHAR(8) NOT NULL DEFAULT 'USD',
      entry_status ENUM('posted', 'scheduled', 'cancelled') NOT NULL DEFAULT 'posted',
      available_on DATE NULL,
      metadata_json LONGTEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_ledger_entry),
      UNIQUE KEY uniq_payment_ledger_key (entry_key),
      KEY idx_payment_ledger_request_date (id_request, created_at),
      KEY idx_payment_ledger_worker_date (id_worker_profile, created_at),
      CONSTRAINT fk_payment_ledger_request FOREIGN KEY (id_request) REFERENCES service_requests(id_request) ON DELETE CASCADE,
      CONSTRAINT fk_payment_ledger_payment FOREIGN KEY (id_payment) REFERENCES service_request_payments(id_payment) ON DELETE SET NULL,
      CONSTRAINT fk_payment_ledger_worker_profile FOREIGN KEY (id_worker_profile) REFERENCES worker_profiles(id_worker_profile) ON DELETE SET NULL,
      CONSTRAINT fk_payment_ledger_worker_payout FOREIGN KEY (id_worker_payout) REFERENCES worker_payouts(id_worker_payout) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await executor.execute(`
    ALTER TABLE service_payment_ledger
    MODIFY COLUMN id_request INT NULL
  `);

  await executor.execute(`
    ALTER TABLE service_payment_ledger
    MODIFY COLUMN entry_type
    ENUM('customer_charge', 'platform_fee', 'worker_escrow', 'worker_release', 'worker_payout_paid', 'bonus_payout_paid', 'refund', 'adjustment', 'dispute_hold')
    NOT NULL
  `);

  paymentLedgerTablesChecked = true;
};

export const recordConfirmedPaymentLedger = async (
  executor: SqlExecutor,
  input: {
    idRequest: number;
    idPayment: number;
    idWorkerProfile?: number | null;
    amount: number;
    platformFee: number;
    workerPayout: number;
    currencyCode?: string | null;
    checkoutReference?: string | null;
    promoCode?: string | null;
    commissionSnapshot?: Record<string, any> | null;
  }
) => {
  await ensurePaymentLedgerTables(executor);

  const currencyCode = String(input.currencyCode || 'USD').toUpperCase();
  const metadata = {
    checkout_reference: input.checkoutReference || null,
    promo_code: input.promoCode || null,
    commission_snapshot: input.commissionSnapshot || null,
  };

  await insertLedgerEntry(executor, {
    idRequest: input.idRequest,
    idPayment: input.idPayment,
    idWorkerProfile: input.idWorkerProfile ?? null,
    entryKey: `customer-charge-${input.idRequest}`,
    entryType: 'customer_charge',
    amount: input.amount,
    currencyCode,
    entryStatus: 'posted',
    metadata,
  });

  await insertLedgerEntry(executor, {
    idRequest: input.idRequest,
    idPayment: input.idPayment,
    idWorkerProfile: input.idWorkerProfile ?? null,
    entryKey: `platform-fee-${input.idRequest}`,
    entryType: 'platform_fee',
    amount: input.platformFee,
    currencyCode,
    entryStatus: 'posted',
    metadata,
  });

  await insertLedgerEntry(executor, {
    idRequest: input.idRequest,
    idPayment: input.idPayment,
    idWorkerProfile: input.idWorkerProfile ?? null,
    entryKey: `worker-escrow-${input.idRequest}`,
    entryType: 'worker_escrow',
    amount: input.workerPayout,
    currencyCode,
    entryStatus: 'posted',
    metadata,
  });
};

export const scheduleWorkerPayoutForReleasedRequest = async (
  executor: SqlExecutor,
  input: {
    idRequest: number;
    idPayment: number;
    idWorkerProfile: number;
    grossAmount: number;
    platformFee: number;
    netAmount: number;
    currencyCode?: string | null;
    releasedAt?: Date;
  }
) => {
  await ensurePaymentLedgerTables(executor);
  const settings = await getWorkerRewardsSettings();
  const releaseDate = input.releasedAt || new Date();
  const scheduledFor = getNextPayoutWeekday(releaseDate, settings.payout_weekday);
  const payoutKey = `worker-request-${input.idRequest}`;

  await executor.execute(
    `INSERT INTO worker_payouts (
       id_worker_profile,
       id_request,
       id_payment,
       payout_key,
       gross_amount,
       platform_fee,
       net_amount,
       payout_status,
       scheduled_for,
       notes
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)
     ON DUPLICATE KEY UPDATE
       id_payment = VALUES(id_payment),
       gross_amount = VALUES(gross_amount),
       platform_fee = VALUES(platform_fee),
       net_amount = VALUES(net_amount),
       payout_status = CASE WHEN payout_status = 'paid' THEN payout_status ELSE 'scheduled' END,
       scheduled_for = VALUES(scheduled_for),
       notes = VALUES(notes),
       updated_at = CURRENT_TIMESTAMP`,
    [
      input.idWorkerProfile,
      input.idRequest,
      input.idPayment,
      payoutKey,
      Number(Number(input.grossAmount || 0).toFixed(2)),
      Number(Number(input.platformFee || 0).toFixed(2)),
      Number(Number(input.netAmount || 0).toFixed(2)),
      toSqlDate(scheduledFor),
      'Base worker payout for released request funds.',
    ]
  );

  const [payoutRows] = (await executor.execute(
    `SELECT
       id_worker_payout,
       id_worker_profile,
       id_request,
       id_payment,
       gross_amount,
       platform_fee,
       net_amount,
       payout_status,
       scheduled_for,
       paid_at,
       notes
     FROM worker_payouts
     WHERE id_request = ?
     LIMIT 1`,
    [input.idRequest]
  )) as [RowDataPacket[], any];
  const payoutRow = payoutRows[0];

  await insertLedgerEntry(executor, {
    idRequest: input.idRequest,
    idPayment: input.idPayment,
    idWorkerProfile: input.idWorkerProfile,
    idWorkerPayout: Number(payoutRow?.id_worker_payout || 0) || null,
    entryKey: `worker-release-${input.idRequest}`,
    entryType: 'worker_release',
    amount: input.netAmount,
    currencyCode: String(input.currencyCode || 'USD').toUpperCase(),
    entryStatus: 'scheduled',
    availableOn: scheduledFor,
    metadata: {
      payout_key: payoutKey,
      payout_status: payoutRow?.payout_status || 'scheduled',
    },
  });

  return payoutRow
    ? {
        id_worker_payout: Number(payoutRow.id_worker_payout),
        id_worker_profile: Number(payoutRow.id_worker_profile),
        id_request: Number(payoutRow.id_request),
        id_payment: payoutRow.id_payment != null ? Number(payoutRow.id_payment) : null,
        gross_amount: Number(payoutRow.gross_amount || 0),
        platform_fee: Number(payoutRow.platform_fee || 0),
        net_amount: Number(payoutRow.net_amount || 0),
        payout_status: String(payoutRow.payout_status || 'scheduled') as WorkerPayoutStatus,
        scheduled_for: payoutRow.scheduled_for,
        paid_at: payoutRow.paid_at || null,
        notes: payoutRow.notes || null,
      }
    : null;
};

export const markWorkerPayoutAsPaid = async (idWorkerPayout: number) => {
  await ensurePaymentLedgerTables();

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       id_worker_payout,
       id_worker_profile,
       id_request,
       id_payment,
       net_amount,
       payout_status
     FROM worker_payouts
     WHERE id_worker_payout = ?
     LIMIT 1`,
    [idWorkerPayout]
  );
  const payoutRow = rows[0];
  if (!payoutRow || String(payoutRow.payout_status || '').toLowerCase() !== 'scheduled') {
    return null;
  }

  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE worker_payouts
     SET payout_status = 'paid',
         paid_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id_worker_payout = ?
       AND payout_status = 'scheduled'`,
    [idWorkerPayout]
  );

  if (result.affectedRows === 0) return null;

  await insertLedgerEntry(pool, {
    idRequest: Number(payoutRow.id_request),
    idPayment: payoutRow.id_payment != null ? Number(payoutRow.id_payment) : null,
    idWorkerProfile: payoutRow.id_worker_profile != null ? Number(payoutRow.id_worker_profile) : null,
    idWorkerPayout: Number(payoutRow.id_worker_payout),
    entryKey: `worker-payout-paid-${idWorkerPayout}`,
    entryType: 'worker_payout_paid',
    amount: Number(payoutRow.net_amount || 0),
    currencyCode: 'USD',
    entryStatus: 'posted',
    metadata: {
      payout_status: 'paid',
    },
  });

  return {
    id_worker_payout: Number(payoutRow.id_worker_payout),
    id_worker_profile: Number(payoutRow.id_worker_profile),
    id_request: Number(payoutRow.id_request),
    id_payment: payoutRow.id_payment != null ? Number(payoutRow.id_payment) : null,
    net_amount: Number(payoutRow.net_amount || 0),
  };
};

export const recordBonusPayoutPaidLedger = async (input: {
  idBonusPayout: number;
  idWorkerProfile: number;
  idRequest?: number | null;
  amount: number;
  currencyCode?: string;
}) => {
  await ensurePaymentLedgerTables();
  await insertLedgerEntry(pool, {
    idRequest: input.idRequest != null ? Number(input.idRequest) : null,
    idWorkerProfile: input.idWorkerProfile,
    entryKey: `bonus-payout-paid-${input.idBonusPayout}`,
    entryType: 'bonus_payout_paid',
    amount: input.amount,
    currencyCode: String(input.currencyCode || 'USD').toUpperCase(),
    entryStatus: 'posted',
    metadata: {
      id_bonus_payout: input.idBonusPayout,
    },
  });
};

export const getWorkerPayouts = async (profileId: number) => {
  await ensurePaymentLedgerTables();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       id_worker_payout,
       id_worker_profile,
       id_request,
       id_payment,
       gross_amount,
       platform_fee,
       net_amount,
       payout_status,
       scheduled_for,
       paid_at,
       notes
     FROM worker_payouts
     WHERE id_worker_profile = ?
     ORDER BY scheduled_for ASC, id_worker_payout ASC`,
    [profileId]
  );
  return rows;
};

export const getAllWorkerPayoutsForAdmin = async (status = 'all') => {
  await ensurePaymentLedgerTables();
  const params: any[] = [];
  const whereParts = ['1=1'];
  if (String(status || 'all').toLowerCase() !== 'all') {
    whereParts.push('wpayout.payout_status = ?');
    params.push(String(status).toLowerCase());
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       wpayout.id_worker_payout,
       wpayout.id_worker_profile,
       wpayout.id_request,
       wpayout.id_payment,
       wpayout.gross_amount,
       wpayout.platform_fee,
       wpayout.net_amount,
       wpayout.payout_status,
       wpayout.scheduled_for,
       wpayout.paid_at,
       wpayout.notes,
       wp.id_user,
       u.name,
       u.lastname,
       sr.location_text,
       s.name AS service_name
     FROM worker_payouts wpayout
     INNER JOIN worker_profiles wp ON wp.id_worker_profile = wpayout.id_worker_profile
     INNER JOIN users u ON u.id_user = wp.id_user
     LEFT JOIN service_requests sr ON sr.id_request = wpayout.id_request
     LEFT JOIN services s ON s.id_service = sr.id_service
     WHERE ${whereParts.join(' AND ')}
     ORDER BY
       CASE WHEN wpayout.payout_status = 'scheduled' THEN 0 WHEN wpayout.payout_status = 'paid' THEN 1 ELSE 2 END,
       wpayout.scheduled_for ASC,
       wpayout.id_worker_payout ASC`,
    params
  );
  return rows;
};

export const getRecentPaymentLedger = async (limit = 40) => {
  await ensurePaymentLedgerTables();
  const safeLimit = clampLimit(limit, 40, 100);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       spl.id_ledger_entry,
       spl.id_request,
       spl.id_payment,
       spl.id_worker_profile,
       spl.id_worker_payout,
       spl.entry_key,
       spl.entry_type,
       spl.amount,
       spl.currency_code,
       spl.entry_status,
       spl.available_on,
       spl.metadata_json,
       spl.created_at,
       sr.location_text,
       s.name AS service_name
     FROM service_payment_ledger spl
     LEFT JOIN service_requests sr ON sr.id_request = spl.id_request
     LEFT JOIN services s ON s.id_service = sr.id_service
     ORDER BY spl.created_at DESC, spl.id_ledger_entry DESC
     LIMIT ${safeLimit}`
  );
  return rows;
};
