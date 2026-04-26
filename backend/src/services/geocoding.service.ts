type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const GEO_TEXT_CACHE_TTL_MS = 10 * 60 * 1000;
const GEO_SUGGEST_CACHE_TTL_MS = 2 * 60 * 1000;
const GEO_REVERSE_CACHE_TTL_MS = 10 * 60 * 1000;
const GEO_CACHE_MAX_ENTRIES = 250;
const geocodeTextCache = new Map<string, CacheEntry<{ lat: number; lng: number; label: string } | null>>();
const suggestLocationsCache = new Map<string, CacheEntry<LocationSuggestionResult[]>>();
const reverseGeocodeCache = new Map<string, CacheEntry<{ label: string; lat: number; lng: number } | null>>();
const inflightGeoRequests = new Map<string, Promise<unknown>>();

type SalvadorLocalPlace = {
  label: string;
  lat: number;
  lng: number;
  kind: 'municipio' | 'residencial' | 'colonia' | 'centro-comercial' | 'parque' | 'zona';
  aliases?: string[];
};

export type LocationSuggestionResult = {
  label: string;
  lat: number;
  lng: number;
  source: 'local' | 'nominatim';
  kind?: string;
  short_label?: string;
  context_label?: string;
};

const EL_SALVADOR_VIEWBOX = '-90.20,14.45,-87.65,13.10';
const EL_SALVADOR_FALLBACK_PLACES: SalvadorLocalPlace[] = [
  { label: 'San Salvador, San Salvador Centro, El Salvador', lat: 13.6929, lng: -89.2182, kind: 'municipio', aliases: ['san salvador centro', 'centro historico san salvador'] },
  { label: 'Mejicanos, San Salvador Centro, El Salvador', lat: 13.7406, lng: -89.2141, kind: 'municipio', aliases: ['mejicanos'] },
  { label: 'Ayutuxtepeque, San Salvador Centro, El Salvador', lat: 13.7466, lng: -89.2062, kind: 'municipio', aliases: ['ayutuxtepeque'] },
  { label: 'Cuscatancingo, San Salvador Centro, El Salvador', lat: 13.7361, lng: -89.1817, kind: 'municipio', aliases: ['cuscatancingo'] },
  { label: 'Ciudad Delgado, San Salvador Centro, El Salvador', lat: 13.7242, lng: -89.1701, kind: 'municipio', aliases: ['delgado', 'ciudad delgado'] },
  { label: 'Santa Tecla, La Libertad Sur, El Salvador', lat: 13.6769, lng: -89.2797, kind: 'municipio', aliases: ['santa tecla', 'la libertad sur'] },
  { label: 'Antiguo Cuscatlan, La Libertad Este, El Salvador', lat: 13.6649, lng: -89.2532, kind: 'municipio', aliases: ['antiguo cuscatlan', 'antiguo'] },
  { label: 'Nuevo Cuscatlan, La Libertad Este, El Salvador', lat: 13.6486, lng: -89.2659, kind: 'municipio', aliases: ['nuevo cuscatlan'] },
  { label: 'Ciudad Merliot, Santa Tecla, La Libertad Sur, El Salvador', lat: 13.6734, lng: -89.2899, kind: 'zona', aliases: ['merliot', 'ciudad merliot'] },
  { label: 'Residencial Santa Monica, Santa Tecla, La Libertad Sur, El Salvador', lat: 13.6841, lng: -89.2872, kind: 'residencial', aliases: ['residencial santa monica', 'santa monica santa tecla'] },
  { label: 'Residencial Cumbres de Cuscatlan, Antiguo Cuscatlan, La Libertad Este, El Salvador', lat: 13.6618, lng: -89.2474, kind: 'residencial', aliases: ['cumbres de cuscatlan', 'residencial cumbres de cuscatlan'] },
  { label: 'Residencial Santa Elena, Antiguo Cuscatlan, La Libertad Este, El Salvador', lat: 13.6519, lng: -89.2471, kind: 'residencial', aliases: ['santa elena', 'residencial santa elena'] },
  { label: 'Bosques de Santa Elena, Antiguo Cuscatlan, La Libertad Este, El Salvador', lat: 13.6537, lng: -89.2432, kind: 'residencial', aliases: ['bosques de santa elena'] },
  { label: 'Jardines de Guadalupe, Antiguo Cuscatlan, La Libertad Este, El Salvador', lat: 13.6641, lng: -89.2486, kind: 'colonia', aliases: ['jardines de guadalupe'] },
  { label: 'Madreselva, Antiguo Cuscatlan, La Libertad Este, El Salvador', lat: 13.6657, lng: -89.2459, kind: 'residencial', aliases: ['madreselva'] },
  { label: 'Parque Calle Ancha, Santa Tecla, La Libertad Sur, El Salvador', lat: 13.6812, lng: -89.2898, kind: 'parque', aliases: ['parque calle ancha', 'calle ancha santa tecla'] },
  { label: 'Paseo El Carmen, Santa Tecla, La Libertad Sur, El Salvador', lat: 13.6756, lng: -89.2818, kind: 'zona', aliases: ['paseo el carmen', 'el carmen santa tecla'] },
  { label: 'Parque El Cafetalon, Santa Tecla, La Libertad Sur, El Salvador', lat: 13.6799, lng: -89.2724, kind: 'parque', aliases: ['el cafetalon', 'parque el cafetalon'] },
  { label: 'Plaza Merliot, Santa Tecla, La Libertad Sur, El Salvador', lat: 13.6736, lng: -89.2892, kind: 'centro-comercial', aliases: ['plaza merliot', 'merliot plaza'] },
  { label: 'Plaza Volcan, Ciudad Merliot, La Libertad Sur, El Salvador', lat: 13.6751, lng: -89.2914, kind: 'centro-comercial', aliases: ['plaza volcan', 'centro comercial plaza volcan'] },
  { label: 'Condado Santa Rosa, Santa Tecla, La Libertad Sur, El Salvador', lat: 13.6698, lng: -89.2851, kind: 'residencial', aliases: ['condado santa rosa', 'santa rosa santa tecla'] },
  { label: 'Colonia Quezaltepec, Santa Tecla, La Libertad Sur, El Salvador', lat: 13.6778, lng: -89.2931, kind: 'colonia', aliases: ['quezaltepec', 'colonia quezaltepec'] },
  { label: 'Colonia Las Delicias, Santa Tecla, La Libertad Sur, El Salvador', lat: 13.6726, lng: -89.2867, kind: 'colonia', aliases: ['las delicias santa tecla', 'colonia las delicias'] },
  { label: 'Colonia Utila, Santa Tecla, La Libertad Sur, El Salvador', lat: 13.6803, lng: -89.2744, kind: 'colonia', aliases: ['colonia utila', 'utila santa tecla'] },
  { label: 'Colonia El Matazano, Santa Tecla, La Libertad Sur, El Salvador', lat: 13.6715, lng: -89.2748, kind: 'colonia', aliases: ['el matazano', 'colonia el matazano'] },
  { label: 'Multiplaza, Antiguo Cuscatlan, La Libertad Este, El Salvador', lat: 13.6743, lng: -89.2547, kind: 'centro-comercial', aliases: ['multiplaza', 'multiplaza el salvador'] },
  { label: 'La Gran Via, Antiguo Cuscatlan, La Libertad Este, El Salvador', lat: 13.6774, lng: -89.2521, kind: 'centro-comercial', aliases: ['gran via', 'la gran via'] },
  { label: 'Portal La Ribera, Antiguo Cuscatlan, La Libertad Este, El Salvador', lat: 13.6731, lng: -89.2495, kind: 'centro-comercial', aliases: ['portal la ribera', 'la ribera antiguo'] },
  { label: 'Universidad Centroamericana UCA, Antiguo Cuscatlan, La Libertad Este, El Salvador', lat: 13.6719, lng: -89.2539, kind: 'zona', aliases: ['uca', 'universidad centroamericana', 'uca antiguo cuscatlan'] },
  { label: 'Centro Comercial El Paseo, Escalon, San Salvador Centro, El Salvador', lat: 13.7051, lng: -89.2453, kind: 'centro-comercial', aliases: ['el paseo', 'centro comercial el paseo'] },
  { label: 'Galerias, Escalon, San Salvador Centro, El Salvador', lat: 13.7003, lng: -89.2487, kind: 'centro-comercial', aliases: ['galerias', 'galerias escalon'] },
  { label: 'Plaza Futura, Colonia Escalon, San Salvador Centro, El Salvador', lat: 13.7006, lng: -89.2408, kind: 'centro-comercial', aliases: ['plaza futura', 'torre futura'] },
  { label: 'Metrocentro San Salvador, San Salvador Centro, El Salvador', lat: 13.7076, lng: -89.2132, kind: 'centro-comercial', aliases: ['metrocentro', 'metrocentro san salvador'] },
  { label: 'Bambu City Center, San Benito, San Salvador Centro, El Salvador', lat: 13.6965, lng: -89.2364, kind: 'centro-comercial', aliases: ['bambu city center', 'bambu'] },
  { label: 'Zona Rosa, San Benito, San Salvador Centro, El Salvador', lat: 13.6961, lng: -89.2408, kind: 'zona', aliases: ['zona rosa', 'zona rosa san benito'] },
  { label: 'Colonia San Benito, San Salvador Centro, El Salvador', lat: 13.6968, lng: -89.2422, kind: 'colonia', aliases: ['san benito', 'colonia san benito'] },
  { label: 'Colonia Escalon, San Salvador Centro, El Salvador', lat: 13.7086, lng: -89.2418, kind: 'colonia', aliases: ['escalon', 'colonia escalon'] },
  { label: 'Colonia Escalon Norte, San Salvador Centro, El Salvador', lat: 13.7132, lng: -89.2495, kind: 'colonia', aliases: ['escalon norte'] },
  { label: 'Colonia Maquilishuat, San Salvador Centro, El Salvador', lat: 13.6994, lng: -89.2461, kind: 'colonia', aliases: ['maquilishuat', 'colonia maquilishuat'] },
  { label: 'Colonia Campestre, San Salvador Centro, El Salvador', lat: 13.686, lng: -89.2469, kind: 'colonia', aliases: ['campestre', 'colonia campestre'] },
  { label: 'Colonia Flor Blanca, San Salvador Centro, El Salvador', lat: 13.7034, lng: -89.2196, kind: 'colonia', aliases: ['flor blanca', 'colonia flor blanca'] },
  { label: 'Colonia Miramonte, San Salvador Centro, El Salvador', lat: 13.7078, lng: -89.2063, kind: 'colonia', aliases: ['miramonte', 'colonia miramonte'] },
  { label: 'Colonia San Francisco, San Salvador Centro, El Salvador', lat: 13.6884, lng: -89.2308, kind: 'colonia', aliases: ['san francisco san salvador', 'colonia san francisco'] },
  { label: 'Colonia Medica, San Salvador Centro, El Salvador', lat: 13.7091, lng: -89.2088, kind: 'colonia', aliases: ['colonia medica', 'medica'] },
  { label: 'Colonia La Mascota, San Salvador Centro, El Salvador', lat: 13.6908, lng: -89.2419, kind: 'colonia', aliases: ['la mascota', 'colonia la mascota'] },
  { label: 'Colonia San Luis, San Salvador Centro, El Salvador', lat: 13.6851, lng: -89.2221, kind: 'colonia', aliases: ['san luis', 'colonia san luis'] },
  { label: 'Monserrat, San Salvador Centro, El Salvador', lat: 13.6784, lng: -89.2101, kind: 'colonia', aliases: ['monserrat', 'colonia monserrat'] },
  { label: 'Soyapango, San Salvador Este, El Salvador', lat: 13.7102, lng: -89.1399, kind: 'municipio', aliases: ['soyapango'] },
  { label: 'Ilopango, San Salvador Este, El Salvador', lat: 13.7016, lng: -89.1074, kind: 'municipio', aliases: ['ilopango'] },
  { label: 'Plaza Mundo Soyapango, San Salvador Este, El Salvador', lat: 13.7002, lng: -89.1502, kind: 'centro-comercial', aliases: ['plaza mundo soyapango', 'plaza mundo'] },
  { label: 'Apopa, San Salvador Oeste, El Salvador', lat: 13.8072, lng: -89.1795, kind: 'municipio', aliases: ['apopa'] },
  { label: 'Plaza Mundo Apopa, San Salvador Oeste, El Salvador', lat: 13.7974, lng: -89.1762, kind: 'centro-comercial', aliases: ['plaza mundo apopa'] },
  { label: 'San Marcos, San Salvador Sur, El Salvador', lat: 13.6583, lng: -89.1833, kind: 'municipio', aliases: ['san marcos'] },
  { label: 'Santo Tomas, San Salvador Sur, El Salvador', lat: 13.64, lng: -89.1337, kind: 'municipio', aliases: ['santo tomas'] },
  { label: 'Panchimalco, San Salvador Sur, El Salvador', lat: 13.6127, lng: -89.1812, kind: 'municipio', aliases: ['panchimalco'] },
  { label: 'Lourdes Colon, La Libertad Oeste, El Salvador', lat: 13.7781, lng: -89.3565, kind: 'zona', aliases: ['lourdes colon', 'lourdes'] },
  { label: 'Colon, La Libertad Oeste, El Salvador', lat: 13.7178, lng: -89.3631, kind: 'municipio', aliases: ['colon la libertad', 'colon'] },
  { label: 'Ciudad Arce, La Libertad Oeste, El Salvador', lat: 13.8403, lng: -89.4472, kind: 'municipio', aliases: ['ciudad arce'] },
  { label: 'San Juan Opico, La Libertad Oeste, El Salvador', lat: 13.8761, lng: -89.3594, kind: 'municipio', aliases: ['opico', 'san juan opico'] },
  { label: 'Santa Ana, Santa Ana Centro, El Salvador', lat: 13.9942, lng: -89.5597, kind: 'municipio', aliases: ['santa ana'] },
  { label: 'Metrocentro Santa Ana, Santa Ana Centro, El Salvador', lat: 13.9891, lng: -89.5521, kind: 'centro-comercial', aliases: ['metrocentro santa ana'] },
  { label: 'Sonsonate, Sonsonate Centro, El Salvador', lat: 13.7189, lng: -89.7242, kind: 'municipio', aliases: ['sonsonate'] },
  { label: 'Ahuachapan, Ahuachapan Centro, El Salvador', lat: 13.9214, lng: -89.845, kind: 'municipio', aliases: ['ahuachapan'] },
  { label: 'San Miguel, San Miguel Centro, El Salvador', lat: 13.4833, lng: -88.1833, kind: 'municipio', aliases: ['san miguel'] },
  { label: 'Metrocentro San Miguel, San Miguel Centro, El Salvador', lat: 13.4762, lng: -88.1772, kind: 'centro-comercial', aliases: ['metrocentro san miguel'] },
  { label: 'Usulutan, Usulutan Este, El Salvador', lat: 13.35, lng: -88.45, kind: 'municipio', aliases: ['usulutan'] },
  { label: 'Zacatecoluca, La Paz Este, El Salvador', lat: 13.5, lng: -88.8686, kind: 'municipio', aliases: ['zacatecoluca'] },
  { label: 'San Vicente, San Vicente Norte, El Salvador', lat: 13.64, lng: -88.785, kind: 'municipio', aliases: ['san vicente'] },
  { label: 'Cojutepeque, Cuscatlan Sur, El Salvador', lat: 13.7167, lng: -88.9333, kind: 'municipio', aliases: ['cojutepeque'] },
  { label: 'Chalatenango, Chalatenango Sur, El Salvador', lat: 14.0333, lng: -88.9333, kind: 'municipio', aliases: ['chalatenango'] },
  { label: 'La Libertad, La Libertad Costa, El Salvador', lat: 13.4883, lng: -89.3228, kind: 'municipio', aliases: ['la libertad puerto', 'puerto de la libertad'] },
  { label: 'Surf City El Tunco, Tamanique, La Libertad Costa, El Salvador', lat: 13.4948, lng: -89.3819, kind: 'zona', aliases: ['el tunco', 'surf city'] },
  { label: 'El Majahual, La Libertad Costa, El Salvador', lat: 13.4891, lng: -89.3994, kind: 'zona', aliases: ['el majahual'] },
  { label: 'Zaragoza, La Libertad Este, El Salvador', lat: 13.5894, lng: -89.2886, kind: 'municipio', aliases: ['zaragoza la libertad', 'zaragoza'] },
];

