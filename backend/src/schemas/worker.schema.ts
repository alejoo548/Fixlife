import { z } from 'zod';
import { nameLikeText, strictText, messageText } from '../utils/sanitize';

const phoneRegex = /^\d{4}-\d{4}$/;
const otpRegex = /^\d{6}$/;
const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+com$/i;
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/;
const nameRegex = /^[\p{L}]+(?:[\p{L}\s]*[\p{L}])?$/u;

const formatEightDigitPhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits;
};

export const WorkerSchema = {
  settings: z.object({
    name: z
      .string()
      .trim()
      .min(2, 'Invalid name format.')
      .max(16, 'Invalid name format.')
      .regex(nameRegex, 'Invalid name format.')
      .nullable()
      .optional(),
    lastname: z
      .string()
      .trim()
      .min(2, 'Invalid lastname format.')
      .max(16, 'Invalid lastname format.')
      .regex(nameRegex, 'Invalid lastname format.')
      .nullable()
      .optional(),
    phone_number: z
      .string()
      .trim()
      .transform(formatEightDigitPhone)
      .refine((value) => phoneRegex.test(value), 'Invalid phone format.')
      .nullable()
      .optional(),
    bio: nameLikeText(500).nullable().optional(),
  }),

  changePassword: z.object({
    current_password: z
      .string()
      .min(1, 'Missing password fields.'),
    new_password: z
      .string()
      .min(8, 'Invalid new password length.')
      .max(128, 'Invalid new password length.'),
    confirm_password: z
      .string()
      .min(1, 'Missing password fields.'),
  }).refine((data) => data.new_password === data.confirm_password, {
    message: 'Passwords do not match.',
    path: ['confirm_password'],
  }),

  emailChangeRequest: z.object({
    new_email: z
      .string()
      .trim()
      .toLowerCase()
      .max(100, 'Invalid new email format.')
      .regex(emailRegex, 'Invalid new email format.'),
  }),

  tokenOnly: z.object({
    token: z
      .string()
      .trim()
      .regex(otpRegex, 'Invalid token format.'),
  }),

  availability: z.object({
    slots: z
      .array(
        z.object({
          day_of_week: z.number().int().min(0).max(6),
          start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Invalid start time.'),
          end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Invalid end time.'),
          is_active: z.boolean().optional(),
        })
      )
      .max(42, 'Too many availability slots.'),
  }),
};
