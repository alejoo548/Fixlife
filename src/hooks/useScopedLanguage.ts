import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import i18n from '../i18n';
import { AUTH_SESSION_CHANGED_EVENT, getAuthUser } from '../utils/session';

const CLIENT_KEY = 'fixlife-language-client';
const WORKER_KEY = 'fixlife-language-worker';
const ADMIN_KEY = 'fixlife-language-admin';

// Paths that belong to the worker/pro area — everything else is the client area.
const WORKER_PATH_PREFIXES = ['/pro-dashboard', '/pro', '/worker'];
const ADMIN_PATH_PREFIXES = ['/admin-dashboard'];

export type LanguageScope = 'client' | 'worker' | 'admin';

export const getLanguageScope = (pathname: string): LanguageScope => {
  if (ADMIN_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return 'admin';
  if (WORKER_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return 'worker';
  return 'client';
};

const baseKeyForScope = (scope: LanguageScope) =>
  scope === 'worker' ? WORKER_KEY : scope === 'admin' ? ADMIN_KEY : CLIENT_KEY;

// Scoped per logged-in account so switching accounts on the same device never
// inherits another account's language preference. Signed-out browsing still
// gets a stable "anon" bucket per area.
const storageKeyForScope = (scope: LanguageScope): string => {
  const accountId = getAuthUser(scope)?.id_user ?? 'anon';
  return `${baseKeyForScope(scope)}:${accountId}`;
};

export const getScopedLanguage = (scope: LanguageScope): string | null =>
  typeof window === 'undefined' ? null : window.localStorage.getItem(storageKeyForScope(scope));

export const setScopedLanguage = (scope: LanguageScope, code: string): void => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(storageKeyForScope(scope), code);
  }
  void i18n.changeLanguage(code);
};

/**
 * Keeps i18n's active language in sync with whichever section (client vs
 * worker) the user is currently viewing, so switching language in one area
 * never leaks into the other. Call once near the router root.
 */
export const useApplyScopedLanguage = (): void => {
  const location = useLocation();

  useEffect(() => {
    const scope = getLanguageScope(location.pathname);
    const stored = getScopedLanguage(scope);
    if (stored && stored !== i18n.resolvedLanguage) {
      void i18n.changeLanguage(stored);
    }
  }, [location.pathname]);

  // Re-apply whenever the auth session changes (login/logout/account switch)
  // so a newly active account loads its own saved language instead of
  // carrying over whatever the previous account left active.
  useEffect(() => {
    const handleAuthChange = () => {
      const scope = getLanguageScope(window.location.pathname);
      const stored = getScopedLanguage(scope);
      void i18n.changeLanguage(stored || i18n.resolvedLanguage);
    };
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, handleAuthChange);
    return () => window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, handleAuthChange);
  }, []);
};
