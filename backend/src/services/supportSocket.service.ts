import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/security';
import {
  getMessageById,
  insertMessage,
  mapMessageRow,
  userCanAccessThread,
} from './support.service';
import { hasUnsafeSupportText, sanitizeSupportText } from '../schemas/support.schema';

const SUPPORT_ADMIN_ROOM = 'support_admins';

const parseThreadId = (raw: unknown): number | null => {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const MESSAGE_RATE_LIMIT = 15;
const MESSAGE_RATE_WINDOW_MS = 10_000;
const messageRateBuckets = new Map<number, number[]>();

const isMessageRateLimited = (userId: number): boolean => {
  const now = Date.now();
  const recent = (messageRateBuckets.get(userId) || []).filter((ts) => now - ts < MESSAGE_RATE_WINDOW_MS);
  if (recent.length >= MESSAGE_RATE_LIMIT) {
    messageRateBuckets.set(userId, recent);
    return true;
  }
  recent.push(now);
  messageRateBuckets.set(userId, recent);
  return false;
};

interface AuthenticatedSocket extends Socket {
  user?: {
    user_id: number;
    rol: string;
  };
}

let io: Server | null = null;

export function initializeSupportSocket(httpServer: HttpServer) {
  if (io) return io;

  io = new Server(httpServer, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
      credentials: true,
    },
    path: '/socket.io/support', 
  });

  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    try {
      const decoded = jwt.verify(token as string, getJwtSecret()) as { user_id: number; rol: string };
      socket.user = {
        user_id: decoded.user_id,
        rol: decoded.rol,
      };
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`[SupportSocket] User ${socket.user?.user_id} connected`);

    if (socket.user?.rol === 'admin' || socket.user?.rol === 'root') {
      socket.join(SUPPORT_ADMIN_ROOM);
    }

    socket.on('support:join_thread', async (data: { threadId: unknown }) => {
      if (!socket.user) return;

      const threadId = parseThreadId(data?.threadId);
      if (!threadId) {
        socket.emit('support:error', { message: 'Invalid thread id' });
        return;
      }

      const canAccess = await userCanAccessThread(threadId, socket.user.user_id, socket.user.rol);
      if (!canAccess) {
        socket.emit('support:error', { message: 'Access denied to this thread' });
        return;
      }

      socket.join(`support_thread_${threadId}`);
      console.log(`[SupportSocket] User ${socket.user.user_id} joined thread ${threadId}`);
    });

    socket.on('support:leave_thread', (data: { threadId: unknown }) => {
      const threadId = parseThreadId(data?.threadId);
      if (!threadId) return;
      socket.leave(`support_thread_${threadId}`);
    });

    socket.on('support:send_message', async (data: { threadId: unknown; message: unknown }) => {
      if (!socket.user) return;

      const threadId = parseThreadId(data?.threadId);
      if (!threadId) {
        socket.emit('support:error', { message: 'Invalid thread id' });
        return;
      }

      const message = data?.message;
      const trimmed = sanitizeSupportText(message, 2000);

      if (!trimmed) return;
      if (String(message ?? '').length > 2000 || hasUnsafeSupportText(message)) {
        socket.emit('support:error', { message: 'Message contains invalid content' });
        return;
      }

      if (isMessageRateLimited(socket.user.user_id)) {
        socket.emit('support:error', { message: 'You are sending messages too quickly. Please slow down.' });
        return;
      }

      try {
        const canAccess = await userCanAccessThread(threadId, socket.user.user_id, socket.user.rol);
        if (!canAccess) {
          socket.emit('support:error', { message: 'Access denied' });
          return;
        }

        const senderRole = socket.user.rol === 'admin' || socket.user.rol === 'root' 
          ? 'admin' 
          : socket.user.rol === 'worker' ? 'worker' : 'client';

        const messageId = await insertMessage(threadId, socket.user.user_id, senderRole, trimmed);
        const messageRow = await getMessageById(messageId);
        if (!messageRow) {
          socket.emit('support:error', { message: 'Failed to send message' });
          return;
        }

        emitNewSupportMessage(threadId, mapMessageRow(messageRow));
      } catch (error) {
        console.error('[SupportSocket] Error sending message:', error);
        socket.emit('support:error', { message: 'Failed to send message' });
      }
    });

    socket.on('disconnect', () => {
      if (socket.user) messageRateBuckets.delete(socket.user.user_id);
      console.log(`[SupportSocket] User ${socket.user?.user_id} disconnected`);
    });
  });

  return io;
}

export function getSupportIO(): Server | null {
  return io;
}

export function emitNewSupportMessage(threadId: number, payload: any) {
  if (!io) return;
  io.to(`support_thread_${threadId}`).to(SUPPORT_ADMIN_ROOM).emit('support:new_message', payload);
}

export function emitSupportThreadCreated(payload: any) {
  if (!io) return;
  io.to(SUPPORT_ADMIN_ROOM).emit('support:thread_created', payload);
}

export function emitAdminActivity(payload: any) {
  if (!io) return;
  io.to(SUPPORT_ADMIN_ROOM).emit('admin:activity_created', payload);
}
