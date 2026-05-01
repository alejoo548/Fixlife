import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { ensurePaymentLedgerTables, recordLedgerEntry } from './paymentLedger.service';

export type FinanceCaseType = 'refund' | 'dispute' | 'adjustment';
export type FinanceCaseStatus = 'open' | 'resolved' | 'cancelled';
export type FinanceCaseDirection =
  | 'customer_refund'
  | 'platform_credit'
  | 'platform_debit'
  | 'worker_hold'
  | 'worker_release';

type FinanceCaseRow = RowDataPacket & {
  id_case: number;
  case_type: FinanceCaseType;
  case_status: FinanceCaseStatus;
  direction: FinanceCaseDirection;
  id_request: number | null;
  id_payment: number | null;
  amount: number;
  currency_code: string;
  reason: string | null;
  notes: string | null;
  created_by_user_id: number | null;
  resolved_by_user_id: number | null;
  created_at: string;
  resolved_at: string | null;
  service_name: string | null;
  location_text: string | null;
};

let financeOperationsTablesChecked = false;

const toSqlDateTime = (date: Date) => date.toISOString().slice(0, 19).replace('T', ' ');

export const ensureFinanceOperationsTables = async () => {
  if (financeOperationsTablesChecked) return;

  await ensurePaymentLedgerTables();
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS finance_cases (
      id_case INT NOT NULL AUTO_INCREMENT,
      case_type ENUM('refund', 'dispute', 'adjustment') NOT NULL,
      case_status ENUM('open', 'resolved', 'cancelled') NOT NULL DEFAULT 'open',
      direction ENUM('customer_refund', 'platform_credit', 'platform_debit', 'worker_hold', 'worker_release') NOT NULL,
      id_request INT NULL,
      id_payment INT NULL,
      amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      currency_code VARCHAR(8) NOT NULL DEFAULT 'USD',
      reason VARCHAR(255) NULL,
      notes TEXT NULL,
      created_by_user_id INT NULL,
      resolved_by_user_id INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMP NULL,
      PRIMARY KEY (id_case),
      KEY idx_finance_cases_status_created (case_status, created_at),
      KEY idx_finance_cases_type_created (case_type, created_at),
      CONSTRAINT fk_finance_cases_request FOREIGN KEY (id_request) REFERENCES service_requests(id_request) ON DELETE SET NULL,
      CONSTRAINT fk_finance_cases_payment FOREIGN KEY (id_payment) REFERENCES service_request_payments(id_payment) ON DELETE SET NULL,
      CONSTRAINT fk_finance_cases_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id_user) ON DELETE SET NULL,
      CONSTRAINT fk_finance_cases_resolved_by FOREIGN KEY (resolved_by_user_id) REFERENCES users(id_user) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  financeOperationsTablesChecked = true;
};

export const createFinanceCase = async (input: {
  caseType: FinanceCaseType;
  direction: FinanceCaseDirection;
  idRequest?: number | null;
  idPayment?: number | null;
  amount: number;
  currencyCode?: string | null;
  reason?: string | null;
  notes?: string | null;
  createdByUserId?: number | null;
}) => {
  await ensureFinanceOperationsTables();
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO finance_cases (
       case_type,
       case_status,
       direction,
       id_request,
       id_payment,
       amount,
       currency_code,
       reason,
       notes,
       created_by_user_id
     )
     VALUES (?, 'open', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.caseType,
      input.direction,
      input.idRequest ?? null,
      input.idPayment ?? null,
      Number(Number(input.amount || 0).toFixed(2)),
      String(input.currencyCode || 'USD').toUpperCase(),
      input.reason ? String(input.reason).slice(0, 255) : null,
      input.notes ? String(input.notes).slice(0, 2000) : null,
      input.createdByUserId ?? null,
    ]
  );

  return result.insertId;
};

const toLedgerAmount = (input: {
  caseType: FinanceCaseType;
  direction: FinanceCaseDirection;
  amount: number;
}) => {
  const absoluteAmount = Math.abs(Number(input.amount || 0));
  if (input.caseType === 'refund' || input.direction === 'customer_refund') {
    return -absoluteAmount;
  }
  if (input.direction === 'platform_debit' || input.direction === 'worker_hold') {
    return -absoluteAmount;
  }
  return absoluteAmount;
};