const parseCoordinateLocation = (value: string) => {
  const match = String(value || '')
    .trim()
    .match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);

  if (!match) return null;

  const lat = Number(match[1]);
  const lng = Number(match[2]);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return null;

  return {
    lat: Number(lat.toFixed(7)),
    lng: Number(lng.toFixed(7)),
    label: `${Number(lat.toFixed(7))}, ${Number(lng.toFixed(7))}`,
  };
};

const normalizeLocationText = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bresid\./g, 'residencial')
    .replace(/\bcol\./g, 'colonia')
    .replace(/\bav\./g, 'avenida')
    .replace(/\bblvd\./g, 'boulevard')
    .replace(/\s+/g, ' ')
    .trim();

const inferSuggestionKind = (label: string) => {
  const normalized = normalizeLocationText(label);
  if (!normalized) return 'municipio';
  if (normalized.includes('residencial')) return 'residencial';
  if (normalized.includes('colonia')) return 'colonia';
  if (
    normalized.includes('plaza ') ||
    normalized.includes('multiplaza') ||
    normalized.includes('mall') ||
    normalized.includes('centro comercial') ||
    normalized.includes('metrocentro') ||
    normalized.includes('gran via') ||
    normalized.includes('galerias')
  ) {
    return 'centro-comercial';
  }
  if (normalized.includes('parque')) return 'parque';
  if (
    normalized.includes('ciudad ') ||
    normalized.includes('zona ') ||
    normalized.includes('lourdes')
  ) {
    return 'zona';
  }
  return 'municipio';
};

