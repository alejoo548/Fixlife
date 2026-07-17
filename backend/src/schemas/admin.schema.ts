import { z } from 'zod';
import { nameLikeText, strictText, messageText } from '../utils/sanitize';

const safeTextRegex = /^[\p{L}\p{N}\s.,\-_'":;!?()]{0,500}$/u;

export const AdminSchema = {
  emptyBody: z.object({}).strict(),

  userRole: z.object({
    rol: z.enum(['client', 'admin']),
    reason: messageText(500).refine(v => v.length >= 8, 'Reason must contain at least 8 characters.'),
  }).strict(),

  userStatus: z.object({
    is_active: z.union([z.boolean(), z.literal(0), z.literal(1), z.literal('0'), z.literal('1')]),
    reason: messageText(500).refine(v => v.length >= 8, 'Reason must contain at least 8 characters.'),
  }).strict(),

  requestAction: z.object({
    action: z.enum(['cancel', 'reassign', 'escalate', 'resolve']),
    reason: messageText(500).refine(v => v.length >= 8, 'Reason must contain at least 8 characters.'),
  }).strict(),

  workerDecision: z.object({
    reason: messageText(500).refine(v => v.length >= 8, 'Reason must contain at least 8 characters.'),
  }).strict(),

  payoutAction: z.object({
    reason: messageText(500).refine(v => v.length >= 8, 'Reason must contain at least 8 characters.'),
  }).strict(),

  workerRewardsSettings: z.object({
    trial_min_completed_jobs: z.coerce.number().int().min(1).max(100),
    commission_rate_percent: z.coerce.number().min(0).max(100),
    royalty_rate_percent: z.coerce.number().min(0).max(100),
    royalty_min_jobs: z.coerce.number().int().min(1).max(500),
    royalty_min_completion_rate: z.coerce.number().min(0).max(100),
  }).strict(),

  createService: z.object({
    name: nameLikeText(100).refine(v => v.length >= 1, 'Service name is required.'),
    description: messageText(500).optional().or(z.literal('')),
    icon: strictText(100).optional().or(z.literal('')),
  }),

  updateService: z.object({
    name: nameLikeText(100).optional(),
    description: messageText(500).optional().or(z.literal('')),
    icon: strictText(100).optional().or(z.literal('')),
    is_active: z
      .union([z.boolean(), z.literal(0), z.literal(1), z.literal('0'), z.literal('1')])
      .optional(),
  }),

  createServiceCard: z.object({
    id_service: z
      .coerce
      .number()
      .int()
      .positive('id_service must be a positive integer.'),
    image_url: strictText(500).optional().nullable().or(z.literal('')),
    badge: nameLikeText(40).optional().nullable().or(z.literal('')),
    headline: nameLikeText(150).optional().nullable().or(z.literal('')),
    summary: messageText(500).optional().nullable().or(z.literal('')),
    cta_label: nameLikeText(60).optional().nullable().or(z.literal('')),
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
    image_url: strictText(500).optional().nullable().or(z.literal('')),
    badge: nameLikeText(40).optional().nullable().or(z.literal('')),
    headline: nameLikeText(150).optional().nullable().or(z.literal('')),
    summary: messageText(500).optional().nullable().or(z.literal('')),
    cta_label: nameLikeText(60).optional().nullable().or(z.literal('')),
    sort_order: z
      .coerce
      .number()
      .int()
      .min(1, 'sort_order must be >= 1.')
      .max(5000, 'sort_order too large.')
      .optional(),
    is_active: z.boolean().optional(),
  }),

  createFaqItem: z.object({
    question: messageText(180).refine(v => v.length >= 6, 'Question must contain at least 6 characters.'),
    answer: messageText(1200).refine(v => v.length >= 12, 'Answer must contain at least 12 characters.'),
    icon: strictText(500).optional().nullable().or(z.literal('')),
    audience: z.enum(['clients', 'professionals', 'all']).optional().default('all'),
    sort_order: z.coerce.number().int().min(1).max(5000).optional(),
    is_active: z.boolean().optional(),
  }).strict(),

  updateFaqItem: z.object({
    question: messageText(180).optional(),
    answer: messageText(1200).optional(),
    icon: strictText(500).optional().nullable().or(z.literal('')),
    audience: z.enum(['clients', 'professionals', 'all']).optional(),
    sort_order: z.coerce.number().int().min(1).max(5000).optional(),
    is_active: z.boolean().optional(),
  }).strict(),

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
  }),

  workerTierBenefits: z.object({
    benefits: z.array(
      z.object({
        tier: z.enum(['standard', 'verified', 'trusted', 'premium', 'elite']),
        priority_weight: z.coerce.number().int().min(1).max(20),
        featured_profile_boost: z.coerce.number().min(1).max(10),
        max_active_leads: z.coerce.number().int().min(1).max(500),
        support_level: nameLikeText(30).refine(v => v.length >= 1, 'Support level is required.'),
        badge_label: nameLikeText(60).refine(v => v.length >= 1, 'Badge label is required.'),
        monthly_fee: z.coerce.number().min(0).max(9999),
        min_completed_jobs: z.coerce.number().int().min(0).max(100000),
        benefits_summary: messageText(255).optional().or(z.literal('')),
      })
    ).min(4, 'At least four worker tiers must be configured.').max(5),
  }).strict(),

  workerTierUpdate: z.object({
    membership_tier: z.enum(['standard', 'verified', 'trusted', 'premium', 'elite']),
    reason: messageText(255).refine(v => v.length >= 8, 'Reason must contain at least 8 characters.'),
  }).strict(),

  financeCaseCreate: z.object({
    case_type: z.enum(['refund', 'dispute', 'adjustment']),
    direction: z.enum(['customer_refund', 'platform_credit', 'platform_debit', 'worker_hold', 'worker_release']),
    id_request: z.coerce.number().int().positive().optional(),
    id_payment: z.coerce.number().int().positive().optional(),
    amount: z.coerce.number().positive().max(100000),
    currency_code: nameLikeText(8).optional().or(z.literal('')),
    reason: messageText(255).refine(v => v.length >= 1, 'Reason is required.'),
    notes: messageText(2000).optional().or(z.literal('')),
  }),

  financeCaseResolve: z.object({
    resolution_notes: messageText(1500).refine(v => v.length >= 8, 'Resolution notes must contain at least 8 characters.'),
    apply_ledger: z.boolean().optional(),
  }).strict(),

  heroSlides: z.object({
    slides: z
      .array(
        z.object({
          id: z.number().int().positive().optional(),
          image: strictText(500).refine(v => v.length >= 1, 'Image is required.'),
          tag: nameLikeText(50).refine(v => v.length >= 1, 'Tag is required.'),
          title: nameLikeText(120).refine(v => v.length >= 1, 'Title is required.'),
          description: messageText(255).refine(v => v.length >= 1, 'Description is required.'),
          cta: nameLikeText(80).refine(v => v.length >= 1, 'CTA is required.'),
        }).strict()
      )
      .min(1, 'At least one slide is required.')
      .max(10, 'Maximum 10 slides allowed.'),
  }).strict(),
};
