import { API_URL } from '../config/api';
import i18n from '../i18n';
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

const HERO_DEFAULT_IMAGES = [
  'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?q=80&w=2070&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1503387762-592deb58ef4e?q=80&w=2070&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1556911220-bff31c812dba?q=80&w=2668&auto=format&fit=crop',
];

const HERO_DEFAULT_ENGLISH_CONTENT = [
  {
    tag: 'PREMIUM',
    title: 'Home Experts',
    description: 'Find certified electricians, plumbers, and technicians ready to solve any problem.',
    cta: 'Find Technician',
  },
  {
    tag: 'RENOVATION',
    title: 'Transform Your Space',
    description: 'From a fresh coat of paint to complete remodels. Make your dream home a reality.',
    cta: 'Get a Quote',
  },
  {
    tag: 'CLEANING',
    title: 'Spotless Homes',
    description: 'Deep cleaning and regular maintenance services so you can enjoy your free time.',
    cta: 'Book Cleaning',
  },
] as const;

const HERO_ENGLISH_VARIANTS = [
  {
    tag: 'HOME REPAIRS AND MAINTENANCE',
    title: 'Home repairs and maintenance',
    description: 'Deep repairing and regular maintenance services so you can enjoy your free time.',
    cta: 'Book repair',
    translations: {
      en: {
        tag: 'HOME REPAIRS AND MAINTENANCE',
        title: 'Home repairs and maintenance',
        description: 'Deep repairing and regular maintenance services so you can enjoy your free time.',
        cta: 'Book repair',
      },
      es: {
        tag: 'REPARACIONES Y MANTENIMIENTO DEL HOGAR',
        title: 'Reparaciones y mantenimiento del hogar',
        description: 'Servicios de reparacion profunda y mantenimiento regular para que disfrutes tu tiempo libre.',
        cta: 'Reservar reparacion',
      },
    },
  },
] as const;

const normalizeSlideText = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

const repairMojibake = (value: string) =>
  value
    .replace(/Ã¡/g, 'a')
    .replace(/Ã©/g, 'e')
    .replace(/Ã­/g, 'i')
    .replace(/Ã³/g, 'o')
    .replace(/Ãº/g, 'u')
    .replace(/Ã±/g, 'n');

export const getDefaultHeroSlides = (): HeroSlideContent[] => {
  const translatedSlides = i18n.t('heroSlides.items', { returnObjects: true }) as Array<{
    tag: string;
    title: string;
    description: string;
    cta: string;
  }>;

  return HERO_DEFAULT_IMAGES.map((image, index) => ({
    id: index + 1,
    image,
    tag: translatedSlides[index]?.tag || '',
    title: translatedSlides[index]?.title || '',
    description: translatedSlides[index]?.description || '',
    cta: translatedSlides[index]?.cta || '',
  }));
};

export const DEFAULT_HERO_SLIDES: HeroSlideContent[] = getDefaultHeroSlides();

const localizeDefaultHeroText = (slide: HeroSlideContent): HeroSlideContent => {
  const sanitizedSlide = {
    ...slide,
    tag: repairMojibake(slide.tag),
    title: repairMojibake(slide.title),
    description: repairMojibake(slide.description),
    cta: repairMojibake(slide.cta),
  };

  const matchedEnglishIndex = HERO_DEFAULT_ENGLISH_CONTENT.findIndex((item, index) => {
    const sameId = index + 1 === sanitizedSlide.id;
    const matchesTitle = normalizeSlideText(item.title) === normalizeSlideText(sanitizedSlide.title);
    const matchesDescription = normalizeSlideText(item.description) === normalizeSlideText(sanitizedSlide.description);
    const matchesCta = normalizeSlideText(item.cta) === normalizeSlideText(sanitizedSlide.cta);
    const matchesTag = normalizeSlideText(item.tag) === normalizeSlideText(sanitizedSlide.tag);

    return matchesTitle || (matchesDescription && matchesCta) || (sameId && matchesTag && (matchesTitle || matchesDescription || matchesCta));
  });

  if (matchedEnglishIndex === -1) {
    const matchedVariant = HERO_ENGLISH_VARIANTS.find((item) =>
      normalizeSlideText(item.title) === normalizeSlideText(sanitizedSlide.title) ||
      normalizeSlideText(item.translations.es.title) === normalizeSlideText(sanitizedSlide.title) ||
      normalizeSlideText(item.translations.es.description) === normalizeSlideText(sanitizedSlide.description) ||
      normalizeSlideText(item.translations.es.cta) === normalizeSlideText(sanitizedSlide.cta) ||
      (normalizeSlideText(item.description) === normalizeSlideText(sanitizedSlide.description) &&
        normalizeSlideText(item.cta) === normalizeSlideText(sanitizedSlide.cta))
    );

    if (!matchedVariant) {
      return sanitizedSlide;
    }

    const language = (i18n.resolvedLanguage || i18n.language || 'en').startsWith('es') ? 'es' : 'en';
    const variantTranslation = matchedVariant.translations[language];

    return {
      ...sanitizedSlide,
      tag: variantTranslation.tag,
      title: variantTranslation.title,
      description: variantTranslation.description,
      cta: variantTranslation.cta,
    };
  }

  const translatedDefault = getDefaultHeroSlides()[matchedEnglishIndex];
  if (!translatedDefault) {
    return slide;
  }

  return {
    ...sanitizedSlide,
    tag: translatedDefault.tag,
    title: translatedDefault.title,
    description: translatedDefault.description,
    cta: translatedDefault.cta,
  };
};

const normalizeHeroSlideImage = (slide: HeroSlideContent): HeroSlideContent => {
  const image = normalizeImageUrl(slide.image);
  const defaultSlide = getDefaultHeroSlides().find((item) => item.id === slide.id);
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

export const getHeroSlides = (): HeroSlideContent[] => {
  try {
    const raw = window.localStorage.getItem(HERO_SLIDES_STORAGE_KEY);
    if (!raw) return DEFAULT_HERO_SLIDES.map(normalizeHeroSlideImage).map(localizeDefaultHeroText);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_HERO_SLIDES.map(normalizeHeroSlideImage).map(localizeDefaultHeroText);
    const filtered = parsed.filter(isSlideShape).map(normalizeHeroSlideImage).map(localizeDefaultHeroText);
    return filtered.length > 0 ? filtered : DEFAULT_HERO_SLIDES.map(normalizeHeroSlideImage).map(localizeDefaultHeroText);
  } catch {
    return DEFAULT_HERO_SLIDES.map(normalizeHeroSlideImage).map(localizeDefaultHeroText);
  }
};

export async function fetchHeroSlides(): Promise<HeroSlideContent[]> {
  try {
    const response = await fetch(`${API_URL}/api/public/content/hero-slides`);
    const payload = await response.json();
    const slides = Array.isArray(payload?.slides) ? payload.slides : Array.isArray(payload) ? payload : [];
    const normalized = slides.filter(isSlideShape).map(normalizeHeroSlideImage).map(localizeDefaultHeroText);
    if (normalized.length > 0) {
      window.localStorage.setItem(HERO_SLIDES_STORAGE_KEY, JSON.stringify(normalized));
      window.dispatchEvent(new Event(HERO_SLIDES_UPDATED_EVENT));
      return normalized;
    }
  } catch {
    // Keep local fallback
  }
  return getHeroSlides();
}
