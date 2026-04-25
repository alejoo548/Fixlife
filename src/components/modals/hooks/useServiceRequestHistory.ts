import { useCallback, useEffect, useState } from 'react';
import { API_ENDPOINTS } from '../../../config/api';
import { getToken, isAuthenticated } from '../../../utils/session';

export type ServiceRequestHistoryStatus =
  | 'all'
  | 'pending'
  | 'payment_pending'
  | 'paid'
  | 'assigned'
  | 'in_progress'
  | 'awaiting_confirmation'
  | 'done'
  | 'cancelled';

export const useServiceRequestHistory = <TRequest,>(isOpen: boolean) => {
  const [myRequests, setMyRequests] = useState<TRequest[]>([]);
  const [historyStatus, setHistoryStatus] = useState<ServiceRequestHistoryStatus>('all');
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchMyRequests = useCallback(
    async (status: ServiceRequestHistoryStatus = historyStatus, silent = false) => {
      const token = getToken();
      if (!token || !isAuthenticated()) {
        setMyRequests([]);
        return;
      }

      try {
        if (!silent) setHistoryLoading(true);
        const res = await fetch(`${API_ENDPOINTS.services.myRequests}?status=${status}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await res.json();
        if (res.ok && payload?.success) {
          setMyRequests(Array.isArray(payload.requests) ? payload.requests : []);
        }
      } catch {
        // Keep the last known list visible when a refresh hiccups.
      } finally {
        if (!silent) setHistoryLoading(false);
      }
    },
    [historyStatus]
  );

  useEffect(() => {
    if (!isOpen) return;
    void fetchMyRequests(historyStatus);
  }, [fetchMyRequests, historyStatus, isOpen]);

  return {
    fetchMyRequests,
    historyLoading,
    historyStatus,
    myRequests,
    setHistoryStatus,
  };
};
