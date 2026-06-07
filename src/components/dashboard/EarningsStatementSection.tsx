import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { WorkerRewardHistoryItem } from '../../hooks/useWorkerRewardsDashboard';
import { API_ENDPOINTS } from '../../config/api';
import { getToken } from '../../utils/session';
import { formatDate, formatMoney } from './workerRewardsUi';

type StatementPeriod = 'all' | 'week' | 'month' | 'custom';
type StatementStatus = 'all' | 'paid' | 'scheduled' | 'waiting_release';

const formatInputDate = (value: Date) => value.toISOString().slice(0, 10);

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

const getStatementStatus = (item: WorkerRewardHistoryItem): Exclude<StatementStatus, 'all'> => {
  const baseStatus = String(item.worker_payout_status || '').toLowerCase();
  const bonusStatus = String(item.bonus_status || '').toLowerCase();
  const hasBonus = Number(item.total_bonus || 0) > 0;

  if (
    baseStatus === 'paid' &&
    (!hasBonus || bonusStatus === 'paid' || bonusStatus === 'not_eligible')
  ) {
    return 'paid';
  }

  if (baseStatus === 'scheduled' || bonusStatus === 'scheduled') {
    return 'scheduled';
  }

  return 'waiting_release';
};

const getStatementStatusLabel = (status: Exclude<StatementStatus, 'all'>) => {
  if (status === 'paid') return 'Paid';
  if (status === 'scheduled') return 'Scheduled';
  return 'Waiting on release';
};

const getStatementStatusChip = (status: Exclude<StatementStatus, 'all'>) => {
  if (status === 'paid') return 'border border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'scheduled') return 'border border-amber-200 bg-amber-50 text-amber-700';
  return 'border border-slate-200 bg-slate-100 text-slate-600';
};

interface EarningsStatementSectionProps {
  history: WorkerRewardHistoryItem[];
}

