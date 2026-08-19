import { Server, Namespace, Socket } from 'socket.io';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { verifyAccessToken } from '../config/security';
import {
  getMessageById,
  insertMessage,
  mapMessageRow,
  userCanAccessThread,
} from './support.service';
import { sanitizeMessage } from '../utils/sanitize';
import { moderateUserText } from '../utils/moderation';

const SUPPORT_ADMIN_ROOM = 'support_admins';

const parseThreadId = (raw: unknown): number | null => {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const MESSAGE_RATE_LIMIT = 15;
const MESSAGE_RATE_WINDOW_MS = 10_000;
// Keyed by user_id (not socket.id) so reconnecting mid-window does not reset the bucket.
const messageRateBuckets = new Map<number, number[]>();
const bucketCleanupTimers = new Map<number, NodeJS.Timeout>();

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

// Drop a user's bucket only after the rate window has fully elapsed since their
// last activity, so a quick reconnect can't reset the counter to bypass the limit.
const scheduleBucketCleanup = (userId: number) => {
  const existingTimer = bucketCleanupTimers.get(userId);
  if (existingTimer) clearTimeout(existingTimer);
  const timer = setTimeout(() => {
    messageRateBuckets.delete(userId);
    bucketCleanupTimers.delete(userId);
  }, MESSAGE_RATE_WINDOW_MS);
  bucketCleanupTimers.set(userId, timer);
};

interface AuthenticatedSocket extends Socket {
  user?: {
    user_id: number;
    rol: string;
  };
}

let nsp: Namespace | null = null;

export function initializeSupportSocket(ioServer: Server) {
  if (nsp) return nsp;

  nsp = ioServer.of('/support');

  nsp.use(async (socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    try {
      const decoded = verifyAccessToken(String(token));
      const userId = Number(decoded?.user_id || 0);
      if (!Number.isSafeInteger(userId) || userId <= 0) {
        return next(new Error('Invalid or expired token'));
      }

      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT id_user, rol
         FROM users
         WHERE id_user = ? AND is_active = 1
         LIMIT 1`,
        [userId]
      );
      if (rows.length === 0) {
        return next(new Error('Invalid or expired token'));
      }

      socket.user = {
        user_id: userId,
        rol: String(rows[0].rol || ''),
      };
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  nsp.on('connection', (socket: AuthenticatedSocket) => {
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

      const message = sanitizeMessage(data?.message, 2000);

      if (!message) return;
      const moderation = moderateUserText(message, { allowLinks: false, allowHelpSeeking: true });
      if (!moderation.ok) {
        socket.emit('support:error', { message: moderation.reason || 'Message contains content that is not allowed.' });
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

        const messageId = await insertMessage(threadId, socket.user.user_id, senderRole, message);
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
      if (socket.user) scheduleBucketCleanup(socket.user.user_id);
      console.log(`[SupportSocket] User ${socket.user?.user_id} disconnected`);
    });
  });

  return nsp;
}

export function getSupportIO(): Namespace | null {
  return nsp;
}

export function emitNewSupportMessage(threadId: number, payload: any) {
  if (!nsp) return;
  nsp.to(`support_thread_${threadId}`).to(SUPPORT_ADMIN_ROOM).emit('support:new_message', payload);
}

export function emitSupportThreadCreated(payload: any) {
  if (!nsp) return;
  nsp.to(SUPPORT_ADMIN_ROOM).emit('support:thread_created', payload);
}

export function emitAdminActivity(payload: any) {
  if (!nsp) return;
  nsp.to(SUPPORT_ADMIN_ROOM).emit('admin:activity_created', payload);
}
