import React from 'react';
import { motion } from 'framer-motion';
import { useWorkerRewardsDashboard } from '../../hooks/useWorkerRewardsDashboard';

const formatMoney = (value: number) => `$${Number(value || 0).toFixed(2)}`;

const getBonusStatusBadge = (status: string) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'paid') return 'border border-emerald-200 bg-emerald-50 text-emerald-700';
  if (normalized === 'scheduled') return 'border border-amber-200 bg-amber-50 text-amber-700';
  if (normalized === 'cancelled') return 'border border-slate-200 bg-slate-100 text-slate-500';
  return 'border border-slate-200 bg-slate-50 text-slate-500';
};

const getBonusStatusLabel = (status: string) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'paid') return 'Paid';
  if (normalized === 'scheduled') return 'Scheduled';
  if (normalized === 'cancelled') return 'Cancelled';
  return 'Not eligible';
};

const ProgressBar: React.FC<{ value: number; tone?: 'blue' | 'amber' | 'emerald' }> = ({
  value,
  tone = 'blue',
}) => {
  const toneClass =
    tone === 'amber'
      ? 'from-amber-400 to-orange-400'
      : tone === 'emerald'
        ? 'from-emerald-400 to-teal-400'
        : 'from-bird-blue to-sky-400';

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <motion.div
        className={`h-full rounded-full bg-gradient-to-r ${toneClass} transition-all duration-500`}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      />
    </div>
  );
};

const EarningsSkeleton: React.FC = () => (
  <div className="w-full h-full overflow-y-auto custom-scrollbar p-3 md:p-6 lg:p-8 pb-20 md:pb-8 flex flex-col gap-4 md:gap-6 animate-fade-in">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="h-32 rounded-2xl border border-gray-200 bg-white animate-pulse" />
      ))}
    </div>
    <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4 md:gap-6">
      <div className="h-[280px] rounded-3xl border border-gray-200 bg-white animate-pulse" />
      <div className="h-[280px] rounded-3xl border border-gray-200 bg-white animate-pulse" />
    </div>
  </div>
);

