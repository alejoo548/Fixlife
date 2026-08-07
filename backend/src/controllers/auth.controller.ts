import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import pool from '../config/db';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/email';
import { ensureUsersActiveColumn, ensureUsersPendingWorkerColumn, ensureUsersPhoneNumberNullable, ensureUsersLoginSecurityColumns, ensureUsersUsernameChangedAtColumn } from '../utils/users';
import { AuthRequest } from '../middlewares/auth.middleware';
import { OAuth2Client } from 'google-auth-library';
import { signAccessToken } from '../config/security';
import { deleteUploadIfExists } from '../utils/assets';
import { recordSystemEvent } from '../services/systemEvents.service';
import { AuthErrorCode } from '../constants/authErrorCodes';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY || '';
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;
const isRecaptchaEnabled = Boolean(RECAPTCHA_SECRET_KEY);

const sanitizeText = (value: unknown): string => String(value ?? '').trim();
const normalizeNameCase = (value: string): string =>
  value
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('es')
    .replace(/(^|\s)(\p{L})/gu, (_match, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase('es')}`);

const verifyRecaptchaToken = async (token: string, remoteIp?: string) => {
  try {
    if (!RECAPTCHA_SECRET_KEY) {
      return { success: false, error: 'Captcha is not configured on the server.' };
    }

    const params = new URLSearchParams();
    params.set('secret', RECAPTCHA_SECRET_KEY);
    params.set('response', token);
    if (remoteIp) params.set('remoteip', remoteIp);

    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = (await response.json()) as any;
    if (data?.success === true) return { success: true };
    return { success: false, error: 'Captcha validation failed.' };
  } catch (error: any) {
    console.error('Error verifying captcha:', error);
    return { success: false, error: 'Captcha verification error.' };
  }
};

const isValidName = (value: string): boolean => {
  if (value.length < 2 || value.length > 16) return false;
  return /^[\p{L}]+(?:[\p{L}\s]*[\p{L}])?$/u.test(value);
};

const isValidPhone = (value: string): boolean => {
  if (!value) return true;
  return /^\d{4}-\d{4}$/.test(value);
};

const isValidUsername = (value: string): boolean => {
  if (!value) return true;
  return /^[a-zA-Z0-9._-]{3,30}$/.test(value);
};
const isValidEmail = (value: string): boolean => {
  if (!value) return false;
  return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+com$/i.test(value) && value.length <= 100;
};

const isValidPassword = (value: string): boolean => {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/.test(value);
};

export const registerWorker = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureUsersPendingWorkerColumn();
    await ensureUsersUsernameChangedAtColumn();

    const { name, lastname, email, phone_number, password, username, service_ids } = req.body;

    if (!name || !lastname || !email || !phone_number || !password) {
      res.status(400).json({ error: 'Missing required fields' , code: AuthErrorCode.MISSING_FIELDS });
      return;
    }

    const trimmedName = normalizeNameCase(name);
    const trimmedLastname = normalizeNameCase(lastname);
    const trimmedEmail = email.trim();
    const trimmedPhoneNumber = phone_number.trim();
    const trimmedUsername = username ? username.trim() : undefined;

    if (!isValidEmail(trimmedEmail)) {
      res.status(400).json({ error: 'Invalid email.' , code: AuthErrorCode.INVALID_EMAIL });
      return;
    }
    if (!isValidName(trimmedName)) {
      res.status(400).json({ error: 'First name is invalid.' , code: AuthErrorCode.INVALID_FIRST_NAME });
      return;
    }
    if (!isValidName(trimmedLastname)) {
      res.status(400).json({ error: 'Last name is invalid.' , code: AuthErrorCode.INVALID_LAST_NAME });
      return;
    }
    if (!isValidPhone(trimmedPhoneNumber)) {
      res.status(400).json({ error: 'Phone number is invalid.' , code: AuthErrorCode.INVALID_PHONE });
      return;
    }
    if (trimmedUsername && !isValidUsername(trimmedUsername)) {
      res.status(400).json({ error: 'Username is invalid.' , code: AuthErrorCode.INVALID_USERNAME });
      return;
    }
    if (!isValidPassword(String(password))) {
      res.status(400).json({ error: 'Password must be 8-128 chars and include at least 1 uppercase letter, 1 lowercase letter and 1 number.' , code: AuthErrorCode.WEAK_PASSWORD });
      return;
    }

    const normalizedServiceIds = Array.isArray(service_ids)
      ? Array.from(new Set(
          service_ids
            .map((id: any) => Number(id))
            .filter((id: number) => Number.isFinite(id) && id > 0)
        ))
      : [];

    if (normalizedServiceIds.length === 0) {
      res.status(400).json({ error: 'Select at least one service you offer.' , code: AuthErrorCode.SELECT_SERVICE });
      return;
    }
    if (normalizedServiceIds.length > 3) {
      res.status(400).json({ error: 'You can select up to 3 services.' , code: AuthErrorCode.TOO_MANY_SERVICES });
      return;
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [activeServiceRows] = await connection.execute<RowDataPacket[]>(
        `SELECT id_service FROM services WHERE id_service IN (${normalizedServiceIds.map(() => '?').join(', ')}) AND is_active = 1`,
        normalizedServiceIds
      );
      if (activeServiceRows.length !== normalizedServiceIds.length) {
        await connection.rollback();
        res.status(400).json({ error: 'One or more selected services are not available.' , code: AuthErrorCode.SERVICES_UNAVAILABLE });
        return;
      }

      const [existingUsers] = await connection.execute<RowDataPacket[]>(
        'SELECT id_user, verification_token FROM users WHERE email = ?',
        [trimmedEmail]
      );

      if (existingUsers.length > 0) {
        const existingUser = existingUsers[0];

        if (existingUser.verification_token !== null) {
          const password_hash = await bcrypt.hash(password, 12);
          const otp = Math.floor(100000 + Math.random() * 900000).toString();
          const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

          await connection.execute(
            `UPDATE users SET name = ?, lastname = ?, phone_number = ?, password_hash = ?, username = ?, verification_token = ?, token_expires_at = ?, pending_worker = 1 WHERE id_user = ?`,
            [trimmedName, trimmedLastname, trimmedPhoneNumber, password_hash, trimmedUsername || null, otp, expiresAt, existingUser.id_user]
          );

          // Re-sync worker services on re-registration: ensure there is a worker_profile
          // and replace selected services with the new list from this attempt.
          const [existingProfileRows] = await connection.execute<RowDataPacket[]>(
            `SELECT id_worker_profile FROM worker_profiles WHERE id_user = ? LIMIT 1`,
            [existingUser.id_user]
          );
          let existingProfileId: number | null = existingProfileRows.length > 0
            ? Number(existingProfileRows[0].id_worker_profile)
            : null;
          if (existingProfileId === null) {
            const [createdProfile] = await connection.execute<ResultSetHeader>(
              `INSERT INTO worker_profiles (id_user, is_verified) VALUES (?, 0)`,
              [existingUser.id_user]
            );
            existingProfileId = Number(createdProfile.insertId);
          }
          await connection.execute(
            `DELETE FROM worker_services WHERE id_worker_profile = ?`,
            [existingProfileId]
          );
          if (normalizedServiceIds.length > 0) {
            await connection.execute(
              `INSERT IGNORE INTO worker_services (id_worker_profile, id_service)
               VALUES ${normalizedServiceIds.map(() => '(?, ?)').join(', ')}`,
              normalizedServiceIds.flatMap((svcId: number) => [existingProfileId, svcId])
            );
          }

          const emailSent = await sendVerificationEmail(trimmedEmail, otp, trimmedName);
          if (!emailSent) {
            await connection.rollback();
            res.status(500).json({ error: 'Could not deliver the verification email. Please try again.' , code: AuthErrorCode.EMAIL_DELIVERY_FAILED });
            return;
          }

          await connection.commit();
          res.status(201).json({ success: true, message: 'New OTP sent to email. Please verify.', email: trimmedEmail });
          return;
        }

        await connection.rollback();
        res.status(400).json({ error: 'Email already registered' , code: AuthErrorCode.EMAIL_ALREADY_REGISTERED });
        return;
      }

      if (trimmedUsername) {
        const [existingUsernames] = await connection.execute<RowDataPacket[]>(
          'SELECT id_user, email FROM users WHERE username = ? AND email != ?',
          [trimmedUsername, trimmedEmail]
        );

        if (existingUsernames.length > 0) {
          await connection.rollback();
          res.status(400).json({ error: 'Username is already taken' , code: AuthErrorCode.USERNAME_TAKEN });
          return;
        }
      }

      const password_hash = await bcrypt.hash(password, 12);

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

      const [insertUserResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO users (name, lastname, email, phone_number, password_hash, rol, username, created_at, verification_token, token_expires_at, pending_worker)
         VALUES (?, ?, ?, ?, ?, 'client', ?, NOW(), ?, ?, 1)`,
        [trimmedName, trimmedLastname, trimmedEmail, trimmedPhoneNumber, password_hash, trimmedUsername || null, otp, expiresAt]
      );

      const userId = insertUserResult.insertId;

      const [profileResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO worker_profiles (id_user, is_verified)
         VALUES (?, 0)`,
        [userId]
      );

      // Insert selected services (already validated: at least 1 id)
      const profileId = profileResult.insertId;
      if (normalizedServiceIds.length > 0) {
        await connection.execute(
          `INSERT IGNORE INTO worker_services (id_worker_profile, id_service)
           VALUES ${normalizedServiceIds.map(() => '(?, ?)').join(', ')}`,
          normalizedServiceIds.flatMap((svcId: number) => [profileId, svcId])
        );
      }

      // Send OTP Email before committing
      const emailSent = await sendVerificationEmail(trimmedEmail, otp, trimmedName);
      
      if (!emailSent) {
        await connection.rollback();
        res.status(500).json({ error: 'Could not deliver the verification email. Please try again or use another email.' , code: AuthErrorCode.EMAIL_DELIVERY_FAILED });
        return;
      }

      await connection.commit();

      res.status(201).json({
        success: true,
        message: 'OTP sent to email. Please verify.',
        email: trimmedEmail
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error: any) {
    console.error('Error in registerWorker:', error);
    res.status(500).json({ error: 'Internal server error' , code: AuthErrorCode.INTERNAL_ERROR });
  }
};

export const resendOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureUsersPendingWorkerColumn();

    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email is required' , code: AuthErrorCode.EMAIL_REQUIRED });
      return;
    }
    const trimmedEmail = String(email).trim().toLowerCase();

    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT id_user, name, verification_token FROM users WHERE email = ? AND pending_worker = 1`,
      [trimmedEmail]
    );

    if (users.length === 0) {
      res.status(404).json({ error: 'User not found' , code: AuthErrorCode.USER_NOT_FOUND });
      return;
    }

    const user = users[0];

    if (user.verification_token === null) {
      res.status(400).json({ error: 'This account is already verified' , code: AuthErrorCode.ALREADY_VERIFIED });
      return;
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await pool.execute(
      `UPDATE users SET verification_token = ?, token_expires_at = ? WHERE id_user = ?`,
      [otp, expiresAt, user.id_user]
    );

    const emailSent = await sendVerificationEmail(trimmedEmail, otp, user.name);

    if (!emailSent) {
      res.status(500).json({ error: 'Could not send verification email. Please try again.' , code: AuthErrorCode.EMAIL_DELIVERY_FAILED });
      return;
    }

    res.json({ success: true, message: 'New verification code sent to your email.' });
  } catch (error: any) {
    console.error('Error in resendOtp:', error);
    res.status(500).json({ error: 'Internal server error' , code: AuthErrorCode.INTERNAL_ERROR });
  }
};

