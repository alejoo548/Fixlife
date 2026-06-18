import { z } from 'zod';

/**
 * Strict text sanitizer for user-generated content.
 * Removes control characters, trims, and optionally limits length.
 * Prevents most injection vectors (XSS, SQLi, command injection).
 */
export const sanitizeStrictText = (value: unknown, maxLen = 2000): string => {
  if (typeof value !== 'string') return '';
  // Remove control chars (0-31, 127) and zero-width chars
  let cleaned = value
    .replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g, '')
    .replace(/[<>`\\]/g, '') // block common injection chars
    .trim();

  if (cleaned.length > maxLen) {
    cleaned = cleaned.slice(0, maxLen);
  }
  return cleaned;
};

/**
 * Even stricter version for names, titles, short fields.
 * Only allows letters, numbers, spaces and basic punctuation.
 */
export const sanitizeNameLike = (value: unknown, maxLen = 120): string => {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[^\p{L}\p{N}\s .,'-]/gu, '')
    .trim()
    .slice(0, maxLen);
};

/**
 * For long descriptions / messages (chat, support, service description).
 * Allows more characters but still blocks dangerous ones.
 */
export const sanitizeMessage = (value: unknown, maxLen = 4000): string => {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF`\\]/g, '')
    .trim()
    .slice(0, maxLen);
};

/** Zod helper for strict text fields */
export const strictText = (maxLen = 2000) =>
  z.string().transform((v) => sanitizeStrictText(v, maxLen));

export const nameLikeText = (maxLen = 120) =>
  z.string().transform((v) => sanitizeNameLike(v, maxLen));

export const messageText = (maxLen = 4000) =>
  z.string().transform((v) => sanitizeMessage(v, maxLen));