const getSuggestionPresentation = (label: string) => {
  const parts = String(label || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => normalizeLocationText(part) !== 'el salvador');

  const shortLabel = (parts[0] || label || 'Lugar').slice(0, 90);
  const contextLabel = parts.slice(1, 3).join(' - ').slice(0, 120);

  return {
    short_label: shortLabel,
    context_label: contextLabel,
  };
};

const scoreSalvadorPlace = (
  query: string,
  place: { label: string; aliases?: string[]; kind?: string }
) => {
  const normalizedQuery = normalizeLocationText(query);
  const haystack = normalizeLocationText([place.label, ...(place.aliases || [])].join(' '));

  if (!normalizedQuery || !haystack.includes(normalizedQuery)) return -1;

  let score = 25;
  if (haystack.startsWith(normalizedQuery)) score += 40;
  if (normalizeLocationText(place.label).startsWith(normalizedQuery)) score += 35;
  if ((place.aliases || []).some((alias) => normalizeLocationText(alias).startsWith(normalizedQuery))) score += 20;
  if (haystack.includes('el salvador')) score += 8;
  if (haystack.includes('santa tecla')) score += 6;
  if (haystack.includes('san salvador')) score += 6;
  if (
    place.kind === 'residencial' ||
    place.kind === 'colonia' ||
    place.kind === 'centro-comercial'
  ) {
    score += 5;
  }
  score -= Math.max(0, normalizeLocationText(place.label).length - normalizedQuery.length) * 0.08;
  return score;
};

