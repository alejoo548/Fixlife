import { io, Socket } from 'socket.io-client';
import { SupportMessage } from '../types/support';

let socket: Socket | null = null;
let currentToken: string | null = null;

interface SupportSocketOptions {
  token: string;
  onNewMessage?: (message: SupportMessage) => void;
  onThreadUpdated?: (data: { threadId: number }) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

/**
 * Real Support Socket Service using Socket.IO
 * 
 * Supports Docker environments by allowing a dedicated socket URL.
 */
// Active listeners per event so multiple callers (user widget + admin) can coexist
const connectListeners: Set<() => void> = new Set();
const disconnectListeners: Set<() => void> = new Set();
const messageListeners: Set<(m: SupportMessage) => void> = new Set();

function setupSocketListeners() {
  if (!socket) return;

  socket.off('connect');
  socket.off('disconnect');
  socket.off('support:new_message');
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

  socket.on('connect_error', (err) => {
    console.error('[SupportSocket] Connection error:', err.message);
  });

  socket.on('support:error', (error: { message: string }) => {
    console.error('[SupportSocket] Server error:', error.message);
  });
}

export function connectSupportSocket({
  token,
  onNewMessage,
  onConnect,
  onDisconnect,
}: SupportSocketOptions) {
  // Register callbacks into shared listener sets
  if (onConnect) connectListeners.add(onConnect);
  if (onDisconnect) disconnectListeners.add(onDisconnect);
  if (onNewMessage) messageListeners.add(onNewMessage);

  // Socket already exists with same token — re-use it
  if (socket && currentToken === token) {
    // If already connected, fire onConnect immediately
    if (socket.connected && onConnect) onConnect();
    return socket;
  }

  if (socket) {
    socket.disconnect();
    connectListeners.clear();
    disconnectListeners.clear();
    messageListeners.clear();
    if (onConnect) connectListeners.add(onConnect);
    if (onDisconnect) disconnectListeners.add(onDisconnect);
    if (onNewMessage) messageListeners.add(onNewMessage);
  }

  currentToken = token;

  const explicitSocketUrl = import.meta.env.VITE_SUPPORT_SOCKET_URL;
  let baseUrl: string;
  if (explicitSocketUrl) {
    baseUrl = explicitSocketUrl.replace(/\/$/, '');
  } else {
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    baseUrl = API_URL.replace(/\/api$/, '');
  }

  socket = io(baseUrl, {
    path: '/socket.io/support',
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

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
  }
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
