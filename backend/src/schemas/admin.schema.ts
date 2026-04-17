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
    id_service: z
      .coerce
      .number()
      .int()
      .positive('id_service must be a positive integer.'),
    image_url: z
      .string()
      .trim()
      .max(500, 'Image URL too long.')
      .optional()
      .nullable()
      .or(z.literal('')),
    badge: z
      .string()
      .trim()
      .max(40, 'Badge too long.')
      .optional()
      .nullable()
      .or(z.literal('')),
    headline: z
      .string()
      .trim()
      .max(150, 'Headline too long.')
      .optional()
      .nullable()
      .or(z.literal('')),
    summary: z
      .string()
      .trim()
      .max(500, 'Summary too long.')
      .optional()
      .nullable()
      .or(z.literal('')),
    cta_label: z
      .string()
      .trim()
      .max(60, 'CTA label too long.')
      .optional()
      .nullable()
      .or(z.literal('')),
    sort_order: z
      .coerce
      .number()
      .int()
      .min(1, 'sort_order must be >= 1.')
      .max(5000, 'sort_order too large.')
      .optional(),
    is_active: z.boolean().optional(),
  }),

  updateServiceCard: z.object({
    id_service: z
      .coerce
      .number()
      .int()
      .positive('id_service must be a positive integer.')
      .optional(),
    image_url: z
      .string()
      .trim()
      .max(500, 'Image URL too long.')
      .optional()
      .nullable()
      .or(z.literal('')),
    badge: z
      .string()
      .trim()
      .max(40, 'Badge too long.')
      .optional()
      .nullable()
      .or(z.literal('')),
    headline: z
      .string()
      .trim()
      .max(150, 'Headline too long.')
      .optional()
      .nullable()
      .or(z.literal('')),
    summary: z
      .string()
      .trim()
      .max(500, 'Summary too long.')
      .optional()
      .nullable()
      .or(z.literal('')),
    cta_label: z
      .string()
      .trim()
      .max(60, 'CTA label too long.')
      .optional()
      .nullable()
      .or(z.literal('')),
    sort_order: z
      .coerce
      .number()
      .int()
      .min(1, 'sort_order must be >= 1.')
      .max(5000, 'sort_order too large.')
      .optional(),
    is_active: z.boolean().optional(),
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
