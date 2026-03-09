import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import { Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { AuthRequest } from '../middlewares/auth.middleware';
import { sendEmailChangeToken, sendProfileChangeNotice } from '../utils/email';

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