const searchLocalSalvadorPlaces = (query: string, limit = 6) => {
  return EL_SALVADOR_FALLBACK_PLACES
    .map((place) => ({ ...place, score: scoreSalvadorPlace(query, place) }))
    .filter((place) => place.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((place): LocationSuggestionResult => ({
      label: place.label,
      lat: Number(place.lat.toFixed(7)),
      lng: Number(place.lng.toFixed(7)),
      source: 'local',
      kind: place.kind,
      ...getSuggestionPresentation(place.label),
    }));
};

const fetchNominatimLocations = async (
  query: string,
  options?: {
    limit?: number;
    allowRegionalFallback?: boolean;
  }
) => {
  const normalized = String(query || '').trim();
  if (!normalized) return [];

  const queryVariants = Array.from(
    new Set(
      [normalized, /el salvador/i.test(normalized) ? '' : `${normalized}, El Salvador`].filter(
        Boolean
      )
    )
  );

  for (const variant of queryVariants) {
    const params = new URLSearchParams({
      format: 'jsonv2',
      limit: String(options?.limit ?? 5),
      addressdetails: '1',
      dedupe: '1',
      viewbox: EL_SALVADOR_VIEWBOX,
      bounded: '1',
      countrycodes: options?.allowRegionalFallback ? 'sv,gt' : 'sv',
      q: variant,
    });

    const nominatimAbort = new AbortController();
    const nominatimTimeout = setTimeout(() => nominatimAbort.abort(), 8000);
    let response: Response;
    try {
      response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: {
          'User-Agent': 'Fixlife/1.0 (backend geocoder)',
          'Accept-Language': 'es-SV,es,en',
        },
        signal: nominatimAbort.signal,
      });
    } finally {
      clearTimeout(nominatimTimeout);
    }

    if (!response.ok) {
      continue;
    }

    const payload = (await response.json()) as Array<{
      lat?: string;
      lon?: string;
      display_name?: string;
    }>;
    if (!Array.isArray(payload) || payload.length === 0) {
      continue;
    }

    return payload
      .map((item) => {
        const lat = item?.lat != null ? Number(item.lat) : NaN;
        const lng = item?.lon != null ? Number(item.lon) : NaN;
        const label = String(item?.display_name || '').trim();

        if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        return {
          label: label.slice(0, 255),
          lat: Number(lat.toFixed(7)),
          lng: Number(lng.toFixed(7)),
          source: 'nominatim' as const,
          kind: inferSuggestionKind(label),
          ...getSuggestionPresentation(label),
        };
      })
      .filter(Boolean) as LocationSuggestionResult[];
  }

  return [];
};

