import React from 'react';
import { motion } from 'framer-motion';

const safetyFeatures = [
  {
    title: "Background Verified",
    description: "Every professional undergoes comprehensive background checks including criminal records, identity verification, and employment history.",
    icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
    color: "blue",
    stat: "100%",
    statLabel: "Verified"
  },
  {
    title: "Licensed & Insured",
    description: "All professionals carry valid licenses for their trade and maintain liability insurance to protect you and your property.",
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    color: "yellow",
    stat: "$2M",
    statLabel: "Coverage"
  },
  {
    title: "Secure Payments",
    description: "Your payment information is encrypted and secure. We hold funds in escrow until the job is completed to your satisfaction.",
    icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
    color: "orange",
    stat: "256-bit",
    statLabel: "Encryption"
  },
  {
    title: "Satisfaction Guarantee",
    description: "If you're not completely satisfied with the service, we'll make it right or provide a full refund. Your happiness is guaranteed.",
    icon: "M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z",
    color: "blue",
    stat: "98%",
    statLabel: "Satisfied"
  }
];

const trustBadges = [
  { name: "SSL Secured", icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" },
  { name: "PCI Compliant", icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" },
  { name: "GDPR Ready", icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
  { name: "24/7 Support", icon: "M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" }
];

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
  return (
    <div className="relative">
      <div className="text-center mb-12 md:mb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-50 border border-green-200 mb-6"
        >
          <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span className="text-sm font-bold text-green-700 uppercase tracking-wider">Your Safety is Our Priority</span>
        </motion.div>

        <motion.h3
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-3xl md:text-4xl lg:text-5xl font-black text-gray-900 mb-4"
        >
          Trust & Safety Guaranteed
        </motion.h3>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-gray-600 text-base md:text-lg max-w-2xl mx-auto font-medium"
        >
          We take security seriously. Every professional is thoroughly vetted, and every transaction is protected.
        </motion.p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 mb-12">
        {safetyFeatures.map((feature, index) => {
          const colors = getColorClasses(feature.color);
          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ y: -5 }}
              className="group bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-6 md:p-8 shadow-sm hover:shadow-xl transition-all duration-300 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-gray-50 to-transparent rounded-full -mr-20 -mt-20 opacity-50 group-hover:opacity-100 transition-opacity" />
              
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl ${colors.bg} border ${colors.border} flex items-center justify-center ${colors.hover} transition-all duration-300`}>
                    <svg className={`w-7 h-7 md:w-8 md:h-8 ${colors.text} group-hover:text-white transition-colors`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={feature.icon} />
                    </svg>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl md:text-3xl font-black ${colors.text}`}>{feature.stat}</div>
                    <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">{feature.statLabel}</div>
                  </div>
                </div>

                <h4 className="text-xl md:text-2xl font-bold text-gray-900 mb-3 group-hover:text-bird-blue transition-colors">
                  {feature.title}
                </h4>
                <p className="text-gray-600 text-sm md:text-base leading-relaxed font-medium">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-2xl p-6 md:p-10 relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-full opacity-5">
          <div className="absolute top-10 left-10 w-20 h-20 border-4 border-bird-blue rounded-full" />
          <div className="absolute bottom-10 right-10 w-32 h-32 border-4 border-bird-yellow rounded-full" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 border-4 border-bird-orange rounded-full" />
        </div>

        <div className="relative z-10">
          <div className="text-center mb-8">
            <h4 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Industry-Leading Security</h4>
            <p className="text-gray-600 text-sm md:text-base font-medium">Certified and compliant with the highest standards</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {trustBadges.map((badge, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ scale: 1.05 }}
                className="bg-white border border-gray-200 rounded-xl p-4 md:p-6 flex flex-col items-center justify-center text-center shadow-sm hover:shadow-md transition-all cursor-pointer group"
              >
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3 group-hover:bg-bird-blue transition-colors">
                  <svg className="w-6 h-6 md:w-7 md:h-7 text-gray-600 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={badge.icon} />
                  </svg>
                </div>
                <span className="text-xs md:text-sm font-bold text-gray-900 group-hover:text-bird-blue transition-colors">
                  {badge.name}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-8 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center gap-6"
      >
        <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-green-500 flex items-center justify-center shrink-0 shadow-lg shadow-green-500/30">
          <svg className="w-8 h-8 md:w-10 md:h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div className="flex-1 text-center md:text-left">
          <h5 className="text-xl md:text-2xl font-bold text-gray-900 mb-2">Our Commitment to You</h5>
          <p className="text-gray-700 text-sm md:text-base font-medium leading-relaxed">
            We continuously monitor and improve our safety standards. If anything goes wrong, our dedicated support team is available 24/7 to help resolve any issues immediately.
          </p>
        </div>
        <a href="#" className="px-6 py-3 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-600/20 whitespace-nowrap">
          Learn More
        </a>
      </motion.div>
    </div>
  );
};