export const EarningsView: React.FC = () => {
  const { data, loading, error } = useWorkerRewardsDashboard();

  if (loading && !data) return <EarningsSkeleton />;

  if (error && !data) {
    return (
      <div className="w-full h-full overflow-y-auto custom-scrollbar p-3 md:p-6 lg:p-8 pb-20 md:pb-8">
        <div className="rounded-[28px] border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      </div>
    );
  }

  const summary = data!.summary;
  const program = data!.program;
  const progress = data!.progress;
  const recentHistory = data!.history.slice(0, 6);
  const upcomingPayouts = data!.calendar.items.slice(0, 4);
  const rewardCards = [
    {
      title: 'Released earnings',
      value: formatMoney(summary.released_worker_payout),
      detail: 'Money already released from completed jobs.',
      accent: 'bg-bird-blue/10',
      glow: 'bg-bird-blue/15',
    },
    {
      title: 'Next payout',
      value: formatMoney(summary.next_payout_amount),
      detail: summary.next_payout_date
        ? `${summary.next_payout_label || 'Scheduled payout'} on ${new Date(summary.next_payout_date).toLocaleDateString()}`
        : `Payouts land every ${program.payout_day_label}.`,
      accent: 'bg-amber-100',
      glow: 'bg-amber-200/20',
    },
    {
      title: 'Bonuses this cycle',
      value: formatMoney(summary.total_bonus),
      detail: `Commission ${Math.round(program.commission_rate * 100)}% + royalty ${Math.round(program.royalty_rate * 100)}%.`,
      accent: 'bg-emerald-100',
      glow: 'bg-emerald-200/20',
    },
  ];

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar p-3 md:p-6 lg:p-8 pb-20 md:pb-8 flex flex-col gap-4 md:gap-6 animate-fade-in">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-[28px] border border-bird-blue/15 bg-gradient-to-r from-bird-blue/10 via-white to-bird-yellow/15 p-5 shadow-sm"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-bird-blue">Rewards program</p>
            <h2 className="mt-2 text-2xl font-black text-slate-900">Commissions and royalty tracking</h2>
            <p className="mt-2 text-sm font-semibold text-slate-600">
              Rewards only start counting from January 2026, so older jobs stay out of the bonus cycle.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:min-w-[320px]">
            <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Trial unlock</p>
              <p className="mt-1 text-xl font-black text-slate-900">{program.trial_min_completed_jobs} jobs</p>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-sm">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Royalty goal</p>
              <p className="mt-1 text-xl font-black text-slate-900">{program.royalty_min_jobs} jobs</p>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        {rewardCards.map((card, index) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="bg-white rounded-2xl md:rounded-3xl p-4 md:p-6 border border-gray-200 relative overflow-hidden shadow-sm"
          >
            <div className={`absolute top-0 right-0 h-28 w-28 rounded-full ${card.glow} blur-2xl`} />
            <div className={`absolute inset-x-0 top-0 h-1 ${card.accent}`} />
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{card.title}</p>
            <p className="mt-3 text-3xl font-black text-slate-900">{card.value}</p>
            <p className="mt-2 text-sm text-slate-500">{card.detail}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-4 md:gap-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-[28px] border border-gray-200 bg-white p-5 md:p-6 shadow-sm"
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-bird-blue">Commission program</p>
              <h3 className="mt-2 text-2xl font-black text-slate-900">Unlock bonuses and track your payout pace</h3>
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-600">
              Trial unlock: {program.trial_min_completed_jobs} completed jobs
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Commission trial</p>
                  <p className="mt-2 text-xl font-black text-slate-900">
                    {summary.trial_unlocked ? 'Unlocked' : `${progress.jobs_until_trial} job(s) left`}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${
                  summary.trial_unlocked
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border border-amber-200 bg-amber-50 text-amber-700'
                }`}>
                  {summary.trial_unlocked ? 'Active' : 'Trial'}
                </span>
              </div>
              <div className="mt-4">
                <ProgressBar value={progress.trial_progress_percent} tone="blue" />
              </div>
              <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
                <span>{summary.lifetime_completed_jobs} completed total</span>
                <span>{progress.trial_progress_percent}%</span>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Royalty target</p>
                  <p className="mt-2 text-xl font-black text-slate-900">
                    {summary.royalty_unlocked ? 'Unlocked this cycle' : `${progress.jobs_until_royalty} job(s) + ${progress.completion_rate_gap}%`}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${
                  summary.royalty_unlocked
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border border-bird-blue/15 bg-bird-blue/10 text-bird-blue'
                }`}>
                  {summary.royalty_unlocked ? 'Ready' : 'In progress'}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-500">
                    <span>Jobs this cycle</span>
                    <span>{summary.current_cycle_completed_jobs} / {program.royalty_min_jobs}</span>
                  </div>
                  <ProgressBar value={progress.royalty_jobs_progress_percent} tone="amber" />
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-500">
                    <span>Completion rate</span>
                    <span>{summary.completion_rate}% / {program.royalty_min_completion_rate}%</span>
                  </div>
                  <ProgressBar value={progress.completion_rate_progress_percent} tone="emerald" />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-bird-blue/15 bg-gradient-to-r from-bird-blue/10 via-sky-50 to-amber-50 p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-bird-blue">Recommended demo policy</p>
                <p className="mt-2 text-sm font-semibold text-slate-700">
                  Keep the commission bonus at {Math.round(program.commission_rate * 100)}% after the first {program.trial_min_completed_jobs} completed jobs.
                  Then add a {Math.round(program.royalty_rate * 100)}% monthly royalty when the worker closes at least {program.royalty_min_jobs} jobs and keeps a {program.royalty_min_completion_rate}% completion rate.
                </p>
              </div>
              <div className="shrink-0 rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-right">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Cycle gross</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{formatMoney(summary.cycle_gross_earnings)}</p>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
          className="rounded-[28px] border border-gray-200 bg-white p-5 md:p-6 shadow-sm"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Upcoming payouts</p>
              <h3 className="mt-2 text-xl font-black text-slate-900">What lands next</h3>
            </div>
            <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
              {formatMoney(summary.pending_worker_payout)} pending worker payout
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {upcomingPayouts.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm font-semibold text-slate-500">
                No bonus payouts are scheduled yet. Finish more jobs to populate the next Friday batches.
              </div>
            ) : (
              upcomingPayouts.map((item) => (
                <div key={`${item.date}-${item.type}`} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-900">{item.label}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {new Date(item.date).toLocaleDateString()} {item.jobs_count > 0 ? `/ ${item.jobs_count} job(s)` : ''}
                      </p>
                    </div>
                    <span className="text-lg font-black text-bird-blue">{formatMoney(item.amount)}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-6">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Recent completed jobs</p>
            <div className="mt-3 space-y-3">
              {recentHistory.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm font-semibold text-slate-500">
                  Completed jobs will appear here once the client confirms them.
                </div>
              ) : (
                recentHistory.map((item) => (
                  <div key={item.id_request} className="rounded-3xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-900">{item.service_name}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {(item.client_name || 'Client') + ' / ' + new Date(item.completed_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="rounded-full border border-bird-blue/15 bg-bird-blue/10 px-3 py-1 text-xs font-black text-bird-blue">
                          +{formatMoney(item.commission_bonus)}
                        </span>
                        <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${getBonusStatusBadge(item.bonus_status)}`}>
                          {getBonusStatusLabel(item.bonus_status)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
