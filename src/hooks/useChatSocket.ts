import { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_URL } from '../config/api';

export interface ChatSocketPayload<TMessage = unknown> {
  id_request: number;
  latest_message_id?: number | null;
  messages?: TMessage[];
}

interface UseChatSocketOptions<TMessage> {
  token: string | null;
  enabled: boolean;
  requestId: number | null;
  onMessage: (payload: ChatSocketPayload<TMessage>) => void;
}

export const useChatSocket = <TMessage,>({
  token,
  enabled,
  requestId,
  onMessage,
}: UseChatSocketOptions<TMessage>) => {
  const socketRef = useRef<Socket | null>(null);
  const onMessageRef = useRef(onMessage);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const socketUrl = useMemo(() => API_URL.replace(/\/api\/?$/i, '').replace(/\/+$/, ''), []);

  useEffect(() => {
    if (!enabled || !token) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      return;
    }

    const socket = io(socketUrl, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 800,
    });

    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    socket.on('chat:message', (payload: ChatSocketPayload<TMessage>) => {
      if (!payload?.id_request) return;
      onMessageRef.current(payload);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [enabled, socketUrl, token]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !connected || !requestId) return undefined;

    socket.emit('chat:join', { id_request: requestId });

    return () => {
      socket.emit('chat:leave', { id_request: requestId });
    };
  }, [connected, requestId]);

  return { connected };
};
