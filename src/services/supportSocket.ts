import { io, Socket } from 'socket.io-client';
import { getSocketBaseUrl, getDefaultSocketOptions } from '../config/api';
import { SupportMessage, SupportThread } from '../types/support';

export interface AdminActivityEvent {
  id_activity: number;
  action: string;
  entity: string;
  entity_id: number | null;
  summary: string;
  created_at: string;
  admin: { id_user: number; name: string; email: string | null } | null;
  metadata: unknown;
}

let socket: Socket | null = null;
let currentToken: string | null = null;

interface SupportSocketOptions {
  token: string;
  onNewMessage?: (message: SupportMessage) => void;
  onThreadCreated?: (data: { thread: SupportThread; message?: SupportMessage | null }) => void;
  onThreadUpdated?: (data: { threadId: number }) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

const connectListeners: Set<() => void> = new Set();
const disconnectListeners: Set<() => void> = new Set();
const messageListeners: Set<(m: SupportMessage) => void> = new Set();
const threadCreatedListeners: Set<(data: { thread: SupportThread; message?: SupportMessage | null }) => void> = new Set();
const activityListeners: Set<(item: AdminActivityEvent) => void> = new Set();

function setupSocketListeners() {
  if (!socket) return;

  socket.off('connect');
  socket.off('disconnect');
  socket.off('support:new_message');
  socket.off('support:thread_created');
  socket.off('admin:activity_created');
  socket.off('connect_error');
  socket.off('support:error');

  socket.on('connect', () => {
    connectListeners.forEach((fn) => fn());
  });

  socket.on('disconnect', () => {
    disconnectListeners.forEach((fn) => fn());
  });

  socket.on('support:new_message', (message: SupportMessage) => {
    messageListeners.forEach((fn) => fn(message));
  });

  socket.on('support:thread_created', (data: { thread: SupportThread; message?: SupportMessage | null }) => {
    threadCreatedListeners.forEach((fn) => fn(data));
  });

  socket.on('admin:activity_created', (item: AdminActivityEvent) => {
    activityListeners.forEach((fn) => fn(item));
  });

  socket.on('connect_error', (err) => {
    // Reduced logging to avoid console spam on transient WS failures (common in some envs/builds)
    if (import.meta.env.DEV) {
      console.warn('[SupportSocket] Connection error (will retry):', err.message);
    }
  });

  socket.on('support:error', (error: { message: string }) => {
    if (import.meta.env.DEV) {
      console.warn('[SupportSocket] Server error:', error.message);
    }
  });
}

export function connectSupportSocket({
  token,
  onNewMessage,
  onThreadCreated,
  onConnect,
  onDisconnect,
}: SupportSocketOptions) {
  if (onConnect) connectListeners.add(onConnect);
  if (onDisconnect) disconnectListeners.add(onDisconnect);
  if (onNewMessage) messageListeners.add(onNewMessage);
  if (onThreadCreated) threadCreatedListeners.add(onThreadCreated);

  if (socket && currentToken === token) {
    if (socket.connected && onConnect) onConnect();
    return socket;
  }

  if (socket) {
    socket.disconnect();
    connectListeners.clear();
    disconnectListeners.clear();
    messageListeners.clear();
    threadCreatedListeners.clear();
    if (onConnect) connectListeners.add(onConnect);
    if (onDisconnect) disconnectListeners.add(onDisconnect);
    if (onNewMessage) messageListeners.add(onNewMessage);
    if (onThreadCreated) threadCreatedListeners.add(onThreadCreated);
  }

  currentToken = token;

  const baseUrl = getSocketBaseUrl();
  const opts = getDefaultSocketOptions(token);

  socket = io(`${baseUrl}/support`, opts);

  setupSocketListeners();

  return socket;
}

export function disconnectSupportSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    currentToken = null;
    connectListeners.clear();
    disconnectListeners.clear();
    messageListeners.clear();
    threadCreatedListeners.clear();
    activityListeners.clear();
  }
}

export function addActivityListener(fn: (item: AdminActivityEvent) => void): () => void {
  activityListeners.add(fn);
  return () => {
    activityListeners.delete(fn);
  };
}

export function joinSupportThread(threadId: number) {
  if (socket?.connected) {
    socket.emit('support:join_thread', { threadId });
  }
}

export function leaveSupportThread(threadId: number) {
  if (socket?.connected) {
    socket.emit('support:leave_thread', { threadId });
  }
}

export function emitSupportMessage(data: {
  threadId: number;
  message: string;
}) {
  if (socket?.connected) {
    socket.emit('support:send_message', data);
  }
}

export function isSupportSocketConnected(): boolean {
  return socket?.connected ?? false;
}
