import { useCallback, useEffect, useMemo, useState } from 'react';

export type DashboardTheme = 'light' | 'dark';
export type DashboardThemeRole = 'admin' | 'worker';

const STORAGE_PREFIX = 'fixlife:dashboard-theme';

const getStorageKey = (role: DashboardThemeRole) => `${STORAGE_PREFIX}:${role}`;

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

export const useDashboardTheme = (role: DashboardThemeRole) => {
  const [theme, setTheme] = useState<DashboardTheme>(() => getInitialTheme(role));

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(getStorageKey(role), theme);
  }, [role, theme]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const storageKey = getStorageKey(role);

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
  }, [role]);

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
