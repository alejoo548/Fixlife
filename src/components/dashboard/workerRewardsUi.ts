import type { WorkerRewardCalendarItem } from '../../hooks/useWorkerRewardsDashboard';
import i18n from '../../i18n';

export const formatMoney = (value: number) => `$${Number(value || 0).toFixed(2)}`;

export const formatDate = (value: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions) => {
  if (!value) return i18n.t('workerDashboard.rewardsUi.notScheduledYet');
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString(
    i18n.language === 'es' ? 'es-SV' : 'en-US',
    options || {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }
  );
};

export const getPayoutStatusBadge = (status: string) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'paid') return 'border border-emerald-200 bg-emerald-50 text-emerald-700';
  if (normalized === 'scheduled') return 'border border-amber-200 bg-amber-50 text-amber-700';
  if (normalized === 'cancelled') return 'border border-slate-200 bg-slate-100 text-slate-500';
  return 'border border-slate-200 bg-slate-50 text-slate-500';
};

export const getPayoutStatusLabel = (status: string) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'paid') return i18n.t('workerDashboard.rewardsUi.statusPaid');
  if (normalized === 'scheduled') return i18n.t('workerDashboard.rewardsUi.statusScheduled');
  if (normalized === 'cancelled') return i18n.t('workerDashboard.rewardsUi.statusCancelled');
  return i18n.t('workerDashboard.rewardsUi.statusNotEligible');
};

export const getBonusProgramLabel = (type: 'commission' | 'royalty') => {
  return type === 'commission' ? i18n.t('workerDashboard.rewardsUi.commissionBonus') : i18n.t('workerDashboard.rewardsUi.monthlyPerformanceBonus');
};

export const getCalendarItemLabel = (item: Pick<WorkerRewardCalendarItem, 'type' | 'label'>) => {
  if (item.type === 'worker_payout') return i18n.t('workerDashboard.rewardsUi.baseEarningsBatch');
  if (item.type === 'commission') return i18n.t('workerDashboard.rewardsUi.commissionBonusBatch');
  if (item.type === 'royalty') return i18n.t('workerDashboard.rewardsUi.monthlyPerformanceBonus');
  return i18n.t('workerDashboard.rewardsUi.mixedPayoutBatch');
};

export const getCalendarItemTone = (type: WorkerRewardCalendarItem['type']) => {
  if (type === 'worker_payout') {
    return {
      chip: 'border border-bird-blue/20 bg-bird-blue/10 text-bird-blue',
      amount: 'text-bird-blue',
      dot: 'bg-bird-blue',
    };
  }
  if (type === 'commission') {
    return {
      chip: 'border border-amber-200 bg-amber-50 text-amber-700',
      amount: 'text-amber-700',
      dot: 'bg-amber-500',
    };
  }
  if (type === 'royalty') {
    return {
      chip: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
      amount: 'text-emerald-700',
      dot: 'bg-emerald-500',
    };
  }
  return {
    chip: 'border border-slate-200 bg-slate-100 text-slate-700',
    amount: 'text-slate-700',
    dot: 'bg-slate-500',
  };
};

export const getCalendarBatchSummary = (items: WorkerRewardCalendarItem[]) => {
  return items.reduce(
    (acc, item) => {
      acc.total += Number(item.amount || 0);
      acc.base += Number(item.base_amount || 0);
      acc.commission += Number(item.commission_amount || 0);
      acc.performance += Number(item.performance_bonus_amount || 0);
      acc.jobs += Number(item.jobs_count || 0);
      return acc;
    },
    { total: 0, base: 0, commission: 0, performance: 0, jobs: 0 }
  );
};

export const getNextPayoutLabel = (label: string | null | undefined) => {
  const normalized = String(label || '').toLowerCase();
  if (normalized.includes('royalty')) return i18n.t('workerDashboard.rewardsUi.monthlyPerformanceBonus');
  if (normalized.includes('commission')) return i18n.t('workerDashboard.rewardsUi.commissionBonusBatch');
  if (normalized.includes('mixed')) return i18n.t('workerDashboard.rewardsUi.mixedPayoutBatch');
  if (normalized.includes('base')) return i18n.t('workerDashboard.rewardsUi.baseEarningsBatch');
  return i18n.t('workerDashboard.rewardsUi.scheduledPayoutBatch');
};
