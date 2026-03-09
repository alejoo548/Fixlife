import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import pool from '../config/db';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { sendResetEmail } from '../config/mail';
import { AuthRequest } from '../middlewares/auth.middleware';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_for_development';

const sanitizeText = (value: unknown): string => String(value ?? '').trim();

const isValidEmail = (email: string): boolean => {
  if (email.length > 120) return false;
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}$/.test(email);
};

const isValidName = (value: string): boolean => {
  if (value.length < 2 || value.length > 60) return false;
  return /^[\p{L}]+(?:[\p{L} .'-]*[\p{L}])?$/u.test(value);
};

const isValidPhone = (value: string): boolean => {
  if (!value) return true;
  return /^\+?[0-9]{8,15}$/.test(value);
};

const isValidUsername = (value: string): boolean => {
  if (!value) return true;
  return /^[a-zA-Z0-9._-]{3,30}$/.test(value);
};

const isValidPassword = (value: string): boolean => {
  if (value.length < 8 || value.length > 72) return false;
  return /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value);
};

const isValidResetCode = (value: string): boolean => /^\d{6}$/.test(value);

const uploadsDir = path.join(__dirname, '../../uploads');

const deleteLocalUploadIfExists = (filename: string | null | undefined): void => {
  if (!filename) return;
  const filePath = path.join(uploadsDir, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

export const registerWorker = async (req: Request, res: Response): Promise<void> => {
  try {
    const name = sanitizeText(req.body.name);
    const lastname = sanitizeText(req.body.lastname);
    const email = sanitizeText(req.body.email).toLowerCase();
    const phone_number = sanitizeText(req.body.phone_number);
    const password = String(req.body.password ?? '');
    const username = sanitizeText(req.body.username);

    if (!name || !lastname || !email || !phone_number || !password) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    if (!isValidName(name) || !isValidName(lastname)) {
      res.status(400).json({ error: 'Invalid name or lastname format' });
      return;
    }

    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    if (!isValidPhone(phone_number)) {
      res.status(400).json({ error: 'Invalid phone number format' });
      return;
    }

    if (!isValidUsername(username)) {
      res.status(400).json({ error: 'Invalid username format' });
      return;
    }

    if (!isValidPassword(password)) {
      res.status(400).json({
        error: 'Password must be 8-72 chars and include uppercase, lowercase, and number'
      });
      return;
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [existingUsers] = await connection.execute<RowDataPacket[]>(
        'SELECT id_user FROM users WHERE email = ?',
        [email]
      );

      if (existingUsers.length > 0) {
        await connection.rollback();
        res.status(400).json({ error: 'Email already registered' });
        return;
      }

      const password_hash = await bcrypt.hash(password, 12);

      const [insertUserResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO users (name, lastname, email, phone_number, password_hash, rol, username, created_at)
         VALUES (?, ?, ?, ?, ?, 'worker', ?, NOW())`,
        [name, lastname, email, phone_number, password_hash, username || null]
      );

      const userId = insertUserResult.insertId;

      const [insertWorkerResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO worker_profiles (id_user, is_verified)
         VALUES (?, 0)`,
        [userId]
      );

      const workerProfileId = insertWorkerResult.insertId;

      await connection.commit();

      const token = jwt.sign(
        { user_id: userId, rol: 'worker' },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.status(201).json({
        success: true,
        message: 'Worker account created successfully',
        user: {
          id_user: userId,
          name,
          lastname,
          email,
          rol: 'worker',
          username: username || null,
          worker_profile: {
            id_worker_profile: workerProfileId,
            dui_document: null,
            is_verified: false
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
    console.error('Error in registerWorker:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const registerUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const name = sanitizeText(req.body.name);
    const lastname = sanitizeText(req.body.lastname);
    const email = sanitizeText(req.body.email).toLowerCase();
    const phone_number = sanitizeText(req.body.phone_number);
    const password = String(req.body.password ?? '');
    const username = sanitizeText(req.body.username);

    if (!name || !lastname || !email || !password) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    if (!isValidName(name) || !isValidName(lastname)) {
      res.status(400).json({ error: 'Invalid name or lastname format' });
      return;
    }

    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    if (!isValidPhone(phone_number)) {
      res.status(400).json({ error: 'Invalid phone number format' });
      return;
    }

    if (!isValidUsername(username)) {
      res.status(400).json({ error: 'Invalid username format' });
      return;
    }

    if (!isValidPassword(password)) {
      res.status(400).json({
        error: 'Password must be 8-72 chars and include uppercase, lowercase, and number'
      });
      return;
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [existingUsers] = await connection.execute<RowDataPacket[]>(
        'SELECT id_user FROM users WHERE email = ?',
        [email]
      );

      if (existingUsers.length > 0) {
        await connection.rollback();
        res.status(400).json({ error: 'Email already registered' });
        return;
      }

      const password_hash = await bcrypt.hash(password, 12);

      const [insertUserResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO users 
         (name, lastname, email, phone_number, password_hash, rol, username, created_at)
         VALUES (?, ?, ?, ?, ?, 'client', ?, NOW())`,
        [name, lastname, email, phone_number || null, password_hash, username || null]
      );

      const userId = insertUserResult.insertId;

      await connection.commit();

      const token = jwt.sign(
        { user_id: userId, rol: 'client' },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.status(201).json({
        success: true,
        message: 'User account created successfully',
        user: {
          id_user: userId,
          name,
          lastname,
          email,
          phone_number: phone_number || null,
          rol: 'client',
          username: username || null
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
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const email = sanitizeText(req.body.email).toLowerCase();
    const password = String(req.body.password ?? '');

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password required' });
      return;
    }

    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT id_user, name, lastname, email, phone_number, password_hash, rol, username, profile_image
       FROM users WHERE email = ?`,
      [email]
    );

    if (users.length === 0) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = users[0];

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    await pool.execute(
      'UPDATE users SET last_login = NOW() WHERE id_user = ?',
      [user.id_user]
    );

    const userData: any = {
      id_user: user.id_user,
      name: user.name,
      lastname: user.lastname,
      email: user.email,
      phone_number: user.phone_number,
      rol: user.rol,
      username: user.username,
      profile_image: user.profile_image
    };

    if (user.rol === 'worker') {
      const [workerProfiles] = await pool.execute<RowDataPacket[]>(
        `SELECT id_worker_profile, bio, banner_image, dui_document, is_verified
         FROM worker_profiles WHERE id_user = ?`,
        [user.id_user]
      );

      if (workerProfiles.length > 0) {
        const worker = workerProfiles[0];
        userData.worker_profile = {
          id_worker_profile: worker.id_worker_profile,
          bio: worker.bio,
          banner_image: worker.banner_image,
          dui_document: worker.dui_document, 
          is_verified: Boolean(worker.is_verified)
        };
      }
    }

    const token = jwt.sign(
      { user_id: user.id_user, rol: user.rol },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      user: userData,
      token
    });
  } catch (error: any) {
    console.error('Error in login:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const email = sanitizeText(req.body.email).toLowerCase();

    if (!email || !isValidEmail(email)) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    const [users] = await pool.execute<RowDataPacket[]>(
      'SELECT id_user FROM users WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      res.json({ success: true });
      return;
    }

    const token = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await pool.execute(
      `UPDATE users 
       SET verification_token = ?, token_expires_at = ?
       WHERE email = ?`,
      [token, expires, email]
    );

    await sendResetEmail(email, token);

    res.json({ success: true });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const email = sanitizeText(req.body.email).toLowerCase();
    const token = sanitizeText(req.body.token);
    const newPassword = String(req.body.newPassword ?? '');

    if (!email || !token || !newPassword) {
      res.status(400).json({ error: 'Missing fields' });
      return;
    }

    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    if (!isValidResetCode(token)) {
      res.status(400).json({ error: 'Invalid verification code format' });
      return;
    }

    if (!isValidPassword(newPassword)) {
      res.status(400).json({
        error: 'Password must be 8-72 chars and include uppercase, lowercase, and number'
      });
      return;
    }

    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT id_user, token_expires_at
       FROM users
       WHERE email = ? AND verification_token = ?`,
      [email, token]
    );

    if (users.length === 0) {
      res.status(400).json({ error: 'Invalid token' });
      return;
    }

    const expiresAt = new Date(users[0].token_expires_at);
    if (expiresAt < new Date()) {
      res.status(400).json({ error: 'Token expired' });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await pool.execute(
      `UPDATE users
       SET password_hash = ?, verification_token = NULL, token_expires_at = NULL
       WHERE email = ?`,
      [passwordHash, email]
    );

    res.json({ success: true, message: 'Password updated' });
  } catch (error) {
    console.error('resetPassword error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const verifyResetToken = async (req: Request, res: Response) => {
  try {

    const email = sanitizeText(req.body.email).toLowerCase();
    const token = sanitizeText(req.body.token);

    if (!email || !token) {
      return res.status(400).json({ message: "Missing fields" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    if (!isValidResetCode(token)) {
      return res.status(400).json({ message: "Invalid code format" });
    }

    const [rows]: any = await pool.query(
      `SELECT verification_token, token_expires_at
       FROM users
       WHERE email = ?`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(400).json({ message: "Invalid email" });
    }

    const user = rows[0];

    if (String(user.verification_token) !== String(token)) {
      return res.status(400).json({ message: "Invalid code" });
    }

    if (new Date(user.token_expires_at) < new Date()) {
      return res.status(400).json({ message: "Code expired" });
    }

    res.json({ message: "Token valid" });

  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

export const uploadProfileImage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'Profile image is required' });
      return;
    }

    const imageFilename = req.file.filename;

    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT profile_image FROM users WHERE id_user = ?',
      [userId]
    );

    if (existing.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await pool.execute(
      `UPDATE users
       SET profile_image = ?
       WHERE id_user = ?`,
      [imageFilename, userId]
    );

    deleteLocalUploadIfExists(existing[0].profile_image);

    res.json({
      success: true,
      profile_image: imageFilename
    });
  } catch (error) {
    console.error('uploadProfileImage error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const removeProfileImage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT profile_image FROM users WHERE id_user = ?',
      [userId]
    );

    if (existing.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await pool.execute(
      `UPDATE users
       SET profile_image = NULL
       WHERE id_user = ?`,
      [userId]
    );

    deleteLocalUploadIfExists(existing[0].profile_image);

    res.json({
      success: true,
      profile_image: null
    });
  } catch (error) {
    console.error('removeProfileImage error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const name = sanitizeText(req.body.name);
    const lastname = sanitizeText(req.body.lastname);
    const phone_number = sanitizeText(req.body.phone_number);
    const username = sanitizeText(req.body.username);

    if (!name || !lastname) {
      res.status(400).json({ error: 'Name and lastname are required' });
      return;
    }

    if (!isValidName(name) || !isValidName(lastname)) {
      res.status(400).json({ error: 'Invalid name or lastname format' });
      return;
    }

    if (!isValidPhone(phone_number)) {
      res.status(400).json({ error: 'Invalid phone number format' });
      return;
    }

    if (!isValidUsername(username)) {
      res.status(400).json({ error: 'Invalid username format' });
      return;
    }

    if (username) {
      const [duplicateUsernames] = await pool.execute<RowDataPacket[]>(
        'SELECT id_user FROM users WHERE username = ? AND id_user <> ? LIMIT 1',
        [username, userId]
      );

      if (duplicateUsernames.length > 0) {
        res.status(409).json({ error: 'Username already in use' });
        return;
      }
    }

    await pool.execute(
      `UPDATE users
       SET name = ?, lastname = ?, phone_number = ?, username = ?
       WHERE id_user = ?`,
      [name, lastname, phone_number || null, username || null, userId]
    );

    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT id_user, name, lastname, email, phone_number, rol, username, profile_image
       FROM users
       WHERE id_user = ?`,
      [userId]
    );

    if (users.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      success: true,
      user: users[0]
    });
  } catch (error) {
    console.error('updateProfile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
