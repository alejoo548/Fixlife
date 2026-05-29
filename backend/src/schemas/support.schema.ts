import { z } from 'zod';

export const SupportSchemas = {
  createThread: z.object({
    subject: z.string().min(3, 'El asunto debe tener al menos 3 caracteres').max(120),
    priority: z.enum(['low', 'normal', 'high']).optional().default('normal'),
    initialMessage: z.string().min(1).max(2000).optional(),
  }),

  sendMessage: z.object({
    message: z.string().max(2000, 'El mensaje es demasiado largo').optional(),
  }),

  updateThreadStatus: z.object({
    status: z.enum(['open', 'waiting_for_user', 'resolved', 'closed']),
  }),

  assignThread: z.object({
    adminUserId: z.number().int().positive(),
  }),
};