const mergeLocationSuggestions = (query: string, suggestions: LocationSuggestionResult[]) => {
  const seen = new Set<string>();
  const normalizedQuery = normalizeLocationText(query);

  return suggestions
    .map((item) => {
      const normalizedLabel = normalizeLocationText(item.label);
      let score = 0;

      if (item.source === 'local') score += 80;
      if (normalizedLabel.startsWith(normalizedQuery)) score += 30;
      if (normalizedLabel.includes(normalizedQuery)) score += 18;
      if (normalizedLabel.includes('el salvador')) score += 8;
      if (normalizedLabel.includes('santa tecla')) score += 5;
      if (normalizedLabel.includes('san salvador')) score += 5;
      score -= Math.max(0, normalizedLabel.length - normalizedQuery.length) * 0.05;

      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score)
    .filter((item) => {
      const key = `${item.label}|${item.lat.toFixed(5)}|${item.lng.toFixed(5)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6)
    .map(({ score, ...item }) => item);
};

const readCacheEntry = <T>(cache: Map<string, CacheEntry<T>>, key: string) => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry;
};

const writeCacheEntry = <T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number
) => {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });

  if (cache.size <= GEO_CACHE_MAX_ENTRIES) {
    return;
  }

  const now = Date.now();
  for (const [cacheKey, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(cacheKey);
    }
  }

  while (cache.size > GEO_CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
};

const rememberGeoResult = async <T>(options: {
  cache: Map<string, CacheEntry<T>>;
  cacheName: string;
  key: string;
  ttlMs: number;
  factory: () => Promise<T>;
}) => {
  const cached = readCacheEntry(options.cache, options.key);
  if (cached) {
    return cached.value;
  }

  const inflightKey = `${options.cacheName}:${options.key}`;
  const existing = inflightGeoRequests.get(inflightKey) as Promise<T> | undefined;
  if (existing) {
    return existing;
  }

  const pending = options
    .factory()
    .then((value) => {
      writeCacheEntry(options.cache, options.key, value, options.ttlMs);
      return value;
    })
    .finally(() => {
      inflightGeoRequests.delete(inflightKey);
    });

  inflightGeoRequests.set(inflightKey, pending as Promise<unknown>);
  return pending;
};

export const geocodeLocationText = async (query: string) => {
  const normalized = String(query || '').trim();
  if (!normalized) return null;
  const cacheKey = normalizeLocationText(normalized);

  return rememberGeoResult({
    cache: geocodeTextCache,
    cacheName: 'geocode-text',
    key: cacheKey,
    ttlMs: GEO_TEXT_CACHE_TTL_MS,
    factory: async () => {
      const localMatch = searchLocalSalvadorPlaces(normalized, 1)[0];
      if (localMatch) {
        return {
          lat: localMatch.lat,
          lng: localMatch.lng,
          label: localMatch.label,
        };
      }

      const remoteMatches = await fetchNominatimLocations(normalized, {
        limit: 5,
        allowRegionalFallback: true,
      });
      const bestMatch = mergeLocationSuggestions(normalized, remoteMatches)[0];

      if (!bestMatch) {
        return null;
      }

      return {
        lat: bestMatch.lat,
        lng: bestMatch.lng,
        label: bestMatch.label,
      };
    },
  });
};

export const suggestLocationTexts = async (query: string) => {
  const normalized = String(query || '').trim();
  if (!normalized) return [];
  const cacheKey = normalizeLocationText(normalized);

  return rememberGeoResult({
    cache: suggestLocationsCache,
    cacheName: 'geocode-suggest',
    key: cacheKey,
    ttlMs: GEO_SUGGEST_CACHE_TTL_MS,
    factory: async () => {
      const localSuggestions = searchLocalSalvadorPlaces(normalized, 6);
      const remoteSuggestions = await fetchNominatimLocations(normalized, {
        limit: 6,
        allowRegionalFallback: false,
      });

      return mergeLocationSuggestions(normalized, [...localSuggestions, ...remoteSuggestions]);
    },
  });
};

export const reverseGeocodeLocation = async (lat: number, lng: number) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const cacheKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;

  return rememberGeoResult({
    cache: reverseGeocodeCache,
    cacheName: 'geocode-reverse',
    key: cacheKey,
    ttlMs: GEO_REVERSE_CACHE_TTL_MS,
    factory: async () => {
      const params = new URLSearchParams({
        format: 'jsonv2',
        lat: String(lat),
        lon: String(lng),
        zoom: '18',
        addressdetails: '1',
      });

      const reverseAbort = new AbortController();
      const reverseTimeout = setTimeout(() => reverseAbort.abort(), 8000);
      let response: Response;
      try {
        response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
          headers: {
            'User-Agent': 'Fixlife/1.0 (backend geocoder)',
            'Accept-Language': 'es-SV,es,en',
          },
          signal: reverseAbort.signal,
        });
      } finally {
        clearTimeout(reverseTimeout);
      }

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as { display_name?: string };
      const label = String(payload?.display_name || '').trim();

      if (!label) return null;

      return {
        label: label.slice(0, 255),
        lat: Number(lat.toFixed(7)),
        lng: Number(lng.toFixed(7)),
      };
    },
  });
};

export const resolveRequestLocation = async (
  locationText: string,
  latitudeRaw: number | null,
  longitudeRaw: number | null
) => {
  if (Number.isFinite(latitudeRaw) && Number.isFinite(longitudeRaw)) {
    const lat = Number(Number(latitudeRaw).toFixed(7));
    const lng = Number(Number(longitudeRaw).toFixed(7));
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng, label: locationText };
    }
  }

  const manualCoords = parseCoordinateLocation(locationText);
  if (manualCoords) return manualCoords;

  return geocodeLocationText(locationText);
};
