import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

const safetyFeatureIcons = [
  "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
  "M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z",
];
const safetyFeatureColors = ["blue", "yellow", "orange", "blue"];

const trustBadgeIcons = [
  "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
  "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
  "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  "M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z",
];
const trustBadgeKeys = ['ssl', 'pci', 'gdpr', 'support'] as const;

const getColorClasses = (color: string) => {
  const colors = {
    blue: {
      bg: 'bg-bird-blue/10',
      text: 'text-bird-blue',
      border: 'border-bird-blue/20',
      shadow: 'shadow-bird-blue/20',
      hover: 'group-hover:bg-bird-blue group-hover:shadow-lg group-hover:shadow-bird-blue/30'
    },
    yellow: {
      bg: 'bg-bird-yellow/10',
      text: 'text-bird-yellow',
      border: 'border-bird-yellow/20',
      shadow: 'shadow-bird-yellow/20',
      hover: 'group-hover:bg-bird-yellow group-hover:shadow-lg group-hover:shadow-bird-yellow/30'
    },
    orange: {
      bg: 'bg-bird-orange/10',
      text: 'text-bird-orange',
      border: 'border-bird-orange/20',
      shadow: 'shadow-bird-orange/20',
      hover: 'group-hover:bg-bird-orange group-hover:shadow-lg group-hover:shadow-bird-orange/30'
    }
  };
  return colors[color as keyof typeof colors] || colors.blue;
};

export const SafetySection: React.FC = () => {
  const { t } = useTranslation();
  const safetyFeatures = (t('safety.features', { returnObjects: true }) as Array<{ title: string; description: string; stat: string; statLabel: string }>).map((feature, index) => ({
    ...feature,
    icon: safetyFeatureIcons[index],
    color: safetyFeatureColors[index],
  }));
  const trustBadgeLabels = t('safety.trustBadges', { returnObjects: true }) as Record<string, string>;
  const trustBadges = trustBadgeKeys.map((key, index) => ({ name: trustBadgeLabels[key], icon: trustBadgeIcons[index] }));
  return (
    <div className="relative">
      <div className="text-center mb-12 md:mb-16">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 mb-6">
          <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span className="text-sm font-bold text-green-600 dark:text-green-400 uppercase tracking-wider">{t('safety.eyebrow')}</span>
        </div>

        <h3 className="text-3xl md:text-4xl lg:text-5xl font-black text-slate-900 dark:text-slate-100 mb-4">
          {t('safety.title')}
        </h3>
        <p className="text-slate-600 dark:text-slate-400 text-base md:text-lg max-w-2xl mx-auto font-medium">
          {t('safety.subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 mb-12">
        {safetyFeatures.map((feature, index) => {
          const colors = getColorClasses(feature.color);
          return (
            <motion.div
              key={index}
              whileHover={{ y: -5 }}
              className="group bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border border-gray-200 dark:border-white/10 rounded-2xl p-6 md:p-8 shadow-sm hover:shadow-xl transition-all duration-300 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-gray-50 dark:from-white/5 to-transparent rounded-full -mr-20 -mt-20 opacity-50 group-hover:opacity-100 transition-opacity" />
              
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl ${colors.bg} border ${colors.border} flex items-center justify-center ${colors.hover} transition-all duration-300`}>
                    <svg className={`w-7 h-7 md:w-8 md:h-8 ${colors.text} group-hover:text-white transition-colors`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={feature.icon} />
                    </svg>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl md:text-3xl font-black ${colors.text}`}>{feature.stat}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">{feature.statLabel}</div>
                  </div>
                </div>

                <h4 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100 mb-3 group-hover:text-bird-blue transition-colors">
                  {feature.title}
                </h4>
                <p className="text-slate-600 dark:text-slate-400 text-sm md:text-base leading-relaxed font-medium">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="bg-gradient-to-br from-gray-50 to-white dark:from-slate-900 dark:to-slate-950 border border-gray-200 dark:border-white/10 rounded-2xl p-6 md:p-10 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-5">
          <div className="absolute top-10 left-10 w-20 h-20 border-4 border-bird-blue rounded-full" />
          <div className="absolute bottom-10 right-10 w-32 h-32 border-4 border-bird-yellow rounded-full" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 border-4 border-bird-orange rounded-full" />
        </div>

        <div className="relative z-10">
          <div className="text-center mb-8">
            <h4 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">{t('safety.securityTitle')}</h4>
            <p className="text-slate-600 dark:text-slate-400 text-sm md:text-base font-medium">{t('safety.securitySubtitle')}</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {trustBadges.map((badge, index) => (
              <div
                key={index}
                className="bg-white dark:bg-slate-800/80 border border-gray-200 dark:border-white/10 rounded-xl p-4 md:p-6 flex flex-col items-center justify-center text-center shadow-sm hover:shadow-md transition-all cursor-pointer group"
              >
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-gray-100 dark:bg-white/[0.08] flex items-center justify-center mb-3 group-hover:bg-bird-blue transition-colors">
                  <svg className="w-6 h-6 md:w-7 md:h-7 text-slate-600 dark:text-slate-300 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={badge.icon} />
                  </svg>
                </div>
                <span className="text-xs md:text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-bird-blue transition-colors">
                  {badge.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-emerald-950/40 dark:to-green-950/40 border border-green-200 dark:border-emerald-800/40 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center gap-6">
        <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-green-500 flex items-center justify-center shrink-0 shadow-lg shadow-green-500/30">
          <svg className="w-8 h-8 md:w-10 md:h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div className="flex-1 text-center md:text-left">
          <h5 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">{t('safety.commitmentTitle')}</h5>
          <p className="text-slate-700 dark:text-slate-300 text-sm md:text-base font-medium leading-relaxed">
            {t('safety.commitmentDescription')}
          </p>
        </div>
        <a href="#" className="px-6 py-3 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-600/20 whitespace-nowrap">
          {t('safety.cta')}
        </a>
      </div>
    </div>
  );
};