export const verifyWorkerEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureUsersPendingWorkerColumn();
    await ensureUsersUsernameChangedAtColumn();

    const { email, otp } = req.body;

    if (!email || !otp) {
      res.status(400).json({ error: 'Email and OTP are required' , code: AuthErrorCode.OTP_FIELDS_REQUIRED });
      return;
    }
    const trimmedEmail = String(email).trim().toLowerCase();
    const trimmedOtp = String(otp).trim();

    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT id_user, name, lastname, email, phone_number, rol, username, username_changed_at, profile_image, verification_token, token_expires_at, pending_worker
       FROM users WHERE email = ? AND pending_worker = 1`,
      [trimmedEmail]
    );

    if (users.length === 0) {
      res.status(404).json({ error: 'User not found' , code: AuthErrorCode.USER_NOT_FOUND });
      return;
    }

    const user = users[0];

    if (user.verification_token !== trimmedOtp) {
      res.status(400).json({ error: 'Invalid verification token' , code: AuthErrorCode.INVALID_OTP });
      return;
    }

    if (new Date(user.token_expires_at) < new Date()) {
      res.status(400).json({ error: 'Verification token has expired' , code: AuthErrorCode.OTP_EXPIRED });
      return;
    }

    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      await connection.execute(
        `UPDATE users SET verification_token = NULL, token_expires_at = NULL WHERE id_user = ?`,
        [user.id_user]
      );

      await connection.commit();
      
      const [workerProfiles] = await connection.execute<RowDataPacket[]>(
        `SELECT id_worker_profile, bio, banner_image, dui_document, cert_document, is_verified
         FROM worker_profiles WHERE id_user = ?`,
        [user.id_user]
      );
      
      const worker = workerProfiles[0];

      const token = signAccessToken({
        user_id: user.id_user,
        rol: user.rol,
        pending_worker: user.pending_worker ? 1 : 0,
      });

      res.status(200).json({
        success: true,
        message: 'Email verified successfully',
        user: {
          id_user: user.id_user,
          name: user.name,
          lastname: user.lastname,
          email: user.email,
          phone_number: user.phone_number,
          rol: user.rol,
          username: user.username,
          username_changed_at: user.username_changed_at,
          profile_image: user.profile_image,
          pending_worker: user.pending_worker ? 1 : 0,
          worker_profile: {
            id_worker_profile: worker.id_worker_profile,
            bio: worker.bio,
            banner_image: worker.banner_image,
            is_verified: Boolean(worker.is_verified)
          }
        },
        token
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error: any) {
    console.error('Error in verifyWorkerEmail:', error);
    res.status(500).json({ error: 'Internal server error' , code: AuthErrorCode.INTERNAL_ERROR });
  }
};

export const registerUser = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureUsersPhoneNumberNullable();

    const { name, lastname, email, phone_number, password, username, captchaToken } = req.body;

    if (!name || !lastname || !email || !phone_number || !password) {
      res.status(400).json({ error: 'Missing required fields' , code: AuthErrorCode.MISSING_FIELDS });
      return;
    }

    const trimmedName = normalizeNameCase(String(name));
    const trimmedLastname = normalizeNameCase(String(lastname));
    const trimmedEmail = String(email).trim().toLowerCase();
    const trimmedPhoneNumber = phone_number ? String(phone_number).trim() : '';
    const trimmedUsername = username ? String(username).trim() : '';

    if (!isValidEmail(trimmedEmail)) {
      res.status(400).json({ error: 'Invalid email' , code: AuthErrorCode.INVALID_EMAIL });
      return;
    }

    if (!isValidName(trimmedName) || !isValidName(trimmedLastname)) {
      res.status(400).json({ error: 'Invalid name or lastname' , code: AuthErrorCode.INVALID_NAME_LASTNAME });
      return;
    }

    if (!isValidPhone(trimmedPhoneNumber)) {
      res.status(400).json({ error: 'Invalid phone number format' , code: AuthErrorCode.INVALID_PHONE });
      return;
    }

    if (trimmedUsername && !isValidUsername(trimmedUsername)) {
      res.status(400).json({ error: 'Invalid username format' , code: AuthErrorCode.INVALID_USERNAME });
      return;
    }

    if (!isValidPassword(String(password))) {
      res.status(400).json({ error: 'Password must be 8-128 chars and include at least 1 letter and 1 number' , code: AuthErrorCode.WEAK_PASSWORD });
      return;
    }

    if (isRecaptchaEnabled && !captchaToken) {
      res.status(400).json({ error: 'Captcha is required' , code: AuthErrorCode.CAPTCHA_REQUIRED });
      return;
    }

    if (isRecaptchaEnabled) {
      const captchaResult = await verifyRecaptchaToken(String(captchaToken), req.ip);
      if (!captchaResult.success) {
        res.status(400).json({ error: captchaResult.error || 'Captcha validation failed', code: AuthErrorCode.CAPTCHA_FAILED });
        return;
      }
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [existingUsers] = await connection.execute<RowDataPacket[]>(
        'SELECT id_user FROM users WHERE email = ?',
        [trimmedEmail]
      );

      if (existingUsers.length > 0) {
        await connection.rollback();
        res.status(400).json({ error: 'Email already registered' , code: AuthErrorCode.EMAIL_ALREADY_REGISTERED });
        return;
      }

      const password_hash = await bcrypt.hash(password, 12);

      const [insertUserResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO users 
         (name, lastname, email, phone_number, password_hash, rol, username, created_at)
         VALUES (?, ?, ?, ?, ?, 'client', ?, NOW())`,
        [trimmedName, trimmedLastname, trimmedEmail, trimmedPhoneNumber || null, password_hash, trimmedUsername || null]
      );

      const userId = insertUserResult.insertId;

      await connection.commit();

      const token = signAccessToken({ user_id: userId, rol: 'client', pending_worker: 0 });

      res.status(201).json({
        success: true,
        message: 'User account created successfully',
        user: {
          id_user: userId,
          name: trimmedName,
          lastname: trimmedLastname,
          email: trimmedEmail,
          phone_number: trimmedPhoneNumber,
          rol: 'client',
          username: trimmedUsername || null,
          username_changed_at: null
        },
        token
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error: any) {
    console.error('Error in registerUser:', error);
    res.status(500).json({ error: 'Internal server error' , code: AuthErrorCode.INTERNAL_ERROR });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password required' , code: AuthErrorCode.LOGIN_FIELDS_REQUIRED });
      return;
    }

    const trimmedEmail = String(email).trim().toLowerCase();

    await ensureUsersActiveColumn();
    await ensureUsersPendingWorkerColumn();
    await ensureUsersUsernameChangedAtColumn();
    await ensureUsersLoginSecurityColumns();

    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT id_user, name, lastname, email, phone_number, password_hash, rol, username, username_changed_at, profile_image, is_active, pending_worker, failed_login_attempts, locked_until
       FROM users WHERE email = ?`,
      [trimmedEmail]
    );

    if (users.length === 0) {
      res.status(401).json({ error: 'Invalid credentials' , code: AuthErrorCode.INVALID_CREDENTIALS });
      return;
    }

    const user = users[0];

    // Account locked due to previous failed login attempts?
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      res.status(403).json({ error: 'Too many failed attempts. Account temporarily locked. Try again later.' , code: AuthErrorCode.ACCOUNT_LOCKED });
      await recordSystemEvent({
        level: 'warning',
        component: 'auth',
        eventType: 'login_blocked',
        message: 'Login attempt on locked account.',
        metadata: { email: trimmedEmail },
      }).catch(() => undefined);
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      // Increment failed attempts and possibly lock the account
      const currentAttempts = Number(user.failed_login_attempts || 0) + 1;
      const MAX_FAILED_ATTEMPTS = 6;
      const LOCK_MINUTES = 15;

      let updateSql = 'UPDATE users SET failed_login_attempts = ?';
      const params: any[] = [currentAttempts];

      if (currentAttempts >= MAX_FAILED_ATTEMPTS) {
        updateSql += ', locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE)';
        params.push(LOCK_MINUTES);
      }

      updateSql += ' WHERE id_user = ?';
      params.push(user.id_user);

      await pool.execute(updateSql, params);

      res.status(401).json({ error: 'Invalid credentials' , code: AuthErrorCode.INVALID_CREDENTIALS });
      await recordSystemEvent({
        level: 'warning',
        component: 'auth',
        eventType: 'login_failed',
        message: 'Failed login attempt.',
        metadata: { email: trimmedEmail, reason: 'invalid_password' },
      }).catch(() => undefined);
      return;
    }

    if (user.is_active === 0) {
      res.status(403).json({ error: 'Account is inactive. Contact support.' , code: AuthErrorCode.ACCOUNT_INACTIVE });
      return;
    }

    // Success: reset security counters + update last_login
    await pool.execute(
      'UPDATE users SET last_login = NOW(), failed_login_attempts = 0, locked_until = NULL WHERE id_user = ?',
      [user.id_user]
    );

    await recordSystemEvent({
      level: 'info',
      component: 'auth',
      eventType: 'login_success',
      message: 'User logged in successfully.',
      metadata: { userId: user.id_user, role: user.rol },
    }).catch(() => undefined);

    const userData: any = {
      id_user: user.id_user,
      name: user.name,
      lastname: user.lastname,
      email: user.email,
      phone_number: user.phone_number,
      rol: user.rol,
      username: user.username,
      username_changed_at: user.username_changed_at,
      profile_image: user.profile_image,
      pending_worker: user.pending_worker ? 1 : 0
    };

    if (user.rol === 'worker' || user.pending_worker === 1) {
      const [workerProfiles] = await pool.execute<RowDataPacket[]>(
        `SELECT id_worker_profile, bio, banner_image, dui_document, cert_document, is_verified
         FROM worker_profiles WHERE id_user = ?`,
        [user.id_user]
      );

      if (workerProfiles.length > 0) {
        const worker = workerProfiles[0];
        userData.worker_profile = {
          id_worker_profile: worker.id_worker_profile,
          bio: worker.bio,
          banner_image: worker.banner_image,
          is_verified: Boolean(worker.is_verified)
        };
      }
    }

    const token = signAccessToken({
      user_id: user.id_user,
      rol: user.rol,
      pending_worker: user.pending_worker ? 1 : 0,
    });

    res.json({
      success: true,
      user: userData,
      token
    });
  } catch (error: any) {
    console.error('Error in login:', error);
    res.status(500).json({ error: 'Internal server error' , code: AuthErrorCode.INTERNAL_ERROR });
  }
};

export const googleLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { credential } = req.body;

    if (!credential) {
      res.status(400).json({ error: 'Missing Google credential' , code: AuthErrorCode.GOOGLE_CRED_MISSING });
      return;
    }

    if (!googleClient || !GOOGLE_CLIENT_ID) {
      res.status(500).json({ error: 'Google login is not configured' , code: AuthErrorCode.GOOGLE_NOT_CONFIGURED });
      return;
    }

    await ensureUsersActiveColumn();
    await ensureUsersPendingWorkerColumn();
    await ensureUsersPhoneNumberNullable();
    await ensureUsersUsernameChangedAtColumn();
    await ensureUsersLoginSecurityColumns();

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const email = payload?.email ? String(payload.email).toLowerCase() : '';

    if (!email) {
      res.status(400).json({ error: 'Google account email is missing' , code: AuthErrorCode.GOOGLE_EMAIL_MISSING });
      return;
    }

    if (payload?.email_verified === false) {
      res.status(400).json({ error: 'Google email is not verified' , code: AuthErrorCode.GOOGLE_EMAIL_UNVERIFIED });
      return;
    }

    const fullName = sanitizeText(payload?.name);
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const fallbackName = nameParts[0] || 'User';
    const fallbackLast = nameParts.slice(1).join(' ') || fallbackName;
    const name = normalizeNameCase(sanitizeText(payload?.given_name) || fallbackName).slice(0, 16);
    const lastname = normalizeNameCase(sanitizeText(payload?.family_name) || fallbackLast).slice(0, 16);

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [users] = await connection.execute<RowDataPacket[]>(
        `SELECT id_user, name, lastname, email, phone_number, rol, username, username_changed_at, profile_image, is_active, pending_worker, failed_login_attempts, locked_until
         FROM users WHERE email = ?`,
        [email]
      );

      let userData: any;
      let userId: number;
      let userRole: string;
      let pendingWorker: number;

      if (users.length > 0) {
        const user = users[0];

        if (user.locked_until && new Date(user.locked_until) > new Date()) {
          await connection.rollback();
          res.status(403).json({ error: 'Too many failed attempts. Account temporarily locked. Try again later.' , code: AuthErrorCode.ACCOUNT_LOCKED });
          return;
        }

        if (user.is_active === 0) {
          await connection.rollback();
          res.status(403).json({ error: 'Account is inactive. Contact support.' , code: AuthErrorCode.ACCOUNT_INACTIVE });
          return;
        }

        userId = Number(user.id_user);
        userRole = String(user.rol);
        pendingWorker = user.pending_worker ? 1 : 0;
        const currentLastname = sanitizeText(user.lastname);

        if (!currentLastname || currentLastname.toLowerCase() === 'google') {
          await connection.execute(`UPDATE users SET lastname = ? WHERE id_user = ?`, [lastname, userId]);
        }

        userData = {
          id_user: userId,
          name: user.name,
          lastname: (!currentLastname || currentLastname.toLowerCase() === 'google') ? lastname : user.lastname,
          email: user.email,
          phone_number: user.phone_number,
          rol: userRole,
          username: user.username,
          username_changed_at: user.username_changed_at,
          profile_image: user.profile_image,
          pending_worker: pendingWorker,
        };
      } else {
        const password_hash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);

        const [insertUserResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO users
           (name, lastname, email, phone_number, password_hash, rol, username, created_at)
           VALUES (?, ?, ?, ?, ?, 'client', ?, NOW())`,
          [name, lastname, email, null, password_hash, null]
        );

        userId = insertUserResult.insertId;
        userRole = 'client';
        pendingWorker = 0;

        userData = {
          id_user: userId,
          name,
          lastname,
          email,
          phone_number: null,
          rol: userRole,
          username: null,
          username_changed_at: null,
          pending_worker: pendingWorker,
        };
      }

      await connection.execute(
        'UPDATE users SET last_login = NOW(), failed_login_attempts = 0, locked_until = NULL WHERE id_user = ?',
        [userId]
      );

      if (userRole === 'worker' || pendingWorker === 1) {
        const [workerProfiles] = await connection.execute<RowDataPacket[]>(
          `SELECT id_worker_profile, bio, banner_image, dui_document, cert_document, is_verified
           FROM worker_profiles WHERE id_user = ?`,
          [userId]
        );

        if (workerProfiles.length > 0) {
          const worker = workerProfiles[0];
          userData.worker_profile = {
            id_worker_profile: worker.id_worker_profile,
            bio: worker.bio,
            banner_image: worker.banner_image,
            is_verified: Boolean(worker.is_verified),
          };
        }
      }

      await connection.commit();

      const token = signAccessToken({
        user_id: userId,
        rol: userRole,
        pending_worker: pendingWorker,
      });

      res.json({
        success: true,
        user: userData,
        token,
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error: any) {
    console.error('Error in googleLogin:', error);
    res.status(500).json({ error: 'Internal server error' , code: AuthErrorCode.INTERNAL_ERROR });
  }
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email || !email.trim()) {
      res.status(400).json({ error: 'Email is required' , code: AuthErrorCode.EMAIL_REQUIRED });
      return;
    }

    const trimmedEmail = email.trim();

    // Buscar usuario
    const [users] = await pool.execute<RowDataPacket[]>(
      'SELECT id_user, name FROM users WHERE email = ?',
      [trimmedEmail]
    );

    // Por seguridad, siempre respondemos success aunque el email no exista
    if (users.length === 0) {
      res.json({ success: true, message: 'If the email exists, a reset code has been sent.' });
      return;
    }

    const user = users[0];

    // Generar OTP de 6 dígitos
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

    // Guardar el token en la BD
    await pool.execute(
      `UPDATE users 
       SET verification_token = ?, token_expires_at = ?
       WHERE email = ?`,
      [otp, expiresAt, trimmedEmail]
    );

    // Enviar email con el OTP
    const emailSent = await sendPasswordResetEmail(trimmedEmail, otp, user.name);

    if (!emailSent) {
      res.status(500).json({ error: 'Could not send reset email. Please try again.' , code: AuthErrorCode.EMAIL_DELIVERY_FAILED });
      return;
    }

    res.json({ 
      success: true, 
      message: 'If the email exists, a reset code has been sent.' 
    });

  } catch (error: any) {
    console.error('Error in forgotPassword:', error);
    res.status(500).json({ error: 'Internal server error' , code: AuthErrorCode.INTERNAL_ERROR });
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, token, newPassword } = req.body;

    if (!email || !token || !newPassword) {
      res.status(400).json({ error: 'Email, token, and new password are required' , code: AuthErrorCode.RESET_FIELDS_REQUIRED });
      return;
    }

    const trimmedEmail = email.trim();
    const trimmedToken = token.trim();

    if (!isValidPassword(newPassword)) {
      res.status(400).json({ error: 'Password must be 8-128 chars and include at least 1 uppercase letter, 1 lowercase letter and 1 number.' , code: AuthErrorCode.WEAK_PASSWORD });
      return;
    }

    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT id_user, verification_token, token_expires_at
       FROM users
       WHERE email = ?`,
      [trimmedEmail]
    );

    const user = users[0];
    const isValidReset =
      user &&
      user.verification_token &&
      user.verification_token === trimmedToken &&
      user.token_expires_at &&
      new Date(user.token_expires_at) >= new Date();

    if (!isValidReset) {
      res.status(400).json({ error: 'Invalid email or verification code' , code: AuthErrorCode.INVALID_RESET_CODE });
      return;
    }

    // Hash de la nueva contraseña
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Actualizar contraseña y limpiar token
    await pool.execute(
      `UPDATE users
       SET password_hash = ?, verification_token = NULL, token_expires_at = NULL
       WHERE email = ?`,
      [passwordHash, trimmedEmail]
    );

    await recordSystemEvent({
      level: 'info',
      component: 'auth',
      eventType: 'password_reset_success',
      message: 'Password reset completed.',
      metadata: { email: trimmedEmail },
    }).catch(() => undefined);

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error: any) {
    console.error('Error in resetPassword:', error);
    res.status(500).json({ error: 'Internal server error' , code: AuthErrorCode.INTERNAL_ERROR });
  }
};

export const verifyResetToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, token } = req.body;

    if (!email || !token) {
      res.status(400).json({ error: 'Email and token are required' , code: AuthErrorCode.RESET_TOKEN_FIELDS_REQUIRED });
      return;
    }

    const trimmedEmail = email.trim();
    const trimmedToken = token.trim();

    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT id_user, verification_token, token_expires_at
       FROM users
       WHERE email = ?`,
      [trimmedEmail]
    );

    const user = users[0];
    const isValid =
      user &&
      user.verification_token &&
      user.verification_token === trimmedToken &&
      user.token_expires_at &&
      new Date(user.token_expires_at) >= new Date();

    if (!isValid) {
      res.status(400).json({ error: 'Invalid email or verification code' , code: AuthErrorCode.INVALID_RESET_CODE });
      return;
    }

    res.json({ success: true, message: 'Token verified successfully' });

  } catch (error: any) {
    console.error('Error in verifyResetToken:', error);
    res.status(500).json({ error: 'Internal server error' , code: AuthErrorCode.INTERNAL_ERROR });
  }
};

