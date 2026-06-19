import { Request, Response, NextFunction } from 'express';
import { RowDataPacket } from 'mysql2';
import { verifyAccessToken } from '../config/security';
import pool from '../config/db';

export interface AuthRequest extends Request {
  user?: { user_id: number; rol: string; pending_worker?: number };
}

export const verifyToken = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const token = req.headers['authorization']?.split(' ')[1];

  if (!token) {
    res.status(403).json({ error: 'No token provided' });
    return;
  }

  try {
    const decoded = verifyAccessToken(token);
    const userId = Number(decoded?.user_id || 0);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      res.status(401).json({ error: 'Unauthorized, invalid token' });
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
      res.status(401).json({ error: 'Unauthorized, inactive account' });
      return;
    }

    req.user = {
      user_id: userId,
      rol: String(rows[0].rol || ''),
      pending_worker:
        rows[0].pending_worker != null ? Number(rows[0].pending_worker) : undefined,
    };
    next();
  } catch {
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

export const requireVerifiedWorker = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const userId = Number(req.user?.user_id || 0);
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_worker_profile
       FROM worker_profiles
       WHERE id_user = ? AND is_verified = 1
       LIMIT 1`,
      [userId]
    );
    if (rows.length === 0) {
      res.status(403).json({ error: 'A verified worker profile is required.' });
      return;
    }
    next();
  } catch {
    res.status(500).json({ error: 'Could not verify worker account.' });
  }
};

export const verifyTokenOptional = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) {
    next();
    return;
  }

  try {
    const decoded = verifyAccessToken(token);
    const userId = Number(decoded?.user_id || 0);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      res.status(401).json({ error: 'Unauthorized, invalid token' });
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
      res.status(401).json({ error: 'Unauthorized, inactive account' });
      return;
    }
    req.user = {
      user_id: userId,
      rol: String(rows[0].rol || ''),
      pending_worker:
        rows[0].pending_worker != null ? Number(rows[0].pending_worker) : undefined,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized, invalid token' });
  }
};
