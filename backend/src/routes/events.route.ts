import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { registerClient, removeClient } from '../services/sseManager';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_for_development';

// EventSource doesn't support custom headers, so token comes as query param
router.get('/', (req: Request, res: Response): void => {
  const token = String(req.query.token || '');
  if (!token) {
    res.status(403).json({ error: 'No token provided' });
    return;
  }

  let decoded: { user_id: number; rol: string };
  try {
    decoded = jwt.verify(token, JWT_SECRET) as { user_id: number; rol: string };
  } catch {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  const clientId = registerClient(decoded.user_id, decoded.rol, res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(clientId);
  });
});

export default router;
