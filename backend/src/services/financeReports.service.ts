import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { buildInvoiceNumber } from './requestPayments.service';
import { ensurePaymentLedgerTables } from './paymentLedger.service';

type LedgerReportRow = RowDataPacket & {
  id_ledger_entry: number;
  id_request: number | null;
  id_payment: number | null;
  id_worker_profile: number | null;
  id_worker_payout: number | null;
  entry_key: string;
  entry_type: string;
  amount: number;
  currency_code: string;
  entry_status: string;
  available_on: string | null;
  metadata_json: string | null;
  created_at: string;
  service_name: string | null;
  location_text: string | null;
  checkout_reference: string | null;
  provider: string | null;
  payment_amount: number | null;
  platform_fee: number | null;
  worker_payout: number | null;
  commission_rate: number | null;
  promo_code: string | null;
};

type InvoiceReportRow = RowDataPacket & {
  id_request: number;
  id_payment: number;
  paid_at: string;
  service_name: string | null;
  location_text: string | null;
  urgency_level: string | null;
  customer_name: string | null;
  customer_lastname: string | null;
  customer_email: string | null;
  provider: string | null;
  checkout_reference: string | null;
  amount: number | null;
  platform_fee: number | null;
  worker_payout: number | null;
  currency_code: string | null;
  commission_rate: number | null;
  promo_code: string | null;
  commission_snapshot_json: string | null;
};

type FinanceRange = {
  from: string;
  to: string;
  fromSql: string;
  toExclusiveSql: string;
  days: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const toDateInput = (date: Date) => date.toISOString().slice(0, 10);
const toSqlStart = (value: string) => `${value} 00:00:00`;
const toSqlExclusiveEnd = (value: string) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return `${toDateInput(new Date(date.getTime() + DAY_MS))} 00:00:00`;
};

const parseDateInput = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : raw;
};

export const resolveFinanceReportRange = (input: { from?: unknown; to?: unknown }): FinanceRange => {
  const today = new Date();
  const fallbackTo = toDateInput(today);
  const fallbackFrom = toDateInput(new Date(today.getTime() - 29 * DAY_MS));

  let from = parseDateInput(input.from) || fallbackFrom;
  let to = parseDateInput(input.to) || fallbackTo;

  if (from > to) {
    const swap = from;
    from = to;
    to = swap;
  }

  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);
  const days = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / DAY_MS) + 1);

  if (days > 366) {
    from = toDateInput(new Date(toDate.getTime() - 365 * DAY_MS));
  }

  const normalizedFromDate = new Date(`${from}T00:00:00.000Z`);
  const normalizedToDate = new Date(`${to}T00:00:00.000Z`);
  const normalizedDays = Math.max(
    1,
    Math.round((normalizedToDate.getTime() - normalizedFromDate.getTime()) / DAY_MS) + 1
  );

  return {
    from,
    to,
    fromSql: toSqlStart(from),
    toExclusiveSql: toSqlExclusiveEnd(to),
    days: normalizedDays,
  };
};

const escapeCsvValue = (value: unknown) => {
  const normalized = String(value ?? '');
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
};

const formatMoney = (value: unknown) => Number(Number(value || 0).toFixed(2));

