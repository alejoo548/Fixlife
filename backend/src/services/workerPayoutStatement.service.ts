import { createHash } from 'crypto';
import { existsSync } from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import {
  getNextPayoutWeekday,
  getWorkerBonusPayouts,
  getWorkerRewardsSettings,
  REWARDS_PROGRAM_START_SQL,
  syncWorkerBonusPayouts,
} from '../utils/workerRewards';
import { getWorkerPayouts } from './paymentLedger.service';
import { enqueueBackgroundJob } from './backgroundJobs.service';

export type WorkerStatementPeriod = 'all' | 'week' | 'month' | 'custom';
export type WorkerStatementStatus = 'all' | 'paid' | 'scheduled' | 'waiting_release';

export interface WorkerStatementFilters {
  period?: string | null;
  status?: string | null;
  from?: string | null;
  to?: string | null;
}

export interface WorkerStatementEntry {
  id_request: number;
  service_name: string;
  location_text: string;
  client_name: string;
  completed_at: string;
  worker_payout: number;
  commission_bonus: number;
  monthly_bonus: number;
  total_bonus: number;
  total_amount: number;
  scheduled_payout_date: string;
  base_status: string;
  bonus_status: string;
  statement_status: Exclude<WorkerStatementStatus, 'all'>;
}

export interface WorkerStatementPayload {
  statementNumber: string;
  generatedAt: string;
  workerName: string;
  workerEmail: string;
  periodLabel: string;
  filters: {
    period: WorkerStatementPeriod;
    status: WorkerStatementStatus;
    from: string | null;
    to: string | null;
  };
  entries: WorkerStatementEntry[];
  summary: {
    jobs: number;
    base: number;
    commission: number;
    monthly: number;
    total: number;
    paidTotal: number;
    scheduledTotal: number;
  };
}

const STATEMENT_HEADER_HEIGHT = 132;

const getStatementDateCode = (value: string | Date) =>
  new Date(value).toISOString().slice(0, 10).replaceAll('-', '');

export const getWorkerStatementLogoPath = () => {
  const candidates = [
    path.resolve(process.cwd(), 'assets/fixlife-logo.png'),
    path.resolve(process.cwd(), 'backend/assets/fixlife-logo.png'),
    path.resolve(__dirname, '../../assets/fixlife-logo.png'),
    path.resolve(__dirname, '../../../backend/assets/fixlife-logo.png'),
  ];

  return candidates.find((candidate) => existsSync(candidate)) || null;
};

