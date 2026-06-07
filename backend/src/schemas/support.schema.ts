import { z } from 'zod';

const UNSAFE_SUPPORT_PATTERN = /[<>]|javascript:|on\w+\s*=|data:text\/html/i;
const CONTROL_CHARS_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const INVISIBLE_CHARS_PATTERN = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;

export const sanitizeSupportText = (value: unknown, maxLen: number, options?: { singleLine?: boolean }) => {
  const normalized = String(value ?? '')
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS_PATTERN, '')
    .replace(INVISIBLE_CHARS_PATTERN, '');

  const cleaned = (options?.singleLine ? normalized.replace(/\s+/g, ' ') : normalized).trim();
  return cleaned.slice(0, maxLen);
};

export const hasUnsafeSupportText = (value: unknown) => UNSAFE_SUPPORT_PATTERN.test(String(value ?? ''));

const safeSupportText = (maxLen: number, message: string, options?: { singleLine?: boolean; min?: number }) =>
  z
    .string()
    .max(maxLen, `Text cannot exceed ${maxLen} characters.`)
    .transform((value) => sanitizeSupportText(value, maxLen, options))
    .refine((value) => value.length >= (options?.min ?? 0), message)
    .refine((value) => !hasUnsafeSupportText(value), 'Content cannot include scripts or malicious HTML.');

export const SupportSchemas = {
  createThread: z.object({
    subject: safeSupportText(120, 'Subject must be at least 3 characters long.', { singleLine: true, min: 3 }),
    priority: z.enum(['low', 'normal', 'high']).optional().default('normal'),
    initialMessage: safeSupportText(2000, 'Message is required.', { min: 1 }).optional(),
  }),

  sendMessage: z.object({
    message: safeSupportText(2000, 'Message is required.').optional(),
  }),

  updateThreadStatus: z.object({
    status: z.enum(['open', 'waiting_for_user', 'resolved', 'closed']),
  }),

  assignThread: z.object({
    adminUserId: z.number().int().positive(),
  }),
};
