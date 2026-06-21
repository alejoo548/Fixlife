// Frontend mirror of backend/src/utils/sanitize.ts -- strips the same injection-risk
// characters live as the user types, so the textbox itself never shows "<script>" etc.
// Backend re-sanitizes on submit regardless; this is just immediate user feedback.

const CONTROL_CHARS = new RegExp(
  '[\\u0000-\\u001F\\u007F\\u200B-\\u200D\\uFEFF]',
  'g'
);

/** Strict text: blocks <, >, backtick, backslash. Use for free-form short fields (codes, URLs, icons). */
export const sanitizeStrictText = (value: string, maxLen = 2000): string =>
  value.replace(CONTROL_CHARS, '').replace(/[<>`\\]/g, '').slice(0, maxLen);

/** Name-like: only letters, numbers, spaces, . , ' -. Use for names, titles, badges, labels. */
export const sanitizeNameLike = (value: string, maxLen = 120): string =>
  value.replace(/[^\p{L}\p{N}\s.,'-]/gu, '').slice(0, maxLen);

/** Message text: letters, numbers, whitespace, normal sentence punctuation. Use for descriptions/messages. */
export const sanitizeMessageText = (value: string, maxLen = 4000): string =>
  value.replace(/[^\p{L}\p{N}\s.,;:!?'"()/_\-@#&%\n]/gu, '').slice(0, maxLen);

/** Letters only: just letters and spaces, no numbers or punctuation. Use for place/location names. */
export const sanitizeLettersOnly = (value: string, maxLen = 80): string =>
  value.replace(/[^\p{L}\s]/gu, '').slice(0, maxLen);
