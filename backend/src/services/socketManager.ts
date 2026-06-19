import { Server, Socket } from 'socket.io';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { verifyAccessToken } from '../config/security';

type SocketUser = {
  user_id: number;
  rol: string;
  pending_worker?: number;
};

type AuthedSocket = Socket & {
  user?: SocketUser;
};

let io: Server | null = null;

const CHAT_ENABLED_REQUEST_STATUSES = [
  'assigned',
  'payment_pending',
  'paid',
  'in_progress',
  'awaiting_confirmation',
  'done',
];

const userRoom = (userId: number) => `user:${userId}`;
const requestRoom = (requestId: number) => `request:${requestId}`;
const SOCKET_JOIN_WINDOW_MS = 60_000;
const SOCKET_JOIN_MAX_ATTEMPTS = 30;
const MAX_SOCKETS_PER_USER = 8;
const socketsByUser = new Map<number, Set<string>>();

// Keyed by user_id (not socket.id) so reconnecting mid-window does not reset the join-attempt counter.
const joinAttemptsByUser = new Map<number, number[]>();
const joinAttemptsCleanupTimers = new Map<number, NodeJS.Timeout>();

const isJoinRateLimited = (userId: number): boolean => {
  const now = Date.now();
  const recent = (joinAttemptsByUser.get(userId) || []).filter(
    (attemptedAt) => now - attemptedAt < SOCKET_JOIN_WINDOW_MS
  );
  if (recent.length >= SOCKET_JOIN_MAX_ATTEMPTS) {
    joinAttemptsByUser.set(userId, recent);
    return true;
  }
  recent.push(now);
  joinAttemptsByUser.set(userId, recent);
  return false;
};

const scheduleJoinAttemptsCleanup = (userId: number) => {
  const existingTimer = joinAttemptsCleanupTimers.get(userId);
  if (existingTimer) clearTimeout(existingTimer);
  const timer = setTimeout(() => {
    joinAttemptsByUser.delete(userId);
    joinAttemptsCleanupTimers.delete(userId);
  }, SOCKET_JOIN_WINDOW_MS);
  joinAttemptsCleanupTimers.set(userId, timer);
};

