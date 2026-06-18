import express, { Request, Response } from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import authRoutes from './routes/auth.routes';
import workerRoutes from './routes/worker.routes';
import adminRoutes from './routes/admin.routes';
import servicesRoutes from './routes/services.routes';
import notificationsRoutes from './routes/notifications.routes';
import uploadsRoutes from './routes/uploads.routes';
import supportRoutes from './routes/support.routes';
import { initializeSupportSocket } from './services/supportSocket.service';
import { globalLimiter } from './middlewares/security.middleware';
import { isUsingGeneratedDevelopmentJwtSecret } from './config/security';
import {
  publicUploadsDir,
  resolvePublicUploadPath,
  isImageFileName,
} from './utils/assets';
import { Server as SocketIOServer } from 'socket.io';
import { runDatabaseMigrations } from './migrations/runMigrations';
import { startBackgroundJobWorker } from './services/backgroundJobs.service';
import { initSocketServer } from './services/socketManager';

dotenv.config();
const isProduction = process.env.NODE_ENV === 'production';

try {
  if (isUsingGeneratedDevelopmentJwtSecret()) {
    console.warn('WARNING: JWT_SECRET is not set. Generated an ephemeral development/test-only secret for this process.');
  }
} catch (error: any) {
  console.error(error?.message || 'JWT configuration error.');
  process.exit(1);
}

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (isProduction && ALLOWED_ORIGINS.length === 0) {
  throw new Error('ALLOWED_ORIGINS must contain at least one trusted frontend origin in production.');
}

const corsOptions =
  isProduction
    ? { origin: ALLOWED_ORIGINS, credentials: true }
    : {};

const app = express();
const server = http.createServer(app);
app.set('trust proxy', 1);
const PORT = process.env.PORT || 8000;

app.use(cors(corsOptions));
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);
app.use(globalLimiter);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use(
  '/uploads/public',
  express.static(publicUploadsDir, {
    setHeaders: (res, filePath) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Cache-Control', 'public, max-age=86400');
    },
  })
);
app.get('/uploads/:fileName', (req: Request, res: Response) => {
  const fileName = String(req.params.fileName || '');
  if (!isImageFileName(fileName)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const filePath = resolvePublicUploadPath(fileName);
  if (!filePath) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(filePath);
});

app.use('/api/auth', authRoutes);
app.use('/api/worker', workerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/uploads', uploadsRoutes);
app.use('/api/support', supportRoutes);

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'El backend de Node.js + Express + TypeScript esta funcionando correctamente en Docker.',
  });
});

app.get('/', (_req: Request, res: Response) => {
  res.json({ message: 'FixLife Backend API is running' });
});

app.use((err: any, _req: Request, res: Response, _next: any) => {
  console.error('Global error:', err);

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ 
      error: 'El archivo es demasiado grande. El limite es de 10MB.'
    });
  }

  return res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

const startServer = async () => {
  const migrationsMode = String(
    process.env.DB_MIGRATIONS_MODE || (isProduction ? 'manual' : 'auto')
  )
    .trim()
    .toLowerCase();

  if (!['auto', 'manual'].includes(migrationsMode)) {
    throw new Error('DB_MIGRATIONS_MODE must be either "auto" or "manual".');
  }

  const migrationResult = await runDatabaseMigrations({
    applyPending: migrationsMode === 'auto',
  });

  if (migrationResult.appliedNow.length > 0) {
    console.log(`[db] Applied migrations: ${migrationResult.appliedNow.join(', ')}`);
  } else {
    console.log('[db] Database schema is up to date.');
  }

  const io = new SocketIOServer(server, {
    cors: corsOptions,
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 128 * 1024,
  });

  initSocketServer(io);
  initializeSupportSocket(io);

  server.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Fixlife backend listening on http://0.0.0.0:${PORT}`);
    console.log('[Support] Socket.IO support chat initialized on namespace /support');
  });

  startBackgroundJobWorker();
  console.log('[jobs] Background worker started.');
};

void startServer().catch((error) => {
  console.error('Fatal startup error:', error);
  process.exit(1);
});
