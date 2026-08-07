import i18n from '../i18n';

/**
 * Translates a backend API error into the current UI language.
 * Backend responses carry a stable `code` (see backend/src/constants/authErrorCodes.ts)
 * plus an English `error` string kept for logs/back-compat. If the code has no
 * translation yet (endpoint not migrated) or is missing, falls back to the raw
 * `error` text, then to a generic translated message.
 */
export const translateApiError = (
  data: { error?: string; code?: string; retryAfter?: string } | null | undefined,
  fallbackKey = 'common.genericError'
): string => {
  const code = data?.code;
  if (code) {
    const key = `apiErrors.${code}`;
    const translated = i18n.t(key, { date: data?.retryAfter, defaultValue: '' });
    if (translated) return translated;
  }
  return data?.error || i18n.t(fallbackKey);
};
