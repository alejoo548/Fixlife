import rateLimit from 'express-rate-limit';

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Dashboard polling for chat and request history can exceed the default during normal use.
  max: 1200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again later.' },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts. Try again in 15 minutes.' },
  handler: (_req: any, res: any) => {
    res.status(429).json({ error: 'Too many auth attempts. Try again in 15 minutes.' });
  },
});

// Dedicated stricter limiter just for password-based login (brute force protection)
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  handler: (_req: any, res: any) => {
    res.status(429).json({ error: 'Too many login attempts. Try again in 15 minutes.' });
  },
});

// Keyed by the email being attempted, not the caller's IP — rotating IPs (VPN/proxy)
// does not reset this bucket, so it backs up the per-account DB lockout in
// auth.controller.ts and the IP-based loginLimiter above.
export const loginEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => String(req.body?.email || '').trim().toLowerCase() || 'unknown',
  message: { error: 'Too many login attempts for this account. Try again in 15 minutes.' },
  handler: (_req: any, res: any) => {
    res.status(429).json({ error: 'Too many login attempts for this account. Try again in 15 minutes.' });
  },
});

// Dedicated limiters for password reset flow (more sensitive than general auth)
export const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset requests. Try again in 15 minutes.' },
  handler: (_req: any, res: any) => {
    res.status(429).json({ error: 'Too many password reset requests. Try again in 15 minutes.' });
  },
});

export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many reset attempts. Try again in 15 minutes.' },
  handler: (_req: any, res: any) => {
    res.status(429).json({ error: 'Too many reset attempts. Try again in 15 minutes.' });
  },
});

export const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sensitive operations. Try again later.' },
});

export const aiChatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many chat requests. Please wait a moment and try again.' },
});

export const requestChatReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many chat refreshes. Wait a moment and try again.' },
});

export const requestChatSendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many chat messages. Wait a moment before sending more.' },
});
