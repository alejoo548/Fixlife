import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const AVATAR_COLORS = ['#0090ff', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444'];

const buildAvatarUri = (name: string, index: number): string => {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const bg = AVATAR_COLORS[index % AVATAR_COLORS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="16" fill="${bg}"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#fff" font-family="Inter,system-ui,sans-serif" font-weight="700" font-size="28">${initials}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const testimonials = [
  {
    id: 1,
    name: "Sarah Mitchell",
    role: "Homeowner",
    image: buildAvatarUri("Sarah Mitchell", 0),
    rating: 5,
    text: "Fixlife connected me with an amazing plumber who fixed my leak in under an hour. The whole process was seamless and professional. Highly recommend!",
    service: "Plumbing"
  },
  {
    id: 2,
    name: "Michael Chen",
    role: "Business Owner",
    image: buildAvatarUri("Michael Chen", 1),
    rating: 5,
    text: "I needed urgent electrical work done at my office. The electrician arrived within 30 minutes and solved the issue quickly. Outstanding service!",
    service: "Electrical"
  },
  {
    id: 3,
    name: "Emily Rodriguez",
    role: "Property Manager",
    image: buildAvatarUri("Emily Rodriguez", 2),
    rating: 5,
    text: "Managing multiple properties means I need reliable professionals. Fixlife has become my go-to platform for all maintenance needs. Simply the best!",
    service: "Multiple Services"
  },
  {
    id: 4,
    name: "David Thompson",
    role: "Homeowner",
    image: buildAvatarUri("David Thompson", 3),
    rating: 5,
    text: "The transparency in pricing and the quality of work exceeded my expectations. I've used Fixlife three times now and will continue to do so.",
    service: "Carpentry"
  },
  {
    id: 5,
    name: "Jessica Park",
    role: "Apartment Resident",
    image: buildAvatarUri("Jessica Park", 4),
    rating: 5,
    text: "Fast, affordable, and trustworthy. The professional was courteous and cleaned up after the job. This is how home services should be!",
    service: "Cleaning"
  }
];

export const TestimonialsCarousel: React.FC = () => {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const translatedTestimonials = t('testimonials.items', { returnObjects: true }) as Array<{
    role: string;
    text: string;
    service: string;
  }>;

  useEffect(() => {
    if (!isAutoPlaying) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % testimonials.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [isAutoPlaying]);

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 10000);
  };

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % testimonials.length);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 10000);
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 10000);
  };

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-6 px-2">
        <div>
          <h3 className="text-2xl font-black text-gray-900 flex items-center gap-4">
            <span className="w-1.5 h-8 rounded-full bg-bird-yellow shadow-[0_0_15px_rgba(255,194,14,0.4)]"></span>
            {t('testimonials.title')}
          </h3>
          <p className="text-gray-600 mt-2 ml-6 text-sm font-medium">{t('testimonials.subtitle')}</p>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-3xl bg-white/80 backdrop-blur-xl border border-gray-200/50 shadow-2xl p-5 md:p-8">
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
          <div className="absolute -top-20 -right-20 w-60 h-60 bg-bird-blue/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-bird-yellow/10 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10">
          <div className="flex items-start gap-4 md:gap-6 mb-5">
            <div className="relative shrink-0">
              <div className="w-14 h-14 md:w-18 md:h-18 rounded-2xl overflow-hidden border-4 border-white shadow-xl">
                <img
                  src={testimonials[currentIndex].image}
                  alt={testimonials[currentIndex].name}
                  onError={(e) => {
                    const fallback = '/mascot.webp';
                    if (e.currentTarget.dataset.fallbackApplied === 'true') {
                      e.currentTarget.removeAttribute('src');
                      return;
                    }
                    e.currentTarget.dataset.fallbackApplied = 'true';
                    e.currentTarget.src = fallback;
                  }}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-bird-blue rounded-full flex items-center justify-center shadow-lg border-2 border-white">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
                </svg>
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="min-w-0">
                  <h4 className="text-base md:text-lg font-bold text-gray-900 truncate">{testimonials[currentIndex].name}</h4>
                  <p className="text-sm text-gray-600 font-medium">{translatedTestimonials[currentIndex]?.role || testimonials[currentIndex].role}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  {[...Array(testimonials[currentIndex].rating)].map((_, i) => (
                    <svg key={i} className="w-5 h-5 text-bird-yellow fill-current" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
              </div>

              <p className="text-gray-700 text-sm md:text-base leading-relaxed mb-3 font-medium">
                "{translatedTestimonials[currentIndex]?.text || testimonials[currentIndex].text}"
              </p>

              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 border border-gray-200">
                <svg className="w-4 h-4 text-bird-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">{translatedTestimonials[currentIndex]?.service || testimonials[currentIndex].service}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-6 border-t border-gray-200">
            <div className="flex gap-2">
              {testimonials.map((_, index) => (
                <button
                  key={index}
                  onClick={() => goToSlide(index)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    index === currentIndex
                      ? 'w-8 bg-bird-blue'
                      : 'w-2 bg-gray-300 hover:bg-gray-400'
                  }`}
                  aria-label={t('testimonials.a11y.goTo', { index: index + 1 })}
                />
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={prevSlide}
                className="w-10 h-10 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-700 hover:bg-bird-blue hover:text-white hover:border-bird-blue transition-all shadow-sm"
                aria-label={t('testimonials.a11y.previous')}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={nextSlide}
                className="w-10 h-10 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-700 hover:bg-bird-blue hover:text-white hover:border-bird-blue transition-all shadow-sm"
                aria-label={t('testimonials.a11y.next')}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-3 md:p-4 text-center shadow-sm hover:shadow-lg transition-shadow">
          <div className="text-2xl md:text-3xl font-black text-bird-blue mb-0.5">2.4k+</div>
          <div className="text-xs md:text-sm text-gray-600 font-medium">{t('testimonials.stats.happyCustomers')}</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-3 md:p-4 text-center shadow-sm hover:shadow-lg transition-shadow">
          <div className="text-2xl md:text-3xl font-black text-bird-yellow mb-0.5">4.9</div>
          <div className="text-xs md:text-sm text-gray-600 font-medium">{t('testimonials.stats.averageRating')}</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-3 md:p-4 text-center shadow-sm hover:shadow-lg transition-shadow">
          <div className="text-2xl md:text-3xl font-black text-bird-orange mb-0.5">15k+</div>
          <div className="text-xs md:text-sm text-gray-600 font-medium">{t('testimonials.stats.jobsCompleted')}</div>
        </div>
        <div className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-3 md:p-4 text-center shadow-sm hover:shadow-lg transition-shadow">
          <div className="text-2xl md:text-3xl font-black text-bird-blue mb-0.5">98%</div>
          <div className="text-xs md:text-sm text-gray-600 font-medium">{t('testimonials.stats.satisfactionRate')}</div>
        </div>
      </div>
    </div>
  );
};
