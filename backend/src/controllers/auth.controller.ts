import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../config/db';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { sendVerificationEmail } from '../utils/email';
import { sendResetEmail } from '../config/mail';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_for_development';

export const registerWorker = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, lastname, email, phone_number, password, username } = req.body;

    if (!name || !lastname || !email || !phone_number || !password) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const nameRegex = /^[a-zA-Z\s]+$/;
    const phoneRegex = /^\d{8}$/;
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

    if (!phoneRegex.test(trimmedPhoneNumber)) {
      res.status(400).json({ error: 'Phone number must be exactly 8 digits.' });
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
        'SELECT id_user, verification_token FROM users WHERE email = ?',
        [trimmedEmail]
      );

      if (existingUsers.length > 0) {
        const existingUser = existingUsers[0];

        // If the user never verified (token still exists), allow re-registration
        if (existingUser.verification_token !== null) {
          const password_hash = await bcrypt.hash(password, 12);
          const otp = Math.floor(100000 + Math.random() * 900000).toString();
          const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

          await connection.execute(
            `UPDATE users SET name = ?, lastname = ?, phone_number = ?, password_hash = ?, username = ?, verification_token = ?, token_expires_at = ? WHERE id_user = ?`,
            [trimmedName, trimmedLastname, trimmedPhoneNumber, password_hash, trimmedUsername || null, otp, expiresAt, existingUser.id_user]
          );

          const emailSent = await sendVerificationEmail(trimmedEmail, otp, trimmedName);
          if (!emailSent) {
            await connection.rollback();
            res.status(500).json({ error: 'Could not deliver the verification email. Please try again.' });
            return;
          }

          await connection.commit();
          res.status(201).json({ success: true, message: 'New OTP sent to email. Please verify.', email: trimmedEmail });
          return;
        }

        await connection.rollback();
        res.status(400).json({ error: 'Email already registered' });
        return;
      }

      if (trimmedUsername) {
        const [existingUsernames] = await connection.execute<RowDataPacket[]>(
          'SELECT id_user, email FROM users WHERE username = ? AND email != ?',
          [trimmedUsername, trimmedEmail]
        );

        if (existingUsernames.length > 0) {
          await connection.rollback();
          res.status(400).json({ error: 'Username is already taken' });
          return;
        }
      }

      const password_hash = await bcrypt.hash(password, 12);

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

      const [insertUserResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO users (name, lastname, email, phone_number, password_hash, rol, username, created_at, verification_token, token_expires_at)
         VALUES (?, ?, ?, ?, ?, 'worker', ?, NOW(), ?, ?)`,
        [trimmedName, trimmedLastname, trimmedEmail, trimmedPhoneNumber, password_hash, trimmedUsername || null, otp, expiresAt]
      );

      const userId = insertUserResult.insertId;

      await connection.execute<ResultSetHeader>(
        `INSERT INTO worker_profiles (id_user, is_verified)
         VALUES (?, 0)`,
        [userId]
      );

      // Send OTP Email before committing
      const emailSent = await sendVerificationEmail(trimmedEmail, otp, trimmedName);
      
      if (!emailSent) {
        await connection.rollback();
        res.status(500).json({ error: 'Could not deliver the verification email. Please try again or use another email.' });
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
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const resendOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT id_user, name, verification_token FROM users WHERE email = ? AND rol = 'worker'`,
      [email]
    );

    if (users.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = users[0];

    if (user.verification_token === null) {
      res.status(400).json({ error: 'This account is already verified' });
      return;
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await pool.execute(
      `UPDATE users SET verification_token = ?, token_expires_at = ? WHERE id_user = ?`,
      [otp, expiresAt, user.id_user]
    );

    const emailSent = await sendVerificationEmail(email, otp, user.name);

    if (!emailSent) {
      res.status(500).json({ error: 'Could not send verification email. Please try again.' });
      return;
    }

    res.json({ success: true, message: 'New verification code sent to your email.' });
  } catch (error: any) {
    console.error('Error in resendOtp:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const verifyWorkerEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      res.status(400).json({ error: 'Email and OTP are required' });
      return;
    }

    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT id_user, name, lastname, email, phone_number, rol, username, profile_image, verification_token, token_expires_at 
       FROM users WHERE email = ? AND rol = 'worker'`,
      [email]
    );

    if (users.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = users[0];

    if (user.verification_token !== otp) {
      res.status(400).json({ error: 'Invalid verification token' });
      return;
    }

    if (new Date(user.token_expires_at) < new Date()) {
      res.status(400).json({ error: 'Verification token has expired' });
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

      const token = jwt.sign(
        { user_id: user.id_user, rol: 'worker' },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

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
          profile_image: user.profile_image,
          worker_profile: {
            id_worker_profile: worker.id_worker_profile,
            bio: worker.bio,
            banner_image: worker.banner_image,
            dui_document: worker.dui_document,
            cert_document: worker.cert_document,
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
          dui_document: worker.dui_document, 
          cert_document: worker.cert_document,
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
