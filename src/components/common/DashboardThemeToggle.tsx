import React from 'react';
import { MoonStar, SunMedium } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DashboardTheme } from '../../hooks/useDashboardTheme';

interface DashboardThemeToggleProps {
  theme: DashboardTheme;
  onToggle: () => void;
  className?: string;
  labelClassName?: string;
  shortLabelClassName?: string;
}

export const DashboardThemeToggle: React.FC<DashboardThemeToggleProps> = ({
  theme,
  onToggle,
  className = '',
  labelClassName = 'hidden sm:block',
  shortLabelClassName = 'sm:hidden',
}) => {
  const { t } = useTranslation();
  const isDark = theme === 'dark';
  const label = isDark ? t('common.theme.darkOn') : t('common.theme.lightOn');
  const nextLabel = isDark ? t('common.theme.switchToLight') : t('common.theme.switchToDark');

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={nextLabel}
      aria-pressed={isDark}
      title={nextLabel}
      className={`dashboard-theme-toggle group inline-flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm font-bold transition-all duration-300 ${className}`}
    >
      <span className="dashboard-theme-toggle__icon relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl">
        <SunMedium
          className={`h-[18px] w-[18px] transition-all duration-300 ${isDark ? 'translate-y-6 rotate-45 opacity-0' : 'translate-y-0 rotate-0 opacity-100'}`}
        />
        <MoonStar
          className={`absolute h-[18px] w-[18px] transition-all duration-300 ${isDark ? 'translate-y-0 rotate-0 opacity-100' : '-translate-y-6 -rotate-45 opacity-0'}`}
        />
      </span>
      <span className={labelClassName}>
        {label}
      </span>
      <span className={shortLabelClassName}>{isDark ? t('common.theme.dark') : t('common.theme.light')}</span>
    </button>
  );
};
