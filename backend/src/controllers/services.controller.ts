import { Request, Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { AuthRequest } from '../middlewares/auth.middleware';
import fs from 'fs';
import path from 'path';
import { createUserNotification } from '../utils/notifications';
import { getWorkerBonusPayouts, getWorkerRewardsSettings, syncWorkerBonusPayouts } from '../utils/workerRewards';

type ServiceCardRow = RowDataPacket & {
  id_card: number;
  id_service: number;
  image_url: string | null;
  badge: string | null;
  headline: string | null;
  summary: string | null;
  cta_label: string | null;
  sort_order: number;
  is_active: number;
  service_name: string;
  service_icon: string | null;
  service_description: string | null;
};

let serviceCardsTableChecked = false;
let workerGeoColumnsChecked = false;
let serviceRequestsTablesChecked = false;
let savedLocationsTableChecked = false;
type SalvadorLocalPlace = {
  label: string;
  lat: number;
  lng: number;
  kind: 'municipio' | 'residencial' | 'colonia' | 'centro-comercial' | 'parque' | 'zona';
  aliases?: string[];
};

type LocationSuggestionResult = {
  label: string;
  lat: number;
  lng: number;
  source: 'local' | 'nominatim';
  kind?: string;
  short_label?: string;
  context_label?: string;
};

const SERVICE_REQUEST_STATUS_ENUM =
  `ENUM('open', 'pending', 'payment_pending', 'paid', 'assigned', 'in_progress', 'awaiting_confirmation', 'done', 'cancelled')`;
const SAVED_LOCATION_KIND_ENUM = `ENUM('home', 'work', 'favorite', 'recent')`;
const CHAT_ENABLED_REQUEST_STATUSES = [
  'assigned',
  'payment_pending',
  'paid',
  'in_progress',
  'awaiting_confirmation',
  'done',
];
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

const toPublicRequestStatus = (status: string | null | undefined) => {
  if (!status) return 'pending';
  return status === 'open' ? 'pending' : status;
};

const getRequestChargeAmount = (row: any) => {
  if (row?.final_budget != null) return Number(row.final_budget);
  if (row?.budget != null) return Number(row.budget);
  if (row?.initial_budget != null) return Number(row.initial_budget);
  return 0;
};

const defaultImageForService = (serviceName: string) => {
  const name = serviceName.toLowerCase();
  if (name.includes('plumb')) return 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?q=80&w=1400&auto=format&fit=crop';
  if (name.includes('electric')) return 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?q=80&w=1400&auto=format&fit=crop';
  if (name.includes('carp')) return 'https://images.unsplash.com/photo-1610557892470-55d9e80c0bce?q=80&w=1400&auto=format&fit=crop';
  if (name.includes('clean')) return 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=1400&auto=format&fit=crop';
  if (name.includes('mechan')) return 'https://images.unsplash.com/photo-1530046339160-71153320c072?q=80&w=1400&auto=format&fit=crop';
  return 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?q=80&w=1400&auto=format&fit=crop';
};

const buildAssetUrl = (req: Request, fileName: string | null) => {
  if (!fileName) return null;
  return `${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(fileName)}`;
};

const getWorkerUserIdByProfileId = async (profileId: number | null | undefined) => {
  if (!profileId) return null;
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id_user FROM worker_profiles WHERE id_worker_profile = ? LIMIT 1`,
    [profileId]
  );
  return rows.length > 0 ? Number(rows[0].id_user) : null;
};

const requeueAssignedRequest = async (
  connection: any,
  input: {
    idRequest: number;
    idService: number | null | undefined;
    latitude: number | null | undefined;
    longitude: number | null | undefined;
    radiusKm: number | null | undefined;
    assignedWorkerProfile: number;
  }
) => {
  await connection.execute(
    `UPDATE service_request_workers
     SET status = 'rejected',
         counter_status = CASE WHEN counter_status = 'pending' THEN 'declined' ELSE counter_status END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id_request = ? AND id_worker_profile = ?`,
    [input.idRequest, input.assignedWorkerProfile]
  );

  await connection.execute(
    `UPDATE service_requests
     SET status = 'pending',
         assigned_worker_profile = NULL,
         assigned_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id_request = ?`,
    [input.idRequest]
  );

  if (input.latitude == null || input.longitude == null || input.idService == null) {
    return;
  }

  const lat = Number(input.latitude);
  const lng = Number(input.longitude);
  const radiusKm = Number(input.radiusKm || 8);
  const idService = Number(input.idService);

  const [nearRows] = await connection.execute(
    `SELECT
       wp.id_worker_profile,
       (ST_Distance_Sphere(point(wp.longitude, wp.latitude), point(?, ?)) / 1000) AS distance_km
     FROM worker_profiles wp
     INNER JOIN users u ON u.id_user = wp.id_user
     INNER JOIN worker_services ws ON ws.id_worker_profile = wp.id_worker_profile
     LEFT JOIN service_request_workers srw
       ON srw.id_request = ? AND srw.id_worker_profile = wp.id_worker_profile
     WHERE u.rol = 'worker'
       AND wp.is_verified = 1
       AND ws.id_service = ?
       AND wp.latitude IS NOT NULL
       AND wp.longitude IS NOT NULL
       AND wp.id_worker_profile <> ?
       AND srw.id_request IS NULL
     HAVING distance_km <= ? AND distance_km <= wp.coverage_km
     ORDER BY distance_km ASC
     LIMIT 50`,
    [lng, lat, input.idRequest, idService, input.assignedWorkerProfile, radiusKm]
  );

  for (const candidate of nearRows as RowDataPacket[]) {
    await connection.execute(
      `INSERT INTO service_request_workers (id_request, id_worker_profile, distance_km, status)
       VALUES (?, ?, ?, 'new')`,
      [
        input.idRequest,
        Number(candidate.id_worker_profile),
        candidate.distance_km != null ? Number(candidate.distance_km) : null,
      ]
    );
  }
};

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
  if (normalized.includes('ciudad ') || normalized.includes('zona ') || normalized.includes('lourdes')) return 'zona';
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

const scoreSalvadorPlace = (query: string, place: { label: string; aliases?: string[]; kind?: string }) => {
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
  if (place.kind === 'residencial' || place.kind === 'colonia' || place.kind === 'centro-comercial') score += 5;
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
    new Set([
      normalized,
      /el salvador/i.test(normalized) ? '' : `${normalized}, El Salvador`,
    ].filter(Boolean))
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

    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        'User-Agent': 'Fixlife/1.0 (backend geocoder)',
        'Accept-Language': 'es-SV,es,en',
      },
    });

    if (!response.ok) {
      continue;
    }

    const payload = (await response.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
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
          source: 'nominatim',
          kind: inferSuggestionKind(label),
          ...getSuggestionPresentation(label),
        };
      })
      .filter(Boolean) as LocationSuggestionResult[];
  }

  return [];
};

const mergeLocationSuggestions = (
  query: string,
  suggestions: LocationSuggestionResult[]
) => {
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

const geocodeLocationText = async (query: string) => {
  const normalized = String(query || '').trim();
  if (!normalized) return null;

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
};

const suggestLocationTexts = async (query: string) => {
  const normalized = String(query || '').trim();
  if (!normalized) return [];

  const localSuggestions = searchLocalSalvadorPlaces(normalized, 6);
  const remoteSuggestions = await fetchNominatimLocations(normalized, {
    limit: 6,
    allowRegionalFallback: false,
  });

  return mergeLocationSuggestions(normalized, [...localSuggestions, ...remoteSuggestions]);
};

const reverseGeocodeLocation = async (lat: number, lng: number) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(lat),
    lon: String(lng),
    zoom: '18',
    addressdetails: '1',
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
    headers: {
      'User-Agent': 'Fixlife/1.0 (backend geocoder)',
      'Accept-Language': 'es-SV,es,en',
    },
  });

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
};

const resolveRequestLocation = async (
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

export const ensureServiceCardsTable = async () => {
  if (serviceCardsTableChecked) return;

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS service_cards (
      id_card INT NOT NULL AUTO_INCREMENT,
      id_service INT NOT NULL,
      image_url VARCHAR(255) DEFAULT NULL,
      badge VARCHAR(40) DEFAULT 'POPULAR',
      headline VARCHAR(120) DEFAULT NULL,
      summary VARCHAR(255) DEFAULT NULL,
      cta_label VARCHAR(60) NOT NULL DEFAULT 'Learn More',
      sort_order INT NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_card),
      KEY idx_service_cards_service (id_service),
      KEY idx_service_cards_active_sort (is_active, sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [fkRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM information_schema.referential_constraints
     WHERE constraint_schema = DATABASE()
       AND table_name = 'service_cards'
       AND constraint_name = 'fk_service_cards_service'`
  );

  const fkExists = Number(fkRows[0]?.total || 0) > 0;
  if (!fkExists) {
    await pool.execute(`
      ALTER TABLE service_cards
      ADD CONSTRAINT fk_service_cards_service
      FOREIGN KEY (id_service) REFERENCES services(id_service)
      ON DELETE CASCADE
    `);
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM service_cards`
  );

  const total = Number(rows[0]?.total || 0);
  if (total === 0) {
    const [services] = await pool.execute<RowDataPacket[]>(
      `SELECT id_service, name, description
       FROM services
       WHERE is_active = 1
       ORDER BY id_service ASC
       LIMIT 4`
    );

    for (let index = 0; index < services.length; index += 1) {
      const service = services[index];
      await pool.execute(
        `INSERT INTO service_cards (id_service, image_url, badge, headline, summary, cta_label, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          service.id_service,
          defaultImageForService(String(service.name || '')),
          'POPULAR',
          String(service.name || '').slice(0, 120),
          String(service.description || 'Trusted professionals ready to help your project.').slice(0, 255),
          'Learn More',
          index + 1,
        ]
      );
    }
  }

  serviceCardsTableChecked = true;
};

