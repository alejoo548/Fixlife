import React from 'react';
import { motion } from 'framer-motion';
import { useWorkerRewardsDashboard } from '../../hooks/useWorkerRewardsDashboard';
import {
  formatDate,
  formatMoney,
  getPayoutStatusBadge,
  getPayoutStatusLabel,
} from './workerRewardsUi';
import { EarningsStatementSection } from './EarningsStatementSection';

const CompletedWorkSkeleton: React.FC = () => (
  <div className="flex h-full w-full flex-col gap-4 overflow-y-auto custom-scrollbar p-3 pb-20 animate-fade-in md:gap-6 md:p-6 md:pb-8 lg:p-8">
    <div className="h-[340px] animate-pulse rounded-3xl border border-slate-200/70 bg-white dark:border-white/10 dark:bg-slate-900" />
    <div className="h-[320px] animate-pulse rounded-3xl border border-slate-200/70 bg-white dark:border-white/10 dark:bg-slate-900" />
  </div>
);

export const CompletedWorkView: React.FC = () => {
  const { data, loading, error } = useWorkerRewardsDashboard();

  if (loading && !data) return <CompletedWorkSkeleton />;

  if (error && !data) {
    return (
      <div className="h-full w-full overflow-y-auto custom-scrollbar p-3 pb-20 md:p-6 md:pb-8 lg:p-8">
        <div className="rounded-[28px] border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      </div>
    );
  }

  const summary = data!.summary;
  const fullHistory = data!.history;
  const recentHistory = fullHistory.slice(0, 6);

  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-y-auto custom-scrollbar p-3 pb-20 animate-fade-in md:gap-6 md:p-6 md:pb-8 lg:p-8">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[28px] border border-slate-200/70 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 md:p-6"
      >
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Recent completed work</p>
            <h3 className="mt-2 text-xl font-black text-slate-900 dark:text-white sm:text-2xl">See what each recent job contributes</h3>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-600 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300">
            {summary.lifetime_completed_jobs} completed jobs total
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {recentHistory.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm font-semibold text-slate-500 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-400">
              Completed jobs will show here once the client confirms them.
            </div>
          ) : (
            recentHistory.map((item) => {
              const totalFromJob = Number(item.worker_payout || 0) + Number(item.total_bonus || 0);

              return (
                <div key={item.id_request} className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-800/60">
                  <div className="absolute inset-x-0 top-0 h-1 bg-bird-blue/40" />
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 xl:max-w-[44%]">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-lg font-black text-slate-900 dark:text-white">{item.service_name}</p>
                        <span
                          className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${getPayoutStatusBadge(item.worker_payout_status)}`}
                        >
                          Base {getPayoutStatusLabel(item.worker_payout_status)}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${getPayoutStatusBadge(item.bonus_status)}`}
                        >
                          Bonus {getPayoutStatusLabel(item.bonus_status)}
                        </span>
                      </div>

                      <p className="mt-2 truncate text-sm font-semibold text-slate-600 dark:text-slate-300">
                        {item.client_name || 'Client'} / {formatDate(item.completed_at)}
                      </p>
                      <p className="mt-2 truncate text-sm text-slate-500 dark:text-slate-400">{item.location_text}</p>
                      <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">{item.description}</p>
                    </div>

                    <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl border border-white/70 bg-white p-3 dark:border-white/10 dark:bg-slate-800">
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Base earnings</p>
                        <p className="mt-2 text-xl font-black text-slate-900 dark:text-white">{formatMoney(item.worker_payout)}</p>
                      </div>
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400">Commission bonus</p>
                        <p className="mt-2 text-xl font-black text-amber-700 dark:text-amber-400">{formatMoney(item.commission_bonus)}</p>
                      </div>
                      <div className="rounded-2xl border border-bird-blue/15 bg-bird-blue/10 p-3 dark:border-bird-blue/25 dark:bg-bird-blue/15">
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-bird-blue">Total from job</p>
                        <p className="mt-2 text-xl font-black text-bird-blue">{formatMoney(totalFromJob)}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-800">
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Scheduled payout date</p>
                        <p className="mt-2 text-base font-black text-slate-900 dark:text-white">{formatDate(item.scheduled_payout_date)}</p>
                        {item.worker_payout_paid_at && (
                          <p className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            Paid {formatDate(item.worker_payout_paid_at)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </motion.div>

      <EarningsStatementSection history={fullHistory} />
    </div>
  );
};
