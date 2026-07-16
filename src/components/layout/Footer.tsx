import React from 'react';
import { useTranslation } from 'react-i18next';
import { TextHoverEffect } from '../common/TextHoverEffect';

interface FooterProps {
  onOpenPro?: () => void;
  onOpenAdmin?: () => void;
  onBookService?: () => void;
  onGoHome?: () => void;
  onNavigateSection?: (target: string) => void;
}

export const Footer: React.FC<FooterProps> = ({
  onOpenPro,
  onOpenAdmin,
  onBookService,
  onGoHome,
  onNavigateSection,
}) => {
  const { t } = useTranslation();
  const platformLinks = t('footer.platformLinks', { returnObjects: true }) as Array<{
    label: string;
    target: string;
  }>;
  const companyLinks = t('footer.companyLinks', { returnObjects: true }) as Array<{
    label: string;
    target?: string;
    action?: 'openPro';
  }>;

  return (
    <footer className="relative bg-gradient-to-b from-transparent via-orange-50/30 to-gray-50 pt-16 pb-10 border-t border-gray-200">
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute bottom-0 left-[10%] w-[500px] h-[500px] bg-bird-blue/10 rounded-full blur-[100px]" />
        <div className="absolute top-20 right-[10%] w-[400px] h-[400px] bg-bird-yellow/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-[15%] right-[5%] w-[300px] h-[300px] bg-bird-orange/10 rounded-full blur-[80px]" />
      </div>

      <div className="max-w-[1400px] mx-auto px-4 md:px-8 relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-12 gap-8 lg:gap-8 mb-16 text-gray-900">
          <div className="col-span-2 lg:col-span-6 flex flex-col items-start gap-6 mb-8 lg:mb-0">
            <button
              type="button"
              onClick={onGoHome}
              className="flex items-center gap-3 group text-left"
            >
              <div className="relative">
                <img
                  src="/mascot.webp"
                  alt="Fixlife Mascot"
                  className="w-16 h-16 object-contain drop-shadow-lg group-hover:scale-110 transition-transform duration-300"
                />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white shadow-lg" />
              </div>
              <div>
                <span className="font-bold text-2xl tracking-tight text-gray-900 block">Fixlife</span>
                <span className="text-xs text-bird-blue font-semibold">{t('footer.tagline')}</span>
              </div>
            </button>

            <p className="text-gray-600 text-sm leading-relaxed max-w-sm">
              {t('footer.description')}
            </p>

            <div className="flex items-center gap-3 mt-2">
              {[
                { name: 'twitter', icon: 'M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z' },
                { name: 'facebook', icon: 'M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z' },
                { name: 'instagram', icon: 'M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37zm1.5-4.87h.01M7.5 2h9A5.5 5.5 0 0122 7.5v9a5.5 5.5 0 01-5.5 5.5h-9A5.5 5.5 0 012 16.5v-9A5.5 5.5 0 017.5 2z' },
                { name: 'linkedin', icon: 'M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z M4 6a2 2 0 100-4 2 2 0 000 4z' },
              ].map((social) => (
                <div
                  key={social.name}
                  className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-500"
                  aria-hidden="true"
                >
                  <span className="sr-only">{social.name}</span>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={social.icon} />
                  </svg>
                </div>
              ))}
            </div>
          </div>

          <div className="col-span-1 lg:col-span-3">
            <h4 className="text-gray-900 font-bold text-base mb-5 flex items-center gap-2">
              <div className="w-1 h-5 bg-bird-blue rounded-full" />
              {t('footer.platformTitle')}
            </h4>
            <ul className="flex flex-col gap-3">
              {platformLinks.map((item) => (
                <li key={item.label}>
                  <button
                    type="button"
                    onClick={() => onNavigateSection?.(item.target)}
                    className="text-gray-600 hover:text-bird-blue hover:translate-x-1 transition-all text-sm font-medium inline-flex items-center gap-2 group"
                  >
                    <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="col-span-1 lg:col-span-3">
            <h4 className="text-gray-900 font-bold text-base mb-5 flex items-center gap-2">
              <div className="w-1 h-5 bg-bird-yellow rounded-full" />
              {t('footer.companyTitle')}
            </h4>
            <ul className="flex flex-col gap-3">
              {companyLinks.map((item) => (
                <li key={item.label}>
                  <button
                    type="button"
                    onClick={() => (item.action === 'openPro' ? onOpenPro?.() : onNavigateSection?.(item.target as string))}
                    className="text-gray-600 hover:text-bird-blue hover:translate-x-1 transition-all text-sm font-medium inline-flex items-center gap-2 group"
                  >
                    <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Epic Fixlife text watermark */}
        <div className="relative -mx-4 md:-mx-8 px-4 md:px-8 py-4 overflow-hidden">
          <TextHoverEffect text="Fixlife" />
        </div>

        <div className="pt-8 border-t border-gray-200 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-gray-500 text-center md:text-left">
          <div className="flex items-center gap-2 text-gray-400">
            <p>{t('footer.copyright')}</p>
            <span className="hidden md:inline">|</span>
            <p className="hidden md:inline">{t('footer.builtForHome')}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-6 md:gap-8 items-center">
            <button
              type="button"
              onClick={onOpenAdmin}
              className="text-gray-400 hover:text-bird-blue transition-colors font-bold text-xs"
            >
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                </svg>
                {t('footer.adminArea')}
              </span>
            </button>
            <span className="text-gray-300 hidden md:inline">|</span>
            <button
              type="button"
              onClick={() => onNavigateSection?.('faq')}
              className="hover:text-bird-blue transition-colors font-medium"
            >
              {t('footer.helpCenter')}
            </button>
            <button type="button" onClick={onBookService} className="hover:text-bird-blue transition-colors font-medium">
              {t('footer.bookService')}
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
