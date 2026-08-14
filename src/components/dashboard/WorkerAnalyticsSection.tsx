import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownRight, ArrowUpRight, Sparkles } from 'lucide-react';
import { API_ENDPOINTS } from '../../config/api';
import { getToken } from '../../utils/session';

interface WeeklyEarning {
  week_start: string;
  total: number;
  jobs: number;
}

interface MonthComparison {
  current_total: number;
  current_jobs: number;
  previous_total: number;
  previous_jobs: number;
  change_pct: number | null;
}

interface NearbyDemand {
  id_service: number;
  service_name: string;
  request_count: number;
  avg_budget: number;
}

interface AnalyticsData {
  weekly_earnings: WeeklyEarning[];
  month_comparison: MonthComparison;
  nearby_demand: NearbyDemand[];
}

const formatMoney = (value: number) => `$${value.toFixed(2)}`;

export const WorkerAnalyticsSection: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken('worker');
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(API_ENDPOINTS.worker.analytics, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await res.json();
        if (!cancelled && res.ok && payload?.success) {
          setData(payload);
        }
      } catch {
        // Insights are a nice-to-have; fail quietly and just hide the section.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="h-[280px] animate-pulse rounded-3xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900" />
        <div className="h-[280px] animate-pulse rounded-3xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900" />
      </div>
    );
  }

  if (!data || data.weekly_earnings.length === 0) return null;

  const { month_comparison: month, nearby_demand: demand } = data;
  const chartData = data.weekly_earnings.map((row) => ({
    ...row,
    label: new Date(row.week_start).toLocaleDateString(i18n.language === 'es' ? 'es-SV' : 'en-US', {
      month: 'short',
      day: 'numeric',
    }),
  }));
  const maxDemand = demand.length > 0 ? Math.max(...demand.map((d) => d.request_count)) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr] md:gap-6"
    >
      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-bird-blue">
              {t('workerDashboard.analytics.weeklyTrendTitle')}
            </p>
            <h3 className="mt-1 text-lg font-black text-slate-950 dark:text-white">
              {t('workerDashboard.analytics.weeklyTrendSubtitle')}
            </h3>
          </div>
          {month.change_pct !== null && (
            <div
              className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-black ${
                month.change_pct >= 0
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                  : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400'
              }`}
            >
              {month.change_pct >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {Math.abs(month.change_pct)}% {t('workerDashboard.analytics.vsLastMonth')}
            </div>
          )}
        </div>

        <div className="mt-4 h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={80}>
            <AreaChart data={chartData} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="earningsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0090ff" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0090ff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.2)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
              <Tooltip formatter={(value: number) => formatMoney(Number(value))} />
              <Area type="monotone" dataKey="total" stroke="#0090ff" strokeWidth={2.5} fill="url(#earningsGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-slate-800">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
              {t('workerDashboard.analytics.thisMonth')}
            </p>
            <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{formatMoney(month.current_total)}</p>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {t('workerDashboard.analytics.jobsCount', { count: month.current_jobs })}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-slate-800">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
              {t('workerDashboard.analytics.lastMonth')}
            </p>
            <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{formatMoney(month.previous_total)}</p>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {t('workerDashboard.analytics.jobsCount', { count: month.previous_jobs })}
            </p>
          </div>
        </div>
      </div>

      {demand.length > 0 && (
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 md:p-6">
          <div className="flex items-center gap-2 text-amber-500">
            <Sparkles className="h-4 w-4" />
            <p className="text-[11px] font-black uppercase tracking-[0.18em]">
              {t('workerDashboard.analytics.nearbyDemandTitle')}
            </p>
          </div>
          <h3 className="mt-1 text-lg font-black text-slate-950 dark:text-white">
            {t('workerDashboard.analytics.nearbyDemandSubtitle')}
          </h3>

          <div className="mt-4 space-y-3">
            {demand.map((item) => (
              <div key={item.id_service}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-slate-800 dark:text-slate-200">{item.service_name}</span>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {t('workerDashboard.analytics.requestCount', { count: item.request_count })} · {formatMoney(item.avg_budget)} {t('workerDashboard.analytics.avgShort')}
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400"
                    style={{ width: `${maxDemand > 0 ? (item.request_count / maxDemand) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
};
