import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { API_ENDPOINTS } from '../../config/api';

const AVATAR_COLORS = ['#0090ff', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444'];

const TESTIMONIAL_NAMES = ['Sarah Mitchell', 'Michael Chen', 'Emily Rodriguez', 'David Thompson', 'Jessica Park'];

const buildAvatarUri = (name: string, index: number): string => {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const bg = AVATAR_COLORS[index % AVATAR_COLORS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="40" fill="${bg}"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#fff" font-family="Inter,system-ui,sans-serif" font-weight="700" font-size="28">${initials}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

interface FallbackTestimonialTranslation {
  role: string;
  text: string;
  service: string;
}

const buildFallbackTestimonials = (items: FallbackTestimonialTranslation[]) =>
  TESTIMONIAL_NAMES.map((name, idx) => ({
    id: idx + 1,
    name,
    role: items[idx]?.role ?? '',
    image: buildAvatarUri(name, idx),
    rating: 5,
    text: items[idx]?.text ?? '',
    service: items[idx]?.service ?? '',
  }));

interface LiveReview {
  id_review: number;
  author_name: string;
  author_role: 'client' | 'worker';
  service_category: string | null;
  rating: number;
  review_text: string;
  created_at: string;
}

interface ReviewStats {
  total_reviews: number;
  average_rating: number;
  completed_jobs: number;
  satisfaction_rate: number;
}

type DisplayTestimonial = {
  id: number;
  name: string;
  role: string;
  authorRole?: 'client' | 'worker';
  image: string;
  rating: number;
  text: string;
  service: string;
};

const defaultStats: ReviewStats = {
  total_reviews: 2400,
  average_rating: 4.9,
  completed_jobs: 15000,
  satisfaction_rate: 98,
};

const formatCompact = (value: number) =>
  new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);

const buildToDisplayTestimonial = (roleProfessional: string, roleClient: string, servicePlatformReview: string) =>
  (r: LiveReview, idx: number): DisplayTestimonial => ({
    id: r.id_review,
    name: r.author_name,
    role: r.author_role === 'worker'
      ? `${roleProfessional}${r.service_category ? ` · ${r.service_category}` : ''}`
      : roleClient,
    authorRole: r.author_role,
    image: buildAvatarUri(r.author_name, idx),
    rating: Math.max(1, Math.min(5, Number(r.rating))),
    text: r.review_text,
    service: r.service_category ?? servicePlatformReview,
  });
const CATEGORY_THEMES: Record<string, { bg: string; text: string; iconBg: string }> = {
  plumbing: { bg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400', text: 'text-sky-600 dark:text-sky-400', iconBg: 'bg-sky-500' },
  electrical: { bg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', text: 'text-amber-600 dark:text-amber-400', iconBg: 'bg-amber-500' },
  cleaning: { bg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', text: 'text-emerald-600 dark:text-emerald-400', iconBg: 'bg-emerald-500' },
  carpentry: { bg: 'bg-orange-500/10 text-orange-600 dark:text-orange-400', text: 'text-orange-600 dark:text-orange-400', iconBg: 'bg-orange-500' },
  painting: { bg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400', text: 'text-rose-600 dark:text-rose-400', iconBg: 'bg-rose-500' },
  default: { bg: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400', text: 'text-indigo-600 dark:text-indigo-400', iconBg: 'bg-indigo-500' },
};

const getCategoryTheme = (service: string) => {
  const norm = service.toLowerCase();
  if (norm.includes('plumb')) return CATEGORY_THEMES.plumbing;
  if (norm.includes('elect')) return CATEGORY_THEMES.electrical;
  if (norm.includes('clean')) return CATEGORY_THEMES.cleaning;
  if (norm.includes('carpen')) return CATEGORY_THEMES.carpentry;
  if (norm.includes('paint')) return CATEGORY_THEMES.painting;
  return CATEGORY_THEMES.default;
};

export const TestimonialsCarousel: React.FC = () => {
  const { t } = useTranslation();
  const roleProfessional = t('testimonials.roleProfessional');
  const roleClient = t('testimonials.roleClient');
  const servicePlatformReview = t('testimonials.servicePlatformReview');
  const toDisplayTestimonial = useMemo(
    () => buildToDisplayTestimonial(roleProfessional, roleClient, servicePlatformReview),
    [roleProfessional, roleClient, servicePlatformReview]
  );
  const testimonials = useMemo(
    () => buildFallbackTestimonials(t('testimonials.items', { returnObjects: true }) as FallbackTestimonialTranslation[]),
    [t]
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [animating, setAnimating] = useState(false);
  const [displayItems, setDisplayItems] = useState<DisplayTestimonial[]>(testimonials);
  const resumeTimerRef = useRef<number | null>(null);

  const fetchLiveReviews = useCallback(async () => {
    try {
      const res = await fetch(API_ENDPOINTS.reviews.public);
      const data = await res.json() as {
        success: boolean;
        reviews?: LiveReview[];
      };

      if (!data.success) return;

      if (Array.isArray(data.reviews) && data.reviews.length > 0) {
        setDisplayItems(data.reviews.map(toDisplayTestimonial));
        setCurrentIndex(0);
      }
    } catch {
      // keep static fallback
    }
  }, [toDisplayTestimonial]);

  useEffect(() => {
    void fetchLiveReviews();
  }, [fetchLiveReviews]);

  // Combine displayItems with fallbacks to avoid duplicates and ensure >= 3 items
  const itemsToRender = useMemo(() => {
    const combined = [...displayItems];
    for (const fb of testimonials) {
      if (!combined.some(item => item.name.toLowerCase() === fb.name.toLowerCase())) {
        combined.push(fb);
      }
    }
    return combined;
  }, [displayItems, testimonials]);

  useEffect(() => {
    if (!isAutoPlaying || itemsToRender.length <= 1) return;
    const interval = window.setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % itemsToRender.length);
    }, 5500);
    return () => window.clearInterval(interval);
  }, [isAutoPlaying, itemsToRender.length]);

  useEffect(() => () => {
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
  }, []);

  const pauseAutoplay = () => {
    setIsAutoPlaying(false);
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = window.setTimeout(() => setIsAutoPlaying(true), 12000);
  };

  const goToSlide = (index: number) => {
    if (animating || index === currentIndex || itemsToRender.length <= 1) return;
    setAnimating(true);
    setCurrentIndex(index);
    pauseAutoplay();
    window.setTimeout(() => setAnimating(false), 400);
  };

  const nextSlide = () => goToSlide((currentIndex + 1) % itemsToRender.length);
  const prevSlide = () => goToSlide((currentIndex - 1 + itemsToRender.length) % itemsToRender.length);

  const card1 = itemsToRender[currentIndex] ?? itemsToRender[0];
  const card2 = itemsToRender[(currentIndex + 1) % itemsToRender.length] ?? itemsToRender[1];
  const card3 = itemsToRender[(currentIndex + 2) % itemsToRender.length] ?? itemsToRender[2];

  if (!card1) return null;

  const renderTestimonialCard = (item: DisplayTestimonial, isExtraClasses: string) => {
    if (!item) return null;
    const theme = getCategoryTheme(item.service);
    return (
      <div 
        className={`flex-1 flex flex-col justify-between bg-white/70 dark:bg-slate-900/60 border border-slate-100 dark:border-white/5 rounded-3xl p-6 shadow-[0_15px_35px_rgba(0,0,0,0.015)] dark:shadow-[0_15px_35px_rgba(0,0,0,0.2)] hover:shadow-[0_20px_45px_rgba(0,144,255,0.06)] hover:border-bird-blue/20 dark:hover:border-white/10 transition-all duration-350 relative group min-h-[290px] backdrop-blur-sm overflow-hidden ${isExtraClasses}`}
        style={{ opacity: animating ? 0.35 : 1 }}
      >
        {/* Giant decorative quote mark in card background */}
        <span className="absolute right-4 top-2 text-7xl font-serif text-slate-100/50 dark:text-slate-800/20 select-none pointer-events-none">
          ”
        </span>

        <div className="relative z-10">
          {/* Card Top Row: Rating and Category Badge */}
          <div className="flex items-center justify-between mb-5">
            {/* Rating Stars */}
            <div className="flex gap-0.5">
              {[...Array(5)].map((_, i) => (
                <svg key={i} className={`h-4 w-4 fill-current ${i < item.rating ? 'text-amber-400' : 'text-slate-200 dark:text-slate-700'}`} viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
            
            {/* Category Pill Tag */}
            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-extrabold tracking-wide uppercase ${theme.bg}`}>
              {item.service}
            </span>
          </div>

          {/* Testimonial Quote */}
          <blockquote className="text-slate-750 dark:text-slate-200 text-sm sm:text-[15px] font-semibold leading-relaxed italic mb-6 font-sans">
            “{item.text}”
          </blockquote>
        </div>

        {/* Author Info & Avatar */}
        <div className="flex items-center gap-3 border-t border-slate-100 dark:border-white/5 pt-4 mt-auto relative z-10">
          <img 
            src={item.image} 
            alt={item.name} 
            className="w-10 h-10 rounded-full object-cover ring-2 ring-bird-blue/50 dark:ring-slate-800 shadow-sm" 
          />
          <div className="text-left">
            <p className="text-sm font-black text-slate-900 dark:text-white leading-none">{item.name}</p>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-wider">{item.role}</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative w-full py-6 max-w-[1400px] mx-auto overflow-hidden">
      {/* Animated glowing gradient background blob behind the cards */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-gradient-to-tr from-bird-blue/10 via-indigo-500/5 to-bird-yellow/10 blur-3xl pointer-events-none select-none" />

      {/* Centered section header */}
      <div className="text-center mb-10 relative z-10">
        <span className="px-3.5 py-1.5 rounded-full bg-bird-blue/10 dark:bg-bird-blue/20 border border-bird-blue/20 text-[10px] font-black uppercase tracking-widest text-bird-blue mb-4 inline-block">
          {t('testimonials.badge')}
        </span>
        <h3 className="text-3xl sm:text-4xl md:text-5xl font-sans font-black text-slate-900 dark:text-white tracking-tight leading-none mb-3">
          {t('testimonials.headingLine1')} <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-bird-blue via-indigo-500 to-bird-orange">
            {t('testimonials.headingLine2')}
          </span>
        </h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base font-medium max-w-xl mx-auto mt-3">
          {t('testimonials.subtitle')}
        </p>
      </div>

      {/* Cards container with side navigation buttons */}
      <div className="relative px-2 sm:px-10 mt-12 z-10">
        {/* Left Arrow */}
        <button
          onClick={prevSlide}
          className="absolute -left-2 sm:left-0 top-1/2 -translate-y-1/2 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/60 bg-white text-slate-500 shadow-md transition hover:bg-slate-50 hover:text-slate-800 hover:scale-105 active:scale-95 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white disabled:opacity-30"
          aria-label={t('testimonials.a11y.previous')}
          disabled={itemsToRender.length <= 1}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Right Arrow */}
        <button
          onClick={nextSlide}
          className="absolute -right-2 sm:right-0 top-1/2 -translate-y-1/2 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/60 bg-white text-slate-500 shadow-md transition hover:bg-slate-50 hover:text-slate-800 hover:scale-105 active:scale-95 dark:border-slate-800 dark:bg-slate-955 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white disabled:opacity-30"
          aria-label={t('testimonials.a11y.next')}
          disabled={itemsToRender.length <= 1}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <div className="flex gap-6 items-stretch">
          {renderTestimonialCard(card1, "w-full")}
          {renderTestimonialCard(card2, "hidden md:flex w-full")}
          {renderTestimonialCard(card3, "hidden lg:flex w-full")}
        </div>
      </div>

      {/* Pagination dots at the bottom center */}
      <div className="flex items-center justify-center gap-1.5 mt-8 relative z-10">
        {itemsToRender.map((item, index) => (
          <button
            key={item.id}
            onClick={() => goToSlide(index)}
            aria-label={t('testimonials.a11y.goTo', { index: index + 1 })}
            className={`transition-all duration-300 ${
              index === currentIndex
                ? 'h-1.5 w-5 rounded-full bg-bird-blue shadow-[0_2px_8px_rgba(0,144,255,0.3)]'
                : 'h-1.5 w-1.5 rounded-full bg-slate-200 dark:bg-slate-800 hover:bg-slate-350 dark:hover:bg-slate-700'
            }`}
          />
        ))}
      </div>
    </div>
  );
};
