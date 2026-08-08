import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import i18n from '../i18n';

const CLIENT_KEY = 'fixlife-language-client';
const WORKER_KEY = 'fixlife-language-worker';

// Paths that belong to the worker/pro area — everything else is the client area.
const WORKER_PATH_PREFIXES = ['/pro-dashboard', '/pro', '/worker'];

export type LanguageScope = 'client' | 'worker';

export const getLanguageScope = (pathname: string): LanguageScope =>
  WORKER_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ? 'worker' : 'client';

const storageKeyForScope = (scope: LanguageScope) => (scope === 'worker' ? WORKER_KEY : CLIENT_KEY);

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
};
