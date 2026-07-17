import React from 'react';
import { motion } from 'framer-motion';
import { BadgeDollarSign, CalendarClock, TrendingUp } from 'lucide-react';
import { useWorkerRewardsDashboard } from '../../hooks/useWorkerRewardsDashboard';
import {formatDate,formatMoney,getBonusProgramLabel,getCalendarBatchSummary,getNextPayoutLabel,} from './workerRewardsUi';

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
  <div className="flex h-full w-full flex-col gap-4 overflow-y-auto custom-scrollbar p-3 pb-20 animate-fade-in md:gap-6 md:p-6 md:pb-8 lg:p-8">
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-32 animate-pulse rounded-2xl border border-gray-200 bg-white" />
      ))}
    </div>
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr] md:gap-6">
      <div className="h-[340px] animate-pulse rounded-3xl border border-gray-200 bg-white" />
      <div className="h-[340px] animate-pulse rounded-3xl border border-gray-200 bg-white" />
    </div>
    <div className="h-[320px] animate-pulse rounded-3xl border border-gray-200 bg-white" />
  </div>
);

export const EarningsView: React.FC = () => {
  const { data, loading, error } = useWorkerRewardsDashboard();

  if (loading && !data) return <EarningsSkeleton />;

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
  const program = data!.program;
  const progress = data!.progress;
  const nextBatch =
    data!.calendar.items.find((item) => item.date === summary.next_payout_date) || null;
  const nextBatchBreakdown = nextBatch ? getCalendarBatchSummary([nextBatch]) : null;

  const overviewCards = [
    {
      title: 'Base earnings paid',
      value: formatMoney(summary.released_worker_payout),
      detail:
        summary.released_worker_payout > 0
          ? `${formatMoney(summary.pending_worker_payout)} from completed work is already queued for later payout dates.`
          : 'Completed jobs will move here after the payout batch is marked as paid.',
      accent: 'bg-bird-blue/15',
      glow: 'bg-bird-blue/15',
    },
    {
      title: 'Bonuses paid',
      value: formatMoney(summary.paid_bonus_payout),
      detail: `${formatMoney(summary.scheduled_bonus_payout)} in commission and monthly bonuses is still scheduled.`,
      accent: 'bg-emerald-100',
      glow: 'bg-emerald-200/20',
    },
    {
      title: 'Next scheduled payout',
      value: formatMoney(summary.next_payout_amount),
      detail: summary.next_payout_date
        ? `${getNextPayoutLabel(summary.next_payout_label)} on ${formatDate(summary.next_payout_date)}.`
        : `New payout batches land every ${program.payout_day_label}.`,
      accent: 'bg-amber-100',
      glow: 'bg-amber-200/20',
    },
    {
      title: 'Waiting on release',
      value: formatMoney(summary.pending_release_worker_payout),
      detail:
        summary.pending_release_worker_payout > 0
          ? 'These funds are secured by the client but still need to move into the payout calendar.'
          : 'Nothing is waiting on client confirmation or payout release right now.',
      accent: 'bg-slate-200',
      glow: 'bg-slate-300/20',
    },
  ];

  const payoutBreakdownRows = [
    {
      label: 'Base earnings already paid',
      value: formatMoney(summary.released_worker_payout),
      tone: 'text-bird-blue',
    },
    {
      label: 'Base earnings still scheduled',
      value: formatMoney(summary.pending_worker_payout),
      tone: 'text-slate-900',
    },
    {
      label: 'Bonuses already paid',
      value: formatMoney(summary.paid_bonus_payout),
      tone: 'text-emerald-700',
    },
    {
      label: 'Bonuses still scheduled',
      value: formatMoney(summary.scheduled_bonus_payout),
      tone: 'text-amber-700',
    },
  ];

  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-y-auto custom-scrollbar p-3 pb-20 animate-fade-in md:gap-6 md:p-6 md:pb-8 lg:p-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 md:p-6"
      >
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-stretch">
          <div className="flex min-w-0 gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-sky-50 text-bird-blue dark:bg-sky-400/10">
              <BadgeDollarSign className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-bird-blue">
                Worker payout plan
              </p>
              <h2 className="mt-2 max-w-3xl text-2xl font-black leading-tight text-slate-950 dark:text-white md:text-3xl">
                Clear payout tracking for base earnings and bonuses
              </h2>
              <p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
                See what has already been paid, what is scheduled for the next payout batch, and which bonus rules are still in progress.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-800">
              <div className="flex items-center gap-2 text-sky-500">
                <TrendingUp className="h-4 w-4" />
                <p className="text-[10px] font-black uppercase tracking-[0.16em]">Commission unlock</p>
              </div>
              <p className="mt-3 text-xl font-black text-slate-950 dark:text-white">
                {program.trial_min_completed_jobs} jobs
              </p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
                Lifetime completed jobs required.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-800">
              <div className="flex items-center gap-2 text-emerald-500">
                <CalendarClock className="h-4 w-4" />
                <p className="text-[10px] font-black uppercase tracking-[0.16em]">Monthly target</p>
              </div>
              <p className="mt-3 text-xl font-black text-slate-950 dark:text-white">
                {program.royalty_min_jobs} jobs
              </p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
                Plus {program.royalty_min_completion_rate}% completion rate.
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {overviewCards.map((card, index) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="relative min-h-[170px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900 md:rounded-3xl md:p-6"
          >
            <div className={`absolute right-0 top-0 h-28 w-28 rounded-full ${card.glow} blur-2xl`} />
            <div className={`absolute inset-x-0 top-0 h-1 ${card.accent}`} />
            <div className="relative">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{card.title}</p>
              <p className="mt-4 text-3xl font-black text-slate-950 dark:text-white sm:text-4xl">{card.value}</p>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">{card.detail}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.08fr_0.92fr] md:gap-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm md:p-6"
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-bird-blue">Bonus progress</p>
              <h3 className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">Track the two bonus rules clearly</h3>
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-600">
              Payout day: every {program.payout_day_label}
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Commission bonus</p>
                  <p className="mt-2 text-lg font-black text-slate-900 sm:text-xl">
                    {summary.trial_unlocked ? 'Unlocked' : `${progress.jobs_until_trial} lifetime job(s) left`}
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    After {program.trial_min_completed_jobs} lifetime completed jobs, each eligible job can add a {Math.round(program.commission_rate * 100)}% commission bonus.
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${
                    summary.trial_unlocked
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border border-amber-200 bg-amber-50 text-amber-700'
                  }`}
                >
                  {summary.trial_unlocked ? 'Active' : 'Locked'}
                </span>
              </div>
              <div className="mt-4">
                <ProgressBar value={progress.trial_progress_percent} tone="blue" />
              </div>
              <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
                <span>{summary.lifetime_completed_jobs} lifetime jobs counted</span>
                <span>{progress.trial_progress_percent}%</span>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Monthly performance bonus</p>
                  <p className="mt-2 text-xl font-black text-slate-900">
                    {summary.royalty_unlocked
                      ? 'Unlocked this cycle'
                      : `${progress.jobs_until_royalty} job(s) + ${progress.completion_rate_gap}% left`}
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    Hit {program.royalty_min_jobs} jobs in the current cycle and keep at least {program.royalty_min_completion_rate}% completion to add a {Math.round(program.royalty_rate * 100)}% monthly bonus.
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${
                    summary.royalty_unlocked
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border border-bird-blue/15 bg-bird-blue/10 text-bird-blue'
                  }`}
                >
                  {summary.royalty_unlocked ? 'Ready' : 'In progress'}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-500">
                    <span>Jobs in this cycle</span>
                    <span>
                      {summary.current_cycle_completed_jobs} / {program.royalty_min_jobs}
                    </span>
                  </div>
                  <ProgressBar value={progress.royalty_jobs_progress_percent} tone="amber" />
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-500">
                    <span>Completion rate</span>
                    <span>
                      {summary.completion_rate}% / {program.royalty_min_completion_rate}%
                    </span>
                  </div>
                  <ProgressBar value={progress.completion_rate_progress_percent} tone="emerald" />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="max-w-3xl">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-bird-blue">Payout policy</p>
                <p className="mt-2 text-sm font-semibold text-slate-700">
                  Base earnings are scheduled into payout batches first. Commission bonuses unlock after {program.trial_min_completed_jobs} lifetime completed jobs, and the monthly performance bonus unlocks once the worker closes at least {program.royalty_min_jobs} jobs with a {program.royalty_min_completion_rate}% completion rate during the cycle.
                </p>
              </div>
              <div className="shrink-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-right">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Cycle gross base earnings</p>
                <p className="mt-1 text-xl font-black text-slate-900 sm:text-2xl">{formatMoney(summary.cycle_gross_earnings)}</p>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
          className="rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm md:p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Current money breakdown</p>
              <h3 className="mt-2 text-xl font-black text-slate-900 sm:text-2xl">What those totals mean</h3>
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-slate-600">
              {summary.lifetime_completed_jobs} jobs counted
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {payoutBreakdownRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <span className="text-sm font-semibold text-slate-600">{row.label}</span>
                <span className={`text-lg font-black ${row.tone}`}>{row.value}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Next payout batch</p>
            <p className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">{formatMoney(summary.next_payout_amount)}</p>
            <p className="mt-2 text-sm text-slate-500">
              {summary.next_payout_date
                ? `${getNextPayoutLabel(summary.next_payout_label)} scheduled for ${formatDate(summary.next_payout_date)}.`
                : 'As soon as work is released into a payout cycle, the next batch will show here.'}
            </p>

            {nextBatchBreakdown && (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/70 bg-white px-3 py-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Base earnings</p>
                  <p className="mt-2 text-xl font-black text-slate-900">{formatMoney(nextBatchBreakdown.base)}</p>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white px-3 py-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Commission bonus</p>
                  <p className="mt-2 text-xl font-black text-amber-700">{formatMoney(nextBatchBreakdown.commission)}</p>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white px-3 py-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Monthly bonus</p>
                  <p className="mt-2 text-xl font-black text-emerald-700">{formatMoney(nextBatchBreakdown.performance)}</p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">At a glance</p>
            <div className="mt-3 space-y-2 text-sm font-semibold text-slate-600">
              <div className="flex items-center justify-between gap-3">
                <span>{getBonusProgramLabel('commission')}</span>
                <span className="font-black text-slate-900">
                  {summary.trial_unlocked ? 'Unlocked' : `${progress.jobs_until_trial} job(s) left`}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>{getBonusProgramLabel('royalty')}</span>
                <span className="font-black text-slate-900">
                  {summary.royalty_unlocked ? 'Unlocked' : `${progress.jobs_until_royalty} job(s) left`}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Completion rate gap</span>
                <span className="font-black text-slate-900">{progress.completion_rate_gap}%</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

    </div>
  );
};