export const uploadProfileImage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' , code: AuthErrorCode.UNAUTHORIZED });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'Profile image is required' , code: AuthErrorCode.PROFILE_IMAGE_REQUIRED });
      return;
    }

    const imageFilename = req.file.filename;

    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT profile_image FROM users WHERE id_user = ?',
      [userId]
    );

    if (existing.length === 0) {
      res.status(404).json({ error: 'User not found' , code: AuthErrorCode.USER_NOT_FOUND });
      return;
    }

    await pool.execute(
      `UPDATE users
       SET profile_image = ?
       WHERE id_user = ?`,
      [imageFilename, userId]
    );

    deleteUploadIfExists(existing[0].profile_image, 'public');

    res.json({
      success: true,
      profile_image: imageFilename
    });
  } catch (error: any) {
    console.error('uploadProfileImage error:', error);
    res.status(500).json({ error: 'Internal server error' , code: AuthErrorCode.INTERNAL_ERROR });
  }
};

export const removeProfileImage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' , code: AuthErrorCode.UNAUTHORIZED });
      return;
    }

    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT profile_image FROM users WHERE id_user = ?',
      [userId]
    );

    if (existing.length === 0) {
      res.status(404).json({ error: 'User not found' , code: AuthErrorCode.USER_NOT_FOUND });
      return;
    }

    await pool.execute(
      `UPDATE users
       SET profile_image = NULL
       WHERE id_user = ?`,
      [userId]
    );

    deleteUploadIfExists(existing[0].profile_image, 'public');

    res.json({
      success: true,
      profile_image: null
    });
  } catch (error: any) {
    console.error('removeProfileImage error:', error);
    res.status(500).json({ error: 'Internal server error' , code: AuthErrorCode.INTERNAL_ERROR });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await ensureUsersPhoneNumberNullable();
    await ensureUsersUsernameChangedAtColumn();

    const userId = req.user?.user_id;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' , code: AuthErrorCode.UNAUTHORIZED });
      return;
    }

    const name = normalizeNameCase(sanitizeText(req.body.name));
    const lastname = normalizeNameCase(sanitizeText(req.body.lastname));
    const phone_number = sanitizeText(req.body.phone_number);
    const username = sanitizeText(req.body.username);

    if (!name || !lastname) {
      res.status(400).json({ error: 'Name and lastname are required' , code: AuthErrorCode.NAME_LASTNAME_REQUIRED });
      return;
    }

    if (!isValidName(name) || !isValidName(lastname)) {
      res.status(400).json({ error: 'Invalid name or lastname format' , code: AuthErrorCode.INVALID_NAME_LASTNAME });
      return;
    }

    if (!isValidPhone(phone_number)) {
      res.status(400).json({ error: 'Invalid phone number format' , code: AuthErrorCode.INVALID_PHONE });
      return;
    }

    if (!isValidUsername(username)) {
      res.status(400).json({ error: 'Invalid username format' , code: AuthErrorCode.INVALID_USERNAME });
      return;
    }

    const [currentUsers] = await pool.execute<RowDataPacket[]>(
      'SELECT username, username_changed_at FROM users WHERE id_user = ? LIMIT 1',
      [userId]
    );

    if (currentUsers.length === 0) {
      res.status(404).json({ error: 'User not found' , code: AuthErrorCode.USER_NOT_FOUND });
      return;
    }

    const currentUsername = String(currentUsers[0].username || '');
    const usernameChanged = username !== currentUsername;
    if (usernameChanged && currentUsers[0].username_changed_at) {
      const lastChangedAt = new Date(currentUsers[0].username_changed_at);
      const nextAllowedAt = new Date(lastChangedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
      if (nextAllowedAt.getTime() > Date.now()) {
        res.status(429).json({ error: `Username can be changed again on ${nextAllowedAt.toISOString().slice(0, 10)}.`, code: AuthErrorCode.USERNAME_COOLDOWN, retryAfter: nextAllowedAt.toISOString().slice(0, 10) });
        return;
      }
    }

    if (username) {
      const [duplicateUsernames] = await pool.execute<RowDataPacket[]>(
        'SELECT id_user FROM users WHERE username = ? AND id_user <> ? LIMIT 1',
        [username, userId]
      );

      if (duplicateUsernames.length > 0) {
        res.status(409).json({ error: 'Username already in use' , code: AuthErrorCode.USERNAME_TAKEN });
        return;
      }
    }

    await pool.execute(
      `UPDATE users
       SET name = ?, lastname = ?, phone_number = ?, username = ?, username_changed_at = ?
       WHERE id_user = ?`,
      [name, lastname, phone_number || null, username || null, usernameChanged ? new Date() : currentUsers[0].username_changed_at, userId]
    );

    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT id_user, name, lastname, email, phone_number, rol, username, username_changed_at, profile_image
       FROM users
       WHERE id_user = ?`,
      [userId]
    );

    if (users.length === 0) {
      res.status(404).json({ error: 'User not found' , code: AuthErrorCode.USER_NOT_FOUND });
      return;
    }

    res.json({
      success: true,
      user: users[0]
    });
  } catch (error: any) {
    console.error('updateProfile error:', error);
    res.status(500).json({ error: 'Internal server error' , code: AuthErrorCode.INTERNAL_ERROR });
  }
};
