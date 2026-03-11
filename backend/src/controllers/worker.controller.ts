import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import { Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { AuthRequest } from '../middlewares/auth.middleware';
import { sendEmailChangeToken, sendProfileChangeNotice } from '../utils/email';
import { autoReassignStaleAssignedRequests, ensureServiceRequestTables, ensureWorkerGeoColumns } from './services.controller';
const toPublicRequestStatus = (status: string | null | undefined) => {
  if (!status) return 'pending';
  return status === 'open' ? 'pending' : status;
};

const allowedImageMimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
]);

let pendingEmailChecked = false;

const ensurePendingEmailColumn = async () => {
  if (pendingEmailChecked) return;

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'users'
       AND column_name = 'pending_email'`
  );

  const exists = Number(rows[0]?.total || 0) > 0;
  if (!exists) {
    await pool.execute(`ALTER TABLE users ADD COLUMN pending_email VARCHAR(100) NULL`);
  }

  pendingEmailChecked = true;
};

const buildAssetUrl = (req: AuthRequest, fileName: string | null) => {
  if (!fileName) return null;
  return `${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(fileName)}`;
};

const ensureWorkerProfile = async (userId: number) => {
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

const getUserCore = async (userId: number) => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id_user, name, lastname, email, phone_number, profile_image, rol, username
     FROM users
     WHERE id_user = ?
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
};

export const getWorkerMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await getUserCore(userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const profileId = await ensureWorkerProfile(userId);
    const [profiles] = await pool.execute<RowDataPacket[]>(
      `SELECT id_worker_profile, id_user, bio, banner_image, dui_document, cert_document, is_verified
       FROM worker_profiles
       WHERE id_worker_profile = ?
       LIMIT 1`,
      [profileId]
    );

    const [portfolio] = await pool.execute<RowDataPacket[]>(
      `SELECT id_photo, id_worker_profile, image_url, description, uploaded_at
       FROM worker_portfolio
       WHERE id_worker_profile = ?
       ORDER BY uploaded_at DESC`,
      [profileId]
    );

    const workerProfile = profiles[0];
    res.json({
      success: true,
      user: {
        ...user,
        profile_image_url: buildAssetUrl(req, user.profile_image || null),
      },
      worker_profile: workerProfile,
      portfolio: portfolio.map((item) => ({
        ...item,
        image_full_url: buildAssetUrl(req, item.image_url),
      })),
    });
  } catch (error: any) {
    console.error('Error in getWorkerMe:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getWorkerRequests = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();
    await ensureWorkerGeoColumns();
    await autoReassignStaleAssignedRequests();

    const status = String(req.query.status || 'new').toLowerCase();
    const allowed = new Set(['new', 'accepted', 'rejected', 'all']);
    if (!allowed.has(status)) {
      res.status(400).json({ error: 'Invalid status filter.' });
      return;
    }

    const [profileRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_worker_profile, latitude, longitude
       FROM worker_profiles
       WHERE id_user = ?
       LIMIT 1`,
      [userId]
    );

    if (profileRows.length === 0) {
      res.status(404).json({ error: 'Worker profile not found.' });
      return;
    }

    const profileId = Number(profileRows[0].id_worker_profile);
    const workerLat = profileRows[0].latitude != null ? Number(profileRows[0].latitude) : null;
    const workerLng = profileRows[0].longitude != null ? Number(profileRows[0].longitude) : null;

    // Backfill discovery rows so older/open requests become visible for eligible workers.
    // This covers requests created before the worker had geo/service data ready.
    await pool.execute(
      `INSERT INTO service_request_workers (id_request, id_worker_profile, distance_km, status)
       SELECT
         sr.id_request,
         ? AS id_worker_profile,
         (
           6371 * ACOS(
             COS(RADIANS(wp.latitude)) * COS(RADIANS(sr.latitude)) *
             COS(RADIANS(sr.longitude) - RADIANS(wp.longitude)) +
             SIN(RADIANS(wp.latitude)) * SIN(RADIANS(sr.latitude))
           )
         ) AS distance_km,
         'new' AS status
       FROM worker_profiles wp
       INNER JOIN worker_services ws ON ws.id_worker_profile = wp.id_worker_profile
       INNER JOIN service_requests sr ON sr.id_service = ws.id_service
       LEFT JOIN service_request_workers srw
         ON srw.id_request = sr.id_request
        AND srw.id_worker_profile = wp.id_worker_profile
       WHERE wp.id_worker_profile = ?
         AND wp.is_verified = 1
         AND wp.latitude IS NOT NULL
         AND wp.longitude IS NOT NULL
         AND sr.status IN ('open', 'pending')
         AND sr.latitude IS NOT NULL
         AND sr.longitude IS NOT NULL
         AND (sr.id_user IS NULL OR sr.id_user <> wp.id_user)
         AND (
           6371 * ACOS(
             COS(RADIANS(wp.latitude)) * COS(RADIANS(sr.latitude)) *
             COS(RADIANS(sr.longitude) - RADIANS(wp.longitude)) +
             SIN(RADIANS(wp.latitude)) * SIN(RADIANS(sr.latitude))
           )
         ) <= COALESCE(sr.radius_km, 8)
         AND srw.id_request IS NULL`,
      [profileId, profileId]
    );

    const whereParts: string[] = ['srw.id_worker_profile = ?'];
    const params: any[] = [profileId];

    if (status === 'new') {
      whereParts.push(`srw.status = 'new'`);
      whereParts.push(`sr.status IN ('open', 'pending')`);
    } else if (status === 'accepted') {
      whereParts.push(`srw.status = 'accepted'`);
      whereParts.push(`sr.assigned_worker_profile = ?`);
      params.push(profileId);
    } else if (status === 'rejected') {
      whereParts.push(`srw.status = 'rejected'`);
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         sr.id_request,
         sr.id_service,
         sr.description,
         sr.location_text,
         sr.latitude,
         sr.longitude,
         sr.budget,
         sr.radius_km,
         sr.status AS request_status,
         sr.created_at,
         sr.assigned_worker_profile,
         s.name AS service_name,
         s.icon AS service_icon,
         srw.distance_km,
         srw.status AS worker_status,
         srw.proposed_budget,
         srw.counter_message,
         u.id_user AS client_id,
         u.name AS client_name,
         u.lastname AS client_lastname,
         u.profile_image AS client_profile_image,
         GROUP_CONCAT(DISTINCT sri.image_url ORDER BY sri.id_image ASC SEPARATOR '||') AS image_urls
       FROM service_request_workers srw
       INNER JOIN service_requests sr ON sr.id_request = srw.id_request
       INNER JOIN services s ON s.id_service = sr.id_service
       LEFT JOIN users u ON u.id_user = sr.id_user
       LEFT JOIN service_request_images sri ON sri.id_request = sr.id_request
       WHERE ${whereParts.join(' AND ')}
        GROUP BY
          sr.id_request, sr.id_service, sr.description, sr.location_text, sr.latitude, sr.longitude,
          sr.budget, sr.radius_km, sr.status, sr.created_at, sr.assigned_worker_profile,
          s.name, s.icon, srw.distance_km, srw.status, srw.proposed_budget, srw.counter_message,
          u.id_user, u.name, u.lastname, u.profile_image
       ORDER BY
         CASE WHEN srw.status = 'new' THEN 0 ELSE 1 END,
         sr.created_at DESC
       LIMIT 60`,
      params
    );

    const requests = rows.map((row: any) => {
      const lat = row.latitude != null ? Number(row.latitude) : null;
      const lng = row.longitude != null ? Number(row.longitude) : null;
      const routeUrl =
        lat != null &&
        lng != null &&
        workerLat != null &&
        workerLng != null
          ? `https://www.google.com/maps/dir/?api=1&origin=${workerLat},${workerLng}&destination=${lat},${lng}&travelmode=driving`
          : null;

      const images =
        typeof row.image_urls === 'string' && row.image_urls.length > 0
          ? String(row.image_urls)
              .split('||')
              .filter(Boolean)
              .map((name: string) => ({
                file_name: name,
                url: buildAssetUrl(req, name),
              }))
          : [];

      return {
        id_request: Number(row.id_request),
        id_service: Number(row.id_service),
        service_name: row.service_name,
        service_icon: row.service_icon || null,
        description: row.description,
        location_text: row.location_text,
        latitude: lat,
        longitude: lng,
        budget: Number(row.budget || 0),
        radius_km: Number(row.radius_km || 8),
        request_status: toPublicRequestStatus(row.request_status),
        worker_status: row.worker_status,
        proposed_budget: row.proposed_budget != null ? Number(row.proposed_budget) : null,
        counter_message: row.counter_message || null,
        distance_km: row.distance_km != null ? Number(row.distance_km) : null,
        created_at: row.created_at,
        assigned_worker_profile:
          row.assigned_worker_profile != null ? Number(row.assigned_worker_profile) : null,
        client: row.client_id
          ? {
              id_user: Number(row.client_id),
              name: `${row.client_name || ''} ${row.client_lastname || ''}`.trim(),
              profile_image_url: buildAssetUrl(req, row.client_profile_image || null),
            }
          : null,
        images,
        route_url: routeUrl,
      };
    });

    res.json({
      success: true,
      status,
      worker_profile: {
        id_worker_profile: profileId,
        latitude: workerLat,
        longitude: workerLng,
      },
      requests,
    });
  } catch (error: any) {
    console.error('Error in getWorkerRequests:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const acceptWorkerRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();

    const idRequest = Number(req.params.idRequest);
    if (!idRequest) {
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }

    const [profileRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id_worker_profile FROM worker_profiles WHERE id_user = ? LIMIT 1`,
      [userId]
    );
    if (profileRows.length === 0) {
      res.status(404).json({ error: 'Worker profile not found.' });
      return;
    }
    const profileId = Number(profileRows[0].id_worker_profile);

    await connection.beginTransaction();

    const [requestRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id_request, status, assigned_worker_profile
       FROM service_requests
       WHERE id_request = ?
       FOR UPDATE`,
      [idRequest]
    );
    if (requestRows.length === 0) {
      await connection.rollback();
      res.status(404).json({ error: 'Request not found.' });
      return;
    }

    const request = requestRows[0];
    if (!['open', 'pending'].includes(String(request.status)) || request.assigned_worker_profile != null) {
      await connection.rollback();
      res.status(409).json({ error: 'Request already taken by another worker.' });
      return;
    }

    const [myRow] = await connection.execute<RowDataPacket[]>(
      `SELECT status FROM service_request_workers
       WHERE id_request = ? AND id_worker_profile = ?
       LIMIT 1
       FOR UPDATE`,
      [idRequest, profileId]
    );
    if (myRow.length === 0 || myRow[0].status !== 'new') {
      await connection.rollback();
      res.status(409).json({ error: 'This request is no longer available for acceptance.' });
      return;
    }

    await connection.execute(
      `UPDATE service_requests
       SET status = 'assigned', assigned_worker_profile = ?, assigned_at = CURRENT_TIMESTAMP, final_budget = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ?`,
      [profileId, idRequest]
    );

    await connection.execute(
      `UPDATE service_request_workers
       SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ? AND id_worker_profile = ?`,
      [idRequest, profileId]
    );

    await connection.execute(
      `UPDATE service_request_workers
       SET status = 'expired', updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ? AND id_worker_profile != ? AND status = 'new'`,
      [idRequest, profileId]
    );

    await connection.commit();
    res.json({ success: true, message: 'Request accepted successfully.', id_request: idRequest });
  } catch (error: any) {
    await connection.rollback();
    console.error('Error in acceptWorkerRequest:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

export const rejectWorkerRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();

    const idRequest = Number(req.params.idRequest);
    if (!idRequest) {
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }

    const [profileRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_worker_profile FROM worker_profiles WHERE id_user = ? LIMIT 1`,
      [userId]
    );
    if (profileRows.length === 0) {
      res.status(404).json({ error: 'Worker profile not found.' });
      return;
    }
    const profileId = Number(profileRows[0].id_worker_profile);

    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE service_request_workers
       SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ? AND id_worker_profile = ? AND status = 'new'`,
      [idRequest, profileId]
    );

    if (result.affectedRows === 0) {
      res.status(409).json({ error: 'Request is not available to reject.' });
      return;
    }

    res.json({ success: true, message: 'Request rejected.', id_request: idRequest });
  } catch (error: any) {
    console.error('Error in rejectWorkerRequest:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const counterOfferWorkerRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();

    const idRequest = Number(req.params.idRequest);
    const proposedBudget = Number(req.body?.proposed_budget);
    const counterMessageRaw = req.body?.counter_message != null ? String(req.body.counter_message) : '';
    const counterMessage = counterMessageRaw.trim().slice(0, 255) || null;

    if (!idRequest) {
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }
    if (!Number.isFinite(proposedBudget) || proposedBudget <= 0 || proposedBudget > 100000) {
      res.status(400).json({ error: 'proposed_budget must be greater than 0 and less than 100000.' });
      return;
    }

    const [profileRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id_worker_profile FROM worker_profiles WHERE id_user = ? LIMIT 1`,
      [userId]
    );
    if (profileRows.length === 0) {
      res.status(404).json({ error: 'Worker profile not found.' });
      return;
    }
    const profileId = Number(profileRows[0].id_worker_profile);

    await connection.beginTransaction();

    const [requestRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id_request, status, assigned_worker_profile
       FROM service_requests
       WHERE id_request = ?
       FOR UPDATE`,
      [idRequest]
    );
    if (requestRows.length === 0) {
      await connection.rollback();
      res.status(404).json({ error: 'Request not found.' });
      return;
    }

    const request = requestRows[0];
    if (!['open', 'pending'].includes(String(request.status)) || request.assigned_worker_profile != null) {
      await connection.rollback();
      res.status(409).json({ error: 'Request already taken by another worker.' });
      return;
    }

    const [myRow] = await connection.execute<RowDataPacket[]>(
      `SELECT status FROM service_request_workers
       WHERE id_request = ? AND id_worker_profile = ?
       LIMIT 1
       FOR UPDATE`,
      [idRequest, profileId]
    );
    if (myRow.length === 0 || myRow[0].status !== 'new') {
      await connection.rollback();
      res.status(409).json({ error: 'This request is no longer available for counter offer.' });
      return;
    }

    await connection.execute(
      `UPDATE service_requests
       SET status = 'assigned', assigned_worker_profile = ?, assigned_at = CURRENT_TIMESTAMP, final_budget = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ?`,
      [profileId, idRequest]
    );

    await connection.execute(
      `UPDATE service_request_workers
       SET status = 'accepted', proposed_budget = ?, counter_message = ?, counter_status = 'pending', updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ? AND id_worker_profile = ?`,
      [proposedBudget, counterMessage, idRequest, profileId]
    );

    await connection.execute(
      `UPDATE service_request_workers
       SET status = 'expired', updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ? AND id_worker_profile != ? AND status = 'new'`,
      [idRequest, profileId]
    );

    await connection.commit();
    res.json({
      success: true,
      message: 'Counter offer sent and request assigned.',
      id_request: idRequest,
      proposed_budget: proposedBudget,
      counter_message: counterMessage,
    });
  } catch (error: any) {
    await connection.rollback();
    console.error('Error in counterOfferWorkerRequest:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

export const updateWorkerPresence = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureWorkerGeoColumns();

    const isOnline = req.body?.is_online === true || req.body?.is_online === 1 || req.body?.is_online === '1';
    const latRaw = req.body?.lat;
    const lngRaw = req.body?.lng;
    const coverageRaw = req.body?.coverage_km;

    const lat = latRaw != null && latRaw !== '' ? Number(latRaw) : null;
    const lng = lngRaw != null && lngRaw !== '' ? Number(lngRaw) : null;
    const coverage = coverageRaw != null && coverageRaw !== '' ? Number(coverageRaw) : null;

    if (lat != null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) {
      res.status(400).json({ error: 'Invalid latitude.' });
      return;
    }
    if (lng != null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
      res.status(400).json({ error: 'Invalid longitude.' });
      return;
    }
    if (coverage != null && (!Number.isFinite(coverage) || coverage <= 0 || coverage > 100)) {
      res.status(400).json({ error: 'Invalid coverage_km (1-100).' });
      return;
    }

    const profileId = await ensureWorkerProfile(userId);
    await pool.execute(
      `UPDATE worker_profiles
       SET is_online = ?,
           latitude = COALESCE(?, latitude),
           longitude = COALESCE(?, longitude),
           coverage_km = COALESCE(?, coverage_km),
           last_seen_at = CURRENT_TIMESTAMP
       WHERE id_worker_profile = ?`,
      [isOnline ? 1 : 0, lat, lng, coverage, profileId]
    );

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_worker_profile, is_online, latitude, longitude, coverage_km, last_seen_at
       FROM worker_profiles
       WHERE id_worker_profile = ?
       LIMIT 1`,
      [profileId]
    );

    res.json({ success: true, presence: rows[0] || null });
  } catch (error: any) {
    console.error('Error in updateWorkerPresence:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateWorkerSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { phone_number, bio } = req.body;
    const changes: string[] = [];

    if (phone_number != null) {
      const phoneRegex = /^\d{8}$/;
      if (!phoneRegex.test(String(phone_number).trim())) {
        res.status(400).json({ error: 'Phone number must be exactly 8 digits.' });
        return;
      }
    }

    const profileId = await ensureWorkerProfile(userId);
    const userBefore = await getUserCore(userId);

    if (phone_number != null && String(phone_number).trim() !== userBefore?.phone_number) {
      await pool.execute(`UPDATE users SET phone_number = ? WHERE id_user = ?`, [
        String(phone_number).trim(),
        userId,
      ]);
      changes.push('Phone number updated');
    }

    if (bio != null) {
      await pool.execute(`UPDATE worker_profiles SET bio = ? WHERE id_worker_profile = ?`, [
        String(bio).trim() || null,
        profileId,
      ]);
      changes.push('Description updated');
    }

    if (changes.length > 0 && userBefore?.email) {
      await sendProfileChangeNotice(userBefore.email, userBefore.name, changes);
    }

    res.json({ success: true, message: 'Settings updated successfully.' });
  } catch (error: any) {
    console.error('Error in updateWorkerSettings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const changeWorkerPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { current_password, new_password, confirm_password } = req.body;
    if (!current_password || !new_password || !confirm_password) {
      res.status(400).json({ error: 'All password fields are required.' });
      return;
    }

    if (new_password !== confirm_password) {
      res.status(400).json({ error: 'New passwords do not match.' });
      return;
    }

    if (String(new_password).length < 8 || String(new_password).length > 128) {
      res.status(400).json({ error: 'New password must be between 8 and 128 characters.' });
      return;
    }

    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT id_user, name, email, password_hash FROM users WHERE id_user = ? LIMIT 1`,
      [userId]
    );
    if (users.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = users[0];
    const ok = await bcrypt.compare(current_password, user.password_hash);
    if (!ok) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }

    const passwordHash = await bcrypt.hash(new_password, 12);
    await pool.execute(`UPDATE users SET password_hash = ? WHERE id_user = ?`, [passwordHash, userId]);
    await sendProfileChangeNotice(user.email, user.name, ['Password changed']);

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (error: any) {
    console.error('Error in changeWorkerPassword:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const requestWorkerEmailChangeToken = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { new_email } = req.body;
    if (!new_email || typeof new_email !== 'string' || !new_email.includes('@')) {
      res.status(400).json({ error: 'Valid new email is required.' });
      return;
    }

    const normalizedEmail = new_email.trim().toLowerCase();
    const [currentUserRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_user, name, email FROM users WHERE id_user = ? LIMIT 1`,
      [userId]
    );
    if (currentUserRows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const currentUser = currentUserRows[0];
    if (currentUser.email === normalizedEmail) {
      res.status(400).json({ error: 'New email must be different from current email.' });
      return;
    }

    const [conflictRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_user FROM users WHERE email = ? LIMIT 1`,
      [normalizedEmail]
    );
    if (conflictRows.length > 0) {
      res.status(400).json({ error: 'Email is already in use.' });
      return;
    }

    await ensurePendingEmailColumn();

    const token = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await pool.execute(
      `UPDATE users SET verification_token = ?, token_expires_at = ?, pending_email = ? WHERE id_user = ?`,
      [token, expiresAt, normalizedEmail, userId]
    );

    const sent = await sendEmailChangeToken(normalizedEmail, token, currentUser.name);
    if (!sent) {
      res.status(500).json({ error: 'Could not send verification token email.' });
      return;
    }

    res.json({ success: true, message: 'Verification token sent to new email.' });
  } catch (error: any) {
    console.error('Error in requestWorkerEmailChangeToken:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const verifyWorkerEmailChangeToken = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      res.status(400).json({ error: 'Token is required.' });
      return;
    }

    await ensurePendingEmailColumn();

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_user, name, email, pending_email, verification_token, token_expires_at
       FROM users
       WHERE id_user = ?
       LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = rows[0];
    if (!user.verification_token || user.verification_token !== token) {
      res.status(400).json({ error: 'Invalid token.' });
      return;
    }

    if (!user.token_expires_at || new Date(user.token_expires_at) < new Date()) {
      res.status(400).json({ error: 'Token expired.' });
      return;
    }

    if (!user.pending_email) {
      res.status(400).json({ error: 'No pending email change found.' });
      return;
    }

    await pool.execute(
      `UPDATE users
       SET email = ?, verification_token = NULL, token_expires_at = NULL, pending_email = NULL
       WHERE id_user = ?`,
      [user.pending_email, userId]
    );

    await sendProfileChangeNotice(user.pending_email, user.name, ['Email changed']);
    res.json({
      success: true,
      message: 'Email updated successfully.',
      new_email: user.pending_email,
    });
  } catch (error: any) {
    console.error('Error in verifyWorkerEmailChangeToken:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const uploadProfileImage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Profile image is required.' });
      return;
    }

    if (!allowedImageMimeTypes.has(file.mimetype)) {
      res.status(400).json({ error: 'Only PNG and JPG/JPEG images are allowed.' });
      return;
    }

    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT id_user, name, email, profile_image FROM users WHERE id_user = ? LIMIT 1`,
      [userId]
    );
    if (users.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = users[0];
    await pool.execute(`UPDATE users SET profile_image = ? WHERE id_user = ?`, [file.filename, userId]);

    if (user.profile_image) {
      const oldFilePath = path.join(__dirname, '../../uploads', user.profile_image);
      if (fs.existsSync(oldFilePath)) {
        try {
          fs.unlinkSync(oldFilePath);
        } catch (e) {
          console.warn('Could not delete old profile image:', oldFilePath);
        }
      }
    }

    await sendProfileChangeNotice(user.email, user.name, ['Profile image updated']);
    res.json({
      success: true,
      message: 'Profile image updated.',
      profile_image: file.filename,
      profile_image_url: buildAssetUrl(req, file.filename),
    });
  } catch (error: any) {
    console.error('Error in uploadProfileImage:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const uploadPortfolioImages = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) {
      res.status(400).json({ error: 'At least one image is required.' });
      return;
    }

    const invalid = files.find((file) => !allowedImageMimeTypes.has(file.mimetype));
    if (invalid) {
      res.status(400).json({ error: 'Only PNG and JPG/JPEG images are allowed in portfolio.' });
      return;
    }

    const profileId = await ensureWorkerProfile(userId);
    const [countRows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM worker_portfolio WHERE id_worker_profile = ?`,
      [profileId]
    );
    const currentCount = Number(countRows[0]?.total || 0);
    if (currentCount + files.length > 10) {
      res.status(400).json({ error: `You can upload up to 10 photos. Current: ${currentCount}.` });
      return;
    }

    const description = req.body?.description ? String(req.body.description).trim() : null;
    for (const file of files) {
      await pool.execute(
        `INSERT INTO worker_portfolio (id_worker_profile, image_url, description)
         VALUES (?, ?, ?)`,
        [profileId, file.filename, description || null]
      );
    }

    const [portfolio] = await pool.execute<RowDataPacket[]>(
      `SELECT id_photo, id_worker_profile, image_url, description, uploaded_at
       FROM worker_portfolio
       WHERE id_worker_profile = ?
       ORDER BY uploaded_at DESC`,
      [profileId]
    );

    res.json({
      success: true,
      message: 'Portfolio updated.',
      portfolio: portfolio.map((item) => ({
        ...item,
        image_full_url: buildAssetUrl(req, item.image_url),
      })),
    });
  } catch (error: any) {
    console.error('Error in uploadPortfolioImages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deletePortfolioImage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const idPhoto = Number(req.params.idPhoto);
    if (!idPhoto) {
      res.status(400).json({ error: 'Invalid photo id.' });
      return;
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT wp.id_photo, wp.image_url
       FROM worker_portfolio wp
       INNER JOIN worker_profiles p ON p.id_worker_profile = wp.id_worker_profile
       WHERE wp.id_photo = ? AND p.id_user = ?
       LIMIT 1`,
      [idPhoto, userId]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Photo not found.' });
      return;
    }

    const imageUrl = rows[0].image_url as string | null;
    await pool.execute(`DELETE FROM worker_portfolio WHERE id_photo = ?`, [idPhoto]);

    if (imageUrl) {
      const filePath = path.join(__dirname, '../../uploads', imageUrl);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          console.warn('Could not delete portfolio file:', filePath);
        }
      }
    }

    res.json({ success: true, message: 'Portfolio photo deleted.' });
  } catch (error: any) {
    console.error('Error in deletePortfolioImage:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const uploadDocuments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!files || !files.dui_document) {
      res.status(400).json({ error: 'DUI Document is required for verification' });
      return;
    }

    if (!files.cert_document || files.cert_document.length === 0) {
      res.status(400).json({ error: 'Certification document is required for verification' });
      return;
    }

    const duiPath = files.dui_document[0].filename;
    const certPath =
      files.cert_document && files.cert_document.length > 0
        ? files.cert_document[0].filename
        : null;

    await pool.execute(
      `UPDATE worker_profiles 
       SET dui_document = ?, cert_document = ?
       WHERE id_user = ?`,
      [duiPath, certPath, userId]
    );

    res.json({
      success: true,
      message: 'Documents uploaded successfully. Pending admin review.',
      dui_path: duiPath,
      cert_path: certPath,
    });
  } catch (error: any) {
    console.error('Error uploading documents:', error);
    res.status(500).json({ error: 'Error processing files' });
  }
};
