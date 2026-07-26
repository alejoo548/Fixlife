import { useEffect, useMemo, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { getSocketBaseUrl, getDefaultSocketOptions } from '../config/api';

type EventMap = Record<string, (data: unknown) => void>;

interface UseSSEOptions {
  token: string | null;
  events: EventMap;
  enabled?: boolean;
}

// We keep one real Socket instance per URL+token and ref-count consumers so
// the socket only disconnects when the last useSSE unmounts. Previously this
// created a brand-new `io()` connection on every acquire while only sharing
// the counter, leaking duplicate sockets that kept pushing stale/duplicate
// live-location events (map markers jumping around from two live connections).
const sharedSockets = new Map<string, { socket: Socket; count: number }>();

function acquireSocket(socketUrl: string, token: string): Socket {
  const key = `${socketUrl}|${token}`;
  const existing = sharedSockets.get(key);
  if (existing) {
    existing.count += 1;
    return existing.socket;
  }

  const opts = getDefaultSocketOptions(token);
  const socket = io(socketUrl, opts);

  // Silence repeated connection errors to reduce console spam on transient failures
  socket.on('connect_error', () => {
    // intentionally silent (consumers can react via their own state if needed)
  });

  sharedSockets.set(key, { socket, count: 1 });
  return socket;
}

function releaseSocket(socketUrl: string, token: string, socket: Socket): void {
  const key = `${socketUrl}|${token}`;
  const entry = sharedSockets.get(key);
  if (!entry || entry.socket !== socket) return;
  entry.count -= 1;
  if (entry.count <= 0) {
    sharedSockets.delete(key);
    socket.disconnect();
  }
}

/**
 * Drop-in replacement for the old SSE-based hook, now backed by socket.io.
 * API is identical — all callers work unchanged.
 * Multiple useSSE calls with the same token share one underlying WebSocket.
 * The connection is torn down only when the last caller unmounts or disables.
 */
export function useSSE({ token, events, enabled = true }: UseSSEOptions): void {
  const handlersRef = useRef<EventMap>(events);
  handlersRef.current = events;

  const socketUrl = useMemo(() => getSocketBaseUrl(), []);

  useEffect(() => {
    if (!token || !enabled) return;

    const socket = acquireSocket(socketUrl, token);

    const eventNames = Object.keys(handlersRef.current);
    const teardowns: Array<() => void> = [];

    for (const name of eventNames) {
      const listener = (data: unknown) => {
        handlersRef.current[name]?.(data);
      };
      socket.on(name, listener);
      teardowns.push(() => socket.off(name, listener));
    }

    return () => {
      teardowns.forEach((off) => off());
      releaseSocket(socketUrl, token, socket);
    };
  }, [token, enabled, socketUrl]); // eslint-disable-line react-hooks/exhaustive-deps
}
