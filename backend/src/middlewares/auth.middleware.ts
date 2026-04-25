import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/security';

export interface AuthRequest extends Request {
  user?: { user_id: number; rol: string; pending_worker?: number };
}

export const verifyToken = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const token = req.headers['authorization']?.split(' ')[1];

  if (!token) {
    res.status(403).json({ error: 'No token provided' });
    return;
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { user_id: number; rol: string; pending_worker?: number };
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized, invalid token' });
  }
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user || (req.user.rol !== 'admin' && req.user.rol !== 'root')) {
    res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    return;
  }
  next();
};

export const requireWorker = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user || (req.user.rol !== 'worker' && req.user.pending_worker !== 1)) {
    res.status(403).json({ error: 'Access denied. Worker privileges required.' });
    return;
  }
  next();
};

export const verifyTokenOptional = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) {
    next();
    return;
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { user_id: number; rol: string; pending_worker?: number };
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized, invalid token' });
  }
};
