import { useCallback, useEffect, useState } from 'react';
import { API_ENDPOINTS } from '../config/api';
import { getToken } from '../utils/session';

export interface WorkerRewardCalendarItem {
  date: string;
  label: string;
  type: 'worker_payout' | 'commission' | 'royalty' | 'combined';
  amount: number;
  jobs_count: number;
  base_amount: number;
  commission_amount: number;
  performance_bonus_amount: number;
}

export interface WorkerRewardHistoryItem {
  id_request: number;
  service_name: string;
  location_text: string;
  description: string;
  client_name: string;
  completed_at: string;
  worker_payout: number;
  payment_status: string;
  worker_payout_status: string;
  worker_payout_paid_at: string | null;
  commission_bonus: number;
  royalty_bonus: number;
  total_bonus: number;
  scheduled_payout_date: string;
  bonus_status: 'scheduled' | 'paid' | 'cancelled' | 'not_eligible' | string;
  paid_at: string | null;
}

export interface WorkerRewardsDashboardData {
  program: {
    trial_min_completed_jobs: number;
    commission_rate: number;
    royalty_rate: number;
    royalty_min_jobs: number;
    royalty_min_completion_rate: number;
    payout_day_label: string;
  };
  summary: {
    lifetime_completed_jobs: number;
    current_cycle_completed_jobs: number;
    current_cycle_closed_jobs: number;
    completion_rate: number;
    cycle_gross_earnings: number;
    released_worker_payout: number;
    pending_worker_payout: number;
    pending_release_worker_payout: number;
    released_to_payout_amount: number;
    scheduled_bonus_payout: number;
    paid_bonus_payout: number;
    current_month_commission: number;
    royalty_bonus: number;
    total_bonus: number;
    next_payout_date: string | null;
    next_payout_amount: number;
    next_payout_label: string | null;
    trial_unlocked: boolean;
    royalty_unlocked: boolean;
  };
  progress: {
    jobs_until_trial: number;
    jobs_until_royalty: number;
    completion_rate_gap: number;
    trial_progress_percent: number;
    royalty_jobs_progress_percent: number;
    completion_rate_progress_percent: number;
  };
  calendar: {
    month_label: string;
    anchor_date: string;
    items: WorkerRewardCalendarItem[];
  };
  history: WorkerRewardHistoryItem[];
}

export const useWorkerRewardsDashboard = () => {
  const [data, setData] = useState<WorkerRewardsDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false) => {
    const token = getToken('worker');
    if (!token) {
      setError('Login required.');
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    setError(null);

    try {
      const res = await fetch(API_ENDPOINTS.worker.rewardsDashboard, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await res.json();

      if (!res.ok || !payload?.success) {
        setError(payload?.error || 'Could not load rewards dashboard.');
        return;
      }

      setData(payload as WorkerRewardsDashboardData);
    } catch {
      setError('Network error loading rewards dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    data,
    loading,
    error,
    refresh,
  };
};
