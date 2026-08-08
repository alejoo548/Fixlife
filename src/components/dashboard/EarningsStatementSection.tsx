import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
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
  if (status === 'paid') return i18n.t('workerDashboard.earningsStatement.statusPaid');
  if (status === 'scheduled') return i18n.t('workerDashboard.earningsStatement.statusScheduled');
  return i18n.t('workerDashboard.earningsStatement.statusWaiting');
};

const getStatementStatusChip = (status: Exclude<StatementStatus, 'all'>) => {
  if (status === 'paid') return 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400';
  if (status === 'scheduled') return 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400';
  return 'border border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300';
};

interface EarningsStatementSectionProps {
  history: WorkerRewardHistoryItem[];
}

export const EarningsStatementSection: React.FC<EarningsStatementSectionProps> = ({ history }) => {
  const { t } = useTranslation();
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
    if (periodFilter === 'week') return t('workerDashboard.earningsStatement.thisWeek');
    if (periodFilter === 'month') return t('workerDashboard.earningsStatement.thisMonth');
    if (periodFilter === 'custom') {
      if (resolvedDateRange.from || resolvedDateRange.to) {
        return `${resolvedDateRange.from || t('workerDashboard.earningsStatement.start')} to ${resolvedDateRange.to || t('workerDashboard.earningsStatement.today')}`;
      }
      return t('workerDashboard.earningsStatement.customRange');
    }
    return t('workerDashboard.earningsStatement.allHistory');
  }, [periodFilter, resolvedDateRange.from, resolvedDateRange.to]);

  const exportRows = useMemo(
    () =>
      filteredHistory.map((item) => {
        const rowStatus = getStatementStatus(item);
        return {
          date: formatDate(item.completed_at),
          request: `#${item.id_request}`,
          client: item.client_name || t('workerDashboard.earningsStatement.clientFallback'),
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
      [t('workerDashboard.earningsStatement.statementPeriod'), statementPeriodLabel].join(','),
      [t('workerDashboard.earningsStatement.csvGeneratedAt'), formatDate(new Date())].join(','),
      '',
      [t('workerDashboard.earningsStatement.colDate'), t('workerDashboard.earningsStatement.colRequest'), t('workerDashboard.earningsStatement.colClient'), t('workerDashboard.earningsStatement.colService'), t('workerDashboard.earningsStatement.baseEarnings'), t('workerDashboard.earningsStatement.colCommBonus'), t('workerDashboard.earningsStatement.colMonthlyBonus'), t('workerDashboard.earningsStatement.colTotal'), t('workerDashboard.earningsStatement.colStatus'), t('workerDashboard.earningsStatement.colPayoutDate')].join(','),
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
      setActionError(t('workerDashboard.earningsStatement.loginRequired'));
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
          throw new Error(payload?.error || t('workerDashboard.earningsStatement.couldNotGeneratePdf'));
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
        setActionError(reason instanceof Error ? reason.message : t('workerDashboard.earningsStatement.couldNotGeneratePdf'));
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
      className="rounded-[28px] border border-slate-200/70 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 md:p-6"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t('workerDashboard.earningsStatement.payoutStatement')}</p>
            <h3 className="mt-2 text-xl font-black text-slate-900 dark:text-white sm:text-2xl">{t('workerDashboard.earningsStatement.filterReviewExport')}</h3>
            <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
              {t('workerDashboard.earningsStatement.buildStatementHint')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePreviewStatementPdf}
              disabled={exportRows.length === 0}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:border-bird-blue/30 hover:bg-bird-blue/5 disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-bird-blue/40 dark:hover:bg-bird-blue/10"
            >
              {pdfLoading ? t('workerDashboard.earningsStatement.generatingPdf') : t('workerDashboard.earningsStatement.previewPdf')}
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={exportRows.length === 0}
              className="rounded-2xl bg-bird-blue px-4 py-3 text-sm font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {t('workerDashboard.earningsStatement.exportCsv')}
            </button>
          </div>
        </div>

        {actionError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
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
                    <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 dark:border-white/10 dark:bg-slate-800 md:flex-row md:items-center md:justify-between md:px-5">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t('workerDashboard.earningsStatement.payoutStatement')}</p>
                        <h3 className="text-lg font-black text-slate-900 dark:text-white">{t('workerDashboard.earningsStatement.pdfPreview')}</h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleDownloadStatementPdf}
                          className="rounded-2xl bg-bird-blue px-4 py-2.5 text-sm font-black text-white transition hover:opacity-90"
                        >
                          {t('workerDashboard.earningsStatement.downloadPdf')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            URL.revokeObjectURL(pdfPreview.url);
                            setPdfPreview(null);
                          }}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-red-500/30 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                        >
                          {t('workerDashboard.earningsStatement.close')}
                        </button>
                      </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto bg-slate-100/70 p-3 md:p-4">
                      <iframe
                        src={pdfPreview.url}
                        title={t('workerDashboard.earningsStatement.previewIframeTitle')}
                        className="h-full min-h-[540px] w-full rounded-3xl border border-slate-200 bg-white shadow-sm"
                      />
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>,
            document.body
          )}

        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-800/60">
          <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_1fr]">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t('workerDashboard.earningsStatement.statementPeriod')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {([
                  ['all', t('workerDashboard.earningsStatement.allHistoryShort')],
                  ['week', t('workerDashboard.earningsStatement.thisWeekShort')],
                  ['month', t('workerDashboard.earningsStatement.thisMonthShort')],
                  ['custom', t('workerDashboard.earningsStatement.custom')],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPeriodFilter(value)}
                    className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.16em] transition ${
                      periodFilter === value
                        ? 'bg-bird-blue text-white'
                        : 'border border-slate-200 bg-white text-slate-600 hover:border-bird-blue/20 hover:text-bird-blue dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-bird-blue/30'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t('workerDashboard.earningsStatement.from')}</label>
              <input
                type="date"
                value={resolvedDateRange.from}
                onChange={(event) => {
                  setPeriodFilter('custom');
                  setFromDate(event.target.value);
                }}
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-bird-blue/40 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:[color-scheme:dark]"
              />
            </div>

            <div>
              <label className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t('workerDashboard.earningsStatement.to')}</label>
              <input
                type="date"
                value={resolvedDateRange.to}
                onChange={(event) => {
                  setPeriodFilter('custom');
                  setToDate(event.target.value);
                }}
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-bird-blue/40 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:[color-scheme:dark]"
              />
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_auto] xl:items-end">
            <div>
              <label className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t('workerDashboard.earningsStatement.status')}</label>
              <div className="mt-3 flex flex-wrap gap-2">
                {([
                  ['all', t('workerDashboard.earningsStatement.all')],
                  ['paid', t('workerDashboard.earningsStatement.statusPaid')],
                  ['scheduled', t('workerDashboard.earningsStatement.statusScheduled')],
                  ['waiting_release', t('workerDashboard.earningsStatement.waitingOnRelease')],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStatusFilter(value)}
                    className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.16em] transition ${
                      statusFilter === value
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-white/20 dark:hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/70 bg-white px-4 py-3 text-sm font-semibold text-slate-600 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300">
              {t('workerDashboard.earningsStatement.showingJobs', { count: filteredHistory.length, period: statementPeriodLabel })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-slate-200/70 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-800/60">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t('workerDashboard.earningsStatement.jobsInRange')}</p>
            <p className="mt-2 text-xl font-black text-slate-900 dark:text-white sm:text-2xl">{statementSummary.jobs}</p>
          </div>
          <div className="rounded-3xl border border-slate-200/70 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-800/60">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t('workerDashboard.earningsStatement.baseEarnings')}</p>
            <p className="mt-2 text-xl font-black text-slate-900 dark:text-white sm:text-2xl">{formatMoney(statementSummary.base)}</p>
          </div>
          <div className="rounded-3xl border border-slate-200/70 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-800/60">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t('workerDashboard.earningsStatement.bonuses')}</p>
            <p className="mt-2 text-xl font-black text-amber-700 dark:text-amber-400 sm:text-2xl">{formatMoney(statementSummary.commission + statementSummary.performance)}</p>
          </div>
          <div className="rounded-3xl border border-slate-200/70 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-800/60">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t('workerDashboard.earningsStatement.combinedTotal')}</p>
            <p className="mt-2 text-xl font-black text-bird-blue sm:text-2xl">{formatMoney(statementSummary.total)}</p>
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-400">
            {t('workerDashboard.earningsStatement.noJobsMatchFilters')}
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-3xl border border-slate-200 dark:border-white/10 xl:block">
              <div className="overflow-x-auto">
                <table className="min-w-[760px] divide-y divide-slate-200 dark:divide-slate-700">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      {[t('workerDashboard.earningsStatement.colDate'), t('workerDashboard.earningsStatement.colRequest'), t('workerDashboard.earningsStatement.colClient'), t('workerDashboard.earningsStatement.colService'), t('workerDashboard.earningsStatement.colBase'), t('workerDashboard.earningsStatement.colCommBonus'), t('workerDashboard.earningsStatement.colMonthlyBonus'), t('workerDashboard.earningsStatement.colTotal'), t('workerDashboard.earningsStatement.colStatus'), t('workerDashboard.earningsStatement.colPayoutDate')].map((label) => (
                        <th key={label} className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-900">
                    {filteredHistory.map((item) => {
                      const rowStatus = getStatementStatus(item);
                      const totalFromJob = Number(item.worker_payout || 0) + Number(item.total_bonus || 0);
                      return (
                        <tr key={item.id_request}>
                          <td className="px-4 py-4 text-sm font-semibold text-slate-600 dark:text-slate-300">{formatDate(item.completed_at)}</td>
                          <td className="px-4 py-4 text-sm font-black text-slate-900 dark:text-white">#{item.id_request}</td>
                          <td className="px-4 py-4 text-sm font-semibold text-slate-700 dark:text-slate-300">{item.client_name || t('workerDashboard.earningsStatement.clientFallback')}</td>
                          <td className="px-4 py-4 text-sm font-black text-slate-900 dark:text-white">{item.service_name}</td>
                          <td className="px-4 py-4 text-sm font-black text-slate-900 dark:text-white">{formatMoney(item.worker_payout)}</td>
                          <td className="px-4 py-4 text-sm font-black text-amber-700 dark:text-amber-400">{formatMoney(item.commission_bonus)}</td>
                          <td className="px-4 py-4 text-sm font-black text-emerald-700 dark:text-emerald-400">{formatMoney(item.royalty_bonus)}</td>
                          <td className="px-4 py-4 text-sm font-black text-bird-blue">{formatMoney(totalFromJob)}</td>
                          <td className="px-4 py-4">
                            <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${getStatementStatusChip(rowStatus)}`}>
                              {getStatementStatusLabel(rowStatus)}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm font-semibold text-slate-600 dark:text-slate-300">{formatDate(item.scheduled_payout_date)}</td>
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
                  <div key={item.id_request} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-800/60">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-lg font-black text-slate-900 dark:text-white">{item.service_name}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">#{item.id_request} / {item.client_name || t('workerDashboard.earningsStatement.clientFallback')}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${getStatementStatusChip(rowStatus)}`}>
                        {getStatementStatusLabel(rowStatus)}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/70 bg-white p-3 dark:border-white/10 dark:bg-slate-800">
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">{t('workerDashboard.earningsStatement.colBase')}</p>
                        <p className="mt-2 text-lg font-black text-slate-900 dark:text-white">{formatMoney(item.worker_payout)}</p>
                      </div>
                      <div className="rounded-2xl border border-white/70 bg-white p-3 dark:border-white/10 dark:bg-slate-800">
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-700 dark:text-amber-400">{t('workerDashboard.earningsStatement.colCommBonus')}</p>
                        <p className="mt-2 text-lg font-black text-amber-700 dark:text-amber-400">{formatMoney(item.commission_bonus)}</p>
                      </div>
                      <div className="rounded-2xl border border-white/70 bg-white p-3 dark:border-white/10 dark:bg-slate-800">
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">{t('workerDashboard.earningsStatement.colMonthlyBonus')}</p>
                        <p className="mt-2 text-lg font-black text-emerald-700 dark:text-emerald-400">{formatMoney(item.royalty_bonus)}</p>
                      </div>
                      <div className="rounded-2xl border border-bird-blue/15 bg-bird-blue/10 p-3 dark:border-bird-blue/25 dark:bg-bird-blue/15">
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-bird-blue">{t('workerDashboard.earningsStatement.colTotal')}</p>
                        <p className="mt-2 text-lg font-black text-bird-blue">{formatMoney(totalFromJob)}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      <span>{formatDate(item.completed_at)}</span>
                      <span>{t('workerDashboard.earningsStatement.payoutPrefix', { date: formatDate(item.scheduled_payout_date) })}</span>
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
