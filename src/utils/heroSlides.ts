import { API_URL } from '../config/api';
import { isExternalStockImage, normalizeImageUrl } from './imageUrls';

export interface HeroSlideContent {
  id: number;
  image: string;
  tag: string;
  title: string;
  description: string;
  cta: string;
}

export const HERO_SLIDES_STORAGE_KEY = 'fixlife_hero_slides_v1';
export const HERO_SLIDES_UPDATED_EVENT = 'fixlife:hero-slides-updated';

type HeroSlideLang = 'en' | 'es';

const storageKeyForLang = (lang: HeroSlideLang) => `${HERO_SLIDES_STORAGE_KEY}_${lang}`;

export const DEFAULT_HERO_SLIDES: HeroSlideContent[] = [
  {
    id: 1,
    image:
      'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?q=80&w=2070&auto=format&fit=crop',
    tag: 'PREMIUM',
    title: 'Home Experts',
    description:
      'Find certified electricians, plumbers, and technicians ready to solve any problem.',
    cta: 'Find Technician',
  },
  {
    id: 2,
    image:
      'https://images.unsplash.com/photo-1503387762-592deb58ef4e?q=80&w=2070&auto=format&fit=crop',
    tag: 'RENOVATION',
    title: 'Transform Your Space',
    description:
      'From a fresh coat of paint to complete remodels. Make your dream home a reality.',
    cta: 'Get a Quote',
  },
  {
    id: 3,
    image:
      'https://images.unsplash.com/photo-1556911220-bff31c812dba?q=80&w=2668&auto=format&fit=crop',
    tag: 'CLEANING',
    title: 'Spotless Homes',
    description:
      'Deep cleaning and regular maintenance services so you can enjoy your free time.',
    cta: 'Book Cleaning',
  },
];

const normalizeHeroSlideImage = (slide: HeroSlideContent): HeroSlideContent => {
  const image = normalizeImageUrl(slide.image);
  const defaultSlide = DEFAULT_HERO_SLIDES.find((item) => item.id === slide.id);
  const label = `${slide.tag} ${slide.title}`.toLowerCase();
  const localFallback = label.includes('renovation') || label.includes('repair')
    ? '/landing-renovation.jpg'
    : label.includes('clean')
      ? '/landing-home-repair.jpg'
      : '/landing-home-repair.jpg';

  if (!image || image.startsWith('/service-')) {
    return {
      ...slide,
      image: defaultSlide?.image || localFallback,
    };
  }

  if (isExternalStockImage(image)) {
    return {
      ...slide,
      image: localFallback,
    };
  }

  return {
    ...slide,
    image,
  };
};

const isSlideShape = (slide: any): slide is HeroSlideContent => {
  return (
    slide &&
    typeof slide.id === 'number' &&
    typeof slide.image === 'string' &&
    typeof slide.tag === 'string' &&
    typeof slide.title === 'string' &&
    typeof slide.description === 'string' &&
    typeof slide.cta === 'string'
  );
};

export const getHeroSlides = (lang: HeroSlideLang = 'en'): HeroSlideContent[] => {
  try {
    const raw = localStorage.getItem(storageKeyForLang(lang));
    if (!raw) return DEFAULT_HERO_SLIDES;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_HERO_SLIDES;
    if (!parsed.every(isSlideShape)) return DEFAULT_HERO_SLIDES;
    return parsed.map(normalizeHeroSlideImage);
  } catch {
    return DEFAULT_HERO_SLIDES;
  }
};

const setHeroSlidesCache = (slides: HeroSlideContent[], lang: HeroSlideLang) => {
  localStorage.setItem(storageKeyForLang(lang), JSON.stringify(slides));
  window.dispatchEvent(new Event(HERO_SLIDES_UPDATED_EVENT));
};

const lastHeroFetchByLang: Partial<Record<HeroSlideLang, number>> = {};
const HERO_FETCH_THROTTLE = 30000; // 30s to avoid repeated calls in logs/remounts

export const fetchHeroSlides = async (lang: HeroSlideLang = 'en'): Promise<HeroSlideContent[]> => {
  const now = Date.now();
  const cached = getHeroSlides(lang);

  // Use cache if recently fetched to reduce network spam
  if (now - (lastHeroFetchByLang[lang] || 0) < HERO_FETCH_THROTTLE && cached.length > 0) {
    return cached;
  }

  try {
    lastHeroFetchByLang[lang] = now;
    const response = await fetch(`${API_URL}/api/admin/hero-slides?lang=${lang}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || 'Could not fetch hero slides.');
    const slides = Array.isArray(data?.slides) ? data.slides : [];
    if (slides.length === 0) return getHeroSlides(lang);
    const normalizedSlides = slides.map(normalizeHeroSlideImage);
    setHeroSlidesCache(normalizedSlides, lang);
    return normalizedSlides;
  } catch {
    return cached.length > 0 ? cached : getHeroSlides(lang);
  }
};

export const saveHeroSlides = async (
  slides: HeroSlideContent[],
  token: string
): Promise<HeroSlideContent[]> => {
  const response = await fetch(`${API_URL}/api/admin/hero-slides`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ slides }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || 'Could not save hero slides.');

  const nextSlides = Array.isArray(data?.slides) ? data.slides : slides;
  const normalizedSlides = nextSlides.map(normalizeHeroSlideImage);
  setHeroSlidesCache(normalizedSlides, 'en');
  return normalizedSlides;
};

export const uploadHeroSlideImage = async (
  slideId: number,
  file: File,
  token: string
): Promise<HeroSlideContent[]> => {
  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch(`${API_URL}/api/admin/hero-slides/${slideId}/image`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || 'Could not upload image.');

  const nextSlides = Array.isArray(data?.slides) ? data.slides : getHeroSlides('en');
  const normalizedSlides = nextSlides.map(normalizeHeroSlideImage);
  setHeroSlidesCache(normalizedSlides, 'en');
  return normalizedSlides;
};

export const uploadHeroImageAsset = async (file: File, token: string): Promise<string> => {
  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch(`${API_URL}/api/admin/hero-slides/image-upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || 'Could not upload image.');
  if (typeof data?.image !== 'string' || !data.image.trim()) {
    throw new Error('Upload succeeded but image URL is missing.');
  }
  return data.image;
};

export const resetHeroSlides = () => {
  localStorage.removeItem(storageKeyForLang('en'));
  localStorage.removeItem(storageKeyForLang('es'));
  window.dispatchEvent(new Event(HERO_SLIDES_UPDATED_EVENT));
};
