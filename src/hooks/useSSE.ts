import { useEffect, useRef } from 'react';
import { API_URL } from '../config/api';

type EventMap = Record<string, (data: unknown) => void>;

interface UseSSEOptions {
  token: string | null;
  events: EventMap;
  enabled?: boolean;
}

/**
 * Maintains a single SSE connection and dispatches named server events to handlers.
 * Automatically reconnects if the connection drops (browser handles this via EventSource).
 */
export function useSSE({ token, events, enabled = true }: UseSSEOptions): void {
  // Keep event handlers in a ref so they never cause the effect to re-run
  const handlersRef = useRef<EventMap>(events);
  handlersRef.current = events;

  useEffect(() => {
    if (!token || !enabled) return;

    const url = `${API_URL}/api/events?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);

    const attached: Array<() => void> = [];

    // Attach a listener for every event name present at mount time
    const eventNames = Object.keys(handlersRef.current);
    for (const name of eventNames) {
      const listener = (e: MessageEvent) => {
        try {
          handlersRef.current[name]?.(JSON.parse(e.data));
        } catch {
          handlersRef.current[name]?.(null);
        }
      };
      es.addEventListener(name, listener);
      attached.push(() => es.removeEventListener(name, listener));
    }

    es.onerror = () => {
      // EventSource auto-reconnects; nothing extra needed
    };

    return () => {
      attached.forEach((off) => off());
      es.close();
    };
  }, [token, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
}
