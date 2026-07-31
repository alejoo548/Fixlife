import type { TFunction } from 'i18next';

const normalizeValue = (value: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

type ServiceTranslation = {
  name: { en: string; es: string };
  description?: { en: string; es: string };
};

const SERVICE_TRANSLATIONS: ServiceTranslation[] = [
  {
    name: { en: 'AC Installation & Repair', es: 'Instalación y reparación de aire acondicionado' },
    description: {
      en: 'Air conditioner setup, maintenance, and cooling fixes.',
      es: 'Instalación, mantenimiento y reparación de aire acondicionado.',
    },
  },
  {
    name: { en: 'Appliance Repair', es: 'Reparación de electrodomésticos' },
    description: {
      en: 'Repair of washers, dryers, stoves, and home appliances.',
      es: 'Reparación de lavadoras, secadoras, estufas y electrodomésticos del hogar.',
    },
  },
  {
    name: { en: 'Auto Mechanic', es: 'Mecánica automotriz' },
    description: {
      en: 'Vehicle diagnostics, maintenance, and mechanical repairs.',
      es: 'Diagnóstico vehicular, mantenimiento y reparaciones mecánicas.',
    },
  },
  {
    name: { en: 'Carpentry', es: 'Carpintería' },
    description: {
      en: 'Custom woodwork, furniture repair, and door/window installations.',
      es: 'Trabajos en madera a medida, reparación de muebles e instalaciones de puertas y ventanas.',
    },
  },
  {
    name: { en: 'Childcare / Babysitting', es: 'Cuidado de niños / Niñera' },
    description: {
      en: 'Safe and reliable care for children at home.',
      es: 'Cuidado seguro y confiable para niños en casa.',
    },
  },
  {
    name: { en: 'Computer Technician', es: 'Técnico en computadoras' },
    description: {
      en: 'PC troubleshooting, software setup, and hardware repair.',
      es: 'Diagnóstico de PC, instalación de software y reparación de hardware.',
    },
  },
  {
    name: { en: 'Drywall Installation', es: 'Instalación de drywall' },
    description: {
      en: 'Drywall mounting, patching, and wall finishing.',
      es: 'Instalación de drywall, reparación de paredes y acabados.',
    },
  },
  {
    name: { en: 'Elderly Care', es: 'Cuidado de adultos mayores' },
    description: {
      en: 'Companion and basic support care for seniors.',
      es: 'Compañía y apoyo básico para adultos mayores.',
    },
  },
  {
    name: { en: 'Electrical Services', es: 'Servicios eléctricos' },
    description: {
      en: 'Wiring, outlets, lighting, and electrical troubleshooting.',
      es: 'Cableado, tomacorrientes, iluminación y diagnóstico eléctrico.',
    },
  },
  { name: { en: 'Electrical', es: 'Electricidad' } },
  {
    name: { en: 'Gardening', es: 'Jardinería' },
    description: {
      en: 'Lawn care, pruning, planting, and garden maintenance.',
      es: 'Corte de césped, poda, siembra y mantenimiento de jardines.',
    },
  },
  {
    name: { en: 'Home Cleaning', es: 'Limpieza del hogar' },
    description: {
      en: 'Deep cleaning and regular housekeeping services.',
      es: 'Limpieza profunda y servicios regulares para el hogar.',
    },
  },
  {
    name: { en: 'House Painting', es: 'Pintura de casas' },
    description: {
      en: 'Interior and exterior painting with professional finishing.',
      es: 'Pintura interior y exterior con acabados profesionales.',
    },
  },
  { name: { en: 'Landscaping', es: 'Jardinería' } },
  {
    name: { en: 'Locksmith Services', es: 'Servicios de cerrajería' },
    description: {
      en: 'Lock installation, key duplication, and emergency unlocking.',
      es: 'Instalación de cerraduras, duplicado de llaves y aperturas de emergencia.',
    },
  },
  {
    name: { en: 'Masonry', es: 'Mampostería' },
    description: {
      en: 'Brickwork, concrete repairs, and structural improvements.',
      es: 'Trabajos en ladrillo, reparaciones de concreto y mejoras estructurales.',
    },
  },
  { name: { en: 'Mechanics', es: 'Mecánica' } },
  {
    name: { en: 'Plumbing', es: 'Plomería' },
    description: {
      en: 'Leak repairs, pipe installation, and drain unclogging.',
      es: 'Reparación de fugas, instalación de tuberías y destape de drenajes.',
    },
  },
  {
    name: { en: 'Refrigeration Repair', es: 'Reparación de refrigeración' },
    description: {
      en: 'Repair and maintenance for refrigerators and cooling systems.',
      es: 'Reparación y mantenimiento de refrigeradoras y sistemas de enfriamiento.',
    },
  },
  {
    name: { en: 'Security Camera Installation', es: 'Instalación de cámaras de seguridad' },
    description: {
      en: 'CCTV setup, configuration, and basic monitoring guidance.',
      es: 'Instalación de CCTV, configuración y guía básica de monitoreo.',
    },
  },
  {
    name: { en: 'Welding', es: 'Soldadura' },
    description: {
      en: 'Metal fabrication, repairs, and custom welding jobs.',
      es: 'Fabricación metálica, reparaciones y trabajos de soldadura personalizada.',
    },
  },
  { name: { en: 'Cleaning', es: 'Limpieza' } },
  {
    name: { en: 'House Painting Alt', es: 'Pintura de casas' },
    description: {
      en: 'Interior and exterior painting with clean, professional finishing.',
      es: 'Pintura interior y exterior con acabados profesionales.',
    },
  },
  {
    name: { en: 'Gardening Alt', es: 'Jardinería' },
    description: {
      en: 'Lawn care, planting, pruning, and garden maintenance.',
      es: 'Corte de césped, siembra, poda y mantenimiento de jardines.',
    },
  },
  {
    name: { en: 'Expert Plumbing', es: 'Plomería' },
    description: {
      en: 'Leak repairs, pipe installation, and sanitary maintenance.',
      es: 'Reparación de fugas, instalación de tuberías y mantenimiento sanitario.',
    },
  },
  {
    name: { en: 'Auto Mechanics', es: 'Mecánica automotriz' },
    description: {
      en: 'Vehicle diagnostics, oil changes, and mobile repairs.',
      es: 'Diagnóstico vehicular, cambios de aceite y reparaciones a domicilio.',
    },
  },
  {
    name: { en: 'Electrical Fallback', es: 'Electricidad' },
    description: {
      en: 'Safe installations, wiring, panels, and short circuit repairs.',
      es: 'Instalaciones seguras, cableado, paneles y reparación de cortocircuitos.',
    },
  },
  {
    name: { en: 'Carpentry Fallback', es: 'Carpintería' },
    description: {
      en: 'Furniture design, door repair, and structure assembly.',
      es: 'Diseño de muebles, reparación de puertas y ensamblaje de estructuras.',
    },
  },
];

const findServiceTranslation = (value: string) => {
  const normalized = normalizeValue(value);
  if (!normalized) return null;

  return (
    SERVICE_TRANSLATIONS.find((entry) => {
      const normalizedEn = normalizeValue(entry.name.en);
      const normalizedEs = normalizeValue(entry.name.es);
      const descriptionEn = normalizeValue(entry.description?.en || '');
      const descriptionEs = normalizeValue(entry.description?.es || '');

      return [normalizedEn, normalizedEs, descriptionEn, descriptionEs]
        .filter(Boolean)
        .includes(normalized);
    }) || null
  );
};

export const localizeClientServiceName = (value: string, language: string) => {
  const match = findServiceTranslation(value);
  if (!match) return value;
  return language.startsWith('es') ? match.name.es : match.name.en;
};

export const localizeClientServiceDescription = (value: string, language: string) => {
  const match = findServiceTranslation(value);
  if (!match?.description) return value;
  return language.startsWith('es') ? match.description.es : match.description.en;
};

export const localizeExperienceLabel = (value: string | null | undefined, language: string) => {
  const raw = String(value || '').trim();
  const isSpanish = language.startsWith('es');
  if (!raw) return isSpanish ? 'Experiencia no disponible' : 'Experience not available';

  const normalized = normalizeValue(raw);
  if (normalized === 'experience not available') {
    return isSpanish ? 'Experiencia no disponible' : 'Experience not available';
  }
  if (normalized === 'less than 1 year') {
    return isSpanish ? 'Menos de 1 año' : 'Less than 1 year';
  }

  const yearMatch = normalized.match(/^(\d+)\s*year[s]?$/) || normalized.match(/^(\d+)\s*years?$/);
  if (yearMatch) {
    const years = Number(yearMatch[1]);
    return isSpanish ? `${years}+ año${years === 1 ? '' : 's'}` : `${years}+ year${years === 1 ? '' : 's'}`;
  }

  return raw;
};

export const localizeClientLearnMore = (t: TFunction) => t('landing.fallbacks.0.ctaLabel');
