import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/security';
import { userCanAccessThread } from './support.service';
import { insertMessage } from './support.service';

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

    socket.on('support:join_thread', async ({ threadId }: { threadId: number }) => {
      if (!socket.user) return;

      const canAccess = await userCanAccessThread(threadId, socket.user.user_id, socket.user.rol);
      if (!canAccess) {
        socket.emit('support:error', { message: 'Access denied to this thread' });
        return;
      }

      socket.join(`support_thread_${threadId}`);
      console.log(`[SupportSocket] User ${socket.user.user_id} joined thread ${threadId}`);
    });

    socket.on('support:leave_thread', ({ threadId }: { threadId: number }) => {
      socket.leave(`support_thread_${threadId}`);
    });

    socket.on('support:send_message', async (data: { threadId: number; message: string }) => {
      if (!socket.user) return;

      const { threadId, message } = data;
      const trimmed = message?.trim();

      if (!trimmed) return;

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

        const payload = {
          id: messageId,
          threadId,
          senderUserId: socket.user.user_id,
          senderRole,
          senderName: '',
          message: trimmed,
          imageUrl: null,
          createdAt: new Date().toISOString(),
        };

        io?.to(`support_thread_${threadId}`).emit('support:new_message', payload);
      } catch (error) {
        console.error('[SupportSocket] Error sending message:', error);
        socket.emit('support:error', { message: 'Failed to send message' });
      }
    });

    socket.on('disconnect', () => {
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
  io.to(`support_thread_${threadId}`).emit('support:new_message', payload);
}

