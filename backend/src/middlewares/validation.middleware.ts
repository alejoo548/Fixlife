import { NextFunction, Request, Response } from 'express';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^\d{8}$/;
const otpRegex = /^\d{6}$/;
const safeTextRegex = /^[\p{L}\p{N}\s.,\-_'":;!?()]{0,500}$/u;

const clean = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export const validateEmailAndPassword = (req: Request, res: Response, next: NextFunction) => {
  const email = clean(req.body?.email).toLowerCase();
  const password = clean(req.body?.password);

  if (!emailRegex.test(email) || email.length > 100) {
    res.status(400).json({ error: 'Invalid email format.' });
    return;
  }
  if (password.length < 8 || password.length > 128) {
    res.status(400).json({ error: 'Invalid password length.' });
    return;
  }

  req.body.email = email;
  req.body.password = password;
  next();
};

export const validateRegisterWorker = (req: Request, res: Response, next: NextFunction) => {
  const name = clean(req.body?.name);
  const lastname = clean(req.body?.lastname);
  const email = clean(req.body?.email).toLowerCase();
  const phone_number = clean(req.body?.phone_number);
  const password = clean(req.body?.password);
  const username = clean(req.body?.username);

  if (!name || !lastname || !email || !phone_number || !password) {
    res.status(400).json({ error: 'Missing required fields.' });
    return;
  }
  if (!emailRegex.test(email) || email.length > 100) {
    res.status(400).json({ error: 'Invalid email format.' });
    return;
  }
  if (!phoneRegex.test(phone_number)) {
    res.status(400).json({ error: 'Invalid phone format.' });
    return;
  }
  if (password.length < 8 || password.length > 128) {
    res.status(400).json({ error: 'Invalid password length.' });
    return;
  }

  req.body.name = name;
  req.body.lastname = lastname;
  req.body.email = email;
  req.body.phone_number = phone_number;
  req.body.password = password;
  req.body.username = username || undefined;
  next();
};

export const validateOtpPayload = (req: Request, res: Response, next: NextFunction) => {
  const email = clean(req.body?.email).toLowerCase();
  const otp = clean(req.body?.otp);

  if (!emailRegex.test(email) || email.length > 100) {
    res.status(400).json({ error: 'Invalid email format.' });
    return;
  }
  if (!otpRegex.test(otp)) {
    res.status(400).json({ error: 'Invalid OTP format.' });
    return;
  }

  req.body.email = email;
  req.body.otp = otp;
  next();
};

export const validateEmailOnly = (req: Request, res: Response, next: NextFunction) => {
  const email = clean(req.body?.email).toLowerCase();
  if (!emailRegex.test(email) || email.length > 100) {
    res.status(400).json({ error: 'Invalid email format.' });
    return;
  }
  req.body.email = email;
  next();
};

export const validateWorkerSettings = (req: Request, res: Response, next: NextFunction) => {
  const phone = req.body?.phone_number != null ? clean(req.body.phone_number) : null;
  const bio = req.body?.bio != null ? clean(req.body.bio) : null;

  if (phone !== null && !phoneRegex.test(phone)) {
    res.status(400).json({ error: 'Invalid phone format.' });
    return;
  }

  if (bio !== null) {
    if (bio.length > 500 || !safeTextRegex.test(bio)) {
      res.status(400).json({ error: 'Invalid bio format.' });
      return;
    }
  }

  req.body.phone_number = phone;
  req.body.bio = bio;
  next();
};

export const validateChangePassword = (req: Request, res: Response, next: NextFunction) => {
  const current_password = clean(req.body?.current_password);
  const new_password = clean(req.body?.new_password);
  const confirm_password = clean(req.body?.confirm_password);

  if (!current_password || !new_password || !confirm_password) {
    res.status(400).json({ error: 'Missing password fields.' });
    return;
  }
  if (new_password.length < 8 || new_password.length > 128) {
    res.status(400).json({ error: 'Invalid new password length.' });
    return;
  }
  if (new_password !== confirm_password) {
    res.status(400).json({ error: 'Passwords do not match.' });
    return;
  }

  req.body.current_password = current_password;
  req.body.new_password = new_password;
  req.body.confirm_password = confirm_password;
  next();
};

export const validateEmailChangeRequest = (req: Request, res: Response, next: NextFunction) => {
  const new_email = clean(req.body?.new_email).toLowerCase();
  if (!emailRegex.test(new_email) || new_email.length > 100) {
    res.status(400).json({ error: 'Invalid new email format.' });
    return;
  }
  req.body.new_email = new_email;
  next();
};

export const validateTokenOnly = (req: Request, res: Response, next: NextFunction) => {
  const token = clean(req.body?.token);
  if (!otpRegex.test(token)) {
    res.status(400).json({ error: 'Invalid token format.' });
    return;
  }
  req.body.token = token;
  next();
};
