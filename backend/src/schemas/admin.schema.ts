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

  commissionRules: z.object({
    global_rate_percent: z
      .coerce
      .number()
      .min(0, 'Default commission must be at least 0%.')
      .max(50, 'Default commission cannot exceed 50%.'),
    service_overrides: z
      .array(
        z.object({
          id_service: z.coerce.number().int().positive('id_service must be a positive integer.'),
          rate_percent: z
            .coerce
            .number()
            .min(0, 'Override rate must be at least 0%.')
            .max(50, 'Override rate cannot exceed 50%.'),
          is_active: z.boolean().optional(),
        })
      )
      .max(200, 'Too many commission overrides.')
      .optional()
      .default([]),
    urgency_adjustments: z
      .array(
        z.object({
          urgency_level: z.enum(['standard', 'urgent', 'emergency']),
          rate_percent: z
            .coerce
            .number()
            .min(0, 'Urgency adjustment must be at least 0%.')
            .max(50, 'Urgency adjustment cannot exceed 50%.'),
          is_active: z.boolean().optional(),
        })
      )
      .max(10, 'Too many urgency adjustments.')
      .optional()
      .default([]),
    worker_tier_adjustments: z
      .array(
        z.object({
          worker_tier: z.enum(['standard', 'verified', 'trusted', 'premium', 'elite']),
          rate_percent: z
            .coerce
            .number()
            .min(0, 'Tier adjustment must be at least 0%.')
            .max(50, 'Tier adjustment cannot exceed 50%.'),
          is_active: z.boolean().optional(),
        })
      )
      .max(10, 'Too many worker tier adjustments.')
      .optional()
      .default([]),
    promo_codes: z
      .array(
        z.object({
          promo_code: z.string().trim().min(1, 'Promo code is required.').max(40, 'Promo code too long.'),
          rate_percent: z
            .coerce
            .number()
            .min(0, 'Promo adjustment must be at least 0%.')
            .max(50, 'Promo adjustment cannot exceed 50%.'),
          is_active: z.boolean().optional(),
        })
      )
      .max(100, 'Too many promo codes.')
      .optional()
      .default([]),
  }),

  workerTierBenefits: z.object({
    benefits: z.array(
      z.object({
        tier: z.enum(['standard', 'verified', 'trusted', 'premium', 'elite']),
        priority_weight: z.coerce.number().int().min(1).max(20),
        featured_profile_boost: z.coerce.number().min(1).max(10),
        max_active_leads: z.coerce.number().int().min(1).max(500),
        support_level: z.string().trim().min(1).max(30),
        badge_label: z.string().trim().min(1).max(60),
        monthly_fee: z.coerce.number().min(0).max(9999),
        benefits_summary: z.string().trim().max(255).optional().or(z.literal('')),
      })
    ).length(4, 'All four worker tiers must be configured.'),
  }),

  workerTierUpdate: z.object({
    membership_tier: z.enum(['standard', 'verified', 'trusted', 'premium', 'elite']),
    reason: z.string().trim().max(255).optional().or(z.literal('')),
  }),

  financeCaseCreate: z.object({
    case_type: z.enum(['refund', 'dispute', 'adjustment']),
    direction: z.enum(['customer_refund', 'platform_credit', 'platform_debit', 'worker_hold', 'worker_release']),
    id_request: z.coerce.number().int().positive().optional(),
    id_payment: z.coerce.number().int().positive().optional(),
    amount: z.coerce.number().positive().max(100000),
    currency_code: z.string().trim().max(8).optional().or(z.literal('')),
    reason: z.string().trim().min(1).max(255),
    notes: z.string().trim().max(2000).optional().or(z.literal('')),
  }),

  financeCaseResolve: z.object({
    resolution_notes: z.string().trim().max(1500).optional().or(z.literal('')),
    apply_ledger: z.boolean().optional(),
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
