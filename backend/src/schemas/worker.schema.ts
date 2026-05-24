import { z } from 'zod';

const phoneRegex = /^\+?[0-9]{8,15}$/;
const otpRegex = /^\d{6}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/;
const safeTextRegex = /^[\p{L}\p{N}\s.,\-_'":;!?()]{0,500}$/u;

export const WorkerSchema = {
  settings: z.object({
    phone_number: z
      .string()
      .trim()
      .regex(phoneRegex, 'Invalid phone format.')
      .nullable()
      .optional(),
    bio: z
      .string()
      .trim()
      .max(500, 'Invalid bio format.')
      .regex(safeTextRegex, 'Invalid bio format.')
      .nullable()
      .optional(),
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
