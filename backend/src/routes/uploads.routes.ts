import { Router, Response } from 'express';
import path from 'path';
import { RowDataPacket } from 'mysql2';
import jwt from 'jsonwebtoken';
import pool from '../config/db';
import { getJwtSecret } from '../config/security';
import { AuthRequest } from '../middlewares/auth.middleware';
import { hasValidProtectedAssetSignature, resolveProtectedUploadPath } from '../utils/assets';

const router = Router();

const canAccessProtectedUpload = async (req: AuthRequest, fileName: string) => {
  const user = req.user;
  if (!user?.user_id) return false;
  if (user.rol === 'admin' || user.rol === 'root') return true;

  const [documentRows] = await pool.execute<RowDataPacket[]>(
    `SELECT 1
     FROM worker_profiles
     WHERE id_user = ?
       AND (dui_document = ? OR cert_document = ?)
     LIMIT 1`,
    [user.user_id, fileName, fileName]
  );
  if (documentRows.length > 0) return true;

  const [requestImageRows] = await pool.execute<RowDataPacket[]>(
    `SELECT 1
     FROM service_request_images sri
     INNER JOIN service_requests sr ON sr.id_request = sri.id_request
     LEFT JOIN service_request_workers srw
       ON srw.id_request = sr.id_request
     LEFT JOIN worker_profiles wp
       ON wp.id_worker_profile = srw.id_worker_profile
       OR wp.id_worker_profile = sr.assigned_worker_profile
     WHERE sri.image_url = ?
       AND (sr.id_user = ? OR wp.id_user = ?)
     LIMIT 1`,
    [fileName, user.user_id, user.user_id]
  );
  if (requestImageRows.length > 0) return true;

  const [chatImageRows] = await pool.execute<RowDataPacket[]>(
    `SELECT 1
     FROM service_request_chat_messages msg
     INNER JOIN service_requests sr ON sr.id_request = msg.id_request
     LEFT JOIN service_request_workers srw
       ON srw.id_request = sr.id_request
     LEFT JOIN worker_profiles wp
       ON wp.id_worker_profile = srw.id_worker_profile
       OR wp.id_worker_profile = sr.assigned_worker_profile
     WHERE msg.image_url = ?
       AND (sr.id_user = ? OR wp.id_user = ?)
     LIMIT 1`,
    [fileName, user.user_id, user.user_id]
  );

  return chatImageRows.length > 0;
};

const readAuthUser = (req: AuthRequest): AuthRequest['user'] => {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return undefined;

  try {
    return jwt.verify(token, getJwtSecret()) as AuthRequest['user'];
  } catch {
    return undefined;
  }
};

router.get('/protected/:fileName', async (req: AuthRequest, res: Response): Promise<void> => {
  const fileName = path.basename(String(req.params.fileName || ''));
  if (!fileName) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  try {
    const hasValidSignature = hasValidProtectedAssetSignature(
      fileName,
      req.query.expires,
      req.query.signature
    );

    if (!hasValidSignature) {
      req.user = readAuthUser(req);
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const allowed = await canAccessProtectedUpload(req, fileName);
      if (!allowed) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }

    const filePath = resolveProtectedUploadPath(fileName);
    if (!filePath) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const isPdf = path.extname(filePath).toLowerCase() === '.pdf';
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', isPdf ? 'attachment' : 'inline');
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving protected upload:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
