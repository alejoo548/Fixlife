import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../config/db';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { sendResetEmail } from '../config/mail';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_for_development';

export const registerWorker = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, lastname, email, phone_number, password, username } = req.body;

    if (!name || !lastname || !email || !phone_number || !password) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    if (!email.includes('@')) {
      res.status(400).json({ error: 'Invalid email' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
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
    const { name, lastname, email, phone_number, password, username } = req.body;

    if (!name || !lastname || !email || !password) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    if (!email.includes('@')) {
      res.status(400).json({ error: 'Invalid email' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
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
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password required' });
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
    const { email } = req.body;

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
    const { email, token, newPassword } = req.body;

    if (!email || !token || !newPassword) {
      res.status(400).json({ error: 'Missing fields' });
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

    const { email, token } = req.body;

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