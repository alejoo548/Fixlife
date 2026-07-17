import { useCallback, useEffect, useState } from 'react';

export type UserTheme = 'light' | 'dark';
const STORAGE_KEY = 'fixlife:user-theme';
const THEME_EVENT = 'fixlife-user-theme-changed';

const readStored = (): UserTheme | null => {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'dark' || raw === 'light') return raw;
    return null;
};

const readSystem = (): UserTheme => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const applyThemeClass = (theme: UserTheme) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    root.dataset.userTheme = theme;
};

export const useUserTheme = () => {
    const [theme, setThemeState] = useState<UserTheme>(() => readStored() ?? readSystem());

    useEffect(() => {
        applyThemeClass(theme);
        try {
            window.localStorage.setItem(STORAGE_KEY, theme);
        } catch {}
    }, [theme]);

    useEffect(() => {
        const handleEvent = (event: Event) => {
            const detail = (event as CustomEvent<UserTheme>).detail;
            if (detail === 'dark' || detail === 'light') setThemeState(detail);
        };
        const handleStorage = (event: StorageEvent) => {
            if (event.key !== STORAGE_KEY) return;
            if (event.newValue === 'light' || event.newValue === 'dark') setThemeState(event.newValue);
        };
        window.addEventListener(THEME_EVENT, handleEvent);
        window.addEventListener('storage', handleStorage);
        return () => {
            window.removeEventListener(THEME_EVENT, handleEvent);
            window.removeEventListener('storage', handleStorage);
        };
    }, []);

    const setTheme = useCallback((next: UserTheme) => {
        setThemeState(next);
        try {
            window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: next }));
        } catch {}
    }, []);

    const toggleTheme = useCallback(() => {
        setThemeState((current) => {
            const next: UserTheme = current === 'dark' ? 'light' : 'dark';
            try {
                window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: next }));
            } catch {}
            return next;
        });
    }, []);

    return { theme, isDark: theme === 'dark', setTheme, toggleTheme };
};

export const applyUserThemeFromStorage = () => {
    applyThemeClass(readStored() ?? readSystem());
};
