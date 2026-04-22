import { useEffect, useRef } from 'react';
import { API_URL } from '../config/api';

type EventMap = Record<string, (data: unknown) => void>;
type EventHandler = (data: unknown) => void;

interface SharedSSEConnection {
  source: EventSource;
  handlers: Map<string, Set<EventHandler>>;
  dispatchers: Map<string, (event: MessageEvent) => void>;
  refCount: number;
  closeTimer: number | null;
}

interface UseSSEOptions {
  token: string | null;
  events: EventMap;
  enabled?: boolean;
}

const connections = new Map<string, SharedSSEConnection>();

const parseEventPayload = (event: MessageEvent) => {
  try {
    return JSON.parse(event.data);
  } catch {
    return null;
  }
};

const getConnection = (token: string): SharedSSEConnection => {
  const existing = connections.get(token);
  if (existing) {
    if (existing.closeTimer != null) {
      window.clearTimeout(existing.closeTimer);
      existing.closeTimer = null;
    }
    existing.refCount += 1;
    return existing;
  }

  const url = `${API_URL}/api/events?token=${encodeURIComponent(token)}`;
  const source = new EventSource(url);
  const connection: SharedSSEConnection = {
    source,
    handlers: new Map(),
    dispatchers: new Map(),
    refCount: 1,
    closeTimer: null,
  };

  source.onerror = () => {
    // EventSource reconnects automatically.
  };

  connections.set(token, connection);
  return connection;
};

const attachHandler = (connection: SharedSSEConnection, eventName: string, handler: EventHandler) => {
  let handlers = connection.handlers.get(eventName);
  if (!handlers) {
    handlers = new Set<EventHandler>();
    connection.handlers.set(eventName, handlers);

    const dispatcher = (event: MessageEvent) => {
      const payload = parseEventPayload(event);
      connection.handlers.get(eventName)?.forEach((listener) => listener(payload));
    };

    connection.dispatchers.set(eventName, dispatcher);
    connection.source.addEventListener(eventName, dispatcher);
  }

  handlers.add(handler);
};

const detachHandler = (connection: SharedSSEConnection, eventName: string, handler: EventHandler) => {
  const handlers = connection.handlers.get(eventName);
  if (!handlers) return;

  handlers.delete(handler);
  if (handlers.size > 0) return;

  const dispatcher = connection.dispatchers.get(eventName);
  if (dispatcher) {
    connection.source.removeEventListener(eventName, dispatcher);
  }
  connection.handlers.delete(eventName);
  connection.dispatchers.delete(eventName);
};

const releaseConnection = (token: string, connection: SharedSSEConnection) => {
  connection.refCount = Math.max(0, connection.refCount - 1);
  if (connection.refCount > 0) return;

  connection.closeTimer = window.setTimeout(() => {
    if (connection.refCount > 0) return;
    connection.dispatchers.forEach((dispatcher, eventName) => {
      connection.source.removeEventListener(eventName, dispatcher);
    });
    connection.source.close();
    connections.delete(token);
  }, 1000);
};

/**
 * Maintains one shared SSE connection per token and dispatches named server events to handlers.
 * Automatically reconnects if the connection drops (browser handles this via EventSource).
 */
export function useSSE({ token, events, enabled = true }: UseSSEOptions): void {
  // Keep event handlers in a ref so they never cause the effect to re-run
  const handlersRef = useRef<EventMap>(events);
  handlersRef.current = events;

  useEffect(() => {
    if (!token || !enabled || typeof window === 'undefined' || !('EventSource' in window)) return;

    const connection = getConnection(token);
    const eventNames = Object.keys(handlersRef.current);
    const attached: Array<[string, EventHandler]> = [];

    for (const name of eventNames) {
      const listener = (payload: unknown) => handlersRef.current[name]?.(payload);
      attachHandler(connection, name, listener);
      attached.push([name, listener]);
    }

    return () => {
      attached.forEach(([name, listener]) => detachHandler(connection, name, listener));
      releaseConnection(token, connection);
    };
  }, [token, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}