const resolveRequestParticipant = async (idRequest: number, userId: number) => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
      sr.id_request,
      sr.id_user AS client_user_id,
      sr.status AS request_status,
      sr.assigned_worker_profile,
      wp.id_user AS worker_user_id,
      u.is_active AS client_active
    FROM service_requests sr
    INNER JOIN users u ON u.id_user = sr.id_user
    LEFT JOIN worker_profiles wp ON wp.id_worker_profile = sr.assigned_worker_profile
    WHERE sr.id_request = ? AND u.is_active = 1
    LIMIT 1`,
    [idRequest]
  );

  if (rows.length === 0) return null;
  const row = rows[0];
  const clientUserId = Number(row.client_user_id);
  const workerUserId = row.worker_user_id != null ? Number(row.worker_user_id) : null;
  const assignedWorkerProfile =
    row.assigned_worker_profile != null ? Number(row.assigned_worker_profile) : null;
  const requestStatus = String(row.request_status || '').toLowerCase();

  if (!assignedWorkerProfile || !CHAT_ENABLED_REQUEST_STATUSES.includes(requestStatus)) {
    return null;
  }

  if (clientUserId === userId) {
    return { role: 'client' as const, clientUserId, workerUserId, assignedWorkerProfile, requestStatus };
  }

  if (workerUserId === userId) {
    return { role: 'worker' as const, clientUserId, workerUserId, assignedWorkerProfile, requestStatus };
  }

  return null;
};

export const initSocketServer = (ioInstance: Server) => {
  io = ioInstance;

  io.use(async (socket: AuthedSocket, next) => {
    const rawToken =
      socket.handshake.auth?.token ||
      socket.handshake.headers.authorization?.toString().replace(/^Bearer\s+/i, '');

    if (!rawToken) {
      next(new Error('No token provided'));
      return;
    }

    try {
      const decoded = verifyAccessToken(String(rawToken));
      const userId = Number(decoded?.user_id || 0);
      if (!Number.isSafeInteger(userId) || userId <= 0) {
        next(new Error('Unauthorized'));
        return;
      }

      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT id_user, rol, pending_worker
        FROM users
        WHERE id_user = ? AND is_active = 1
        LIMIT 1`,
        [userId]
      );
      if (rows.length === 0) {
        next(new Error('Unauthorized'));
        return;
      }

      socket.user = {
        user_id: userId,
        rol: String(rows[0].rol || ''),
        pending_worker: rows[0].pending_worker != null ? Number(rows[0].pending_worker) : undefined,
      };
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket: AuthedSocket) => {
    const userId = Number(socket.user?.user_id || 0);
    if (!userId) {
      socket.disconnect(true);
      return;
    }

    const existingSockets = socketsByUser.get(userId) || new Set<string>();
    if (existingSockets.size >= MAX_SOCKETS_PER_USER) {
      socket.emit('socket:error', { error: 'Too many active chat connections.' });
      socket.disconnect(true);
      return;
    }
    existingSockets.add(socket.id);
    socketsByUser.set(userId, existingSockets);

    socket.join(userRoom(userId));
    if (socket.user?.rol === 'worker') socket.join('all_workers');
    socket.emit('socket:ready', { user_id: userId });

    socket.on('disconnect', () => {
      const userSockets = socketsByUser.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) socketsByUser.delete(userId);
      }
      scheduleJoinAttemptsCleanup(userId);
    });

    socket.on('chat:join', async (payload: { id_request?: number }, ack?: (response: unknown) => void) => {
      if (isJoinRateLimited(userId)) {
        ack?.({ success: false, error: 'Too many chat join attempts. Try again shortly.' });
        return;
      }

      const idRequest = Number(payload?.id_request || 0);
      if (!Number.isSafeInteger(idRequest) || idRequest <= 0) {
        ack?.({ success: false, error: 'Invalid request id.' });
        return;
      }

      try {
        const participant = await resolveRequestParticipant(idRequest, userId);
        if (!participant) {
          ack?.({ success: false, error: 'Access denied for this request chat.' });
          return;
        }

        for (const room of socket.rooms) {
          if (room.startsWith('request:') && room !== requestRoom(idRequest)) {
            socket.leave(room);
          }
        }
        socket.join(requestRoom(idRequest));
        ack?.({ success: true, id_request: idRequest, role: participant.role });
      } catch {
        ack?.({ success: false, error: 'Could not join request chat.' });
      }
    });

    socket.on('chat:leave', (payload: { id_request?: number }) => {
      const idRequest = Number(payload?.id_request || 0);
      if (idRequest) socket.leave(requestRoom(idRequest));
    });
  });

  return io;
};

export const emitChatMessage = (payload: {
  id_request: number;
  latest_message_id: number | null;
  messages?: unknown[];
  recipient_user_id?: number | null;
  sender_user_id?: number | null;
}) => {
  if (!io) return;

  const eventPayload = {
    id_request: payload.id_request,
    latest_message_id: payload.latest_message_id,
    messages: payload.messages || [],
  };


  if (payload.sender_user_id) {
    io.to(userRoom(payload.sender_user_id)).emit('chat:message', eventPayload);
  }

  if (payload.recipient_user_id) {
    io.to(userRoom(payload.recipient_user_id)).emit('chat:message', eventPayload);
  }
};

export const emitUserUpdate = (
  userId: number,
  payload: {
    event_type: string;
    id_request?: number | null;
    title?: string;
    message?: string;
    tone?: 'info' | 'success' | 'warning';
    metadata?: Record<string, unknown> | null;
  }
) => {
  if (!io || !Number.isSafeInteger(userId) || userId <= 0) return;
  io.to(userRoom(userId)).emit('worker:update', {
    ...payload,
    emitted_at: new Date().toISOString(),
  });
};

export const emitToUser = (userId: number, event: string, data: unknown) => {
  if (!io || !Number.isSafeInteger(userId) || userId <= 0) return;
  io.to(userRoom(userId)).emit(event, data);
};

export const emitToWorkers = (event: string, data: unknown) => {
  if (!io) return;
  io.to('all_workers').emit(event, data);
};
