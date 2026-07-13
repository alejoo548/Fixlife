import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { API_ENDPOINTS } from '../../config/api';

const AVATAR_COLORS = ['#0090ff', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444'];

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

const testimonials = [
  {
    id: 1,
    name: 'Sarah Mitchell',
    role: 'Homeowner',
    image: buildAvatarUri('Sarah Mitchell', 0),
    rating: 5,
    text: 'Fixlife connected me with an amazing plumber who fixed my leak in under an hour. The whole process was seamless and professional. Highly recommend!',
    service: 'Plumbing',
  },
  {
    id: 2,
    name: 'Michael Chen',
    role: 'Business Owner',
    image: buildAvatarUri('Michael Chen', 1),
    rating: 5,
    text: 'I needed urgent electrical work done at my office. The electrician arrived within 30 minutes and solved the issue quickly. Outstanding service!',
    service: 'Electrical',
  },
  {
    id: 3,
    name: 'Emily Rodriguez',
    role: 'Property Manager',
    image: buildAvatarUri('Emily Rodriguez', 2),
    rating: 5,
    text: 'Managing multiple properties means I need reliable professionals. Fixlife has become my go-to platform for all maintenance needs. Simply the best!',
    service: 'Multiple Services',
  },
  {
    id: 4,
    name: 'David Thompson',
    role: 'Homeowner',
    image: buildAvatarUri('David Thompson', 3),
    rating: 5,
    text: "The transparency in pricing and the quality of work exceeded my expectations. I've used Fixlife three times now and will continue to do so.",
    service: 'Carpentry',
  },
  {
    id: 5,
    name: 'Jessica Park',
    role: 'Apartment Resident',
    image: buildAvatarUri('Jessica Park', 4),
    rating: 5,
    text: 'Fast, affordable, and trustworthy. The professional was courteous and cleaned up after the job. This is how home services should be!',
    service: 'Cleaning',
  },
];

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

const toDisplayTestimonial = (r: LiveReview, idx: number): DisplayTestimonial => ({
  id: r.id_review,
  name: r.author_name,
  role: r.author_role === 'worker'
    ? `Professional${r.service_category ? ` · ${r.service_category}` : ''}`
    : 'Client',
  authorRole: r.author_role,
  image: buildAvatarUri(r.author_name, idx),
  rating: Math.max(1, Math.min(5, Number(r.rating))),
  text: r.review_text,
  service: r.service_category ?? 'Platform Review',
});

export const TestimonialsCarousel: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [animating, setAnimating] = useState(false);
  const [displayItems, setDisplayItems] = useState<DisplayTestimonial[]>(testimonials);
  const [reviewStats, setReviewStats] = useState<ReviewStats>(defaultStats);
  const resumeTimerRef = useRef<number | null>(null);

  const fetchLiveReviews = useCallback(async () => {
    try {
      const res = await fetch(API_ENDPOINTS.reviews.public);
      const data = await res.json() as {
        success: boolean;
        reviews?: LiveReview[];
        stats?: Partial<ReviewStats>;
      };

      if (!data.success) return;

      if (Array.isArray(data.reviews) && data.reviews.length > 0) {
        setDisplayItems(data.reviews.map(toDisplayTestimonial));
        setCurrentIndex(0);
      }

      if (data.stats) {
        setReviewStats({
          total_reviews: Number(data.stats.total_reviews || defaultStats.total_reviews),
          average_rating: Number(data.stats.average_rating || defaultStats.average_rating),
          completed_jobs: Number(data.stats.completed_jobs || defaultStats.completed_jobs),
          satisfaction_rate: Number(data.stats.satisfaction_rate || defaultStats.satisfaction_rate),
        });
      }
    } catch {
      // keep static fallback
    }
  }, []);

  useEffect(() => {
    void fetchLiveReviews();
  }, [fetchLiveReviews]);

  useEffect(() => {
    if (!isAutoPlaying || displayItems.length <= 1) return;
    const interval = window.setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % displayItems.length);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [isAutoPlaying, displayItems.length]);

  useEffect(() => () => {
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
  }, []);

  const pauseAutoplay = () => {
    setIsAutoPlaying(false);
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = window.setTimeout(() => setIsAutoPlaying(true), 10000);
  };

  const goToSlide = (index: number) => {
    if (animating || index === currentIndex || displayItems.length <= 1) return;
    setAnimating(true);
    setCurrentIndex(index);
    pauseAutoplay();
    window.setTimeout(() => setAnimating(false), 400);
  };

  const nextSlide = () => goToSlide((currentIndex + 1) % displayItems.length);
  const prevSlide = () => goToSlide((currentIndex - 1 + displayItems.length) % displayItems.length);

  const t = displayItems[currentIndex] ?? displayItems[0];

  const stats = useMemo(() => ([
    {
      value: `${formatCompact(reviewStats.total_reviews)}+`,
      label: 'Verified reviews',
      detail: 'From real clients and pros',
      accent: 'from-sky-500/20 to-cyan-400/10',
      valueClass: 'text-sky-600 dark:text-sky-400',
    },
    {
      value: reviewStats.average_rating.toFixed(1),
      label: 'Average rating',
      detail: 'Platform-wide trust signal',
      accent: 'from-amber-400/20 to-orange-400/10',
      valueClass: 'text-amber-500 dark:text-amber-400',
    },
    {
      value: `${formatCompact(reviewStats.completed_jobs)}+`,
      label: 'Jobs completed',
      detail: 'Successful services delivered',
      accent: 'from-emerald-500/20 to-teal-400/10',
      valueClass: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      value: `${Math.min(100, Math.max(0, reviewStats.satisfaction_rate))}%`,
      label: '5-star satisfaction',
      detail: 'Share of top-rated reviews',
      accent: 'from-fuchsia-500/20 to-violet-400/10',
      valueClass: 'text-fuchsia-600 dark:text-fuchsia-400',
    },
  ]), [reviewStats]);

  if (!t) return null;

  return (
    <div className="relative">
      <div className="mb-6 px-1">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-bird-blue">
          Client Reviews
        </p>
        <h3 className="text-2xl font-black text-slate-900 md:text-3xl dark:text-slate-100">
          What customers say
        </h3>
      </div>

      <div className="relative overflow-hidden rounded-3xl bg-slate-900 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.18)] md:p-8">
        <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-bird-blue/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 h-40 w-40 rounded-full bg-bird-yellow/10 blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                {[...Array(t.rating)].map((_, i) => (
                  <svg key={i} className="h-4 w-4 fill-current text-amber-400" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>

              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {t.service}
              </span>
            </div>

            <div className="hidden items-center gap-2 sm:flex">
              <button
                onClick={prevSlide}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/70 transition hover:bg-white hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Previous testimonial"
                disabled={displayItems.length <= 1}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={nextSlide}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-900 transition hover:bg-bird-blue hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Next testimonial"
                disabled={displayItems.length <= 1}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          <blockquote
            className="min-h-[88px] text-lg leading-8 text-white/90 transition-opacity duration-300 md:text-xl"
            style={{ opacity: animating ? 0.35 : 1 }}
          >
            “{t.text}”
          </blockquote>

          <div className="mt-6 flex items-center justify-between gap-4 border-t border-white/10 pt-5">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 overflow-hidden rounded-full ring-2 ring-white/10">
                <img src={t.image} alt={t.name} className="h-full w-full object-cover" />
              </div>
              <div>
                <p className="text-sm font-bold text-white md:text-base">{t.name}</p>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-slate-400 md:text-sm">{t.role}</p>
                  {t.authorRole === 'worker' && (
                    <span className="rounded-full border border-bird-blue/30 bg-bird-blue/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-bird-blue">
                      Pro
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {displayItems.map((item, index) => (
                <button
                  key={item.id}
                  onClick={() => goToSlide(index)}
                  aria-label={`Go to testimonial ${index + 1}`}
                  className={`transition-all duration-300 ${
                    index === currentIndex
                      ? 'h-2 w-6 rounded-full bg-white'
                      : 'h-2 w-2 rounded-full bg-white/25 hover:bg-white/50'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2 sm:hidden">
            <button
              onClick={prevSlide}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/70 transition hover:bg-white hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Previous testimonial"
              disabled={displayItems.length <= 1}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={nextSlide}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-900 transition hover:bg-bird-blue hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next testimonial"
              disabled={displayItems.length <= 1}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-white/10 dark:bg-slate-900/70"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{stat.label}</p>
            <p className={`mt-2 text-2xl font-black ${stat.valueClass}`}>{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
