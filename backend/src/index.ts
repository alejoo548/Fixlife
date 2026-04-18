import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import helmet from 'helmet';
import authRoutes from './routes/auth.routes';
import workerRoutes from './routes/worker.routes';
import adminRoutes from './routes/admin.routes';
import servicesRoutes from './routes/services.routes';
import aiChatRoutes from './routes/aiChat.routes';
import notificationsRoutes from './routes/notifications.routes';
import eventsRoute from './routes/events.route';
import { globalLimiter } from './middlewares/security.middleware';

dotenv.config();

if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ FATAL: JWT_SECRET is not set. Refusing to start in production.');
    process.exit(1);
  }
  console.warn('⚠️  WARNING: JWT_SECRET not set — using insecure default. Never use this in production.');
}

const isProduction = process.env.NODE_ENV === 'production';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions = isProduction && ALLOWED_ORIGINS.length > 0
  ? { origin: ALLOWED_ORIGINS, credentials: true }
  : {};

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 8000;
const uploadsDir = path.resolve(process.cwd(), 'uploads');

app.use(cors(corsOptions));
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);
app.use(globalLimiter);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use('/uploads', express.static(uploadsDir));

app.use('/api/auth', authRoutes);
app.use('/api/worker', workerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api', aiChatRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/events', eventsRoute);


app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: '¡El backend de Node.js + Express + TypeScript está funcionando perfectamente en Docker!',
  });
});

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'FixLife Backend API is running' });
});

app.use((err: any, req: Request, res: Response, next: any) => {
  console.error('Error global:', err);
  
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ 
      error: 'El archivo es demasiado grande. El límite es de 10MB.' 
    });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Error interno del servidor',
  });
});

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🚀 Servidor Node.js corriendo en http://0.0.0.0:${PORT}`);
});
