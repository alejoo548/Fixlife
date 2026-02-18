import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ProBentoProps {
  onOpenPro?: () => void;
}

const PRO_PROFILES = [
  {
    id: 1,
    name: "Carlos Méndez",
    role: "Industrial Electrician",
    bio: "Specialist in structured cabling. 6-month guarantee.",
    image: "https://images.unsplash.com/photo-1556911220-bff31c812dba?q=80&w=1968&auto=format&fit=crop",
    stats: ["certified", "5.0", "verified"],
    jobs: 124,
    color: "blue"
  },
  {
    id: 2,
    name: "Ana Julia R.",
    role: "Plumbing & Gas",
    bio: "Quick solutions for leaks and preventive maintenance.",
    image: "https://images.unsplash.com/photo-1581578731117-10d52b43cc0a?q=80&w=1968&auto=format&fit=crop",
    stats: ["top-rated", "4.9", "fast"],
    jobs: 98,
    color: "yellow"
  },
  {
    id: 3,
    name: "Roberto Díaz",
    role: "HVAC Technician",
    bio: "Air conditioning installation and repair.",
    image: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?q=80&w=1968&auto=format&fit=crop",
    stats: ["expert", "4.8", "insured"],
    jobs: 156,
    color: "orange"
  }
];

const StatIcon = ({ type }: { type: string }) => {
  if (type === '5.0' || type === '4.9' || type === '4.8') return <span className="text-bird-yellow font-bold text-lg drop-shadow-sm">★ {type}</span>;
  if (type === 'verified') return <span className="text-blue-500 bg-blue-50 px-2.5 py-1 rounded-lg text-[10px] font-bold border border-blue-200 tracking-wider">VERIFIED</span>;
  if (type === 'certified') return <span className="text-emerald-500 bg-emerald-50 px-2.5 py-1 rounded-lg text-[10px] font-bold border border-emerald-200 tracking-wider">CERTIFIED</span>;
  if (type === 'expert') return <span className="text-purple-500 bg-purple-50 px-2.5 py-1 rounded-lg text-[10px] font-bold border border-purple-200 tracking-wider">EXPERT</span>;
  if (type === 'top-rated') return <span className="text-orange-500 bg-orange-50 px-2.5 py-1 rounded-lg text-[10px] font-bold border border-orange-200 tracking-wider">TOP RATED</span>;
  if (type === 'fast') return <span className="text-cyan-500 bg-cyan-50 px-2.5 py-1 rounded-lg text-[10px] font-bold border border-cyan-200 tracking-wider">FAST</span>;
  if (type === 'insured') return <span className="text-indigo-500 bg-indigo-50 px-2.5 py-1 rounded-lg text-[10px] font-bold border border-indigo-200 tracking-wider">INSURED</span>;
  return null;
};

