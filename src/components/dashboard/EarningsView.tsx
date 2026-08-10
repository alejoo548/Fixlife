import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { BadgeDollarSign, CalendarClock, TrendingUp } from 'lucide-react';
import { useWorkerRewardsDashboard } from '../../hooks/useWorkerRewardsDashboard';
import { WorkerAnalyticsSection } from './WorkerAnalyticsSection';
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
  const { t } = useTranslation();
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
      title: t('workerDashboard.earnings.cardBaseEarningsPaid'),
      value: formatMoney(summary.released_worker_payout),
      detail:
        summary.released_worker_payout > 0
          ? t('workerDashboard.earnings.cardBaseEarningsPaidDetailPending', { amount: formatMoney(summary.pending_worker_payout) })
          : t('workerDashboard.earnings.cardBaseEarningsPaidDetailEmpty'),
      accent: 'bg-bird-blue/15',
      glow: 'bg-bird-blue/15',
    },
    {
      title: t('workerDashboard.earnings.cardBonusesPaid'),
      value: formatMoney(summary.paid_bonus_payout),
      detail: t('workerDashboard.earnings.cardBonusesPaidDetail', { amount: formatMoney(summary.scheduled_bonus_payout) }),
      accent: 'bg-emerald-100',
      glow: 'bg-emerald-200/20',
    },
    {
      title: t('workerDashboard.earnings.cardNextScheduledPayout'),
      value: formatMoney(summary.next_payout_amount),
      detail: summary.next_payout_date
        ? t('workerDashboard.earnings.cardNextScheduledPayoutDetail', { label: getNextPayoutLabel(summary.next_payout_label), date: formatDate(summary.next_payout_date) })
        : t('workerDashboard.earnings.cardNextScheduledPayoutDetailEmpty', { day: program.payout_day_label }),
      accent: 'bg-amber-100',
      glow: 'bg-amber-200/20',
    },
    {
      title: t('workerDashboard.earnings.cardWaitingOnRelease'),
      value: formatMoney(summary.pending_release_worker_payout),
      detail:
        summary.pending_release_worker_payout > 0
          ? t('workerDashboard.earnings.cardWaitingOnReleaseDetailPending')
          : t('workerDashboard.earnings.cardWaitingOnReleaseDetailEmpty'),
      accent: 'bg-slate-200',
      glow: 'bg-slate-300/20',
    },
  ];

  const payoutBreakdownRows = [
    {
      label: t('workerDashboard.earnings.breakdownBaseEarningsPaid'),
      value: formatMoney(summary.released_worker_payout),
      tone: 'text-bird-blue',
    },
    {
      label: t('workerDashboard.earnings.breakdownBaseEarningsScheduled'),
      value: formatMoney(summary.pending_worker_payout),
      tone: 'text-slate-900 dark:text-white',
    },
    {
      label: t('workerDashboard.earnings.breakdownBonusesPaid'),
      value: formatMoney(summary.paid_bonus_payout),
      tone: 'text-emerald-700 dark:text-emerald-400',
    },
    {
      label: t('workerDashboard.earnings.breakdownBonusesScheduled'),
      value: formatMoney(summary.scheduled_bonus_payout),
      tone: 'text-amber-700 dark:text-amber-400',
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
                {t('workerDashboard.earnings.planLabel')}
              </p>
              <h2 className="mt-2 max-w-3xl text-2xl font-black leading-tight text-slate-950 dark:text-white md:text-3xl">
                {t('workerDashboard.earnings.heroTitle')}
              </h2>
              <p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
                {t('workerDashboard.earnings.heroSubtitle')}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-800">
              <div className="flex items-center gap-2 text-sky-500">
                <TrendingUp className="h-4 w-4" />
                <p className="text-[10px] font-black uppercase tracking-[0.16em]">{t('workerDashboard.earnings.commissionUnlock')}</p>
              </div>
              <p className="mt-3 text-xl font-black text-slate-950 dark:text-white">
                {t('workerDashboard.earnings.jobsCount', { count: program.trial_min_completed_jobs })}
              </p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
                {t('workerDashboard.earnings.lifetimeJobsRequired')}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-800">
              <div className="flex items-center gap-2 text-emerald-500">
                <CalendarClock className="h-4 w-4" />
                <p className="text-[10px] font-black uppercase tracking-[0.16em]">{t('workerDashboard.earnings.monthlyTarget')}</p>
              </div>
              <p className="mt-3 text-xl font-black text-slate-950 dark:text-white">
                {t('workerDashboard.earnings.jobsCount', { count: program.royalty_min_jobs })}
              </p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
                {t('workerDashboard.earnings.plusCompletionRate', { rate: program.royalty_min_completion_rate })}
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      <WorkerAnalyticsSection />

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
          className="rounded-[28px] border border-slate-200/70 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 md:p-6"
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-bird-blue">{t('workerDashboard.earnings.bonusProgress')}</p>
              <h3 className="mt-2 text-xl font-black text-slate-900 dark:text-white sm:text-2xl">{t('workerDashboard.earnings.bonusProgressTitle')}</h3>
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-600 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300">
              {t('workerDashboard.earnings.payoutDay', { day: program.payout_day_label })}
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-800/60">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t('workerDashboard.earnings.commissionBonus')}</p>
                  <p className="mt-2 text-lg font-black text-slate-900 dark:text-white sm:text-xl">
                    {summary.trial_unlocked ? t('workerDashboard.earnings.unlocked') : t('workerDashboard.earnings.jobsLeft', { count: progress.jobs_until_trial })}
                  </p>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    {t('workerDashboard.earnings.commissionBonusDetail', { jobs: program.trial_min_completed_jobs, rate: Math.round(program.commission_rate * 100) })}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${
                    summary.trial_unlocked
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400'
                      : 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400'
                  }`}
                >
                  {summary.trial_unlocked ? t('workerDashboard.earnings.active') : t('workerDashboard.earnings.locked')}
                </span>
              </div>
              <div className="mt-4">
                <ProgressBar value={progress.trial_progress_percent} tone="blue" />
              </div>
              <div className="mt-3 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
                <span>{t('workerDashboard.earnings.lifetimeJobsCounted', { count: summary.lifetime_completed_jobs })}</span>
                <span>{progress.trial_progress_percent}%</span>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-800/60">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t('workerDashboard.earnings.monthlyPerformanceBonus')}</p>
                  <p className="mt-2 text-xl font-black text-slate-900 dark:text-white">
                    {summary.royalty_unlocked
                      ? t('workerDashboard.earnings.unlockedThisCycle')
                      : t('workerDashboard.earnings.jobsAndRateLeft', { jobs: progress.jobs_until_royalty, rate: progress.completion_rate_gap })}
                  </p>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    {t('workerDashboard.earnings.monthlyBonusDetail', { jobs: program.royalty_min_jobs, rate: program.royalty_min_completion_rate, bonusRate: Math.round(program.royalty_rate * 100) })}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${
                    summary.royalty_unlocked
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400'
                      : 'border border-bird-blue/15 bg-bird-blue/10 text-bird-blue dark:border-bird-blue/25 dark:bg-bird-blue/15'
                  }`}
                >
                  {summary.royalty_unlocked ? t('workerDashboard.earnings.ready') : t('workerDashboard.earnings.inProgress')}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-500 dark:text-slate-400">
                    <span>{t('workerDashboard.earnings.jobsInCycle')}</span>
                    <span>
                      {summary.current_cycle_completed_jobs} / {program.royalty_min_jobs}
                    </span>
                  </div>
                  <ProgressBar value={progress.royalty_jobs_progress_percent} tone="amber" />
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-500 dark:text-slate-400">
                    <span>{t('workerDashboard.earnings.completionRate')}</span>
                    <span>
                      {summary.completion_rate}% / {program.royalty_min_completion_rate}%
                    </span>
                  </div>
                  <ProgressBar value={progress.completion_rate_progress_percent} tone="emerald" />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-800/60">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="max-w-3xl">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-bird-blue">{t('workerDashboard.earnings.payoutPolicy')}</p>
                <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {t('workerDashboard.earnings.payoutPolicyDetail', { trialJobs: program.trial_min_completed_jobs, royaltyJobs: program.royalty_min_jobs, rate: program.royalty_min_completion_rate })}
                </p>
              </div>
              <div className="shrink-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-right dark:border-white/10 dark:bg-slate-800">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t('workerDashboard.earnings.cycleGrossEarnings')}</p>
                <p className="mt-1 text-xl font-black text-slate-900 dark:text-white sm:text-2xl">{formatMoney(summary.cycle_gross_earnings)}</p>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
          className="rounded-[28px] border border-slate-200/70 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 md:p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t('workerDashboard.earnings.currentMoneyBreakdown')}</p>
              <h3 className="mt-2 text-xl font-black text-slate-900 dark:text-white sm:text-2xl">{t('workerDashboard.earnings.whatTotalsMean')}</h3>
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-slate-600 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300">
              {t('workerDashboard.earnings.jobsCounted', { count: summary.lifetime_completed_jobs })}
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {payoutBreakdownRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-slate-800/60">
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{row.label}</span>
                <span className={`text-lg font-black ${row.tone}`}>{row.value}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-800/60">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t('workerDashboard.earnings.nextPayoutBatch')}</p>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">{formatMoney(summary.next_payout_amount)}</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {summary.next_payout_date
                ? t('workerDashboard.earnings.nextPayoutScheduled', { label: getNextPayoutLabel(summary.next_payout_label), date: formatDate(summary.next_payout_date) })
                : t('workerDashboard.earnings.nextPayoutEmpty')}
            </p>

            {nextBatchBreakdown && (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/70 bg-white px-3 py-3 dark:border-white/10 dark:bg-slate-800">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t('workerDashboard.earnings.baseEarnings')}</p>
                  <p className="mt-2 text-xl font-black text-slate-900 dark:text-white">{formatMoney(nextBatchBreakdown.base)}</p>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white px-3 py-3 dark:border-white/10 dark:bg-slate-800">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t('workerDashboard.earnings.commissionBonusShort')}</p>
                  <p className="mt-2 text-xl font-black text-amber-700 dark:text-amber-400">{formatMoney(nextBatchBreakdown.commission)}</p>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white px-3 py-3 dark:border-white/10 dark:bg-slate-800">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t('workerDashboard.earnings.monthlyBonusShort')}</p>
                  <p className="mt-2 text-xl font-black text-emerald-700 dark:text-emerald-400">{formatMoney(nextBatchBreakdown.performance)}</p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-800/60">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t('workerDashboard.earnings.atAGlance')}</p>
            <div className="mt-3 space-y-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
              <div className="flex items-center justify-between gap-3">
                <span>{getBonusProgramLabel('commission')}</span>
                <span className="font-black text-slate-900 dark:text-white">
                  {summary.trial_unlocked ? t('workerDashboard.earnings.unlocked') : t('workerDashboard.earnings.jobsLeftShort', { count: progress.jobs_until_trial })}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>{getBonusProgramLabel('royalty')}</span>
                <span className="font-black text-slate-900 dark:text-white">
                  {summary.royalty_unlocked ? t('workerDashboard.earnings.unlocked') : t('workerDashboard.earnings.jobsLeftShort', { count: progress.jobs_until_royalty })}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>{t('workerDashboard.earnings.completionRateGap')}</span>
                <span className="font-black text-slate-900 dark:text-white">{progress.completion_rate_gap}%</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

    </div>
  );
};