export const EarningsStatementSection: React.FC<EarningsStatementSectionProps> = ({ history }) => {
  const [periodFilter, setPeriodFilter] = useState<StatementPeriod>('all');
  const [statusFilter, setStatusFilter] = useState<StatementStatus>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; fileName: string } | null>(null);

  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    return () => {
      if (pdfPreview?.url) {
        URL.revokeObjectURL(pdfPreview.url);
      }
    };
  }, [pdfPreview]);

  const resolvedDateRange = useMemo(() => {
    if (periodFilter === 'week') {
      return {
        from: formatInputDate(getStartOfWeek(today)),
        to: formatInputDate(getEndOfWeek(today)),
      };
    }
    if (periodFilter === 'month') {
      return {
        from: formatInputDate(getStartOfMonth(today)),
        to: formatInputDate(getEndOfMonth(today)),
      };
    }
    if (periodFilter === 'custom') {
      return {
        from: fromDate || '',
        to: toDate || '',
      };
    }
    return { from: '', to: '' };
  }, [periodFilter, fromDate, toDate, today]);

  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      const completedTime = new Date(item.completed_at).getTime();
      const rowStatus = getStatementStatus(item);

      if (statusFilter !== 'all' && rowStatus !== statusFilter) return false;
      if (resolvedDateRange.from) {
        const fromTime = new Date(`${resolvedDateRange.from}T00:00:00`).getTime();
        if (completedTime < fromTime) return false;
      }
      if (resolvedDateRange.to) {
        const toTime = new Date(`${resolvedDateRange.to}T23:59:59`).getTime();
        if (completedTime > toTime) return false;
      }
      return true;
    });
  }, [history, resolvedDateRange.from, resolvedDateRange.to, statusFilter]);

  const statementSummary = useMemo(() => {
    return filteredHistory.reduce(
      (acc, item) => {
        const totalBonus = Number(item.total_bonus || 0);
        const total = Number(item.worker_payout || 0) + totalBonus;
        const rowStatus = getStatementStatus(item);
        acc.jobs += 1;
        acc.base += Number(item.worker_payout || 0);
        acc.commission += Number(item.commission_bonus || 0);
        acc.performance += Number(item.royalty_bonus || 0);
        acc.total += total;
        if (rowStatus === 'paid') acc.paidTotal += total;
        if (rowStatus === 'scheduled') acc.scheduledTotal += total;
        return acc;
      },
      { jobs: 0, base: 0, commission: 0, performance: 0, total: 0, paidTotal: 0, scheduledTotal: 0 }
    );
  }, [filteredHistory]);

  const statementPeriodLabel = useMemo(() => {
    if (periodFilter === 'week') return 'This week';
    if (periodFilter === 'month') return 'This month';
    if (periodFilter === 'custom') {
      if (resolvedDateRange.from || resolvedDateRange.to) {
        return `${resolvedDateRange.from || 'Start'} to ${resolvedDateRange.to || 'Today'}`;
      }
      return 'Custom range';
    }
    return 'All available history';
  }, [periodFilter, resolvedDateRange.from, resolvedDateRange.to]);

  const exportRows = useMemo(
    () =>
      filteredHistory.map((item) => {
        const rowStatus = getStatementStatus(item);
        return {
          date: formatDate(item.completed_at),
          request: `#${item.id_request}`,
          client: item.client_name || 'Client',
          service: item.service_name,
          base: Number(item.worker_payout || 0),
          commissionBonus: Number(item.commission_bonus || 0),
          monthlyBonus: Number(item.royalty_bonus || 0),
          total: Number(item.worker_payout || 0) + Number(item.total_bonus || 0),
          status: getStatementStatusLabel(rowStatus),
          payoutDate: formatDate(item.scheduled_payout_date),
        };
      }),
    [filteredHistory]
  );

  const handleExportCsv = () => {
    if (exportRows.length === 0) return;
    setActionError(null);
    const lines = [
      ['Statement period', statementPeriodLabel].join(','),
      ['Generated at', formatDate(new Date())].join(','),
      '',
      ['Date', 'Request', 'Client', 'Service', 'Base earnings', 'Commission bonus', 'Monthly bonus', 'Total', 'Status', 'Payout date'].join(','),
      ...exportRows.map((row) =>
        [
          row.date,
          row.request,
          `"${String(row.client).replaceAll('"', '""')}"`,
          `"${String(row.service).replaceAll('"', '""')}"`,
          row.base.toFixed(2),
          row.commissionBonus.toFixed(2),
          row.monthlyBonus.toFixed(2),
          row.total.toFixed(2),
          row.status,
          row.payoutDate,
        ].join(',')
      ),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `fixlife-worker-statement-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const fetchStatementPdf = () => {
    if (exportRows.length === 0 || pdfLoading) return;
    setActionError(null);
    const token = getToken('worker');
    if (!token) {
      setActionError('Login required to generate the PDF statement.');
      return;
    }

    const params = new URLSearchParams();
    params.set('period', periodFilter);
    params.set('status', statusFilter);
    if (resolvedDateRange.from) params.set('from', resolvedDateRange.from);
    if (resolvedDateRange.to) params.set('to', resolvedDateRange.to);

    setPdfLoading(true);
    return fetch(`${API_ENDPOINTS.worker.rewardsStatementPdf}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || 'Could not generate the PDF statement.');
        }

        return {
          blob: await response.blob(),
          fileName:
            response.headers
              .get('Content-Disposition')
              ?.match(/filename="?([^"]+)"?/)?.[1]
              ?.trim() || `fixlife-worker-statement-${new Date().toISOString().slice(0, 10)}.pdf`,
        };
      })
      .catch((reason) => {
        setActionError(reason instanceof Error ? reason.message : 'Could not generate the PDF statement.');
        return null;
      })
      .finally(() => {
        setPdfLoading(false);
      });
  };

  const handlePreviewStatementPdf = () => {
    void fetchStatementPdf()?.then((result) => {
      if (!result) return;
      if (pdfPreview?.url) {
        URL.revokeObjectURL(pdfPreview.url);
      }
      const url = URL.createObjectURL(result.blob);
      setPdfPreview({ url, fileName: result.fileName });
    });
  };

  const handleDownloadStatementPdf = () => {
    if (!pdfPreview) return;
    const anchor = document.createElement('a');
    anchor.href = pdfPreview.url;
    anchor.download = pdfPreview.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.22 }}
      className="rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm md:p-6"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Payout statement</p>
            <h3 className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">Filter, review, and export completed work</h3>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              Build a statement by period, filter by payout status, and export what is visible. The branded PDF is also emailed to your account on file.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePreviewStatementPdf}
              disabled={exportRows.length === 0}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:border-bird-blue/30 hover:bg-bird-blue/5 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {pdfLoading ? 'Generating PDF...' : 'Preview PDF'}
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={exportRows.length === 0}
              className="rounded-2xl bg-bird-blue px-4 py-3 text-sm font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Export CSV
            </button>
          </div>
        </div>

        {actionError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {actionError}
          </div>
        )}

        {typeof document !== 'undefined' &&
          createPortal(
            <AnimatePresence>
              {pdfPreview && (
                <div className="fixed inset-0 z-[1600] flex items-center justify-center p-4 md:p-6">
                  <div
                    className="absolute inset-0 bg-slate-950/78 backdrop-blur-sm"
                    onClick={() => {
                      URL.revokeObjectURL(pdfPreview.url);
                      setPdfPreview(null);
                    }}
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 18 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 18 }}
                    className="relative z-[1610] flex h-[min(92vh,980px)] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl"
                  >
                    <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-5">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Payout statement</p>
                        <h3 className="text-lg font-black text-slate-900">PDF preview</h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleDownloadStatementPdf}
                          className="rounded-2xl bg-bird-blue px-4 py-2.5 text-sm font-black text-white transition hover:opacity-90"
                        >
                          Download PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            URL.revokeObjectURL(pdfPreview.url);
                            setPdfPreview(null);
                          }}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto bg-slate-100/70 p-3 md:p-4">
                      <iframe
                        src={pdfPreview.url}
                        title="Worker payout statement preview"
                        className="h-full min-h-[540px] w-full rounded-3xl border border-slate-200 bg-white shadow-sm"
                      />
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>,
            document.body
          )}

        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_1fr]">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Statement period</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {([
                  ['all', 'All history'],
                  ['week', 'This week'],
                  ['month', 'This month'],
                  ['custom', 'Custom'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPeriodFilter(value)}
                    className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.16em] transition ${
                      periodFilter === value
                        ? 'bg-bird-blue text-white'
                        : 'border border-slate-200 bg-white text-slate-600 hover:border-bird-blue/20 hover:text-bird-blue'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">From</label>
              <input
                type="date"
                value={resolvedDateRange.from}
                onChange={(event) => {
                  setPeriodFilter('custom');
                  setFromDate(event.target.value);
                }}
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-bird-blue/40"
              />
            </div>

            <div>
              <label className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">To</label>
              <input
                type="date"
                value={resolvedDateRange.to}
                onChange={(event) => {
                  setPeriodFilter('custom');
                  setToDate(event.target.value);
                }}
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-bird-blue/40"
              />
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_auto] xl:items-end">
            <div>
              <label className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Status</label>
              <div className="mt-3 flex flex-wrap gap-2">
                {([
                  ['all', 'All'],
                  ['paid', 'Paid'],
                  ['scheduled', 'Scheduled'],
                  ['waiting_release', 'Waiting on release'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStatusFilter(value)}
                    className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.16em] transition ${
                      statusFilter === value
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/70 bg-white px-4 py-3 text-sm font-semibold text-slate-600">
              Showing <span className="font-black text-slate-900">{filteredHistory.length}</span> job(s) / {statementPeriodLabel}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-gray-200 bg-slate-50 p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Jobs in range</p>
            <p className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">{statementSummary.jobs}</p>
          </div>
          <div className="rounded-3xl border border-gray-200 bg-slate-50 p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Base earnings</p>
            <p className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">{formatMoney(statementSummary.base)}</p>
          </div>
          <div className="rounded-3xl border border-gray-200 bg-slate-50 p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Bonuses</p>
            <p className="mt-2 text-xl font-black text-amber-700 sm:text-2xl">{formatMoney(statementSummary.commission + statementSummary.performance)}</p>
          </div>
          <div className="rounded-3xl border border-gray-200 bg-slate-50 p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Combined total</p>
            <p className="mt-2 text-xl font-black text-bird-blue sm:text-2xl">{formatMoney(statementSummary.total)}</p>
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
            No completed jobs match the current filters yet.
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-3xl border border-slate-200 xl:block">
              <div className="overflow-x-auto">
                <table className="min-w-[760px] divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      {['Date', 'Request', 'Client', 'Service', 'Base', 'Comm. bonus', 'Monthly bonus', 'Total', 'Status', 'Payout date'].map((label) => (
                        <th key={label} className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {filteredHistory.map((item) => {
                      const rowStatus = getStatementStatus(item);
                      const totalFromJob = Number(item.worker_payout || 0) + Number(item.total_bonus || 0);
                      return (
                        <tr key={item.id_request}>
                          <td className="px-4 py-4 text-sm font-semibold text-slate-600">{formatDate(item.completed_at)}</td>
                          <td className="px-4 py-4 text-sm font-black text-slate-900">#{item.id_request}</td>
                          <td className="px-4 py-4 text-sm font-semibold text-slate-700">{item.client_name || 'Client'}</td>
                          <td className="px-4 py-4 text-sm font-black text-slate-900">{item.service_name}</td>
                          <td className="px-4 py-4 text-sm font-black text-slate-900">{formatMoney(item.worker_payout)}</td>
                          <td className="px-4 py-4 text-sm font-black text-amber-700">{formatMoney(item.commission_bonus)}</td>
                          <td className="px-4 py-4 text-sm font-black text-emerald-700">{formatMoney(item.royalty_bonus)}</td>
                          <td className="px-4 py-4 text-sm font-black text-bird-blue">{formatMoney(totalFromJob)}</td>
                          <td className="px-4 py-4">
                            <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${getStatementStatusChip(rowStatus)}`}>
                              {getStatementStatusLabel(rowStatus)}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm font-semibold text-slate-600">{formatDate(item.scheduled_payout_date)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-3 xl:hidden">
              {filteredHistory.map((item) => {
                const rowStatus = getStatementStatus(item);
                const totalFromJob = Number(item.worker_payout || 0) + Number(item.total_bonus || 0);
                return (
                  <div key={item.id_request} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-lg font-black text-slate-900">{item.service_name}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-500">#{item.id_request} / {item.client_name || 'Client'}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${getStatementStatusChip(rowStatus)}`}>
                        {getStatementStatusLabel(rowStatus)}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/70 bg-white p-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Base</p>
                        <p className="mt-2 text-lg font-black text-slate-900">{formatMoney(item.worker_payout)}</p>
                      </div>
                      <div className="rounded-2xl border border-white/70 bg-white p-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-700">Comm. bonus</p>
                        <p className="mt-2 text-lg font-black text-amber-700">{formatMoney(item.commission_bonus)}</p>
                      </div>
                      <div className="rounded-2xl border border-white/70 bg-white p-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">Monthly bonus</p>
                        <p className="mt-2 text-lg font-black text-emerald-700">{formatMoney(item.royalty_bonus)}</p>
                      </div>
                      <div className="rounded-2xl border border-bird-blue/15 bg-bird-blue/10 p-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-bird-blue">Total</p>
                        <p className="mt-2 text-lg font-black text-bird-blue">{formatMoney(totalFromJob)}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
                      <span>{formatDate(item.completed_at)}</span>
                      <span>{`/ Payout ${formatDate(item.scheduled_payout_date)}`}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
};
