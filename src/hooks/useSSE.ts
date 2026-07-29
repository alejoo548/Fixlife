import { useEffect, useMemo, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { getSocketBaseUrl, getDefaultSocketOptions } from '../config/api';

type EventMap = Record<string, (data: unknown) => void>;

interface UseSSEOptions {
  token: string | null;
  events: EventMap;
  enabled?: boolean;
}

// socket.io-client returns the same Socket instance for the same URL+token.
// We ref-count so the socket only disconnects when the last useSSE unmounts.
const socketRefCounts = new Map<string, number>();

function acquireSocket(socketUrl: string, token: string): Socket {
  const key = `${socketUrl}|${token}`;
  const count = socketRefCounts.get(key) ?? 0;
  socketRefCounts.set(key, count + 1);

  const opts = getDefaultSocketOptions(token);
  const socket = io(socketUrl, opts);

  // Silence repeated connection errors to reduce console spam on transient failures
  socket.on('connect_error', () => {
    // intentionally silent (consumers can react via their own state if needed)
  });

  return socket;
}

function releaseSocket(socketUrl: string, token: string, socket: Socket): void {
  const key = `${socketUrl}|${token}`;
  const count = (socketRefCounts.get(key) ?? 1) - 1;
  if (count <= 0) {
    socketRefCounts.delete(key);
    socket.disconnect();
  } else {
    socketRefCounts.set(key, count);
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
