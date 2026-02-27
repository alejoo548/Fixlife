import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../config/db';
import { ResultSetHeader, RowDataPacket } from 'mysql2';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_for_development';

export const registerWorker = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, lastname, email, phone_number, password, username } = req.body;

    if (!name || !lastname || !email || !phone_number || !password) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const nameRegex = /^[a-zA-Z\s]+$/;
    const phoneRegex = /^[+\d\-\s]+$/;
    const usernameRegex = /^[a-zA-Z0-9_]+$/;

    const trimmedName = name.trim();
    const trimmedLastname = lastname.trim();
    const trimmedEmail = email.trim();
    const trimmedPhoneNumber = phone_number.trim();
    const trimmedUsername = username ? username.trim() : undefined;

    if (!nameRegex.test(trimmedName) || trimmedName.length > 50) {
      res.status(400).json({ error: 'First name is invalid or too long (max 50 chars, letters only)' });
      return;
    }

    if (!nameRegex.test(trimmedLastname) || trimmedLastname.length > 50) {
      res.status(400).json({ error: 'Last name is invalid or too long (max 50 chars, letters only)' });
      return;
    }

    if (trimmedUsername && (!usernameRegex.test(trimmedUsername) || trimmedUsername.length > 30)) {
      res.status(400).json({ error: 'Username is invalid or too long (max 30 chars, alphanumeric and underscores only)' });
      return;
    }

    if (!phoneRegex.test(trimmedPhoneNumber) || trimmedPhoneNumber.length > 15) {
      res.status(400).json({ error: 'Phone number is invalid or too long (max 15 chars)' });
      return;
    }

    if (trimmedEmail.length > 100 || !trimmedEmail.includes('@')) {
      res.status(400).json({ error: 'Invalid email or too long (max 100 chars)' });
      return;
    }

    if (password.length < 8 || password.length > 128) {
      res.status(400).json({ error: 'Password must be between 8 and 128 characters' });
      return;
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
        res.status(400).json({ error: 'Email already registered' });
        return;
      }

      if (trimmedUsername) {
        const [existingUsernames] = await connection.execute<RowDataPacket[]>(
          'SELECT id_user FROM users WHERE username = ?',
          [trimmedUsername]
        );

        if (existingUsernames.length > 0) {
          await connection.rollback();
          res.status(400).json({ error: 'Username is already taken' });
          return;
        }
      }

      const password_hash = await bcrypt.hash(password, 12);

      const [insertUserResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO users (name, lastname, email, phone_number, password_hash, rol, username, created_at)
         VALUES (?, ?, ?, ?, ?, 'worker', ?, NOW())`,
        [trimmedName, trimmedLastname, trimmedEmail, trimmedPhoneNumber, password_hash, trimmedUsername || null]
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
          name: trimmedName,
          lastname: trimmedLastname,
          email: trimmedEmail,
          rol: 'worker',
          username: trimmedUsername || null,
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