export const resolveFinanceCase = async (input: {
  idCase: number;
  resolvedByUserId?: number | null;
  resolutionNotes?: string | null;
  applyLedger?: boolean;
}) => {
  await ensureFinanceOperationsTables();

  const [rows] = await pool.execute<FinanceCaseRow[]>(
    `SELECT id_case, case_type, case_status, direction, id_request, id_payment, amount, currency_code, reason, notes, created_by_user_id, resolved_by_user_id, created_at, resolved_at
     FROM finance_cases
     WHERE id_case = ?
     LIMIT 1`,
    [input.idCase]
  );
  const caseRow = rows[0];
  if (!caseRow || String(caseRow.case_status || '').toLowerCase() !== 'open') {
    return null;
  }

  await pool.execute(
    `UPDATE finance_cases
     SET case_status = 'resolved',
         resolved_by_user_id = ?,
         resolved_at = CURRENT_TIMESTAMP,
         notes = CASE
           WHEN ? IS NULL OR ? = '' THEN notes
           WHEN notes IS NULL OR notes = '' THEN ?
           ELSE CONCAT(notes, '\n', ?)
         END
     WHERE id_case = ?`,
    [
      input.resolvedByUserId ?? null,
      input.resolutionNotes ?? null,
      input.resolutionNotes ?? null,
      input.resolutionNotes ? String(input.resolutionNotes).slice(0, 1500) : null,
      input.resolutionNotes ? String(input.resolutionNotes).slice(0, 1500) : null,
      input.idCase,
    ]
  );

  if (input.applyLedger !== false && caseRow.id_request != null) {
    const entryType =
      caseRow.case_type === 'refund'
        ? 'refund'
        : caseRow.case_type === 'dispute'
          ? 'dispute_hold'
          : 'adjustment';

    await recordLedgerEntry({
      idRequest: Number(caseRow.id_request),
      idPayment: caseRow.id_payment != null ? Number(caseRow.id_payment) : null,
      entryKey: `finance-case-${Number(caseRow.id_case)}`,
      entryType,
      amount: toLedgerAmount({
        caseType: caseRow.case_type,
        direction: caseRow.direction,
        amount: Number(caseRow.amount || 0),
      }),
      currencyCode: String(caseRow.currency_code || 'USD').toUpperCase(),
      entryStatus: 'posted',
      metadata: {
        id_case: Number(caseRow.id_case),
        case_type: caseRow.case_type,
        direction: caseRow.direction,
        reason: caseRow.reason || null,
      },
    });

    if (caseRow.case_type === 'refund' && caseRow.id_payment != null) {
      await pool.execute(
        `UPDATE service_request_payments
         SET payment_status = 'refunded',
             updated_at = CURRENT_TIMESTAMP
         WHERE id_payment = ?`,
        [Number(caseRow.id_payment)]
      );
    }
  }

  return {
    id_case: Number(caseRow.id_case),
    case_type: caseRow.case_type,
    case_status: 'resolved' as const,
  };
};

export const getFinanceCases = async (input?: {
  status?: string | null;
  caseType?: string | null;
  limit?: number;
}) => {
  await ensureFinanceOperationsTables();

  const whereParts = ['1=1'];
  const params: any[] = [];
  if (input?.status && input.status !== 'all') {
    whereParts.push('fc.case_status = ?');
    params.push(String(input.status).toLowerCase());
  }
  if (input?.caseType && input.caseType !== 'all') {
    whereParts.push('fc.case_type = ?');
    params.push(String(input.caseType).toLowerCase());
  }

  const safeLimit = Math.max(1, Math.min(Number(input?.limit || 40), 100));
  const [rows] = await pool.execute<FinanceCaseRow[]>(
    `SELECT
       fc.id_case,
       fc.case_type,
       fc.case_status,
       fc.direction,
       fc.id_request,
       fc.id_payment,
       fc.amount,
       fc.currency_code,
       fc.reason,
       fc.notes,
       fc.created_by_user_id,
       fc.resolved_by_user_id,
       fc.created_at,
       fc.resolved_at,
       s.name AS service_name,
       sr.location_text
     FROM finance_cases fc
     LEFT JOIN service_requests sr ON sr.id_request = fc.id_request
     LEFT JOIN services s ON s.id_service = sr.id_service
     WHERE ${whereParts.join(' AND ')}
     ORDER BY fc.created_at DESC, fc.id_case DESC
     LIMIT ${safeLimit}`,
    params
  );

  return rows.map((row) => ({
    id_case: Number(row.id_case),
    case_type: row.case_type,
    case_status: row.case_status,
    direction: row.direction,
    id_request: row.id_request != null ? Number(row.id_request) : null,
    id_payment: row.id_payment != null ? Number(row.id_payment) : null,
    amount: Number(row.amount || 0),
    currency_code: String(row.currency_code || 'USD'),
    reason: row.reason || null,
    notes: row.notes || null,
    created_by_user_id: row.created_by_user_id != null ? Number(row.created_by_user_id) : null,
    resolved_by_user_id: row.resolved_by_user_id != null ? Number(row.resolved_by_user_id) : null,
    created_at: row.created_at,
    resolved_at: row.resolved_at || null,
    service_name: row.service_name || null,
    location_text: row.location_text || null,
  }));
};