export const getWorkerStatementFileName = (statementNumber: string) => {
  const safeNumber = String(statementNumber || '')
    .replace(/[^A-Z0-9-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  return `${safeNumber || 'fixlife-worker-statement'}.pdf`;
};

export const queueWorkerPayoutStatementEmail = async (
  userId: number,
  input: WorkerStatementFilters,
  options: { jobKeyPrefix?: string; jobKeySuffix?: string } = {}
) => {
  const payload = await getWorkerPayoutStatementPayload(userId, input);
  const pdfBuffer = await renderWorkerPayoutStatementPdf(payload);
  const fileName = getWorkerStatementFileName(payload.statementNumber);

  if (!payload.workerEmail) {
  return {
    queued: false,
    payload,
    fileName,
    pdfBuffer,
    reason: 'Worker email is missing.',
  };
  }

  const jobKeyPrefix = options.jobKeyPrefix || 'worker-statement-email';
  const jobKeySuffix = options.jobKeySuffix ? `-${options.jobKeySuffix}` : '';

  await enqueueBackgroundJob({
    jobType: 'send_worker_statement_email',
    jobKey: `${jobKeyPrefix}-${payload.statementNumber}${jobKeySuffix}`,
    payload: {
      to: payload.workerEmail,
      workerName: payload.workerName,
      statementNumber: payload.statementNumber,
      periodLabel: payload.periodLabel,
      jobs: payload.summary.jobs,
      base: payload.summary.base,
      bonuses: Number((payload.summary.commission + payload.summary.monthly).toFixed(2)),
      total: payload.summary.total,
      paidTotal: payload.summary.paidTotal,
      scheduledTotal: payload.summary.scheduledTotal,
      generatedAt: payload.generatedAt,
      fileName,
      pdfBase64: pdfBuffer.toString('base64'),
    },
    attemptsMax: 3,
  });

  return {
    queued: true,
    payload,
    fileName,
    pdfBuffer,
  };
};

const parsePeriod = (value: string | null | undefined): WorkerStatementPeriod => {
  const normalized = String(value || 'all').toLowerCase();
  if (normalized === 'week' || normalized === 'month' || normalized === 'custom') return normalized;
  return 'all';
};

const parseStatus = (value: string | null | undefined): WorkerStatementStatus => {
  const normalized = String(value || 'all').toLowerCase();
  if (normalized === 'paid' || normalized === 'scheduled' || normalized === 'waiting_release') {
    return normalized;
  }
  return 'all';
};

const parseDateInput = (value: string | null | undefined) => {
  const normalized = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const date = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : normalized;
};

const getStartOfWeek = (value: Date) => {
  const next = new Date(value);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  next.setHours(0, 0, 0, 0);
  return next;
};

const getEndOfWeek = (value: Date) => {
  const next = getStartOfWeek(value);
  next.setDate(next.getDate() + 6);
  next.setHours(23, 59, 59, 999);
  return next;
};

const getStartOfMonth = (value: Date) => {
  const next = new Date(value.getFullYear(), value.getMonth(), 1);
  next.setHours(0, 0, 0, 0);
  return next;
};

const getEndOfMonth = (value: Date) => {
  const next = new Date(value.getFullYear(), value.getMonth() + 1, 0);
  next.setHours(23, 59, 59, 999);
  return next;
};

const formatDateOnly = (value: Date) => value.toISOString().slice(0, 10);
const formatDateLong = (value: string | Date) =>
  new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const formatMoney = (value: number) => `$${Number(value || 0).toFixed(2)}`;

const resolveDateRange = (
  period: WorkerStatementPeriod,
  from: string | null,
  to: string | null,
  now = new Date()
) => {
  if (period === 'week') {
    return {
      from: formatDateOnly(getStartOfWeek(now)),
      to: formatDateOnly(getEndOfWeek(now)),
      label: 'This week',
    };
  }

  if (period === 'month') {
    return {
      from: formatDateOnly(getStartOfMonth(now)),
      to: formatDateOnly(getEndOfMonth(now)),
      label: 'This month',
    };
  }

  if (period === 'custom') {
    if (from || to) {
      return {
        from,
        to,
        label: `${from || 'Start'} to ${to || 'Today'}`,
      };
    }

    return {
      from: null,
      to: null,
      label: 'Custom range',
    };
  }

  return {
    from: null,
    to: null,
    label: 'All available history',
  };
};

const getStatementStatus = (
  baseStatus: string,
  bonusStatus: string,
  totalBonus: number
): Exclude<WorkerStatementStatus, 'all'> => {
  const normalizedBase = String(baseStatus || '').toLowerCase();
  const normalizedBonus = String(bonusStatus || '').toLowerCase();

  if (
    normalizedBase === 'paid' &&
    (totalBonus <= 0 || normalizedBonus === 'paid' || normalizedBonus === 'not_eligible')
  ) {
    return 'paid';
  }

  if (normalizedBase === 'scheduled' || normalizedBonus === 'scheduled') {
    return 'scheduled';
  }

  return 'waiting_release';
};

export const getWorkerPayoutStatementPayload = async (
  userId: number,
  input: WorkerStatementFilters
): Promise<WorkerStatementPayload> => {
  const period = parsePeriod(input.period);
  const status = parseStatus(input.status);
  const from = parseDateInput(input.from);
  const to = parseDateInput(input.to);
  const now = new Date();
  const resolvedRange = resolveDateRange(period, from, to, now);

  const [profileRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       wp.id_worker_profile,
       u.name,
       u.lastname,
       u.email
     FROM worker_profiles wp
     INNER JOIN users u ON u.id_user = wp.id_user
     WHERE wp.id_user = ?
     LIMIT 1`,
    [userId]
  );

  if (profileRows.length === 0) {
    throw new Error('Worker profile not found.');
  }

  const profileId = Number(profileRows[0].id_worker_profile);
  const workerName = `${profileRows[0].name || ''} ${profileRows[0].lastname || ''}`.trim() || 'Fixlife pro';
  const workerEmail = String(profileRows[0].email || '');

  const settings = await getWorkerRewardsSettings();
  await syncWorkerBonusPayouts(profileId, settings);

  const [historyRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       sr.id_request,
       sr.location_text,
       s.name AS service_name,
       COALESCE(srp.worker_payout, sr.final_budget, sr.budget, 0) AS worker_payout,
       COALESCE(srp.released_at, sr.updated_at, sr.created_at) AS completed_at,
       u.name AS client_name,
       u.lastname AS client_lastname
     FROM service_requests sr
     INNER JOIN services s ON s.id_service = sr.id_service
     LEFT JOIN service_request_payments srp ON srp.id_request = sr.id_request
     LEFT JOIN users u ON u.id_user = sr.id_user
     WHERE sr.assigned_worker_profile = ?
       AND sr.status = 'done'
       AND COALESCE(srp.released_at, sr.updated_at, sr.created_at) >= ?
     ORDER BY completed_at DESC
     LIMIT 200`,
    [profileId, REWARDS_PROGRAM_START_SQL]
  );

  const workerPayoutRows = await getWorkerPayouts(profileId);
  const bonusPayoutRows = await getWorkerBonusPayouts(profileId);

  const entries = historyRows
    .map((row) => {
      const completedAt = row.completed_at ? new Date(row.completed_at) : now;
      const workerPayout = Number(row.worker_payout || 0);
      const basePayout = workerPayoutRows.find(
        (payout: any) => payout.id_request != null && Number(payout.id_request) === Number(row.id_request)
      );
      const commissionPayout = bonusPayoutRows.find(
        (payout: any) =>
          String(payout.bonus_type || '').toLowerCase() === 'commission' &&
          payout.source_request_id != null &&
          Number(payout.source_request_id) === Number(row.id_request)
      );
      const commissionBonus = commissionPayout ? Number(commissionPayout.bonus_amount || 0) : 0;
      const monthlyBonus = 0;
      const totalBonus = commissionBonus + monthlyBonus;
      const payoutDates = [
        basePayout?.scheduled_for ? new Date(basePayout.scheduled_for) : null,
        commissionPayout?.scheduled_for ? new Date(commissionPayout.scheduled_for) : null,
      ].filter((value): value is Date => Boolean(value));
      const payoutDate =
        payoutDates.length > 0
          ? payoutDates.sort((left, right) => left.getTime() - right.getTime())[0]
          : getNextPayoutWeekday(completedAt, settings.payout_weekday);
      const baseStatus = basePayout
        ? String(basePayout.payout_status || 'scheduled')
        : 'waiting_release';
      const bonusStatus = commissionPayout
        ? String(commissionPayout.payout_status || 'scheduled')
        : 'not_eligible';

      return {
        id_request: Number(row.id_request),
        service_name: String(row.service_name || 'Service'),
        location_text: String(row.location_text || ''),
        client_name: `${row.client_name || ''} ${row.client_lastname || ''}`.trim() || 'Client',
        completed_at: completedAt.toISOString(),
        worker_payout: workerPayout,
        commission_bonus: commissionBonus,
        monthly_bonus: monthlyBonus,
        total_bonus: totalBonus,
        total_amount: Number((workerPayout + totalBonus).toFixed(2)),
        scheduled_payout_date: payoutDate.toISOString(),
        base_status: baseStatus,
        bonus_status: bonusStatus,
        statement_status: getStatementStatus(baseStatus, bonusStatus, totalBonus),
      } satisfies WorkerStatementEntry;
    })
    .filter((entry) => {
      if (status !== 'all' && entry.statement_status !== status) return false;

      if (resolvedRange.from) {
        const fromTime = new Date(`${resolvedRange.from}T00:00:00`).getTime();
        if (new Date(entry.completed_at).getTime() < fromTime) return false;
      }

      if (resolvedRange.to) {
        const toTime = new Date(`${resolvedRange.to}T23:59:59`).getTime();
        if (new Date(entry.completed_at).getTime() > toTime) return false;
      }

      return true;
    });

  const summary = entries.reduce(
    (acc, entry) => {
      acc.jobs += 1;
      acc.base += Number(entry.worker_payout || 0);
      acc.commission += Number(entry.commission_bonus || 0);
      acc.monthly += Number(entry.monthly_bonus || 0);
      acc.total += Number(entry.total_amount || 0);
      if (entry.statement_status === 'paid') acc.paidTotal += Number(entry.total_amount || 0);
      if (entry.statement_status === 'scheduled') acc.scheduledTotal += Number(entry.total_amount || 0);
      return acc;
    },
    {
      jobs: 0,
      base: 0,
      commission: 0,
      monthly: 0,
      total: 0,
      paidTotal: 0,
      scheduledTotal: 0,
    }
  );

  const statementSeed = JSON.stringify({
    profileId,
    generatedAt: now.toISOString().slice(0, 10),
    filters: { period, status, from: resolvedRange.from, to: resolvedRange.to },
  });
  const suffix = createHash('sha1').update(statementSeed).digest('hex').slice(0, 6).toUpperCase();
  const statementNumber = `FL-STM-${getStatementDateCode(now)}-${String(profileId).padStart(4, '0')}-${suffix}`;

  return {
    statementNumber,
    generatedAt: now.toISOString(),
    workerName,
    workerEmail,
    periodLabel: resolvedRange.label,
    filters: {
      period,
      status,
      from: resolvedRange.from,
      to: resolvedRange.to,
    },
    entries,
    summary: {
      jobs: summary.jobs,
      base: Number(summary.base.toFixed(2)),
      commission: Number(summary.commission.toFixed(2)),
      monthly: Number(summary.monthly.toFixed(2)),
      total: Number(summary.total.toFixed(2)),
      paidTotal: Number(summary.paidTotal.toFixed(2)),
      scheduledTotal: Number(summary.scheduledTotal.toFixed(2)),
    },
  };
};

const ensureSpace = (doc: PDFKit.PDFDocument, minimumHeight: number) => {
  if (doc.y + minimumHeight <= doc.page.height - doc.page.margins.bottom) return;
  doc.addPage();
};

const drawSummaryCard = (
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string
) => {
  doc.roundedRect(x, y, width, 56, 10).fillAndStroke('#F8FAFC', '#DCE6F1');
  doc.fillColor('#64748B').fontSize(9).font('Helvetica-Bold').text(label.toUpperCase(), x + 12, y + 10);
  doc.fillColor('#0F172A').fontSize(18).font('Helvetica-Bold').text(value, x + 12, y + 24);
};

const drawInfoCard = (
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  lines: string[],
  options: { fill: string; stroke: string; titleColor: string }
) => {
  doc.roundedRect(x, y, width, height, 18).fillAndStroke(options.fill, options.stroke);
  doc.fillColor(options.titleColor).fontSize(11).font('Helvetica-Bold').text(title, x + 16, y + 16, {
    width: width - 32,
  });
  doc.fillColor('#0F172A').fontSize(9.5).font('Helvetica').text(lines.join('\n\n'), x + 16, y + 38, {
    width: width - 32,
    lineGap: 2,
  });
};

export const renderWorkerPayoutStatementPdf = async (payload: WorkerStatementPayload): Promise<Buffer> => {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const chunks: Buffer[] = [];
  const logoPath = getWorkerStatementLogoPath();

  doc.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.rect(0, 0, doc.page.width, STATEMENT_HEADER_HEIGHT).fill('#0F52BA');
  doc.roundedRect(40, 26, 196, 78, 20).fill('#0B3E8A');
  if (logoPath) {
    doc.image(logoPath, 54, 42, { fit: [132, 42], valign: 'center' });
  } else {
    doc.fillColor('#FFFFFF').fontSize(24).font('Helvetica-Bold').text('Fixlife', 56, 46);
  }
  doc.fillColor('#DCEAFE').fontSize(11).font('Helvetica-Bold').text('PROFESSIONAL PAYOUT STATEMENT', 258, 40, {
    width: 280,
  });
  doc.fillColor('#FFFFFF').fontSize(21).font('Helvetica-Bold').text('Statement ready for your records', 258, 58, {
    width: 280,
    lineGap: 1,
  });
  doc
    .fontSize(10)
    .font('Helvetica')
    .text('Generated from your filtered Fixlife earnings history and prepared for payout review.', 258, 106, {
      width: 260,
      lineGap: 2,
    });

  doc.fillColor('#0F172A');
  doc.fontSize(10).font('Helvetica-Bold').text(`Statement number`, 40, 150);
  doc.fontSize(18).font('Helvetica-Bold').text(payload.statementNumber, 40, 164);
  doc.fontSize(10).font('Helvetica').text(`Generated: ${formatDateLong(payload.generatedAt)}`, 40, 188);
  doc.text(`Statement period: ${payload.periodLabel}`, 40, 204);

  doc.roundedRect(320, 146, 236, 74, 16).fillAndStroke('#F8FAFC', '#DCE6F1');
  doc.fillColor('#64748B').fontSize(9).font('Helvetica-Bold').text('Prepared for', 336, 160);
  doc.fillColor('#0F172A').fontSize(16).font('Helvetica-Bold').text(payload.workerName, 336, 176, { width: 190 });
  doc.fillColor('#475569').fontSize(10).font('Helvetica').text(payload.workerEmail || 'Email not available', 336, 197, {
    width: 200,
    ellipsis: true,
  });

  const cardY = 238;
  const cardWidth = 120;
  drawSummaryCard(doc, 40, cardY, cardWidth, 'Jobs in range', String(payload.summary.jobs));
  drawSummaryCard(doc, 172, cardY, cardWidth, 'Base earnings', formatMoney(payload.summary.base));
  drawSummaryCard(doc, 304, cardY, cardWidth, 'Bonuses', formatMoney(payload.summary.commission + payload.summary.monthly));
  drawSummaryCard(doc, 436, cardY, cardWidth, 'Combined total', formatMoney(payload.summary.total));

  const totalsY = 318;
  doc.roundedRect(40, totalsY, 516, 54, 12).fillAndStroke('#F8FAFC', '#DCE6F1');
  doc.fillColor('#0F172A').fontSize(13).font('Helvetica-Bold').text('Statement totals', 56, totalsY + 12, {
    width: 160,
  });
  doc.fillColor('#475569').fontSize(9.5).font('Helvetica').text(
    `Paid in this statement: ${formatMoney(payload.summary.paidTotal)}`,
    228,
    totalsY + 12,
    { width: 150 }
  );
  doc.text(
    `Still scheduled: ${formatMoney(payload.summary.scheduledTotal)}`,
    390,
    totalsY + 12,
    { width: 140 }
  );

  doc.fillColor('#0F172A').fontSize(14).font('Helvetica-Bold').text('Completed work included', 40, 398);
  doc.y = 424;

  const tableHeaders = ['Date', 'Request', 'Client', 'Service', 'Base', 'Bonus', 'Total', 'Status', 'Payout'];
  const columnWidths = [58, 50, 84, 88, 54, 54, 56, 58, 54];
  const tableX = 40;
  const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);

  const drawTableHeader = () => {
    let cursorX = tableX;
    const headerY = doc.y;
    doc.rect(tableX, headerY - 4, tableWidth, 22).fill('#EFF6FF');
    doc.fillColor('#1D4ED8').fontSize(8).font('Helvetica-Bold');
    tableHeaders.forEach((header, index) => {
      doc.text(header, cursorX + 4, headerY + 2, { width: columnWidths[index] - 8 });
      cursorX += columnWidths[index];
    });
    doc.y = headerY + 22;
  };

  drawTableHeader();

  if (payload.entries.length === 0) {
    doc.fillColor('#475569').fontSize(10).font('Helvetica').text(
      'No completed jobs match the selected statement filters.',
      tableX,
      doc.y + 6
    );
  } else {
    payload.entries.forEach((entry, index) => {
      ensureSpace(doc, 28);
      if (doc.y > doc.page.height - doc.page.margins.bottom - 60) {
        doc.addPage();
        drawTableHeader();
      }

      const rowY = doc.y;
      let cursorX = tableX;
      const rowHeight = 28;
      if (index % 2 === 0) {
        doc.rect(tableX, rowY - 2, tableWidth, rowHeight).fill('#F8FAFC');
      }

      const cells = [
        formatDateLong(entry.completed_at),
        `#${entry.id_request}`,
        entry.client_name,
        entry.service_name,
        formatMoney(entry.worker_payout),
        formatMoney(entry.commission_bonus + entry.monthly_bonus),
        formatMoney(entry.total_amount),
        entry.statement_status === 'waiting_release' ? 'Waiting' : entry.statement_status.charAt(0).toUpperCase() + entry.statement_status.slice(1),
        formatDateLong(entry.scheduled_payout_date),
      ];

      doc.fillColor('#0F172A').fontSize(8.5).font('Helvetica');
      cells.forEach((cell, cellIndex) => {
        doc.text(cell, cursorX + 4, rowY + 4, {
          width: columnWidths[cellIndex] - 8,
          ellipsis: true,
        });
        cursorX += columnWidths[cellIndex];
      });

      doc.y = rowY + rowHeight;
    });
  }

  ensureSpace(doc, 210);
  const notesTop = doc.y + 24;
  const notesWidth = 248;
  const notesHeight = 166;

  drawInfoCard(
    doc,
    40,
    notesTop,
    notesWidth,
    notesHeight,
    'Company notes',
    [
      'This statement is generated directly from the payout data visible in your Fixlife dashboard.',
      'Use it for bookkeeping, payout review, or sharing with your accountant.',
      'If a payout looks incorrect, contact support from your worker dashboard before settlement day.',
    ],
    { fill: '#EFF6FF', stroke: '#BFDBFE', titleColor: '#1D4ED8' }
  );

  drawInfoCard(
    doc,
    308,
    notesTop,
    notesWidth,
    notesHeight,
    'Payout policy',
    [
      'Base earnings move into scheduled payout batches after the client confirms completion and the job funds are released.',
      'Commission bonuses unlock once your configured lifetime completed-job threshold is met.',
      'Monthly performance bonuses depend on the active cycle goals for completed jobs and completion rate.',
    ],
    { fill: '#FFFBEB', stroke: '#FDE68A', titleColor: '#B45309' }
  );

  doc.y = notesTop + notesHeight + 18;
  doc
    .fillColor('#64748B')
    .fontSize(8.5)
    .font('Helvetica')
    .text('Fixlife Billing · Statement prepared automatically from your current dashboard filters.', 40, doc.y, {
      width: 516,
      align: 'center',
    });

  doc.end();
  return done;
};