export const getActiveServices = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_service, name, description, icon FROM services WHERE is_active = 1 ORDER BY name ASC`
    );
    res.json({ success: true, services: rows });
  } catch (error: any) {
    console.error('Error in getActiveServices:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPublicServiceCards = async (_req: Request, res: Response): Promise<void> => {
  try {
    await ensureServiceCardsTable();

    const [rows] = await pool.execute<ServiceCardRow[]>(
      `SELECT
         sc.id_card,
         sc.id_service,
         sc.image_url,
         sc.badge,
         sc.headline,
         sc.summary,
         sc.cta_label,
         sc.sort_order,
         sc.is_active,
         s.name AS service_name,
         s.icon AS service_icon,
         s.description AS service_description
       FROM service_cards sc
       INNER JOIN services s ON s.id_service = sc.id_service
       WHERE sc.is_active = 1 AND s.is_active = 1
       ORDER BY sc.sort_order ASC, sc.id_card ASC`
    );

    const cards = rows.map((row) => ({
      id_card: Number(row.id_card),
      id_service: Number(row.id_service),
      image_url: row.image_url,
      badge: row.badge || 'POPULAR',
      headline: row.headline || row.service_name,
      summary: row.summary || row.service_description || '',
      cta_label: row.cta_label || 'Learn More',
      sort_order: Number(row.sort_order),
      service_name: row.service_name,
      service_icon: row.service_icon,
    }));

    res.json({ success: true, cards });
  } catch (error: any) {
    console.error('Error in getPublicServiceCards:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const ensureWorkerGeoColumns = async () => {
  if (workerGeoColumnsChecked) return;

  const [columns] = await pool.execute<RowDataPacket[]>(
    `SELECT COLUMN_NAME
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'worker_profiles'
       AND column_name IN ('latitude', 'longitude', 'coverage_km', 'is_online', 'last_seen_at')`
  );

  const names = new Set(columns.map((c: any) => String(c.COLUMN_NAME)));

  if (!names.has('latitude')) {
    await pool.execute(`ALTER TABLE worker_profiles ADD COLUMN latitude DECIMAL(10,7) NULL`);
  }
  if (!names.has('longitude')) {
    await pool.execute(`ALTER TABLE worker_profiles ADD COLUMN longitude DECIMAL(10,7) NULL`);
  }
  if (!names.has('coverage_km')) {
    await pool.execute(`ALTER TABLE worker_profiles ADD COLUMN coverage_km DECIMAL(6,2) NOT NULL DEFAULT 8.00`);
  }
  if (!names.has('is_online')) {
    await pool.execute(`ALTER TABLE worker_profiles ADD COLUMN is_online TINYINT(1) NOT NULL DEFAULT 0`);
  }
  if (!names.has('last_seen_at')) {
    await pool.execute(`ALTER TABLE worker_profiles ADD COLUMN last_seen_at TIMESTAMP NULL`);
  }

  workerGeoColumnsChecked = true;
};

export const ensureSavedLocationsTable = async () => {
  if (savedLocationsTableChecked) return;

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS user_saved_locations (
      id_saved_location INT NOT NULL AUTO_INCREMENT,
      id_user INT NOT NULL,
      kind ${SAVED_LOCATION_KIND_ENUM} NOT NULL,
      title VARCHAR(80) NOT NULL,
      label VARCHAR(255) NOT NULL,
      latitude DECIMAL(10,7) NOT NULL,
      longitude DECIMAL(10,7) NOT NULL,
      last_used_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_saved_location),
      KEY idx_user_saved_locations_user_kind (id_user, kind),
      KEY idx_user_saved_locations_user_last_used (id_user, last_used_at),
      CONSTRAINT fk_user_saved_locations_user FOREIGN KEY (id_user) REFERENCES users(id_user) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  savedLocationsTableChecked = true;
};

const mapSavedLocationRow = (row: any) => ({
  id_saved_location: Number(row.id_saved_location),
  kind: String(row.kind),
  title: String(row.title || ''),
  label: String(row.label || ''),
  lat: Number(row.latitude),
  lng: Number(row.longitude),
  last_used_at: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
});

export const getNearbyWorkers = async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureWorkerGeoColumns();

    const idService = Number(req.query.id_service);
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKmRaw = Number(req.query.radius_km ?? 8);
    const radiusKm = Number.isFinite(radiusKmRaw) && radiusKmRaw > 0 ? Math.min(radiusKmRaw, 50) : 8;

    if (!idService || Number.isNaN(idService)) {
      res.status(400).json({ error: 'id_service is required.' });
      return;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: 'lat and lng are required.' });
      return;
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         u.id_user,
         u.name,
         u.lastname,
         u.profile_image,
         wp.id_worker_profile,
         wp.bio,
         wp.latitude,
         wp.longitude,
         (ST_Distance_Sphere(point(wp.longitude, wp.latitude), point(?, ?)) / 1000) AS distance_km
       FROM worker_profiles wp
       INNER JOIN users u ON u.id_user = wp.id_user
       INNER JOIN worker_services ws ON ws.id_worker_profile = wp.id_worker_profile
       WHERE u.rol = 'worker'
         AND wp.is_verified = 1
         AND wp.is_online = 1
         AND ws.id_service = ?
         AND wp.latitude IS NOT NULL
         AND wp.longitude IS NOT NULL
       HAVING distance_km <= ? AND distance_km <= wp.coverage_km
       ORDER BY distance_km ASC
       LIMIT 20`,
      [lng, lat, idService, radiusKm]
    );

    const workers = rows.map((row: any) => ({
      id_user: Number(row.id_user),
      id_worker_profile: Number(row.id_worker_profile),
      name: `${row.name || ''} ${row.lastname || ''}`.trim(),
      bio: row.bio || '',
      profile_image: row.profile_image || null,
      latitude: row.latitude != null ? Number(row.latitude) : null,
      longitude: row.longitude != null ? Number(row.longitude) : null,
      distance_km: row.distance_km != null ? Number(row.distance_km) : null,
    }));

    res.json({ success: true, workers, center: { lat, lng }, radius_km: radiusKm });
  } catch (error: any) {
    console.error('Error in getNearbyWorkers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const geocodeLocation = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query || query.length > 255) {
      res.status(400).json({ error: 'q is required (max 255 chars).' });
      return;
    }

    const location = await resolveRequestLocation(query, null, null);
    if (!location) {
      res.status(404).json({ error: 'Could not resolve that address. Try a more specific place or paste coordinates.' });
      return;
    }

    res.json({ success: true, location });
  } catch (error: any) {
    console.error('Error in geocodeLocation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const suggestLocations = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query || query.length < 2 || query.length > 255) {
      res.json({ success: true, suggestions: [] });
      return;
    }

    const suggestions = await suggestLocationTexts(query);
    res.json({ success: true, suggestions });
  } catch (error: any) {
    console.error('Error in suggestLocations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const reverseGeocode = async (req: Request, res: Response): Promise<void> => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: 'lat and lng are required.' });
      return;
    }

    const location = await reverseGeocodeLocation(lat, lng);
    if (!location) {
      res.status(404).json({ error: 'Could not read a friendly address for that point.' });
      return;
    }

    res.json({ success: true, location });
  } catch (error: any) {
    console.error('Error in reverseGeocode:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getSavedLocations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureSavedLocationsTable();

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_saved_location, kind, title, label, latitude, longitude, last_used_at
       FROM user_saved_locations
       WHERE id_user = ?
       ORDER BY
         FIELD(kind, 'home', 'work', 'favorite', 'recent'),
         CASE WHEN kind = 'favorite' THEN last_used_at END DESC,
         CASE WHEN kind = 'recent' THEN last_used_at END DESC,
         id_saved_location DESC`,
      [userId]
    );

    res.json({
      success: true,
      locations: rows.map(mapSavedLocationRow),
    });
  } catch (error: any) {
    console.error('Error in getSavedLocations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createSavedLocation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureSavedLocationsTable();

    const kind = String(req.body?.kind || '').trim().toLowerCase();
    const title = String(req.body?.title || '').trim();
    const label = String(req.body?.label || '').trim();
    const latitude = Number(req.body?.lat);
    const longitude = Number(req.body?.lng);

    if (!['home', 'work', 'favorite', 'recent'].includes(kind)) {
      res.status(400).json({ error: 'Invalid location kind.' });
      return;
    }
    if (!title || title.length > 80) {
      res.status(400).json({ error: 'title is required (max 80 chars).' });
      return;
    }
    if (!label || label.length > 255) {
      res.status(400).json({ error: 'label is required (max 255 chars).' });
      return;
    }
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      res.status(400).json({ error: 'Valid lat/lng are required.' });
      return;
    }

    if (kind === 'home' || kind === 'work') {
      await pool.execute(
        `DELETE FROM user_saved_locations
         WHERE id_user = ? AND kind = ?`,
        [userId, kind]
      );
    }

    if (kind === 'recent') {
      const [existingRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id_saved_location
         FROM user_saved_locations
         WHERE id_user = ?
           AND kind = 'recent'
           AND label = ?
           AND latitude = ?
           AND longitude = ?
         LIMIT 1`,
        [userId, label, latitude, longitude]
      );

      if (existingRows.length > 0) {
        await pool.execute(
          `UPDATE user_saved_locations
           SET title = ?, last_used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id_saved_location = ?`,
          [title, Number(existingRows[0].id_saved_location)]
        );
      } else {
        await pool.execute(
          `INSERT INTO user_saved_locations (id_user, kind, title, label, latitude, longitude, last_used_at)
           VALUES (?, 'recent', ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [userId, title, label, latitude, longitude]
        );
      }

      await pool.execute(
        `DELETE FROM user_saved_locations
         WHERE id_user = ?
           AND kind = 'recent'
           AND id_saved_location NOT IN (
             SELECT id_saved_location
             FROM (
               SELECT id_saved_location
               FROM user_saved_locations
               WHERE id_user = ? AND kind = 'recent'
               ORDER BY last_used_at DESC, id_saved_location DESC
               LIMIT 4
             ) AS keep_recent
           )`,
        [userId, userId]
      );
    } else if (kind === 'favorite') {
      const [existingRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id_saved_location
         FROM user_saved_locations
         WHERE id_user = ?
           AND kind = 'favorite'
           AND (
             LOWER(title) = LOWER(?)
             OR (label = ? AND latitude = ? AND longitude = ?)
           )
         LIMIT 1`,
        [userId, title, label, latitude, longitude]
      );

      if (existingRows.length > 0) {
        await pool.execute(
          `UPDATE user_saved_locations
           SET title = ?, label = ?, latitude = ?, longitude = ?, last_used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id_saved_location = ?`,
          [title, label, latitude, longitude, Number(existingRows[0].id_saved_location)]
        );
      } else {
        await pool.execute(
          `INSERT INTO user_saved_locations (id_user, kind, title, label, latitude, longitude, last_used_at)
           VALUES (?, 'favorite', ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [userId, title, label, latitude, longitude]
        );
      }
    } else {
      await pool.execute(
        `INSERT INTO user_saved_locations (id_user, kind, title, label, latitude, longitude, last_used_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [userId, kind, title, label, latitude, longitude]
      );
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_saved_location, kind, title, label, latitude, longitude, last_used_at
       FROM user_saved_locations
       WHERE id_user = ?
       ORDER BY
         FIELD(kind, 'home', 'work', 'favorite', 'recent'),
         CASE WHEN kind = 'favorite' THEN last_used_at END DESC,
         CASE WHEN kind = 'recent' THEN last_used_at END DESC,
         id_saved_location DESC`,
      [userId]
    );

    res.status(201).json({
      success: true,
      locations: rows.map(mapSavedLocationRow),
    });
  } catch (error: any) {
    console.error('Error in createSavedLocation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateSavedLocation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureSavedLocationsTable();

    const idSavedLocation = Number(req.params.idSavedLocation);
    if (!idSavedLocation) {
      res.status(400).json({ error: 'Invalid saved location id.' });
      return;
    }

    const titleRaw = req.body?.title;
    const title = titleRaw != null ? String(titleRaw).trim() : null;
    const touch = Boolean(req.body?.touch);

    const updates: string[] = [];
    const params: any[] = [];

    if (title != null) {
      if (!title || title.length > 80) {
        res.status(400).json({ error: 'title must be between 1 and 80 chars.' });
        return;
      }
      updates.push('title = ?');
      params.push(title);
    }

    if (touch) {
      updates.push('last_used_at = CURRENT_TIMESTAMP');
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'Nothing to update.' });
      return;
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE user_saved_locations
       SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id_saved_location = ? AND id_user = ?`,
      [...params, idSavedLocation, userId]
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Saved location not found.' });
      return;
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_saved_location, kind, title, label, latitude, longitude, last_used_at
       FROM user_saved_locations
       WHERE id_user = ?
       ORDER BY
         FIELD(kind, 'home', 'work', 'favorite', 'recent'),
         CASE WHEN kind = 'favorite' THEN last_used_at END DESC,
         CASE WHEN kind = 'recent' THEN last_used_at END DESC,
         id_saved_location DESC`,
      [userId]
    );

    res.json({
      success: true,
      locations: rows.map(mapSavedLocationRow),
    });
  } catch (error: any) {
    console.error('Error in updateSavedLocation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteSavedLocation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureSavedLocationsTable();

    const idSavedLocation = Number(req.params.idSavedLocation);
    if (!idSavedLocation) {
      res.status(400).json({ error: 'Invalid saved location id.' });
      return;
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `DELETE FROM user_saved_locations
       WHERE id_saved_location = ? AND id_user = ?`,
      [idSavedLocation, userId]
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Saved location not found.' });
      return;
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error in deleteSavedLocation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const clearSavedLocationsByKind = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureSavedLocationsTable();

    const kind = String(req.query.kind || '').trim().toLowerCase();
    if (kind !== 'recent') {
      res.status(400).json({ error: 'Only kind=recent can be cleared in bulk.' });
      return;
    }

    await pool.execute(
      `DELETE FROM user_saved_locations
       WHERE id_user = ? AND kind = 'recent'`,
      [userId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error in clearSavedLocationsByKind:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const ensureServiceRequestTables = async () => {
  if (serviceRequestsTablesChecked) return;

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS service_requests (
      id_request INT NOT NULL AUTO_INCREMENT,
      id_user INT NULL,
      id_service INT NOT NULL,
      description TEXT NOT NULL,
      location_text VARCHAR(255) NOT NULL,
      latitude DECIMAL(10,7) NULL,
      longitude DECIMAL(10,7) NULL,
      initial_budget DECIMAL(10,2) NULL,
      budget DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      final_budget DECIMAL(10,2) NULL,
      radius_km DECIMAL(6,2) NOT NULL DEFAULT 8.00,
      assigned_worker_profile INT NULL,
      assigned_at TIMESTAMP NULL,
      status ${SERVICE_REQUEST_STATUS_ENUM} NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_request),
      KEY idx_service_requests_service (id_service),
      KEY idx_service_requests_status_created (status, created_at),
      KEY idx_service_requests_user (id_user),
      KEY idx_service_requests_assigned_worker (assigned_worker_profile),
      CONSTRAINT fk_service_requests_service FOREIGN KEY (id_service) REFERENCES services(id_service) ON DELETE CASCADE,
      CONSTRAINT fk_service_requests_user FOREIGN KEY (id_user) REFERENCES users(id_user) ON DELETE SET NULL,
      CONSTRAINT fk_service_requests_assigned_worker FOREIGN KEY (assigned_worker_profile) REFERENCES worker_profiles(id_worker_profile) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    ALTER TABLE service_requests
    MODIFY COLUMN status ${SERVICE_REQUEST_STATUS_ENUM}
    NOT NULL DEFAULT 'pending'
  `);

  const [assignedColRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'service_requests'
       AND column_name IN ('assigned_worker_profile', 'initial_budget', 'final_budget', 'assigned_at')`
  );
  const requestColsCount = Number(assignedColRows[0]?.total || 0);
  if (requestColsCount < 4) {
    const [requestCols] = await pool.execute<RowDataPacket[]>(
      `SELECT COLUMN_NAME
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'service_requests'
         AND column_name IN ('assigned_worker_profile', 'initial_budget', 'final_budget', 'assigned_at')`
    );
    const requestColSet = new Set(requestCols.map((c: any) => String(c.COLUMN_NAME)));
    if (!requestColSet.has('assigned_worker_profile')) {
      await pool.execute(`ALTER TABLE service_requests ADD COLUMN assigned_worker_profile INT NULL`);
    }
    if (!requestColSet.has('initial_budget')) {
      await pool.execute(`ALTER TABLE service_requests ADD COLUMN initial_budget DECIMAL(10,2) NULL`);
    }
    if (!requestColSet.has('final_budget')) {
      await pool.execute(`ALTER TABLE service_requests ADD COLUMN final_budget DECIMAL(10,2) NULL`);
    }
    if (!requestColSet.has('assigned_at')) {
      await pool.execute(`ALTER TABLE service_requests ADD COLUMN assigned_at TIMESTAMP NULL`);
    }
  }

  const [assignedIdxRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'service_requests'
       AND index_name = 'idx_service_requests_assigned_worker'`
  );
  if (Number(assignedIdxRows[0]?.total || 0) === 0) {
    await pool.execute(`ALTER TABLE service_requests ADD KEY idx_service_requests_assigned_worker (assigned_worker_profile)`);
  }

  const [assignedFkRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM information_schema.referential_constraints
     WHERE constraint_schema = DATABASE()
       AND table_name = 'service_requests'
       AND constraint_name = 'fk_service_requests_assigned_worker'`
  );
  if (Number(assignedFkRows[0]?.total || 0) === 0) {
    await pool.execute(
      `ALTER TABLE service_requests
       ADD CONSTRAINT fk_service_requests_assigned_worker
       FOREIGN KEY (assigned_worker_profile) REFERENCES worker_profiles(id_worker_profile)
       ON DELETE SET NULL`
    );
  }

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS service_request_images (
      id_image INT NOT NULL AUTO_INCREMENT,
      id_request INT NOT NULL,
      image_url VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_image),
      KEY idx_service_request_images_request (id_request),
      CONSTRAINT fk_service_request_images_request FOREIGN KEY (id_request) REFERENCES service_requests(id_request) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS service_request_workers (
      id_request INT NOT NULL,
      id_worker_profile INT NOT NULL,
      distance_km DECIMAL(8,3) NULL,
      status ENUM('new', 'accepted', 'rejected', 'expired') NOT NULL DEFAULT 'new',
      proposed_budget DECIMAL(10,2) NULL,
      counter_message VARCHAR(255) NULL,
      counter_status ENUM('pending', 'accepted', 'declined') NULL,
      notified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_request, id_worker_profile),
      KEY idx_service_request_workers_worker_status (id_worker_profile, status, notified_at),
      KEY idx_service_request_workers_request (id_request),
      CONSTRAINT fk_service_request_workers_request FOREIGN KEY (id_request) REFERENCES service_requests(id_request) ON DELETE CASCADE,
      CONSTRAINT fk_service_request_workers_worker FOREIGN KEY (id_worker_profile) REFERENCES worker_profiles(id_worker_profile) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS service_request_chat_messages (
      id_message INT NOT NULL AUTO_INCREMENT,
      id_request INT NOT NULL,
      sender_role ENUM('client','worker') NOT NULL,
      id_user INT NOT NULL,
      id_worker_profile INT NULL,
      message VARCHAR(500) NULL,
      image_url VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_message),
      KEY idx_sr_chat_request_created (id_request, created_at),
      KEY idx_sr_chat_sender (id_user),
      CONSTRAINT fk_sr_chat_request FOREIGN KEY (id_request) REFERENCES service_requests(id_request) ON DELETE CASCADE,
      CONSTRAINT fk_sr_chat_user FOREIGN KEY (id_user) REFERENCES users(id_user) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS service_request_ratings (
      id_rating INT NOT NULL AUTO_INCREMENT,
      id_request INT NOT NULL,
      id_client_user INT NOT NULL,
      id_worker_profile INT NOT NULL,
      punctuality TINYINT NOT NULL,
      quality TINYINT NOT NULL,
      price_fairness TINYINT NOT NULL,
      comment VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_rating),
      UNIQUE KEY uniq_sr_rating_request (id_request),
      KEY idx_sr_rating_worker (id_worker_profile),
      CONSTRAINT fk_sr_rating_request FOREIGN KEY (id_request) REFERENCES service_requests(id_request) ON DELETE CASCADE,
      CONSTRAINT fk_sr_rating_client FOREIGN KEY (id_client_user) REFERENCES users(id_user) ON DELETE CASCADE,
      CONSTRAINT fk_sr_rating_worker FOREIGN KEY (id_worker_profile) REFERENCES worker_profiles(id_worker_profile) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS service_request_payments (
      id_payment INT NOT NULL AUTO_INCREMENT,
      id_request INT NOT NULL,
      provider VARCHAR(50) NOT NULL DEFAULT 'sandbox',
      checkout_reference VARCHAR(64) NOT NULL,
      provider_payment_id VARCHAR(120) NULL,
      amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      platform_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      worker_payout DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      payment_status ENUM('pending', 'paid', 'released', 'refunded', 'failed', 'cancelled') NOT NULL DEFAULT 'pending',
      paid_at TIMESTAMP NULL,
      released_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_payment),
      UNIQUE KEY uniq_sr_payment_request (id_request),
      UNIQUE KEY uniq_sr_payment_reference (checkout_reference),
      KEY idx_sr_payment_status (payment_status, created_at),
      CONSTRAINT fk_sr_payment_request FOREIGN KEY (id_request) REFERENCES service_requests(id_request) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [workerCols] = await pool.execute<RowDataPacket[]>(
    `SELECT COLUMN_NAME
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'service_request_workers'
      AND column_name IN ('proposed_budget', 'counter_message', 'counter_status')`
  );
  const workerColSet = new Set(workerCols.map((c: any) => String(c.COLUMN_NAME)));
  if (!workerColSet.has('proposed_budget')) {
    await pool.execute(`ALTER TABLE service_request_workers ADD COLUMN proposed_budget DECIMAL(10,2) NULL`);
  }
  if (!workerColSet.has('counter_message')) {
    await pool.execute(`ALTER TABLE service_request_workers ADD COLUMN counter_message VARCHAR(255) NULL`);
  }
  if (!workerColSet.has('counter_status')) {
    await pool.execute(
      `ALTER TABLE service_request_workers
      ADD COLUMN counter_status ENUM('pending', 'accepted', 'declined') NULL`
    );
  }

  serviceRequestsTablesChecked = true;
};

const removeUploadedFiles = (files: Express.Multer.File[]) => {
  for (const file of files) {
    if (!file?.filename) continue;
    const filePath = path.join(__dirname, '../../uploads', file.filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // ignore cleanup failures
      }
    }
  }
};

const buildCheckoutReference = (idRequest: number) =>
  `FX-${idRequest}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

const getPlatformFeeRate = () => {
  const raw = Number(process.env.PLATFORM_FEE_RATE || 0.12);
  if (!Number.isFinite(raw)) return 0.12;
  return Math.min(Math.max(raw, 0), 0.5);
};

const getPaymentBreakdown = (amount: number) => {
  const normalizedAmount = Math.max(0, Number(amount || 0));
  const platformFee = Number((normalizedAmount * getPlatformFeeRate()).toFixed(2));
  const workerPayout = Number(Math.max(0, normalizedAmount - platformFee).toFixed(2));
  return { amount: normalizedAmount, platformFee, workerPayout };
};

export const createServiceRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  const files = ((req.files as Express.Multer.File[]) || []).slice(0, 5);

  try {
    const idUser = req.user?.user_id;
    if (!idUser) {
      removeUploadedFiles(files);
      res.status(401).json({ error: 'You must be logged in to create a request.' });
      return;
    }

    await ensureServiceRequestTables();
    await ensureWorkerGeoColumns();

    const idService = Number(req.body?.id_service);
    const description = String(req.body?.description || '').trim();
    const locationText = String(req.body?.location || '').trim();
    const budget = Number(req.body?.budget);
    const latitudeRaw = req.body?.lat != null && req.body?.lat !== '' ? Number(req.body?.lat) : null;
    const longitudeRaw = req.body?.lng != null && req.body?.lng !== '' ? Number(req.body?.lng) : null;
    const radiusRaw = Number(req.body?.radius_km ?? 8);
    const radiusKm = Number.isFinite(radiusRaw) && radiusRaw > 0 ? Math.min(radiusRaw, 50) : 8;

    if (!idService || Number.isNaN(idService)) {
      removeUploadedFiles(files);
      res.status(400).json({ error: 'id_service is required.' });
      return;
    }
    if (!description || description.length < 10 || description.length > 1000) {
      removeUploadedFiles(files);
      res.status(400).json({ error: 'Description must be between 10 and 1000 characters.' });
      return;
    }
    if (!locationText || locationText.length > 255) {
      removeUploadedFiles(files);
      res.status(400).json({ error: 'Location is required (max 255 chars).' });
      return;
    }

    const resolvedLocation = await resolveRequestLocation(locationText, latitudeRaw, longitudeRaw);
    if (!resolvedLocation) {
      removeUploadedFiles(files);
      res.status(400).json({
        error: 'Enter a valid address, use Detect my location, or paste coordinates like 13.6841, -89.2872.',
      });
      return;
    }
    const latitude = resolvedLocation.lat;
    const longitude = resolvedLocation.lng;

    if (!Number.isFinite(budget) || budget <= 0 || budget > 100000) {
      removeUploadedFiles(files);
      res.status(400).json({ error: 'Budget must be greater than 0 and less than 100000.' });
      return;
    }
    if (files.length === 0) {
      res.status(400).json({ error: 'At least one problem image is required.' });
      return;
    }

    const invalidMime = files.find(
      (file) => !['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.mimetype)
    );
    if (invalidMime) {
      removeUploadedFiles(files);
      res.status(400).json({ error: 'Only PNG/JPG/WEBP images are allowed.' });
      return;
    }

    const [svcRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_service FROM services WHERE id_service = ? AND is_active = 1 LIMIT 1`,
      [idService]
    );
    if (svcRows.length === 0) {
      removeUploadedFiles(files);
      res.status(400).json({ error: 'Service is not available.' });
      return;
    }

    const [activeRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_request
       FROM service_requests
       WHERE id_user = ?
         AND status IN ('open', 'pending', 'payment_pending', 'paid', 'assigned', 'in_progress', 'awaiting_confirmation')
       ORDER BY created_at DESC
       LIMIT 1`,
      [idUser]
    );
    if (activeRows.length > 0) {
      removeUploadedFiles(files);
      res.status(409).json({
        error: 'You already have an active request. Complete or cancel it before creating another one.',
        id_request: Number(activeRows[0].id_request),
      });
      return;
    }

    const [insertRequest] = await pool.execute<ResultSetHeader>(
      `INSERT INTO service_requests
       (id_user, id_service, description, location_text, latitude, longitude, initial_budget, budget, final_budget, radius_km, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'pending')`,
      [idUser, idService, description, locationText, latitude, longitude, budget, budget, radiusKm]
    );

    const idRequest = Number(insertRequest.insertId);

    for (const file of files) {
      await pool.execute(
        `INSERT INTO service_request_images (id_request, image_url) VALUES (?, ?)`,
        [idRequest, file.filename]
      );
    }

    if (latitude != null && longitude != null) {
      const [nearRows] = await pool.execute<RowDataPacket[]>(
        `SELECT
           wp.id_worker_profile,
           (ST_Distance_Sphere(point(wp.longitude, wp.latitude), point(?, ?)) / 1000) AS distance_km
         FROM worker_profiles wp
         INNER JOIN users u ON u.id_user = wp.id_user
         INNER JOIN worker_services ws ON ws.id_worker_profile = wp.id_worker_profile
         WHERE u.rol = 'worker'
           AND wp.is_verified = 1
           AND ws.id_service = ?
           AND wp.latitude IS NOT NULL
           AND wp.longitude IS NOT NULL
         HAVING distance_km <= ? AND distance_km <= wp.coverage_km
         ORDER BY distance_km ASC
         LIMIT 50`,
        [longitude, latitude, idService, radiusKm]
      );

      for (const row of nearRows) {
        await pool.execute(
          `INSERT INTO service_request_workers (id_request, id_worker_profile, distance_km, status)
           VALUES (?, ?, ?, 'new')`,
          [idRequest, Number(row.id_worker_profile), row.distance_km != null ? Number(row.distance_km) : null]
        );
      }
    }

    res.status(201).json({
      success: true,
      message: 'Service request created successfully.',
      request: {
        id_request: idRequest,
        id_service: idService,
        id_user: idUser,
        radius_km: radiusKm,
        budget,
        location: locationText,
        status: 'pending',
        images: files.map((f) => ({
          file_name: f.filename,
          url: `${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(f.filename)}`,
        })),
      },
    });
  } catch (error: any) {
    console.error('Error in createServiceRequest:', error);
    removeUploadedFiles(files);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getMyServiceRequests = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();

    await autoReassignStaleAssignedRequests();

    const requestedStatus = String(req.query.status || 'all').toLowerCase();
    const allowed = new Set(['all', 'pending', 'payment_pending', 'paid', 'assigned', 'in_progress', 'awaiting_confirmation', 'done', 'cancelled']);
    if (!allowed.has(requestedStatus)) {
      res.status(400).json({ error: 'Invalid status filter.' });
      return;
    }

    const whereParts: string[] = ['sr.id_user = ?'];
    const params: any[] = [userId];

    if (requestedStatus !== 'all') {
      if (requestedStatus === 'pending') {
        whereParts.push(`sr.status IN ('pending', 'open')`);
      } else {
        whereParts.push(`sr.status = ?`);
        params.push(requestedStatus);
      }
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         sr.id_request,
         sr.id_service,
         sr.description,
         sr.location_text,
         sr.latitude,
         sr.longitude,
         sr.initial_budget,
         sr.budget,
         sr.final_budget,
         sr.radius_km,
         sr.status,
         sr.created_at,
         s.name AS service_name,
         s.icon AS service_icon,
         wp.id_worker_profile AS assigned_worker_profile,
         wp.latitude AS worker_latitude,
         wp.longitude AS worker_longitude,
         wp.is_online AS worker_is_online,
         wp.bio AS worker_bio,
         u2.name AS worker_name,
         u2.lastname AS worker_lastname,
         u2.phone_number AS worker_phone_number,
         u2.profile_image AS worker_profile_image,
         srp.provider AS payment_provider,
         srp.checkout_reference,
         srp.amount AS payment_amount,
         srp.payment_status,
         srp.paid_at,
         srp.released_at,
         srw_assigned.proposed_budget,
         srw_assigned.counter_message,
         srw_assigned.counter_status,
         GROUP_CONCAT(DISTINCT sri.image_url ORDER BY sri.id_image ASC SEPARATOR '||') AS image_urls
       FROM service_requests sr
       INNER JOIN services s ON s.id_service = sr.id_service
       LEFT JOIN worker_profiles wp ON wp.id_worker_profile = sr.assigned_worker_profile
       LEFT JOIN users u2 ON u2.id_user = wp.id_user
       LEFT JOIN service_request_payments srp ON srp.id_request = sr.id_request
       LEFT JOIN service_request_workers srw_assigned
         ON srw_assigned.id_request = sr.id_request
        AND srw_assigned.id_worker_profile = sr.assigned_worker_profile
       LEFT JOIN service_request_images sri ON sri.id_request = sr.id_request
       WHERE ${whereParts.join(' AND ')}
       GROUP BY
         sr.id_request, sr.id_service, sr.description, sr.location_text, sr.latitude, sr.longitude,
         sr.initial_budget, sr.budget, sr.final_budget, sr.radius_km, sr.status, sr.created_at, s.name, s.icon, wp.id_worker_profile, wp.latitude, wp.longitude, wp.is_online, wp.bio, u2.name, u2.lastname, u2.phone_number, u2.profile_image,
         srp.provider, srp.checkout_reference, srp.amount, srp.payment_status, srp.paid_at, srp.released_at,
         srw_assigned.proposed_budget, srw_assigned.counter_message, srw_assigned.counter_status
       ORDER BY sr.created_at DESC
       LIMIT 100`,
      params
    );

    const requests = rows.map((row: any) => ({
      id_request: Number(row.id_request),
      id_service: Number(row.id_service),
      service_name: row.service_name,
      service_icon: row.service_icon || null,
      description: row.description,
      location_text: row.location_text,
      latitude: row.latitude != null ? Number(row.latitude) : null,
      longitude: row.longitude != null ? Number(row.longitude) : null,
      initial_budget: row.initial_budget != null ? Number(row.initial_budget) : Number(row.budget || 0),
      budget: Number(row.budget || 0),
      final_budget: row.final_budget != null ? Number(row.final_budget) : null,
      radius_km: Number(row.radius_km || 8),
      status: toPublicRequestStatus(row.status),
      created_at: row.created_at,
      assigned_worker:
        row.assigned_worker_profile != null
          ? {
              id_worker_profile: Number(row.assigned_worker_profile),
              name: `${row.worker_name || ''} ${row.worker_lastname || ''}`.trim(),
              phone_number: row.worker_phone_number || null,
              bio: row.worker_bio || '',
              latitude: row.worker_latitude != null ? Number(row.worker_latitude) : null,
              longitude: row.worker_longitude != null ? Number(row.worker_longitude) : null,
              is_online: row.worker_is_online != null ? Boolean(Number(row.worker_is_online)) : null,
              profile_image_url: buildAssetUrl(req, row.worker_profile_image || null),
            }
          : null,
      proposed_budget: row.proposed_budget != null ? Number(row.proposed_budget) : null,
      counter_message: row.counter_message || null,
      counter_status: row.counter_status || null,
      payment:
        row.payment_provider || row.payment_status || row.checkout_reference
          ? {
              provider: row.payment_provider || 'sandbox',
              checkout_reference: row.checkout_reference || null,
              amount: row.payment_amount != null ? Number(row.payment_amount) : getRequestChargeAmount(row),
              status: row.payment_status || 'pending',
              paid_at: row.paid_at || null,
              released_at: row.released_at || null,
            }
          : null,
      images:
        typeof row.image_urls === 'string' && row.image_urls.length > 0
          ? String(row.image_urls)
              .split('||')
              .filter(Boolean)
              .map((name: string) => ({
                file_name: name,
                url: `${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(name)}`,
              }))
          : [],
    }));

    res.json({ success: true, requests });
  } catch (error: any) {
    console.error('Error in getMyServiceRequests:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getRequestAssignedWorkerProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();

    const idRequest = Number(req.params.idRequest);
    if (!idRequest || Number.isNaN(idRequest)) {
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }

    const [requestRows] = await pool.execute<RowDataPacket[]>(
      `SELECT sr.id_request, sr.assigned_worker_profile
       FROM service_requests sr
       WHERE sr.id_request = ? AND sr.id_user = ?
       LIMIT 1`,
      [idRequest, userId]
    );

    if (requestRows.length === 0) {
      res.status(404).json({ error: 'Request not found.' });
      return;
    }

    const assignedWorkerProfile = requestRows[0].assigned_worker_profile != null
      ? Number(requestRows[0].assigned_worker_profile)
      : null;

    if (!assignedWorkerProfile) {
      res.status(409).json({ error: 'This request does not have an assigned worker yet.' });
      return;
    }

    const [workerRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         wp.id_worker_profile,
         wp.bio,
         wp.is_online,
         u.name,
         u.lastname,
         u.phone_number,
         u.profile_image,
         u.created_at
       FROM worker_profiles wp
       INNER JOIN users u ON u.id_user = wp.id_user
       WHERE wp.id_worker_profile = ?
       LIMIT 1`,
      [assignedWorkerProfile]
    );

    if (workerRows.length === 0) {
      res.status(404).json({ error: 'Assigned worker profile not found.' });
      return;
    }

    const worker = workerRows[0];

    const [serviceRows] = await pool.execute<RowDataPacket[]>(
      `SELECT s.name
       FROM worker_services ws
       INNER JOIN services s ON s.id_service = ws.id_service
       WHERE ws.id_worker_profile = ?
       ORDER BY s.name ASC`,
      [assignedWorkerProfile]
    );

    const createdAt = worker.created_at ? new Date(worker.created_at) : null;
    const now = new Date();
    const diffMs = createdAt ? now.getTime() - createdAt.getTime() : null;
    const approxYears = diffMs != null && diffMs > 0
      ? Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365.25))
      : null;
    const experienceLabel =
      approxYears == null
        ? 'Experience not available'
        : approxYears < 1
          ? 'Less than 1 year'
          : `${approxYears}+ year${approxYears === 1 ? '' : 's'}`;

    const [portfolioRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_photo, image_url, description, uploaded_at
       FROM worker_portfolio
       WHERE id_worker_profile = ?
       ORDER BY uploaded_at DESC
       LIMIT 10`,
      [assignedWorkerProfile]
    );

    const [statsRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         COALESCE(AVG((rr.punctuality + rr.quality + rr.price_fairness) / 3), NULL) AS rating_average,
         COUNT(DISTINCT rr.id_rating) AS rating_count,
         COUNT(DISTINCT CASE WHEN sr.status = 'done' THEN sr.id_request END) AS completed_jobs
       FROM worker_profiles wp
       LEFT JOIN service_request_ratings rr
         ON rr.id_worker_profile = wp.id_worker_profile
       LEFT JOIN service_requests sr
         ON sr.assigned_worker_profile = wp.id_worker_profile
       WHERE wp.id_worker_profile = ?
       GROUP BY wp.id_worker_profile
       LIMIT 1`,
      [assignedWorkerProfile]
    );
    const workerStats = statsRows[0] || null;

    res.json({
      success: true,
      worker: {
        id_worker_profile: assignedWorkerProfile,
        name: `${worker.name || ''} ${worker.lastname || ''}`.trim(),
        phone_number: worker.phone_number || null,
        bio: worker.bio || '',
        is_online: worker.is_online != null ? Boolean(Number(worker.is_online)) : null,
        profile_image_url: buildAssetUrl(req, worker.profile_image || null),
        years_of_experience: approxYears != null && approxYears >= 1 ? approxYears : null,
        experience_label: experienceLabel,
        rating_average: workerStats?.rating_average != null ? Number(workerStats.rating_average) : null,
        rating_count: workerStats?.rating_count != null ? Number(workerStats.rating_count) : 0,
        completed_jobs: workerStats?.completed_jobs != null ? Number(workerStats.completed_jobs) : 0,
        services_offered: serviceRows
          .map((item) => String(item.name || '').trim())
          .filter(Boolean),
      },
      portfolio: portfolioRows.map((item) => ({
        id_photo: Number(item.id_photo),
        description: item.description || '',
        uploaded_at: item.uploaded_at || null,
        image_url: buildAssetUrl(req, item.image_url || null),
      })),
    });
  } catch (error: any) {
    console.error('Error in getRequestAssignedWorkerProfile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const cancelServiceRequest = async (req: AuthRequest, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();

    const idRequest = Number(req.params.idRequest);
    if (!idRequest || Number.isNaN(idRequest)) {
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }

    await connection.beginTransaction();

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT id_request, status
       FROM service_requests
       WHERE id_request = ? AND id_user = ?
       LIMIT 1
       FOR UPDATE`,
      [idRequest, userId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      res.status(404).json({ error: 'Request not found.' });
      return;
    }

    const currentStatus = String(rows[0].status || '').toLowerCase();

    if (currentStatus === 'cancelled') {
      await connection.rollback();
      res.status(409).json({ error: 'This request is already cancelled.' });
      return;
    }

    if (currentStatus === 'done') {
      await connection.rollback();
      res.status(409).json({ error: 'Completed requests cannot be cancelled.' });
      return;
    }

    if (currentStatus === 'in_progress') {
      await connection.rollback();
      res.status(409).json({ error: 'This request is already in progress and can no longer be cancelled.' });
      return;
    }

    if (!['open', 'pending', 'assigned', 'payment_pending'].includes(currentStatus)) {
      await connection.rollback();
      res.status(409).json({ error: 'This request cannot be cancelled in its current state.' });
      return;
    }

    await connection.execute(
      `UPDATE service_requests
       SET status = 'cancelled',
           assigned_worker_profile = NULL,
           assigned_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ?`,
      [idRequest]
    );

    await connection.execute(
      `UPDATE service_request_workers
       SET status = CASE WHEN status = 'rejected' THEN 'rejected' ELSE 'expired' END,
           counter_status = CASE WHEN counter_status = 'pending' THEN 'declined' ELSE counter_status END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ?`,
      [idRequest]
    );

    await connection.execute(
      `UPDATE service_request_payments
       SET payment_status = CASE WHEN payment_status = 'paid' THEN payment_status ELSE 'cancelled' END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ?`,
      [idRequest]
    );

    await connection.commit();
    res.json({
      success: true,
      message: 'Request cancelled successfully.',
      id_request: idRequest,
      status: 'cancelled',
    });
  } catch (error: any) {
    try {
      await connection.rollback();
    } catch {
      // ignore rollback errors
    }
    console.error('Error in cancelServiceRequest:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

export const autoReassignStaleAssignedRequests = async () => {
  await ensureServiceRequestTables();
  await ensureWorkerGeoColumns();

  const timeoutMinutes = Math.max(1, Number(process.env.WORKER_RESPONSE_TIMEOUT_MINUTES || 10));
  const [staleRows] = await pool.execute<RowDataPacket[]>(
    `SELECT id_request, id_service, latitude, longitude, radius_km, assigned_worker_profile
     FROM service_requests
     WHERE status = 'assigned'
       AND assigned_worker_profile IS NOT NULL
       AND assigned_at IS NOT NULL
       AND assigned_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? MINUTE)
     ORDER BY assigned_at ASC
     LIMIT 50`,
    [timeoutMinutes]
  );

  for (const stale of staleRows) {
    const idRequest = Number(stale.id_request);
    const prevWorker = Number(stale.assigned_worker_profile);
    const idService = Number(stale.id_service);
    const lat = stale.latitude != null ? Number(stale.latitude) : null;
    const lng = stale.longitude != null ? Number(stale.longitude) : null;
    const radiusKm = Number(stale.radius_km || 8);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [lockRows] = await connection.execute<RowDataPacket[]>(
        `SELECT id_request, status, assigned_worker_profile
         FROM service_requests
         WHERE id_request = ?
         LIMIT 1
         FOR UPDATE`,
        [idRequest]
      );
      if (lockRows.length === 0 || lockRows[0].status !== 'assigned') {
        await connection.rollback();
        continue;
      }

      await connection.execute(
        `UPDATE service_request_workers
         SET status = 'expired',
             counter_status = CASE WHEN counter_status = 'pending' THEN 'declined' ELSE counter_status END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id_request = ? AND id_worker_profile = ?`,
        [idRequest, prevWorker]
      );

      await connection.execute(
        `UPDATE service_requests
         SET status = 'pending',
             assigned_worker_profile = NULL,
             assigned_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id_request = ?`,
        [idRequest]
      );

      if (lat != null && lng != null && idService > 0) {
        const [nearRows] = await connection.execute<RowDataPacket[]>(
          `SELECT
             wp.id_worker_profile,
             (ST_Distance_Sphere(point(wp.longitude, wp.latitude), point(?, ?)) / 1000) AS distance_km
           FROM worker_profiles wp
           INNER JOIN users u ON u.id_user = wp.id_user
           INNER JOIN worker_services ws ON ws.id_worker_profile = wp.id_worker_profile
           LEFT JOIN service_request_workers srw
             ON srw.id_request = ? AND srw.id_worker_profile = wp.id_worker_profile
           WHERE u.rol = 'worker'
             AND wp.is_verified = 1
             AND ws.id_service = ?
             AND wp.latitude IS NOT NULL
             AND wp.longitude IS NOT NULL
             AND wp.id_worker_profile <> ?
             AND srw.id_request IS NULL
           HAVING distance_km <= ? AND distance_km <= wp.coverage_km
           ORDER BY distance_km ASC
           LIMIT 50`,
          [lng, lat, idRequest, idService, prevWorker, radiusKm]
        );

        for (const row of nearRows) {
          await connection.execute(
            `INSERT INTO service_request_workers (id_request, id_worker_profile, distance_km, status)
             VALUES (?, ?, ?, 'new')`,
            [idRequest, Number(row.id_worker_profile), row.distance_km != null ? Number(row.distance_km) : null]
          );
        }
      }

      await connection.commit();
    } catch {
      await connection.rollback();
    } finally {
      connection.release();
    }
  }
};

const resolveRequestParticipant = async (idRequest: number, userId: number) => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       sr.id_request,
       sr.id_user AS client_user_id,
       sr.status AS request_status,
       sr.assigned_worker_profile,
       wp.id_user AS worker_user_id
     FROM service_requests sr
     LEFT JOIN worker_profiles wp ON wp.id_worker_profile = sr.assigned_worker_profile
     WHERE sr.id_request = ?
     LIMIT 1`,
    [idRequest]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  if (Number(row.client_user_id) === userId) {
    return {
      role: 'client' as const,
      clientUserId: Number(row.client_user_id),
      workerUserId: row.worker_user_id != null ? Number(row.worker_user_id) : null,
      assignedWorkerProfile: row.assigned_worker_profile != null ? Number(row.assigned_worker_profile) : null,
      requestStatus: String(row.request_status || '').toLowerCase(),
    };
  }
  if (row.worker_user_id != null && Number(row.worker_user_id) === userId) {
    return {
      role: 'worker' as const,
      clientUserId: Number(row.client_user_id),
      workerUserId: Number(row.worker_user_id),
      assignedWorkerProfile: row.assigned_worker_profile != null ? Number(row.assigned_worker_profile) : null,
      requestStatus: String(row.request_status || '').toLowerCase(),
    };
  }
  return null;
};

export const getRequestChat = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    await ensureServiceRequestTables();

    const idRequest = Number(req.params.idRequest);
    if (!idRequest) {
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }

    const participant = await resolveRequestParticipant(idRequest, userId);
    if (!participant) {
      res.status(403).json({ error: 'Access denied for this request chat.' });
      return;
    }
    if (!participant.assignedWorkerProfile || !CHAT_ENABLED_REQUEST_STATUSES.includes(participant.requestStatus)) {
      res.status(409).json({ error: 'Chat is available only after a worker accepts the request.' });
      return;
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_message, id_request, sender_role, id_user, id_worker_profile, message, image_url, created_at
       FROM service_request_chat_messages
       WHERE id_request = ?
       ORDER BY created_at ASC, id_message ASC
       LIMIT 500`,
      [idRequest]
    );

    res.json({
      success: true,
      chat: rows.map((row: any) => ({
        id_message: Number(row.id_message),
        id_request: Number(row.id_request),
        sender_role: row.sender_role,
        id_user: Number(row.id_user),
        id_worker_profile: row.id_worker_profile != null ? Number(row.id_worker_profile) : null,
        message: row.message || null,
        image_url: row.image_url ? `${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(row.image_url)}` : null,
        created_at: row.created_at,
      })),
    });
  } catch (error: any) {
    console.error('Error in getRequestChat:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const postRequestChatMessage = async (req: AuthRequest, res: Response): Promise<void> => {
  const files = ((req.files as Express.Multer.File[]) || []).slice(0, 3);
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      removeUploadedFiles(files);
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    await ensureServiceRequestTables();

    const idRequest = Number(req.params.idRequest);
    const rawMessage = String(req.body?.message || '').trim();
    const message = rawMessage ? rawMessage.slice(0, 500) : null;
    if (!idRequest) {
      removeUploadedFiles(files);
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }
    if (!message && files.length === 0) {
      res.status(400).json({ error: 'Message or image is required.' });
      return;
    }

    const participant = await resolveRequestParticipant(idRequest, userId);
    if (!participant) {
      removeUploadedFiles(files);
      res.status(403).json({ error: 'Access denied for this request chat.' });
      return;
    }
    if (!participant.assignedWorkerProfile || !CHAT_ENABLED_REQUEST_STATUSES.includes(participant.requestStatus)) {
      removeUploadedFiles(files);
      res.status(409).json({ error: 'Chat is available only after a worker accepts the request.' });
      return;
    }

    let workerProfileId: number | null = null;
    if (participant.role === 'worker') {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT id_worker_profile FROM worker_profiles WHERE id_user = ? LIMIT 1`,
        [userId]
      );
      workerProfileId = rows.length > 0 ? Number(rows[0].id_worker_profile) : null;
    }

    const inserts: any[] = [];
    const firstImage = files[0] || null;
    const [insertResult] = await pool.execute<ResultSetHeader>(
      `INSERT INTO service_request_chat_messages
       (id_request, sender_role, id_user, id_worker_profile, message, image_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [idRequest, participant.role, userId, workerProfileId, message, firstImage ? firstImage.filename : null]
    );
    const primaryMessageId = Number(insertResult.insertId || 0);
    if (firstImage) inserts.push(firstImage.filename);

    for (let i = 1; i < files.length; i += 1) {
      const file = files[i];
      await pool.execute(
        `INSERT INTO service_request_chat_messages
         (id_request, sender_role, id_user, id_worker_profile, message, image_url)
         VALUES (?, ?, ?, ?, NULL, ?)`,
        [idRequest, participant.role, userId, workerProfileId, file.filename]
      );
      inserts.push(file.filename);
    }

    const recipientUserId =
      participant.role === 'client' ? participant.workerUserId : participant.clientUserId;

    if (recipientUserId) {
      const senderLabel = participant.role === 'client' ? 'client' : 'worker';
      const notificationMessage = message
        ? message.slice(0, 120)
        : `A new image was shared in request #${idRequest}.`;

      await createUserNotification({
        userId: recipientUserId,
        eventType: 'chat_new_message',
        title: participant.role === 'client' ? 'New client message' : 'New worker message',
        message: notificationMessage,
        tone: 'info',
        requestId: idRequest,
        actionUrl: participant.role === 'client' ? '/pro-dashboard' : '/app',
        dedupeKey: primaryMessageId
          ? `chat-message-${primaryMessageId}`
          : `chat-message-${idRequest}-${userId}-${Date.now()}`,
        metadata: {
          sender_role: senderLabel,
          has_image: files.length > 0,
        },
      });
    }

    res.status(201).json({
      success: true,
      message: 'Chat message sent.',
      id_request: idRequest,
      uploads: inserts.map((name) => `${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(name)}`),
    });
  } catch (error: any) {
    console.error('Error in postRequestChatMessage:', error);
    removeUploadedFiles(files);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createRequestPaymentCheckout = async (req: AuthRequest, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();

    const idRequest = Number(req.params.idRequest);
    if (!idRequest) {
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }

    await connection.beginTransaction();

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT id_request, id_user, status, assigned_worker_profile, budget, final_budget
       FROM service_requests
       WHERE id_request = ? AND id_user = ?
       LIMIT 1
       FOR UPDATE`,
      [idRequest, userId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      res.status(404).json({ error: 'Request not found.' });
      return;
    }

    const requestRow = rows[0];
    const status = String(requestRow.status || '').toLowerCase();
    if (!requestRow.assigned_worker_profile) {
      await connection.rollback();
      res.status(409).json({ error: 'No worker assigned to this request yet.' });
      return;
    }
    if (status !== 'payment_pending') {
      await connection.rollback();
      res.status(409).json({ error: 'This request is not waiting for payment.' });
      return;
    }

    const { amount, platformFee, workerPayout } = getPaymentBreakdown(getRequestChargeAmount(requestRow));
    const checkoutReference = buildCheckoutReference(idRequest);

    await connection.execute(
      `INSERT INTO service_request_payments
       (id_request, provider, checkout_reference, amount, platform_fee, worker_payout, payment_status)
       VALUES (?, 'sandbox', ?, ?, ?, ?, 'pending')
       ON DUPLICATE KEY UPDATE
         provider = VALUES(provider),
         checkout_reference = VALUES(checkout_reference),
         amount = VALUES(amount),
         platform_fee = VALUES(platform_fee),
         worker_payout = VALUES(worker_payout),
         payment_status = CASE WHEN payment_status = 'paid' THEN payment_status ELSE 'pending' END,
         updated_at = CURRENT_TIMESTAMP`,
      [idRequest, checkoutReference, amount, platformFee, workerPayout]
    );

    await connection.commit();
    res.json({
      success: true,
      message: 'Checkout session created.',
      checkout: {
        id_request: idRequest,
        provider: 'sandbox',
        checkout_reference: checkoutReference,
        amount,
        platform_fee: platformFee,
        worker_payout: workerPayout,
      },
    });
  } catch (error: any) {
    await connection.rollback();
    console.error('Error in createRequestPaymentCheckout:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

export const confirmRequestPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();

    const idRequest = Number(req.params.idRequest);
    if (!idRequest) {
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }

    await connection.beginTransaction();

    const [requestRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id_request, id_user, status, budget, final_budget, assigned_worker_profile
       FROM service_requests
       WHERE id_request = ? AND id_user = ?
       LIMIT 1
       FOR UPDATE`,
      [idRequest, userId]
    );

    if (requestRows.length === 0) {
      await connection.rollback();
      res.status(404).json({ error: 'Request not found.' });
      return;
    }

    const requestRow = requestRows[0];
    const currentStatus = String(requestRow.status || '').toLowerCase();
    if (currentStatus !== 'payment_pending') {
      await connection.rollback();
      res.status(409).json({ error: 'This request is not waiting for payment.' });
      return;
    }

    const [paymentRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id_payment, payment_status, amount
       FROM service_request_payments
       WHERE id_request = ?
       LIMIT 1
       FOR UPDATE`,
      [idRequest]
    );

    const { amount, platformFee, workerPayout } = getPaymentBreakdown(getRequestChargeAmount(requestRow));

    if (paymentRows.length === 0) {
      await connection.execute(
        `INSERT INTO service_request_payments
         (id_request, provider, checkout_reference, amount, platform_fee, worker_payout, payment_status, paid_at)
         VALUES (?, 'sandbox', ?, ?, ?, ?, 'paid', CURRENT_TIMESTAMP)`,
        [idRequest, buildCheckoutReference(idRequest), amount, platformFee, workerPayout]
      );
    } else {
      if (String(paymentRows[0].payment_status || '').toLowerCase() === 'paid') {
        await connection.rollback();
        res.status(409).json({ error: 'This request is already paid.' });
        return;
      }

      await connection.execute(
        `UPDATE service_request_payments
         SET amount = ?,
             platform_fee = ?,
             worker_payout = ?,
             payment_status = 'paid',
             paid_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id_request = ?`,
        [amount, platformFee, workerPayout, idRequest]
      );
    }

    await connection.execute(
      `UPDATE service_requests
       SET status = 'paid',
           final_budget = COALESCE(final_budget, budget),
           updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ?`,
      [idRequest]
    );

    await connection.commit();

    const workerUserId = await getWorkerUserIdByProfileId(
      requestRow.assigned_worker_profile != null ? Number(requestRow.assigned_worker_profile) : null
    );

    await createUserNotification({
      userId,
      eventType: 'payment_secured',
      title: 'Payment secured',
      message: `Funds are secured for request #${idRequest}. Your pro can head over now.`,
      tone: 'success',
      requestId: idRequest,
      actionUrl: '/app',
      dedupeKey: `request-${idRequest}-payment-secured-client`,
      metadata: { request_status: 'paid' },
    });

    if (workerUserId) {
      await createUserNotification({
        userId: workerUserId,
        eventType: 'payment_secured',
        title: 'Client payment secured',
        message: `Request #${idRequest} is now paid. You can head to the client.`,
        tone: 'success',
        requestId: idRequest,
        actionUrl: '/pro-dashboard',
        dedupeKey: `request-${idRequest}-payment-secured-worker`,
        metadata: { request_status: 'paid' },
      });
    }

    res.json({
      success: true,
      message: 'Payment confirmed. Funds are secured for this request.',
      id_request: idRequest,
      payment: {
        provider: 'sandbox',
        amount,
        platform_fee: platformFee,
        worker_payout: workerPayout,
        status: 'paid',
      },
      request_status: 'paid',
    });
  } catch (error: any) {
    await connection.rollback();
    console.error('Error in confirmRequestPayment:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

export const confirmServiceCompletion = async (req: AuthRequest, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();

    const idRequest = Number(req.params.idRequest);
    if (!idRequest) {
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }

    await connection.beginTransaction();

    const [requestRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id_request, id_user, status, assigned_worker_profile
       FROM service_requests
       WHERE id_request = ? AND id_user = ?
       LIMIT 1
       FOR UPDATE`,
      [idRequest, userId]
    );

    if (requestRows.length === 0) {
      await connection.rollback();
      res.status(404).json({ error: 'Request not found.' });
      return;
    }

    const status = String(requestRows[0].status || '').toLowerCase();
    if (status !== 'awaiting_confirmation') {
      await connection.rollback();
      res.status(409).json({ error: 'This request is not waiting for customer confirmation.' });
      return;
    }

    await connection.execute(
      `UPDATE service_requests
       SET status = 'done',
           updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ?`,
      [idRequest]
    );

    await connection.execute(
      `UPDATE service_request_payments
       SET payment_status = CASE WHEN payment_status = 'paid' THEN 'released' ELSE payment_status END,
           released_at = CASE WHEN payment_status = 'paid' THEN CURRENT_TIMESTAMP ELSE released_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ?`,
      [idRequest]
    );

    await connection.commit();

    const workerUserId = await getWorkerUserIdByProfileId(
      requestRows[0].assigned_worker_profile != null ? Number(requestRows[0].assigned_worker_profile) : null
    );

    await createUserNotification({
      userId,
      eventType: 'job_completed',
      title: 'Service completed',
      message: `Request #${idRequest} is complete and your review is now unlocked.`,
      tone: 'success',
      requestId: idRequest,
      actionUrl: '/app',
      dedupeKey: `request-${idRequest}-completed-client`,
      metadata: { request_status: 'done' },
    });

    if (workerUserId) {
      await createUserNotification({
        userId: workerUserId,
        eventType: 'job_completed',
        title: 'Job completed',
        message: `The client confirmed request #${idRequest}. Payment is marked for release.`,
        tone: 'success',
        requestId: idRequest,
        actionUrl: '/pro-dashboard',
        dedupeKey: `request-${idRequest}-completed-worker`,
        metadata: { request_status: 'done' },
      });

      const workerProfileId = requestRows[0].assigned_worker_profile != null ? Number(requestRows[0].assigned_worker_profile) : null;
      if (workerProfileId) {
        const settings = await getWorkerRewardsSettings();
        await syncWorkerBonusPayouts(workerProfileId, settings);
        const payoutRows = await getWorkerBonusPayouts(workerProfileId);
        const matchingPayouts = payoutRows.filter((row: any) => {
          if (String(row.payout_status || '').toLowerCase() !== 'scheduled') return false;
          if (row.source_request_id != null && Number(row.source_request_id) === idRequest) return true;
          return false;
        });

        await Promise.all(
          matchingPayouts.map((row: any) =>
            createUserNotification({
              userId: workerUserId,
              eventType: 'payout_scheduled',
              title: String(row.bonus_type || '').toLowerCase() === 'royalty' ? 'Royalty payout scheduled' : 'Commission payout scheduled',
              message: `A $${Number(row.bonus_amount || 0).toFixed(2)} payout is scheduled for ${row.scheduled_for ? new Date(row.scheduled_for).toLocaleDateString() : 'the next cycle'}.`,
              tone: 'success',
              bonusPayoutId: Number(row.id_bonus_payout),
              requestId: row.source_request_id != null ? Number(row.source_request_id) : null,
              actionUrl: '/pro-dashboard',
              dedupeKey: `worker-payout-scheduled-${Number(row.id_bonus_payout)}`,
              metadata: {
                bonus_type: row.bonus_type,
                scheduled_for: row.scheduled_for,
                bonus_amount: Number(row.bonus_amount || 0),
              },
            })
          )
        );
      }
    }

    res.json({
      success: true,
      message: 'Work confirmed. Payment will be released to the worker.',
      id_request: idRequest,
      request_status: 'done',
    });
  } catch (error: any) {
    await connection.rollback();
    console.error('Error in confirmServiceCompletion:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

export const submitRequestRating = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    await ensureServiceRequestTables();

    const idRequest = Number(req.params.idRequest);
    const punctuality = Number(req.body?.punctuality);
    const quality = Number(req.body?.quality);
    const priceFairness = Number(req.body?.price_fairness);
    const comment = req.body?.comment != null ? String(req.body.comment).trim().slice(0, 255) : null;

    if (!idRequest) {
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }
    const metrics = [punctuality, quality, priceFairness];
    if (metrics.some((m) => !Number.isInteger(m) || m < 1 || m > 5)) {
      res.status(400).json({ error: 'Ratings must be integers between 1 and 5.' });
      return;
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_request, id_user, assigned_worker_profile, status
       FROM service_requests
       WHERE id_request = ? AND id_user = ?
       LIMIT 1`,
      [idRequest, userId]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Request not found.' });
      return;
    }
    const row = rows[0];
    const workerProfileId = row.assigned_worker_profile != null ? Number(row.assigned_worker_profile) : null;
    if (!workerProfileId) {
      res.status(409).json({ error: 'No assigned worker to rate.' });
      return;
    }
    if (String(row.status) !== 'done') {
      res.status(409).json({ error: 'Rating is available only when the job is completed.' });
      return;
    }

    await pool.execute(
      `INSERT INTO service_request_ratings
       (id_request, id_client_user, id_worker_profile, punctuality, quality, price_fairness, comment)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         punctuality = VALUES(punctuality),
         quality = VALUES(quality),
         price_fairness = VALUES(price_fairness),
         comment = VALUES(comment),
         updated_at = CURRENT_TIMESTAMP`,
      [idRequest, userId, workerProfileId, punctuality, quality, priceFairness, comment]
    );

    res.json({ success: true, message: 'Rating submitted successfully.', id_request: idRequest });
  } catch (error: any) {
    console.error('Error in submitRequestRating:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const acceptAssignedWorker = async (req: AuthRequest, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();

    const idRequest = Number(req.params.idRequest);
    if (!idRequest) {
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }

    await connection.beginTransaction();

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT
         sr.id_request,
         sr.id_user,
         sr.status,
         sr.assigned_worker_profile,
         sr.budget,
         sr.final_budget,
         srw_assigned.proposed_budget,
         srw_assigned.counter_status
       FROM service_requests sr
       LEFT JOIN service_request_workers srw_assigned
         ON srw_assigned.id_request = sr.id_request
        AND srw_assigned.id_worker_profile = sr.assigned_worker_profile
       WHERE sr.id_request = ? AND sr.id_user = ?
       LIMIT 1
       FOR UPDATE`,
      [idRequest, userId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      res.status(404).json({ error: 'Request not found.' });
      return;
    }

    const row = rows[0];
    const workerProfileId = row.assigned_worker_profile != null ? Number(row.assigned_worker_profile) : null;
    if (!workerProfileId || String(row.status || '').toLowerCase() !== 'assigned' || row.proposed_budget != null) {
      await connection.rollback();
      res.status(409).json({ error: 'No worker approval is pending for this request.' });
      return;
    }

    const nextBudget = row.final_budget != null ? Number(row.final_budget) : Number(row.budget || 0);

    await connection.execute(
      `UPDATE service_requests
       SET status = 'payment_pending',
           final_budget = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ?`,
      [nextBudget, idRequest]
    );

    await connection.commit();

    const workerUserId = await getWorkerUserIdByProfileId(workerProfileId);
    if (workerUserId) {
      await createUserNotification({
        userId: workerUserId,
        eventType: 'worker_approved',
        title: 'Client approved you',
        message: `The client approved you for request #${idRequest}. You can now open the route while payment is being secured.`,
        tone: 'success',
        requestId: idRequest,
        actionUrl: '/pro-dashboard',
        dedupeKey: `request-${idRequest}-worker-approved-worker`,
        metadata: { request_status: 'payment_pending' },
      });
    }

    await createUserNotification({
      userId,
      eventType: 'worker_approved',
      title: 'Worker approved',
      message: `You approved the pro for request #${idRequest}. Secure payment when you are ready.`,
      tone: 'success',
      requestId: idRequest,
      actionUrl: '/app',
      dedupeKey: `request-${idRequest}-worker-approved-client`,
      metadata: { request_status: 'payment_pending' },
    });

    res.json({
      success: true,
      message: 'Worker approved. Payment is now pending.',
      id_request: idRequest,
      request_status: 'payment_pending',
      final_budget: nextBudget,
    });
  } catch (error: any) {
    await connection.rollback();
    console.error('Error in acceptAssignedWorker:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

export const declineAssignedWorker = async (req: AuthRequest, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();
    await ensureWorkerGeoColumns();

    const idRequest = Number(req.params.idRequest);
    if (!idRequest) {
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }

    await connection.beginTransaction();

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT
         sr.id_request,
         sr.id_user,
         sr.id_service,
         sr.status,
         sr.latitude,
         sr.longitude,
         sr.radius_km,
         sr.assigned_worker_profile,
         srw_assigned.proposed_budget
       FROM service_requests sr
       LEFT JOIN service_request_workers srw_assigned
         ON srw_assigned.id_request = sr.id_request
        AND srw_assigned.id_worker_profile = sr.assigned_worker_profile
       WHERE sr.id_request = ? AND sr.id_user = ?
       LIMIT 1
       FOR UPDATE`,
      [idRequest, userId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      res.status(404).json({ error: 'Request not found.' });
      return;
    }

    const row = rows[0];
    const assignedWorker = row.assigned_worker_profile != null ? Number(row.assigned_worker_profile) : null;
    if (!assignedWorker || String(row.status || '').toLowerCase() !== 'assigned' || row.proposed_budget != null) {
      await connection.rollback();
      res.status(409).json({ error: 'No worker approval is pending for this request.' });
      return;
    }

    await requeueAssignedRequest(connection, {
      idRequest,
      idService: row.id_service != null ? Number(row.id_service) : null,
      latitude: row.latitude != null ? Number(row.latitude) : null,
      longitude: row.longitude != null ? Number(row.longitude) : null,
      radiusKm: row.radius_km != null ? Number(row.radius_km) : null,
      assignedWorkerProfile: assignedWorker,
    });

    await connection.commit();

    const workerUserId = await getWorkerUserIdByProfileId(assignedWorker);
    if (workerUserId) {
      await createUserNotification({
        userId: workerUserId,
        eventType: 'worker_declined',
        title: 'Client chose another pro',
        message: `The client declined your assignment for request #${idRequest}.`,
        tone: 'warning',
        requestId: idRequest,
        actionUrl: '/pro-dashboard',
        dedupeKey: `request-${idRequest}-worker-declined-worker`,
        metadata: { request_status: 'pending' },
      });
    }

    await createUserNotification({
      userId,
      eventType: 'worker_declined',
      title: 'Worker declined',
      message: `You declined the assigned pro for request #${idRequest}. We are looking for another worker.`,
      tone: 'info',
      requestId: idRequest,
      actionUrl: '/app',
      dedupeKey: `request-${idRequest}-worker-declined-client`,
      metadata: { request_status: 'pending' },
    });

    res.json({
      success: true,
      message: 'Worker declined. Looking for another worker.',
      id_request: idRequest,
      request_status: 'pending',
    });
  } catch (error: any) {
    await connection.rollback();
    console.error('Error in declineAssignedWorker:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

export const acceptCounterOffer = async (req: AuthRequest, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();

    const idRequest = Number(req.params.idRequest);
    if (!idRequest) {
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }

    await connection.beginTransaction();

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT
         sr.id_request,
         sr.id_user,
         sr.status,
         sr.assigned_worker_profile,
         srw_assigned.proposed_budget,
         srw_assigned.counter_status
       FROM service_requests sr
       LEFT JOIN service_request_workers srw_assigned
         ON srw_assigned.id_request = sr.id_request
        AND srw_assigned.id_worker_profile = sr.assigned_worker_profile
       WHERE sr.id_request = ? AND sr.id_user = ?
       LIMIT 1
       FOR UPDATE`,
      [idRequest, userId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      res.status(404).json({ error: 'Request not found.' });
      return;
    }

    const row = rows[0];
    if (!row.assigned_worker_profile || row.proposed_budget == null) {
      await connection.rollback();
      res.status(409).json({ error: 'No pending counter offer for this request.' });
      return;
    }

    const finalBudget = Number(row.proposed_budget);
    await connection.execute(
      `UPDATE service_requests
       SET budget = ?, final_budget = ?, status = 'payment_pending', updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ?`,
      [finalBudget, finalBudget, idRequest]
    );

    await connection.execute(
      `UPDATE service_request_workers
       SET counter_status = 'accepted', updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ? AND id_worker_profile = ?`,
      [idRequest, Number(row.assigned_worker_profile)]
    );

    await connection.commit();

    const workerProfileId = Number(row.assigned_worker_profile);
    const workerUserId = await getWorkerUserIdByProfileId(workerProfileId);

    if (workerUserId) {
      await createUserNotification({
        userId: workerUserId,
        eventType: 'counter_offer_accepted',
        title: 'Counter offer accepted',
        message: `The client accepted your counter offer for request #${idRequest}. Payment is now pending.`,
        tone: 'success',
        requestId: idRequest,
        actionUrl: '/pro-dashboard',
        dedupeKey: `request-${idRequest}-counter-accepted-worker`,
        metadata: { request_status: 'payment_pending' },
      });
    }

    await createUserNotification({
      userId,
      eventType: 'counter_offer_accepted',
      title: 'Counter offer accepted',
      message: `Request #${idRequest} is ready for payment so your pro can start.`,
      tone: 'info',
      requestId: idRequest,
      actionUrl: '/app',
      dedupeKey: `request-${idRequest}-counter-accepted-client`,
      metadata: { request_status: 'payment_pending' },
    });

    res.json({
      success: true,
      message: 'Counter offer accepted. Payment is now required.',
      id_request: idRequest,
      final_budget: finalBudget,
      request_status: 'payment_pending',
    });
  } catch (error: any) {
    await connection.rollback();
    console.error('Error in acceptCounterOffer:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};

export const declineCounterOffer = async (req: AuthRequest, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await ensureServiceRequestTables();
    await ensureWorkerGeoColumns();

    const idRequest = Number(req.params.idRequest);
    if (!idRequest) {
      res.status(400).json({ error: 'Invalid request id.' });
      return;
    }

    await connection.beginTransaction();

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT
         sr.id_request,
         sr.id_user,
         sr.id_service,
         sr.latitude,
         sr.longitude,
         sr.radius_km,
         sr.assigned_worker_profile,
         srw_assigned.proposed_budget
       FROM service_requests sr
       LEFT JOIN service_request_workers srw_assigned
         ON srw_assigned.id_request = sr.id_request
        AND srw_assigned.id_worker_profile = sr.assigned_worker_profile
       WHERE sr.id_request = ? AND sr.id_user = ?
       LIMIT 1
       FOR UPDATE`,
      [idRequest, userId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      res.status(404).json({ error: 'Request not found.' });
      return;
    }

    const row = rows[0];
    const assignedWorker = row.assigned_worker_profile != null ? Number(row.assigned_worker_profile) : null;
    if (!assignedWorker || row.proposed_budget == null) {
      await connection.rollback();
      res.status(409).json({ error: 'No pending counter offer for this request.' });
      return;
    }

    await connection.execute(
      `UPDATE service_request_workers
       SET status = 'rejected',
           counter_status = 'declined',
           updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ? AND id_worker_profile = ?`,
      [idRequest, assignedWorker]
    );

    await connection.execute(
      `UPDATE service_requests
       SET status = 'pending',
           assigned_worker_profile = NULL,
           assigned_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id_request = ?`,
      [idRequest]
    );

    if (row.latitude != null && row.longitude != null && row.id_service != null) {
      const lat = Number(row.latitude);
      const lng = Number(row.longitude);
      const radiusKm = Number(row.radius_km || 8);
      const idService = Number(row.id_service);

      const [nearRows] = await connection.execute<RowDataPacket[]>(
        `SELECT
           wp.id_worker_profile,
           (ST_Distance_Sphere(point(wp.longitude, wp.latitude), point(?, ?)) / 1000) AS distance_km
         FROM worker_profiles wp
         INNER JOIN users u ON u.id_user = wp.id_user
         INNER JOIN worker_services ws ON ws.id_worker_profile = wp.id_worker_profile
         LEFT JOIN service_request_workers srw
           ON srw.id_request = ? AND srw.id_worker_profile = wp.id_worker_profile
         WHERE u.rol = 'worker'
           AND wp.is_verified = 1
           AND ws.id_service = ?
           AND wp.latitude IS NOT NULL
           AND wp.longitude IS NOT NULL
           AND wp.id_worker_profile <> ?
           AND srw.id_request IS NULL
         HAVING distance_km <= ? AND distance_km <= wp.coverage_km
         ORDER BY distance_km ASC
         LIMIT 50`,
        [lng, lat, idRequest, idService, assignedWorker, radiusKm]
      );

      for (const candidate of nearRows) {
        await connection.execute(
          `INSERT INTO service_request_workers (id_request, id_worker_profile, distance_km, status)
           VALUES (?, ?, ?, 'new')`,
          [idRequest, Number(candidate.id_worker_profile), candidate.distance_km != null ? Number(candidate.distance_km) : null]
        );
      }
    }

    await connection.commit();
    res.json({
      success: true,
      message: 'Counter offer declined. Looking for another worker.',
      id_request: idRequest,
    });
  } catch (error: any) {
    await connection.rollback();
    console.error('Error in declineCounterOffer:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
};
