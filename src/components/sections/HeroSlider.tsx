import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HeroSliderProps } from '../../types';
import {
  DEFAULT_HERO_SLIDES,
  fetchHeroSlides,
  getHeroSlides,
  HERO_SLIDES_STORAGE_KEY,
  HERO_SLIDES_UPDATED_EVENT,
} from '../../utils/heroSlides';

export const HeroSlider: React.FC<HeroSliderProps> = ({ onStartBooking }) => {
  const [slides, setSlides] = useState(() => getHeroSlides());
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const nextSlide = useCallback(() => {
    setCurrent((prev) => (prev === slides.length - 1 ? 0 : prev + 1));
  }, [slides.length]);

  const prevSlide = () => {
    setCurrent((prev) => (prev === 0 ? slides.length - 1 : prev - 1));
  };

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(nextSlide, 5000);
    return () => clearInterval(timer);
  }, [isPaused, nextSlide]);

  useEffect(() => {
    fetchHeroSlides().then((fetched) => {
      if (Array.isArray(fetched) && fetched.length > 0) {
        setSlides(fetched);
      }
    });

    const syncSlides = () => {
      const nextSlides = getHeroSlides();
      setSlides(nextSlides.length > 0 ? nextSlides : DEFAULT_HERO_SLIDES);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === HERO_SLIDES_STORAGE_KEY) syncSlides();
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener(HERO_SLIDES_UPDATED_EVENT, syncSlides);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(HERO_SLIDES_UPDATED_EVENT, syncSlides);
    };
  }, []);

  useEffect(() => {
    if (current > slides.length - 1) setCurrent(0);
  }, [current, slides.length]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6 }}
      className="relative w-full h-full min-h-[450px] rounded-3xl overflow-hidden shadow-2xl border border-gray-200/50 group bg-white"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <AnimatePresence mode="wait">
        {slides.map((slide, index) => {
          const isActive = index === current;
          if (!isActive) return null;
          
          return (
            <motion.div
              key={slide.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7 }}
              className="absolute inset-0 z-10"
            >
              <div className="absolute inset-0 overflow-hidden">
                <motion.img
                  initial={{ scale: 1 }}
                  animate={{ scale: 1.1 }}
                  transition={{ duration: 6, ease: "easeOut" }}
                  src={slide.image}
                  alt={slide.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/60 to-transparent opacity-90" />
                <div className="absolute inset-0 bg-gradient-to-r from-gray-900/80 to-transparent opacity-60" />
              </div>
              
              <div className="absolute bottom-0 left-0 w-full p-8 md:p-12 flex flex-col items-start justify-end h-full">
                <div className="max-w-xl">
                  <motion.span
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                    className="inline-block px-3 py-1 mb-4 text-xs font-bold tracking-wider text-black bg-bird-yellow rounded-full uppercase shadow-lg shadow-bird-yellow/20"
                  >
                    {slide.tag}
                  </motion.span>

                  <motion.h2
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, duration: 0.6 }}
                    className="text-3xl md:text-5xl font-bold text-white mb-4 tracking-tight leading-tight"
                  >
                    {slide.title}
                  </motion.h2>

                  <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5, duration: 0.5 }}
                    className="text-gray-200 text-sm md:text-lg mb-8 leading-relaxed line-clamp-2 md:line-clamp-none drop-shadow-md"
                  >
                    {slide.description}
                  </motion.p>

                  <motion.button
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6, duration: 0.5 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onStartBooking}
                    className="px-8 py-3.5 rounded-xl bg-white/10 hover:bg-white text-white hover:text-bird-darkBlue border border-white/20 hover:border-white font-bold transition-all duration-300 backdrop-blur-md flex items-center gap-2 group/btn"
                  >
                    {slide.cta}
                    <motion.svg
                      animate={{ x: [0, 5, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </motion.svg>
                  </motion.button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      <motion.button
        initial={{ opacity: 0 }}
        whileHover={{ scale: 1.1, backgroundColor: "rgb(56, 189, 248)" }}
        onClick={prevSlide}
        className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-white/90 text-gray-900 backdrop-blur-md border border-gray-200 opacity-0 group-hover:opacity-100 transition-opacity duration-300 hidden md:flex"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </motion.button>

      <motion.button
        initial={{ opacity: 0 }}
        whileHover={{ scale: 1.1, backgroundColor: "rgb(56, 189, 248)" }}
        onClick={nextSlide}
        className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-white/90 text-gray-900 backdrop-blur-md border border-gray-200 opacity-0 group-hover:opacity-100 transition-opacity duration-300 hidden md:flex"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </motion.button>

      <div className="absolute bottom-6 right-6 z-20 flex gap-2">
        {slides.map((_, idx) => (
          <motion.button
            key={idx}
            whileHover={{ scale: 1.2 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setCurrent(idx)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              idx === current ? 'w-8 bg-bird-yellow' : 'w-2 bg-white/30 hover:bg-white/50'
            }`}
          />
        ))}
      </div>
    </motion.div>
  );
};
