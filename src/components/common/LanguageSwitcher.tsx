import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

const languageOptions = [
  { code: 'en', labelKey: 'common.language.english' },
  { code: 'es', labelKey: 'common.language.spanish' },
] as const;

interface LanguageSwitcherProps {
  mobile?: boolean;
}

const FlagIcon: React.FC<{ code: 'en' | 'es' }> = ({ code }) => {
  if (code === 'en') {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 16"
        className="h-4 w-6 overflow-hidden rounded-[4px] border border-slate-200/80 shadow-sm"
      >
        <rect width="24" height="16" fill="#ffffff" />
        <rect width="24" height="1.23" y="0" fill="#b22234" />
        <rect width="24" height="1.23" y="2.46" fill="#b22234" />
        <rect width="24" height="1.23" y="4.92" fill="#b22234" />
        <rect width="24" height="1.23" y="7.38" fill="#b22234" />
        <rect width="24" height="1.23" y="9.84" fill="#b22234" />
        <rect width="24" height="1.23" y="12.3" fill="#b22234" />
        <rect width="10.4" height="8.6" fill="#3c3b6e" />
        <g fill="#ffffff">
          <circle cx="1.5" cy="1.4" r="0.35" />
          <circle cx="3.4" cy="1.4" r="0.35" />
          <circle cx="5.3" cy="1.4" r="0.35" />
          <circle cx="7.2" cy="1.4" r="0.35" />
          <circle cx="9.1" cy="1.4" r="0.35" />
          <circle cx="2.45" cy="2.5" r="0.35" />
          <circle cx="4.35" cy="2.5" r="0.35" />
          <circle cx="6.25" cy="2.5" r="0.35" />
          <circle cx="8.15" cy="2.5" r="0.35" />
          <circle cx="1.5" cy="3.6" r="0.35" />
          <circle cx="3.4" cy="3.6" r="0.35" />
          <circle cx="5.3" cy="3.6" r="0.35" />
          <circle cx="7.2" cy="3.6" r="0.35" />
          <circle cx="9.1" cy="3.6" r="0.35" />
          <circle cx="2.45" cy="4.7" r="0.35" />
          <circle cx="4.35" cy="4.7" r="0.35" />
          <circle cx="6.25" cy="4.7" r="0.35" />
          <circle cx="8.15" cy="4.7" r="0.35" />
          <circle cx="1.5" cy="5.8" r="0.35" />
          <circle cx="3.4" cy="5.8" r="0.35" />
          <circle cx="5.3" cy="5.8" r="0.35" />
          <circle cx="7.2" cy="5.8" r="0.35" />
          <circle cx="9.1" cy="5.8" r="0.35" />
          <circle cx="2.45" cy="6.9" r="0.35" />
          <circle cx="4.35" cy="6.9" r="0.35" />
          <circle cx="6.25" cy="6.9" r="0.35" />
          <circle cx="8.15" cy="6.9" r="0.35" />
        </g>
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 16"
      className="h-4 w-6 overflow-hidden rounded-[4px] border border-slate-200/80 shadow-sm"
    >
      <rect width="24" height="16" fill="#c60b1e" />
      <rect y="4" width="24" height="8" fill="#ffc400" />
    </svg>
  );
};

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ mobile = false }) => {
  const { i18n, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const activeLanguage = languageOptions.find((option) => option.code === i18n.resolvedLanguage) || languageOptions[0];

  const handleChangeLanguage = (code: string) => {
    void i18n.changeLanguage(code);
    setIsOpen(false);
  };

  if (mobile) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
          {t('common.language.label')}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {languageOptions.map((option) => {
            const isActive = i18n.resolvedLanguage === option.code;

            return (
              <button
                key={option.code}
                type="button"
                onClick={() => handleChangeLanguage(option.code)}
                className={`rounded-xl border px-4 py-3 text-sm font-black uppercase tracking-[0.12em] transition-all ${
                  isActive
                    ? 'border-bird-blue bg-bird-blue text-white shadow-lg shadow-bird-blue/20'
                    : 'border-gray-200 bg-white text-slate-600'
                }`}
              >
                <span className="flex items-center justify-center gap-2">
                  <FlagIcon code={option.code} />
                  <span>{t(option.labelKey)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="group relative flex items-center justify-center h-16" onMouseLeave={() => setIsOpen(false)}>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-label={t('common.language.label')}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-all duration-200 shadow-sm ${
          isOpen
            ? 'border-bird-blue/40 bg-bird-blue/10 ring-2 ring-bird-blue/20'
            : 'border-gray-200/50 dark:border-white/10 bg-white/50 dark:bg-slate-900/50 hover:border-bird-blue/30 hover:bg-bird-blue/5'
        }`}
      >
        <FlagIcon code={activeLanguage.code} />
      </button>

      <div
        className={`absolute top-14 right-0 w-44 bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/10 rounded-xl shadow-xl overflow-hidden transition-all duration-300 origin-top-right z-50 cursor-default
          ${isOpen ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'}`}
        onClick={(event) => event.stopPropagation()}
        role="listbox"
      >
        <div className="p-1">
          {languageOptions.map((option) => {
            const isActive = i18n.resolvedLanguage === option.code;

            return (
              <button
                key={option.code}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => handleChangeLanguage(option.code)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-bird-blue/10 text-bird-blue'
                    : 'text-gray-600 dark:text-slate-300 hover:bg-bird-blue/5 hover:text-bird-blue'
                }`}
              >
                <span className="flex items-center gap-2">
                  <FlagIcon code={option.code} />
                  <span>{t(option.labelKey)}</span>
                </span>
                {isActive && (
                  <svg className="h-4 w-4 text-bird-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
