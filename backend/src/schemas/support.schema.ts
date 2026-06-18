import { z } from 'zod';
import { sanitizeNameLike, sanitizeMessage } from '../utils/sanitize';

const safeThreadTitle = z.string().transform((v) => sanitizeNameLike(v, 120));
const safeMessage = z.string().transform((v) => sanitizeMessage(v, 2000));

export const SupportSchemas = {
  createThread: z.object({
    subject: safeThreadTitle,
    priority: z.enum(['low', 'normal', 'high']).optional().default('normal'),
    initialMessage: safeMessage.optional(),
  }),

  sendMessage: z.object({
    message: safeMessage.optional(),
  }),

  updateThreadStatus: z.object({
    status: z.enum(['open', 'waiting_for_user', 'resolved', 'closed']),
  }),

  assignThread: z.object({
    adminUserId: z.number().int().positive(),
  }),
};
