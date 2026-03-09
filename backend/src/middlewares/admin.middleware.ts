import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (req.user.rol !== 'admin') {
    res.status(403).json({ error: 'Forbidden: admin access required' });
    return;
  }

  next();
};

