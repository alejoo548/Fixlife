import { useMemo } from 'react';

const ACTIVE_TRACKED_REQUEST_PRIORITY = [
  'in_progress',
  'awaiting_confirmation',
  'paid',
  'payment_pending',
];

interface ActiveTrackedRequestLike {
  assigned_worker?: unknown;
  created_at?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status?: string | null;
}

export const useActiveTrackedRequest = <T extends ActiveTrackedRequestLike>(requests: T[]) =>
  useMemo(() => {
    return (
      [...requests]
        .filter((request) => {
          const status = String(request.status || '').toLowerCase();
          return (
            ACTIVE_TRACKED_REQUEST_PRIORITY.includes(status) &&
            Boolean(request.assigned_worker) &&
            request.latitude != null &&
            request.longitude != null
          );
        })
        .sort((left, right) => {
          const leftStatus = String(left.status || '').toLowerCase();
          const rightStatus = String(right.status || '').toLowerCase();
          return (
            ACTIVE_TRACKED_REQUEST_PRIORITY.indexOf(leftStatus) -
              ACTIVE_TRACKED_REQUEST_PRIORITY.indexOf(rightStatus) ||
            new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime()
          );
        })[0] || null
    );
  }, [requests]);