export const ProBento: React.FC<ProBentoProps> = ({ onOpenPro }) => {
  const [activeProfile, setActiveProfile] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveProfile((prev) => (prev + 1) % PRO_PROFILES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const profile = PRO_PROFILES[activeProfile];

  return (
    <div className="w-full relative">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute top-0 right-0 w-[600px] h-[600px] bg-bird-blue/10 rounded-full blur-[120px]"
        />
        <motion.div
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-bird-yellow/10 rounded-full blur-[100px]"
        />
      </div>

      <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-12 lg:gap-20">

        {/* Left content */}
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex-1 max-w-xl text-center lg:text-left order-2 lg:order-1"
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-bird-blue/10 to-bird-lightBlue/10 border border-bird-blue/20 text-bird-blue text-xs font-bold tracking-wider mb-6 shadow-sm"
          >
            <motion.span
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-2 h-2 rounded-full bg-bird-blue"
            />
            FOR PROFESSIONALS
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="text-4xl md:text-5xl lg:text-6xl font-black text-gray-900 mb-6 leading-[1.1] tracking-tight"
          >
            Your work.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-bird-blue via-bird-lightBlue to-bird-blue animate-gradient">
              Your rules.
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 }}
            className="text-gray-600 text-base md:text-lg mb-8 leading-relaxed font-medium"
          >
            Join the platform that values your craft. No bosses, manage your own schedule and get paid securely every week.
          </motion.p>

          {/* Benefits list */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
            className="mb-8 space-y-3"
          >
            {[
              { icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", text: "Earn up to $5,000/month" },
              { icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z", text: "Flexible schedule" },
              { icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", text: "Insurance included" }
            ].map((benefit, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.6 + i * 0.1 }}
                className="flex items-center gap-3 text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-bird-blue/10 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-bird-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={benefit.icon} />
                  </svg>
                </div>
                <span className="text-gray-700 font-medium">{benefit.text}</span>
              </motion.div>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.9 }}
            className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start"
          >
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onOpenPro}
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-bird-blue to-bird-lightBlue text-white font-bold text-base shadow-xl shadow-bird-blue/30 flex items-center justify-center gap-2 group hover:shadow-2xl hover:shadow-bird-blue/40 transition-all"
            >
              Apply as Pro
              <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white border-2 border-gray-200 text-gray-900 font-bold hover:border-bird-blue hover:text-bird-blue transition-all"
            >
              See Benefits
            </motion.button>
          </motion.div>
        </motion.div>

        {/* Right content - Profile card */}
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex-1 w-full flex justify-center lg:justify-end order-1 lg:order-2"
        >
          <div className="relative w-full max-w-[550px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={profile.id}
                initial={{ opacity: 0, scale: 0.9, rotateY: -20 }}
                animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                exit={{ opacity: 0, scale: 0.9, rotateY: 20 }}
                transition={{ duration: 0.5 }}
                className="relative"
              >
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="relative flex flex-col sm:flex-row items-center bg-white/90 backdrop-blur-2xl border-2 border-gray-200 rounded-[32px] p-6 sm:pr-8 shadow-2xl hover:shadow-3xl transition-all"
                >
                  {/* Profile image */}
                  <div className="relative flex-shrink-0 mb-6 sm:mb-0">
                    <motion.div
                      whileHover={{ scale: 1.05, rotate: 2 }}
                      className="-mt-12 sm:mt-0 sm:-ml-12 w-48 h-48 sm:w-[220px] sm:h-[280px] rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.3)] border-4 border-white relative z-20 group cursor-pointer"
                    >
                      <img
                        src={profile.image}
                        alt={profile.name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                      
                      {/* Online indicator */}
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute top-4 right-4 flex items-center gap-2 bg-green-500 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg"
                      >
                        <motion.span
                          animate={{ scale: [1, 1.3, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                          className="w-2 h-2 rounded-full bg-white"
                        />
                        ONLINE
                      </motion.div>
                    </motion.div>

                    {/* Jobs completed badge */}
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ delay: 0.3, type: "spring" }}
                      className="absolute -bottom-4 -right-4 sm:-bottom-4 sm:-right-8 z-30 bg-gradient-to-br from-bird-blue to-bird-lightBlue border-4 border-white p-4 rounded-2xl shadow-xl flex flex-col items-center min-w-[100px]"
                    >
                      <span className="text-[10px] text-white/80 uppercase tracking-widest font-bold">JOBS</span>
                      <span className="text-2xl font-black text-white">{profile.jobs}</span>
                    </motion.div>
                  </div>

                  {/* Profile info */}
                  <div className="flex-1 flex flex-col items-center sm:items-start text-center sm:text-left sm:pl-10 pt-4 sm:pt-0">
                    <motion.h3
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="text-2xl md:text-3xl font-black text-gray-900 mb-1"
                    >
                      {profile.name}
                    </motion.h3>
                    <motion.p
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="text-bird-blue font-bold text-sm mb-4 uppercase tracking-wide"
                    >
                      {profile.role}
                    </motion.p>

                    <motion.p
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="text-gray-600 text-sm leading-relaxed mb-6 font-medium"
                    >
                      {profile.bio}
                    </motion.p>

                    {/* Stats badges */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="flex flex-wrap items-center justify-center sm:justify-start gap-2 w-full"
                    >
                      {profile.stats.map((stat, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.6 + i * 0.1, type: "spring" }}
                        >
                          <StatIcon type={stat} />
                        </motion.div>
                      ))}
                    </motion.div>
                  </div>
                </motion.div>
              </motion.div>
            </AnimatePresence>

            {/* Profile navigation dots */}
            <div className="flex justify-center gap-2 mt-6">
              {PRO_PROFILES.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setActiveProfile(index)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    index === activeProfile
                      ? 'w-8 bg-bird-blue'
                      : 'w-2 bg-gray-300 hover:bg-gray-400'
                  }`}
                  aria-label={`View profile ${index + 1}`}
                />
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};