export const getFinanceSettlementReport = async (input: { from?: unknown; to?: unknown }) => {
  await ensurePaymentLedgerTables();
  const range = resolveFinanceReportRange(input);

  const [ledgerRows] = await pool.execute<LedgerReportRow[]>(
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
       s.name AS service_name,
       sr.location_text,
       srp.checkout_reference,
       srp.provider,
       srp.amount AS payment_amount,
       srp.platform_fee,
       srp.worker_payout,
       srp.commission_rate,
       srp.promo_code
     FROM service_payment_ledger spl
     LEFT JOIN service_requests sr ON sr.id_request = spl.id_request
     LEFT JOIN services s ON s.id_service = sr.id_service
     LEFT JOIN service_request_payments srp ON srp.id_payment = spl.id_payment
     WHERE spl.created_at >= ?
       AND spl.created_at < ?
     ORDER BY spl.created_at DESC, spl.id_ledger_entry DESC`,
    [range.fromSql, range.toExclusiveSql]
  );

  const [invoiceRows] = await pool.execute<InvoiceReportRow[]>(
    `SELECT
       srp.id_payment,
       srp.id_request,
       srp.paid_at,
       s.name AS service_name,
       sr.location_text,
       sr.urgency_level,
       cu.name AS customer_name,
       cu.lastname AS customer_lastname,
       cu.email AS customer_email,
       srp.provider,
       srp.checkout_reference,
       srp.amount,
       srp.platform_fee,
       srp.worker_payout,
       srp.currency_code,
       srp.commission_rate,
       srp.promo_code,
       srp.commission_snapshot_json
     FROM service_request_payments srp
     INNER JOIN service_requests sr ON sr.id_request = srp.id_request
     INNER JOIN services s ON s.id_service = sr.id_service
     LEFT JOIN users cu ON cu.id_user = sr.id_user
     WHERE srp.paid_at IS NOT NULL
       AND srp.paid_at >= ?
       AND srp.paid_at < ?
     ORDER BY srp.paid_at DESC, srp.id_payment DESC
     LIMIT 25`,
    [range.fromSql, range.toExclusiveSql]
  );

  const summary = ledgerRows.reduce(
    (acc, row) => {
      const amount = formatMoney(row.amount);
      acc.ledger_rows += 1;

      if (row.entry_type === 'customer_charge') acc.gross_volume += amount;
      if (row.entry_type === 'platform_fee') acc.platform_revenue += amount;
      if (row.entry_type === 'worker_escrow') acc.worker_escrow += amount;
      if (row.entry_type === 'worker_release') acc.worker_released += amount;
      if (row.entry_type === 'worker_payout_paid') acc.worker_paid += amount;
      if (row.entry_type === 'bonus_payout_paid') acc.bonus_paid += amount;
      if (row.entry_status === 'scheduled') acc.scheduled_settlement_total += amount;

      return acc;
    },
    {
      ledger_rows: 0,
      gross_volume: 0,
      platform_revenue: 0,
      worker_escrow: 0,
      worker_released: 0,
      worker_paid: 0,
      bonus_paid: 0,
      scheduled_settlement_total: 0,
    }
  );

  const serviceBuckets = new Map<
    string,
    { service_name: string; gross_volume: number; platform_revenue: number; settled_payouts: number; invoices: number }
  >();

  ledgerRows.forEach((row) => {
    const serviceName = String(row.service_name || 'Unassigned service');
    const bucket =
      serviceBuckets.get(serviceName) || {
        service_name: serviceName,
        gross_volume: 0,
        platform_revenue: 0,
        settled_payouts: 0,
        invoices: 0,
      };

    const amount = formatMoney(row.amount);
    if (row.entry_type === 'customer_charge') {
      bucket.gross_volume += amount;
      bucket.invoices += 1;
    }
    if (row.entry_type === 'platform_fee') bucket.platform_revenue += amount;
    if (row.entry_type === 'worker_payout_paid') bucket.settled_payouts += amount;

    serviceBuckets.set(serviceName, bucket);
  });

  return {
    range: {
      from: range.from,
      to: range.to,
      days: range.days,
    },
    summary: {
      ledger_rows: summary.ledger_rows,
      gross_volume: formatMoney(summary.gross_volume),
      platform_revenue: formatMoney(summary.platform_revenue),
      worker_escrow: formatMoney(summary.worker_escrow),
      worker_released: formatMoney(summary.worker_released),
      worker_paid: formatMoney(summary.worker_paid),
      bonus_paid: formatMoney(summary.bonus_paid),
      scheduled_settlement_total: formatMoney(summary.scheduled_settlement_total),
      invoice_count: invoiceRows.length,
    },
    service_breakdown: [...serviceBuckets.values()]
      .map((bucket) => ({
        ...bucket,
        gross_volume: formatMoney(bucket.gross_volume),
        platform_revenue: formatMoney(bucket.platform_revenue),
        settled_payouts: formatMoney(bucket.settled_payouts),
      }))
      .sort((left, right) => right.gross_volume - left.gross_volume)
      .slice(0, 8),
    invoices: invoiceRows.map((row) => {
      let policyLabel: string | null = null;
      try {
        const parsed = row.commission_snapshot_json ? JSON.parse(String(row.commission_snapshot_json)) : null;
        policyLabel = parsed?.policy_label ? String(parsed.policy_label) : null;
      } catch {
        policyLabel = null;
      }

      return {
        invoice_number: buildInvoiceNumber(Number(row.id_request)),
        id_request: Number(row.id_request),
        id_payment: Number(row.id_payment),
        paid_at: row.paid_at,
        service_name: row.service_name || 'Service',
        location_text: row.location_text || null,
        urgency_level: row.urgency_level || 'standard',
        customer_name: `${row.customer_name || ''} ${row.customer_lastname || ''}`.trim() || 'Customer',
        customer_email: row.customer_email || null,
        provider: row.provider || 'paypal',
        checkout_reference: row.checkout_reference || null,
        amount: formatMoney(row.amount),
        platform_fee: formatMoney(row.platform_fee),
        worker_payout: formatMoney(row.worker_payout),
        currency_code: row.currency_code || 'USD',
        commission_rate_percent: Number((Number(row.commission_rate || 0) * 100).toFixed(2)),
        promo_code: row.promo_code || null,
        policy_label: policyLabel,
      };
    }),
    export_rows: ledgerRows.map((row) => ({
      created_at: row.created_at,
      available_on: row.available_on || '',
      invoice_number: row.id_request != null ? buildInvoiceNumber(Number(row.id_request)) : '',
      request_id: row.id_request != null ? Number(row.id_request) : '',
      payment_id: row.id_payment != null ? Number(row.id_payment) : '',
      service_name: row.service_name || '',
      location_text: row.location_text || '',
      provider: row.provider || '',
      checkout_reference: row.checkout_reference || '',
      entry_type: row.entry_type,
      entry_status: row.entry_status,
      currency_code: row.currency_code || 'USD',
      amount: formatMoney(row.amount),
      payment_amount: formatMoney(row.payment_amount),
      platform_fee: formatMoney(row.platform_fee),
      worker_payout: formatMoney(row.worker_payout),
      commission_rate_percent: Number((Number(row.commission_rate || 0) * 100).toFixed(2)),
      promo_code: row.promo_code || '',
    })),
  };
};

export const buildFinanceSettlementCsv = (report: Awaited<ReturnType<typeof getFinanceSettlementReport>>) => {
  const lines: string[] = [];

  lines.push('Fixlife Finance Settlement Report');
  lines.push(`Range,${escapeCsvValue(`${report.range.from} to ${report.range.to}`)}`);
  lines.push(`Days,${report.range.days}`);
  lines.push(`Gross Volume,${report.summary.gross_volume}`);
  lines.push(`Platform Revenue,${report.summary.platform_revenue}`);
  lines.push(`Worker Escrow,${report.summary.worker_escrow}`);
  lines.push(`Worker Released,${report.summary.worker_released}`);
  lines.push(`Worker Paid,${report.summary.worker_paid}`);
  lines.push(`Bonus Paid,${report.summary.bonus_paid}`);
  lines.push(`Scheduled Settlements,${report.summary.scheduled_settlement_total}`);
  lines.push('');
  lines.push([
    'created_at',
    'available_on',
    'invoice_number',
    'request_id',
    'payment_id',
    'service_name',
    'location_text',
    'provider',
    'checkout_reference',
    'entry_type',
    'entry_status',
    'currency_code',
    'amount',
    'payment_amount',
    'platform_fee',
    'worker_payout',
    'commission_rate_percent',
    'promo_code',
  ].join(','));

  for (const row of report.export_rows) {
    lines.push(
      [
        row.created_at,
        row.available_on,
        row.invoice_number,
        row.request_id,
        row.payment_id,
        row.service_name,
        row.location_text,
        row.provider,
        row.checkout_reference,
        row.entry_type,
        row.entry_status,
        row.currency_code,
        row.amount,
        row.payment_amount,
        row.platform_fee,
        row.worker_payout,
        row.commission_rate_percent,
        row.promo_code,
      ]
        .map(escapeCsvValue)
        .join(',')
    );
  }

  return lines.join('\n');
};
