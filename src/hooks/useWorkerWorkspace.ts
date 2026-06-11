import { useCallback, useEffect, useState } from 'react';
import { API_ENDPOINTS } from '../config/api';
import { useWorkerUpdatesSocket, WorkerUpdatePayload } from './useWorkerUpdatesSocket';

export interface WorkerAgendaJob {
  id_request: number;
  service_name: string;
  service_icon: string | null;
  description: string;
  location_text: string;
  latitude: number | null;
  longitude: number | null;
  amount: number;
  booking_type: string;
  status: string;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
  duration_minutes: number;
  client_name: string;
}

export interface WorkerWorkspacePayload {
  summary: {
    estimated_earnings: number;
    pending_jobs: number;
    completed_jobs: number;
    total_distance_km: number;
    next_job: WorkerAgendaJob | null;
  };
  agenda: {
    buffer_minutes: number;
    range_start: string;
    range_end: string;
    jobs: WorkerAgendaJob[];
  };
}

export const useWorkerWorkspace = ({
  token,
  enabled,
  onRealtimeUpdate,
}: {
  token: string | null;
  enabled: boolean;
  onRealtimeUpdate?: (payload: WorkerUpdatePayload) => void;
}) => {
  const [data, setData] = useState<WorkerWorkspacePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!token || !enabled) return;
    if (!silent) setLoading(true);
    try {
      const response = await fetch(API_ENDPOINTS.worker.workspace, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        setError(payload?.error || 'Could not load worker workspace.');
        return;
      }
      setData({ summary: payload.summary, agenda: payload.agenda });
      setError(null);
    } catch {
      setError('Network error loading worker workspace.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [enabled, token]);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  const { connected } = useWorkerUpdatesSocket({
    token,
    enabled,
    onUpdate: (payload) => {
      onRealtimeUpdate?.(payload);
      void refresh(true);
    },
  });

  return { connected, data, error, loading, refresh };
};
