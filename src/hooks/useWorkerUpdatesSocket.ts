import { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getSocketBaseUrl, getDefaultSocketOptions } from '../config/api';

export interface WorkerUpdatePayload {
  event_type: string;
  id_request?: number | null;
  title?: string;
  message?: string;
  tone?: 'info' | 'success' | 'warning';
  metadata?: Record<string, unknown> | null;
  emitted_at?: string;
}

export const useWorkerUpdatesSocket = ({
  token,
  enabled,
  onUpdate,
}: {
  token: string | null;
  enabled: boolean;
  onUpdate: (payload: WorkerUpdatePayload) => void;
}) => {
  const socketRef = useRef<Socket | null>(null);
  const onUpdateRef = useRef(onUpdate);
  const [connected, setConnected] = useState(false);
  const socketUrl = useMemo(
    () => getSocketBaseUrl(),
    []
  );

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!enabled || !token) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      return;
    }
    const opts = getDefaultSocketOptions(token!);
    const socket = io(socketUrl, opts);
    socketRef.current = socket;
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    socket.on('worker:update', (payload: WorkerUpdatePayload) => {
      if (payload?.event_type) onUpdateRef.current(payload);
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [enabled, socketUrl, token]);

  return { connected };
};
