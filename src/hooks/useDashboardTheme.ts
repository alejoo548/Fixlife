import { useCallback, useEffect, useMemo, useState } from 'react';
import { AUTH_SESSION_CHANGED_EVENT, getAuthUser } from '../utils/session';

export type DashboardTheme = 'light' | 'dark';
export type DashboardThemeRole = 'admin' | 'worker';

const STORAGE_PREFIX = 'fixlife:dashboard-theme';

// Scoped per logged-in account (not just per role) so switching accounts on
// the same device — even two workers, or a worker then an admin — never
// inherits another account's theme preference.
const getAccountId = (role: DashboardThemeRole): string =>
  String(getAuthUser(role)?.id_user ?? 'anon');

const getStorageKey = (role: DashboardThemeRole) => `${STORAGE_PREFIX}:${role}:${getAccountId(role)}`;

const getSystemTheme = (): DashboardTheme => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const getInitialTheme = (role: DashboardThemeRole): DashboardTheme => {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const savedTheme = window.localStorage.getItem(getStorageKey(role));
  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }

  return getSystemTheme();
};

export const useDashboardTheme = (
  role: DashboardThemeRole,
  // Only the persistent top-level shell (ProDashboard, AdminShell) should
  // own the <html class="dark"> side effect — child components (tabs,
  // modules) also call this hook just to read `isDark` for their own
  // prop-driven styling, and mount/unmount far more often than the shell
  // does. If every instance synced the document class, an inner tab
  // unmounting would race the shell's own effect and reset <html> to the
  // client-facing theme while the dashboard is still on screen.
  options: { syncDocumentClass?: boolean } = {}
) => {
  const { syncDocumentClass = false } = options;
  const [accountId, setAccountId] = useState<string>(() => getAccountId(role));
  const [theme, setTheme] = useState<DashboardTheme>(() => getInitialTheme(role));
  const storageKey = useMemo(() => `${STORAGE_PREFIX}:${role}:${accountId}`, [role, accountId]);

  // Re-resolve which account is active whenever the auth session changes
  // (login, logout, or switching to a different account) and load that
  // account's own saved theme instead of carrying over the previous one.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncAccount = () => {
      const nextAccountId = getAccountId(role);
      setAccountId((current) => (current === nextAccountId ? current : nextAccountId));
      const saved = window.localStorage.getItem(`${STORAGE_PREFIX}:${role}:${nextAccountId}`);
      setTheme(saved === 'light' || saved === 'dark' ? saved : getSystemTheme());
    };

    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, syncAccount);
    return () => window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, syncAccount);
  }, [role]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(storageKey, theme);
  }, [storageKey, theme]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) {
        return;
      }

      if (event.newValue === 'light' || event.newValue === 'dark') {
        setTheme(event.newValue);
      }
    };

    const handleMediaChange = () => {
      if (window.localStorage.getItem(storageKey)) {
        return;
      }

      setTheme(getSystemTheme());
    };

    window.addEventListener('storage', handleStorage);
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleMediaChange);
    } else {
      mediaQuery.addListener(handleMediaChange);
    }

    return () => {
      window.removeEventListener('storage', handleStorage);
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', handleMediaChange);
      } else {
        mediaQuery.removeListener(handleMediaChange);
      }
    };
  }, [storageKey]);

  // Drive the actual <html class="dark"> that Tailwind's `dark:` variant
  // reads. Without this, raw `dark:*` utilities inside the dashboard
  // markup keep following whatever the client-facing site's theme
  // (fixlife:user-theme) last set, ignoring this dashboard's own toggle —
  // e.g. a worker switching their dashboard to light mode while <html>
  // still carries a leftover 'dark' class from the main site.
  useEffect(() => {
    if (!syncDocumentClass || typeof document === 'undefined') return;
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [syncDocumentClass, theme]);

  // On unmount (leaving the dashboard back to the client-facing pages),
  // restore whatever theme those pages themselves are set to instead of
  // leaving this dashboard's class stuck on <html>.
  useEffect(() => {
    if (!syncDocumentClass) return;
    return () => {
      if (typeof document === 'undefined' || typeof window === 'undefined') return;
      const clientTheme = window.localStorage.getItem('fixlife:user-theme');
      if (clientTheme === 'dark') document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    };
  }, [syncDocumentClass]);

  const toggleTheme = useCallback(() => {
    setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'));
  }, []);

  return useMemo(
    () => ({
      theme,
      isDark: theme === 'dark',
      setTheme,
      toggleTheme,
    }),
    [theme, toggleTheme]
  );
};
