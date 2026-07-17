import { Request, Response, NextFunction } from 'express';
import { scanProfanity } from '../utils/profanityFilter';

/**
 * Field names that must never be scanned: passwords/tokens/secrets are
 * sensitive, opaque, or can legitimately contain any character sequence.
 */
const EXCLUDED_FIELDS = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'oldpassword',
  'confirmpassword',
  'token',
  'resettoken',
  'otp',
  'code',
  'cvv',
  'card_number',
  'cardnumber',
  'expiry',
  'refreshtoken',
  'accesstoken',
  'idtoken',
  'credential',
  'signature',
  'hash',
]);

const MAX_DEPTH = 6;

const findProfaneField = (value: unknown, keyPath: string, depth: number): string | null => {
  if (depth > MAX_DEPTH || value == null) return null;

  if (typeof value === 'string') {
    if (EXCLUDED_FIELDS.has(keyPath.toLowerCase())) return null;
    if (!value.trim()) return null;
    return scanProfanity(value).hasProfanity ? keyPath : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findProfaneField(item, keyPath, depth + 1);
      if (hit) return hit;
    }
    return null;
  }

  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const hit = findProfaneField(nested, key, depth + 1);
      if (hit) return hit;
    }
    return null;
  }

  return null;
};

/**
 * Global request body guard: rejects any request whose text fields contain
 * profanity, so a client that bypasses the frontend filter (devtools, curl,
 * a modified app) still can't get offensive content saved server-side.
 */
export const profanityGuard = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.body || typeof req.body !== 'object') {
    next();
    return;
  }

  const hitField = findProfaneField(req.body, '', 0);
  if (hitField) {
    res.status(400).json({
      success: false,
      message: 'Your submission contains language that is not allowed. Please rephrase and try again.',
    });
    return;
  }

  next();
};
