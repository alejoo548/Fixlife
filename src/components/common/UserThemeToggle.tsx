import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useUserTheme } from '../../hooks/useUserTheme';

interface Props {
    className?: string;
    compact?: boolean;
}

export const UserThemeToggle: React.FC<Props> = ({ className = '', compact = false }) => {
    const { isDark, toggleTheme } = useUserTheme();
    return (
        <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-pressed={isDark}
            className={`group relative flex items-center justify-center rounded-2xl border transition duration-300 ${
                compact ? 'h-9 w-9' : 'h-10 w-10'
            } border-slate-200 bg-white text-slate-600 shadow-sm hover:-translate-y-0.5 hover:border-bird-blue/30 hover:text-bird-blue hover:shadow-[0_10px_22px_rgba(0,144,255,0.16)] dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:border-bird-orange/40 dark:hover:text-bird-orange dark:hover:shadow-[0_10px_22px_rgba(255,128,0,0.20)] ${className}`}
        >
            <Sun className={`h-4 w-4 transition duration-300 ${isDark ? '-rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'}`} />
            <Moon className={`absolute h-4 w-4 transition duration-300 ${isDark ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-0 opacity-0'}`} />
        </button>
    );
};

export default UserThemeToggle;
