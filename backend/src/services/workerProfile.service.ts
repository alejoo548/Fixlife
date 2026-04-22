import { Request } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/db';

export const ACTIVE_WORKER_REQUEST_STATUSES = ['payment_pending', 'paid', 'assigned', 'in_progress', 'awaiting_confirmation'];

export const toPublicRequestStatus = (status: string | null | undefined) => {
  if (!status) return 'pending';
  return status === 'open' ? 'pending' : status;
};

export const allowedImageMimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
]);

export const buildAssetUrl = (req: Request, fileName: string | null) => {
  if (!fileName) return null;
  return `${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(fileName)}`;
};

export const toSqlDateTime = (date: Date) => date.toISOString().slice(0, 19).replace('T', ' ');

export const formatMonthLabel = (anchor = new Date()) =>
  anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

export const ensureWorkerProfile = async (userId: number) => {
  const [profiles] = await pool.execute<RowDataPacket[]>(
    `SELECT id_worker_profile FROM worker_profiles WHERE id_user = ? LIMIT 1`,
    [userId]
  );

  if (profiles.length > 0) return profiles[0].id_worker_profile as number;

  const [insertResult] = await pool.execute<ResultSetHeader>(
    `INSERT INTO worker_profiles (id_user, is_verified) VALUES (?, 0)`,
    [userId]
  );
  return insertResult.insertId;
};

export const getUserCore = async (userId: number) => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id_user, name, lastname, email, phone_number, profile_image, rol, username
     FROM users
     WHERE id_user = ?
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
};

export const getWorkerActiveRequest = async (
  executor: Pick<typeof pool, 'execute'>,
  profileId: number,
  excludeRequestId?: number
) => {
  const params: any[] = [profileId, ...ACTIVE_WORKER_REQUEST_STATUSES];
  let excludeSql = '';
  if (excludeRequestId != null) {
    excludeSql = ' AND id_request <> ?';
    params.push(excludeRequestId);
  }

  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT id_request, status
     FROM service_requests
     WHERE assigned_worker_profile = ?
       AND status IN (${ACTIVE_WORKER_REQUEST_STATUSES.map(() => '?').join(', ')})
       ${excludeSql}
     ORDER BY updated_at DESC
     LIMIT 1`,
    params
  );

  if (rows.length === 0) return null;
  return {
    id_request: Number(rows[0].id_request),
    status: String(rows[0].status || '').toLowerCase(),
  };
};
