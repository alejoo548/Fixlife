import { API_URL } from '../config/api';

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

export const getHeroSlides = (): HeroSlideContent[] => {
  try {
    const raw = localStorage.getItem(HERO_SLIDES_STORAGE_KEY);
    if (!raw) return DEFAULT_HERO_SLIDES;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_HERO_SLIDES;
    if (!parsed.every(isSlideShape)) return DEFAULT_HERO_SLIDES;
    return parsed;
  } catch {
    return DEFAULT_HERO_SLIDES;
  }
};

const setHeroSlidesCache = (slides: HeroSlideContent[]) => {
  localStorage.setItem(HERO_SLIDES_STORAGE_KEY, JSON.stringify(slides));
  window.dispatchEvent(new Event(HERO_SLIDES_UPDATED_EVENT));
};

export const fetchHeroSlides = async (): Promise<HeroSlideContent[]> => {
  try {
    const response = await fetch(`${API_URL}/api/admin/hero-slides`);
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || 'Could not fetch hero slides.');
    const slides = Array.isArray(data?.slides) ? data.slides : [];
    if (slides.length === 0) return getHeroSlides();
    setHeroSlidesCache(slides);
    return slides;
  } catch {
    return getHeroSlides();
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
  setHeroSlidesCache(nextSlides);
  return nextSlides;
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

  const nextSlides = Array.isArray(data?.slides) ? data.slides : getHeroSlides();
  setHeroSlidesCache(nextSlides);
  return nextSlides;
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
  localStorage.removeItem(HERO_SLIDES_STORAGE_KEY);
  window.dispatchEvent(new Event(HERO_SLIDES_UPDATED_EVENT));
};
