import { z } from 'zod';

const safeTextRegex = /^[\p{L}\p{N}\s.,\-_'":;!?()]{0,500}$/u;

export const AdminSchema = {
  createService: z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Service name is required.')
      .max(100, 'Service name too long.'),
    description: z
      .string()
      .trim()
      .max(500, 'Description too long.')
      .regex(safeTextRegex, 'Invalid description format.')
      .optional()
      .or(z.literal('')),
    icon: z
      .string()
      .trim()
      .max(100, 'Icon value too long.')
      .optional()
      .or(z.literal('')),
  }),

  updateService: z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Service name is required.')
      .max(100, 'Service name too long.')
      .optional(),
    description: z
      .string()
      .trim()
      .max(500, 'Description too long.')
      .regex(safeTextRegex, 'Invalid description format.')
      .optional()
      .or(z.literal('')),
    icon: z
      .string()
      .trim()
      .max(100, 'Icon value too long.')
      .optional()
      .or(z.literal('')),
  }),

  createServiceCard: z.object({
    service_id: z
      .coerce
      .number()
      .int()
      .positive('service_id must be a positive integer.'),
    title: z
      .string()
      .trim()
      .min(1, 'Title is required.')
      .max(150, 'Title too long.'),
    description: z
      .string()
      .trim()
      .max(500, 'Description too long.')
      .optional()
      .or(z.literal('')),
    image_url: z
      .string()
      .trim()
      .url('Invalid image URL.')
      .max(300, 'Image URL too long.')
      .optional()
      .or(z.literal('')),
  }),

  updateServiceCard: z.object({
    title: z
      .string()
      .trim()
      .min(1, 'Title is required.')
      .max(150, 'Title too long.')
      .optional(),
    description: z
      .string()
      .trim()
      .max(500, 'Description too long.')
      .optional()
      .or(z.literal('')),
    image_url: z
      .string()
      .trim()
      .url('Invalid image URL.')
      .max(300, 'Image URL too long.')
      .optional()
      .or(z.literal('')),
  }),

  heroSlides: z.object({
    slides: z
      .array(
        z.object({
          id: z.number().int().positive().optional(),
          title: z.string().trim().max(200, 'Title too long.').optional().or(z.literal('')),
          subtitle: z.string().trim().max(300, 'Subtitle too long.').optional().or(z.literal('')),
          image_url: z.string().trim().max(500, 'Image URL too long.').optional().or(z.literal('')),
          cta_text: z.string().trim().max(100, 'CTA text too long.').optional().or(z.literal('')),
          cta_link: z.string().trim().max(300, 'CTA link too long.').optional().or(z.literal('')),
          order: z.number().int().min(0).optional(),
        })
      )
      .max(20, 'Too many slides.'),
  }),
};