export const getFinanceClosureReport = async (input: {
  period: 'weekly' | 'monthly';
  from?: unknown;
  to?: unknown;
}) => {
  await ensureFinanceOperationsTables();
  const period = input.period === 'weekly' ? 'weekly' : 'monthly';
  const from = input.from ? new Date(String(input.from)) : new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
  const to = input.to ? new Date(String(input.to)) : new Date();
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error('Invalid finance closure date range.');
  }
  const fromSql = toSqlDateTime(new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0));
  const toSql = toSqlDateTime(new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59));
  const periodExpr =
    period === 'weekly'
      ? `DATE_FORMAT(DATE_SUB(DATE(created_at), INTERVAL WEEKDAY(created_at) DAY), '%Y-%m-%d')`
      : `DATE_FORMAT(created_at, '%Y-%m')`;

  const [periodRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       ${periodExpr} AS period_key,
       COALESCE(SUM(CASE WHEN entry_type = 'customer_charge' AND entry_status != 'cancelled' THEN amount ELSE 0 END), 0) AS gross_volume,
       COALESCE(SUM(CASE WHEN entry_type = 'platform_fee' AND entry_status != 'cancelled' THEN amount ELSE 0 END), 0) AS platform_fee,
       COALESCE(SUM(CASE WHEN entry_type IN ('refund', 'adjustment', 'dispute_hold') AND entry_status != 'cancelled' THEN amount ELSE 0 END), 0) AS adjustments_total,
       COALESCE(SUM(CASE WHEN entry_type IN ('worker_release', 'worker_payout_paid', 'bonus_payout_paid') AND entry_status != 'cancelled' THEN amount ELSE 0 END), 0) AS worker_settlement_total
     FROM service_payment_ledger
     WHERE created_at >= ?
       AND created_at <= ?
     GROUP BY ${periodExpr}
     ORDER BY MIN(created_at) ASC`,
    [fromSql, toSql]
  );

  const [discrepancyRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       srp.id_payment,
       srp.id_request,
       srp.amount AS expected_amount,
       srp.platform_fee AS expected_platform_fee,
       srp.worker_payout AS expected_worker_payout,
       COALESCE(SUM(CASE WHEN spl.entry_type = 'customer_charge' AND spl.entry_status != 'cancelled' THEN spl.amount ELSE 0 END), 0) AS ledger_customer_charge,
       COALESCE(SUM(CASE WHEN spl.entry_type = 'platform_fee' AND spl.entry_status != 'cancelled' THEN spl.amount ELSE 0 END), 0) AS ledger_platform_fee,
       COALESCE(SUM(CASE WHEN spl.entry_type IN ('worker_release', 'worker_payout_paid') AND spl.entry_status != 'cancelled' THEN spl.amount ELSE 0 END), 0) AS ledger_worker_release
     FROM service_request_payments srp
     LEFT JOIN service_payment_ledger spl ON spl.id_payment = srp.id_payment
     WHERE srp.created_at >= ?
       AND srp.created_at <= ?
     GROUP BY srp.id_payment, srp.id_request, srp.amount, srp.platform_fee, srp.worker_payout
     HAVING
       ABS(expected_amount - ledger_customer_charge) >= 0.01
       OR ABS(expected_platform_fee - ledger_platform_fee) >= 0.01
       OR ABS(expected_worker_payout - ledger_worker_release) >= 0.01
     ORDER BY srp.created_at DESC, srp.id_payment DESC
     LIMIT 25`,
    [fromSql, toSql]
  );

  const [openCasesRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM finance_cases
     WHERE case_status = 'open'`
  );

  const periods = periodRows.map((row) => {
    const grossVolume = Number(row.gross_volume || 0);
    const platformFee = Number(row.platform_fee || 0);
    const adjustmentsTotal = Number(row.adjustments_total || 0);
    const workerSettlementTotal = Number(row.worker_settlement_total || 0);
    return {
      period_key: String(row.period_key || ''),
      gross_volume: grossVolume,
      platform_fee: platformFee,
      adjustments_total: adjustmentsTotal,
      worker_settlement_total: workerSettlementTotal,
      net_platform: Number((platformFee + adjustmentsTotal).toFixed(2)),
    };
  });

  return {
    range: {
      from: fromSql.slice(0, 10),
      to: toSql.slice(0, 10),
      period,
    },
    summary: {
      gross_volume: Number(periods.reduce((sum, row) => sum + row.gross_volume, 0).toFixed(2)),
      platform_fee: Number(periods.reduce((sum, row) => sum + row.platform_fee, 0).toFixed(2)),
      adjustments_total: Number(periods.reduce((sum, row) => sum + row.adjustments_total, 0).toFixed(2)),
      worker_settlement_total: Number(periods.reduce((sum, row) => sum + row.worker_settlement_total, 0).toFixed(2)),
      net_platform: Number(periods.reduce((sum, row) => sum + row.net_platform, 0).toFixed(2)),
      discrepancy_count: discrepancyRows.length,
      open_case_count: Number(openCasesRows[0]?.total || 0),
    },
    periods,
    discrepancies: discrepancyRows.map((row) => ({
      id_payment: Number(row.id_payment),
      id_request: Number(row.id_request),
      expected_amount: Number(row.expected_amount || 0),
      expected_platform_fee: Number(row.expected_platform_fee || 0),
      expected_worker_payout: Number(row.expected_worker_payout || 0),
      ledger_customer_charge: Number(row.ledger_customer_charge || 0),
      ledger_platform_fee: Number(row.ledger_platform_fee || 0),
      ledger_worker_release: Number(row.ledger_worker_release || 0),
    })),
  };
};
