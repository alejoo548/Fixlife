import { z } from 'zod';

const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+com$/i;
const phoneRegex = /^\d{4}-\d{4}$/;
const otpRegex = /^\d{6}$/;
const nameRegex = /^[\p{L}]+(?:[\p{L}\s]*[\p{L}])?$/u;
const usernameRegex = /^[a-zA-Z0-9._-]{3,30}$/;
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/;

const formatEightDigitPhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits;
};

const phoneText = z
  .string()
  .trim()
  .transform(formatEightDigitPhone)
  .refine((value) => phoneRegex.test(value), 'Phone must contain exactly 8 digits.');

export const AuthSchema = {
  login: z.object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(100, 'Invalid email format.')
      .regex(emailRegex, 'Invalid email format.'),
    password: z
      .string()
      .min(8, 'Invalid password length.')
      .max(128, 'Invalid password length.'),
  }),

  registerWorker: z.object({
    name: z
      .string()
      .trim()
      .min(2, 'Invalid name format.')
      .max(16, 'Invalid name format.')
      .regex(nameRegex, 'Invalid name format.'),
    lastname: z
      .string()
      .trim()
      .min(2, 'Invalid lastname format.')
      .max(16, 'Invalid lastname format.')
      .regex(nameRegex, 'Invalid lastname format.'),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(100, 'Invalid email format.')
      .regex(emailRegex, 'Invalid email format.'),
    phone_number: phoneText,
    password: z
      .string()
      .regex(passwordRegex, 'Password must be 8-128 chars and include at least 1 letter and 1 number.'),
    username: z
      .string()
      .trim()
      .regex(usernameRegex, 'Invalid username format.')
      .optional()
      .or(z.literal('')),
    service_ids: z
      .array(z.number().int().positive())
      .min(1, 'Select at least one service you offer.')
      .max(3, 'You can select up to 3 services.'),
  }),

  registerUser: z.object({
    name: z
      .string()
      .trim()
      .min(2, 'Invalid name format.')
      .max(16, 'Invalid name format.')
      .regex(nameRegex, 'Invalid name format.'),
    lastname: z
      .string()
      .trim()
      .min(2, 'Invalid lastname format.')
      .max(16, 'Invalid lastname format.')
      .regex(nameRegex, 'Invalid lastname format.'),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(100, 'Invalid email format.')
      .regex(emailRegex, 'Invalid email format.'),
    phone_number: phoneText,
    password: z
      .string()
      .regex(passwordRegex, 'Password must be 8-128 chars and include at least 1 letter and 1 number.'),
    username: z
      .string()
      .trim()
      .regex(usernameRegex, 'Invalid username format.')
      .optional()
      .or(z.literal('')),
    captchaToken: z
      .string()
      .trim()
      .min(10, 'Captcha token is required.')
      .optional(),
  }),

  googleLogin: z.object({
    credential: z
      .string()
      .trim()
      .min(10, 'Invalid Google credential.'),
  }),

  verifyEmail: z.object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(100, 'Invalid email format.')
      .regex(emailRegex, 'Invalid email format.'),
    otp: z
      .string()
      .trim()
      .regex(otpRegex, 'Invalid OTP format.'),
  }),

  emailOnly: z.object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(100, 'Invalid email format.')
      .regex(emailRegex, 'Invalid email format.'),
  }),

  resetPassword: z.object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(100, 'Invalid email format.')
      .regex(emailRegex, 'Invalid email format.'),
    token: z
      .string()
      .trim()
      .regex(otpRegex, 'Invalid token format.'),
    newPassword: z
      .string()
      .regex(passwordRegex, 'Password must be 8-128 chars and include at least 1 letter and 1 number.'),
  }),

  verifyResetToken: z.object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(100, 'Invalid email format.')
      .regex(emailRegex, 'Invalid email format.'),
    token: z
      .string()
      .trim()
      .regex(otpRegex, 'Invalid token format.'),
  }),
};
