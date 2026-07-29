import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

export const StepsSection: React.FC = () => {
  const { t } = useTranslation();
  const translatedSteps = t('steps.items', { returnObjects: true }) as Array<{ id: string; title: string; desc: string }>;
  const stepMeta = [
    {
      icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
      gradient: 'from-bird-blue to-bird-lightBlue',
    },
    {
      icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
      gradient: 'from-bird-yellow to-bird-orange',
    },
    {
      icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
      gradient: 'from-green-400 to-emerald-500',
    },
  ];
  const steps = translatedSteps.map((step, index) => ({ ...step, ...stepMeta[index] }));

  return (
    <div className="w-full relative">
      <div className="text-center mb-7">
        <h3 className="text-2xl md:text-3xl font-black text-gray-900 mb-2">
          {t('steps.title')}
        </h3>
        <p className="text-gray-600 text-sm md:text-base font-medium">
          {t('steps.subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-8 relative">
        {/* Connecting line for desktop */}
        <div className="hidden md:block absolute top-20 left-[16%] right-[16%] h-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent">
          <div className="h-full bg-gradient-to-r from-bird-blue via-bird-yellow to-green-400 origin-left" />
        </div>

        {steps.map((step, i) => (
          <motion.div
            key={i}
            whileHover={{ y: -10 }}
            className="flex flex-col items-center text-center group relative"
          >
            {/* Background glow effect */}
            <div className={`absolute top-0 w-64 h-64 bg-gradient-to-br ${step.gradient} opacity-0 group-hover:opacity-10 blur-3xl transition-opacity duration-500 rounded-full`} />

            {/* Main icon container */}
            <motion.div
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ type: "spring", stiffness: 300 }}
              className="relative z-10 w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-white border-2 border-gray-200 flex items-center justify-center mb-4 shadow-xl group-hover:border-transparent group-hover:shadow-2xl transition-all duration-300"
            >
              {/* Gradient background on hover */}
              <div className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${step.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
              
              {/* Icon */}
              <div className="relative z-10">
                <svg className="w-9 h-9 md:w-10 md:h-10 text-gray-700 group-hover:text-white transition-colors duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={step.icon} />
                </svg>
              </div>

              {/* Step number badge */}
              <div className={`absolute -top-3 -right-3 w-9 h-9 rounded-full bg-gradient-to-br ${step.gradient} flex items-center justify-center shadow-lg border-4 border-white`}>
                <span className="text-white font-black text-sm">{step.id}</span>
              </div>

              {/* Pulse effect */}
              <div className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${step.gradient} opacity-20 animate-ping`} style={{ animationDuration: '3s' }} />
            </motion.div>

            {/* Content */}
            <h3 className="text-xl md:text-2xl font-black text-gray-900 mb-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-bird-blue group-hover:to-bird-lightBlue transition-all duration-300">
              {step.title}
            </h3>
            <p className="text-gray-600 text-xs md:text-sm leading-relaxed max-w-xs px-2 font-medium">
              {step.desc}
            </p>

            {/* Arrow connector for mobile */}
            {i < steps.length - 1 && (
              <div className="md:hidden mt-8 mb-4">
                <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
            )}
          </motion.div>
        ))}
      </div>

    </div>
  );
};
