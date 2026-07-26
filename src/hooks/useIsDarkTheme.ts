import { useEffect, useState } from 'react';

// Tracks the app-wide dark mode class set on <html> by useUserTheme. Used by
// components (like the client map tile layer) that need to react to theme
// changes but sit far from wherever the theme toggle actually lives.
export const useIsDarkTheme = () => {
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );

  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(root.classList.contains('dark'));
    });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
};
