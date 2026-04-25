import React from 'react';
import type { LocationSuggestion, SavedLocation } from './ServiceRequestWizard.types';

const SAVED_LOCATIONS_KEY = 'fixlife.saved_locations.v1';
const HOME_ICON = "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6";
const WORK_ICON = "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4";
const RECENT_ICON = "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z";
const FAVORITE_ICON = "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.783.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81H7.03a1 1 0 00.95-.69l1.07-3.292z";
const CURRENT_ICON = "M12 21c-4.35-4.56-7-8.28-7-12a7 7 0 1114 0c0 3.72-2.65 7.44-7 12zm0-8.5A2.5 2.5 0 1012 7a2.5 2.5 0 000 5.5z";

export const renderStarSummary = (ratingAverage: number | null) => {
    const safeRating = ratingAverage != null ? Math.max(0, Math.min(5, ratingAverage)) : 0;

    return (
        <div className="flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, index) => {
                const filled = safeRating >= index + 1;
                const partial = !filled && safeRating > index && safeRating < index + 1;
                return (
                    <span
                        key={`star-${index}`}
                        className={`text-sm ${filled ? 'text-amber-400' : partial ? 'text-amber-300' : 'text-slate-300'}`}
                    >
                        {'\u2605'}
                    </span>
                );
            })}
        </div>
    );
};

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const first = touches[0];
    const second = touches[1];
    return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
};

export const parseCoordinateInput = (value: string) => {
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
    };
};

export const readSavedLocations = () => {
    if (typeof window === 'undefined') {
        return {
            home: null as SavedLocation | null,
            work: null as SavedLocation | null,
            favorites: [] as SavedLocation[],
            recent: [] as SavedLocation[],
        };
    }

    try {
        const raw = window.localStorage.getItem(SAVED_LOCATIONS_KEY);
        if (!raw) {
            return { home: null, work: null, favorites: [], recent: [] };
        }

        const parsed = JSON.parse(raw);
        return {
            home: parsed?.home ?? null,
            work: parsed?.work ?? null,
            favorites: Array.isArray(parsed?.favorites) ? parsed.favorites : [],
            recent: Array.isArray(parsed?.recent) ? parsed.recent : [],
        };
    } catch {
        return { home: null, work: null, favorites: [], recent: [] };
    }
};

export const writeSavedLocations = (payload: {
    home: SavedLocation | null;
    work: SavedLocation | null;
    favorites: SavedLocation[];
    recent: SavedLocation[];
}) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SAVED_LOCATIONS_KEY, JSON.stringify(payload));
};

export const compactLocationTitle = (label: string) => {
    const firstPart = String(label || '').split(',')[0]?.trim();
    if (!firstPart) return 'Recent';
    return firstPart.slice(0, 28);
};

export const toSavedLocation = (row: any): SavedLocation | null => {
    const lat = Number(row?.lat);
    const lng = Number(row?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return {
        id_saved_location: row?.id_saved_location != null ? Number(row.id_saved_location) : null,
        kind: String(row?.kind || 'recent') as SavedLocation['kind'],
        title: String(row?.title || 'Saved place'),
        label: String(row?.label || ''),
        lat,
        lng,
        last_used_at: row?.last_used_at ? new Date(row.last_used_at).getTime() : null,
    };
};

export const getPreviewTileUrl = (lat: number, lng: number, zoom = 15) => {
    const scale = 2 ** zoom;
    const x = Math.min(
        Math.max(Math.floor(((lng + 180) / 360) * scale), 0),
        scale - 1
    );
    const y = Math.min(
        Math.max(
            Math.floor(
                ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
                    scale
            ),
            0
        ),
        scale - 1
    );

    return `https://a.basemaps.cartocdn.com/rastertiles/voyager/${zoom}/${x}/${y}.png`;
};

export const sameCoords = (
    pointA: { lat: number; lng: number } | null | undefined,
    pointB: { lat: number; lng: number } | null | undefined
) => {
    if (!pointA || !pointB) return false;
    return (
        Math.abs(Number(pointA.lat) - Number(pointB.lat)) < 0.00005 &&
        Math.abs(Number(pointA.lng) - Number(pointB.lng)) < 0.00005
    );
};

export const distanceKmBetween = (
    pointA: { lat: number; lng: number } | null | undefined,
    pointB: { lat: number; lng: number } | null | undefined
) => {
    if (!pointA || !pointB) return null;

    const toRad = (value: number) => (value * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const dLat = toRad(pointB.lat - pointA.lat);
    const dLng = toRad(pointB.lng - pointA.lng);
    const lat1 = toRad(pointA.lat);
    const lat2 = toRad(pointB.lat);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);

    return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const formatDistanceLabel = (distanceKm: number | null) => {
    if (distanceKm == null || !Number.isFinite(distanceKm)) return null;
    if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m away`;
    return `${distanceKm.toFixed(1)} km away`;
};

export const getSuggestionDisplay = (suggestion: LocationSuggestion) => {
    const fallbackParts = String(suggestion.label || '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .filter((part) => part.toLowerCase() !== 'el salvador');

    return {
        title: (suggestion.short_label || fallbackParts[0] || suggestion.label || 'Saved place').trim(),
        context:
            (suggestion.context_label ||
                fallbackParts.slice(1, 3).join(' - ') ||
                `${suggestion.lat.toFixed(4)}, ${suggestion.lng.toFixed(4)}`).trim(),
    };
};

const getSuggestionKindLabel = (kind?: string) => {
    if (!kind) return 'Place';
    if (kind === 'centro-comercial') return 'Mall';
    if (kind === 'residencial') return 'Residential';
    if (kind === 'colonia') return 'Colonia';
    if (kind === 'parque') return 'Park';
    if (kind === 'zona') return 'Zone';
    return 'Place';
};

export const getSuggestionBadgeLabel = (suggestion: LocationSuggestion) => {
    if (suggestion.source === 'local') {
        return `SV - ${getSuggestionKindLabel(suggestion.kind)}`;
    }

    if (suggestion.kind) {
        return getSuggestionKindLabel(suggestion.kind);
    }

    return 'Map';
};

export const getLocationVisual = (kind: SavedLocation['kind'] | 'current') => {
    if (kind === 'home') {
        return {
            color: '#10b981',
            label: 'Home',
            iconPath: HOME_ICON,
            filled: false,
            badgeClass: 'from-emerald-500 via-emerald-500 to-teal-500',
            iconClass: 'text-emerald-600',
            chipClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        };
    }
    if (kind === 'work') {
        return {
            color: '#f59e0b',
            label: 'Work',
            iconPath: WORK_ICON,
            filled: false,
            badgeClass: 'from-amber-400 via-amber-500 to-orange-500',
            iconClass: 'text-amber-600',
            chipClass: 'border-amber-200 bg-amber-50 text-amber-700',
        };
    }
    if (kind === 'favorite') {
        return {
            color: '#ec4899',
            label: 'Favorite',
            iconPath: FAVORITE_ICON,
            filled: true,
            badgeClass: 'from-fuchsia-500 via-pink-500 to-rose-500',
            iconClass: 'text-pink-600',
            chipClass: 'border-pink-200 bg-pink-50 text-pink-700',
        };
    }
    if (kind === 'recent') {
        return {
            color: '#64748b',
            label: 'Recent',
            iconPath: RECENT_ICON,
            filled: false,
            badgeClass: 'from-slate-500 via-slate-500 to-slate-600',
            iconClass: 'text-slate-600',
            chipClass: 'border-slate-200 bg-slate-50 text-slate-700',
        };
    }
    return {
        color: '#0ea5e9',
        label: 'Selected',
        iconPath: CURRENT_ICON,
        filled: true,
        badgeClass: 'from-sky-500 via-cyan-500 to-blue-500',
        iconClass: 'text-sky-600',
        chipClass: 'border-sky-200 bg-sky-50 text-gray-500',
    };
};

export const renderLocationIcon = (
    kind: SavedLocation['kind'] | 'current',
    className = 'h-4 w-4'
) => {
    const visual = getLocationVisual(kind);

    return (
        <svg
            className={className}
            viewBox="0 0 24 24"
            fill={visual.filled ? 'currentColor' : 'none'}
            stroke={visual.filled ? 'none' : 'currentColor'}
            strokeWidth={visual.filled ? 0 : 2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d={visual.iconPath} />
        </svg>
    );
};

export const renderLocationBadge = (
    kind: SavedLocation['kind'] | 'current',
    size: 'sm' | 'md' | 'lg' = 'md'
) => {
    const visual = getLocationVisual(kind);
    const sizeMap = {
        sm: {
            outer: 'h-8 w-8 rounded-xl',
            inner: 'h-6 w-6 rounded-[10px]',
            icon: 'h-3.5 w-3.5',
        },
        md: {
            outer: 'h-11 w-11 rounded-2xl',
            inner: 'h-8 w-8 rounded-xl',
            icon: 'h-4 w-4',
        },
        lg: {
            outer: 'h-12 w-12 rounded-2xl',
            inner: 'h-9 w-9 rounded-xl',
            icon: 'h-4.5 w-4.5',
        },
    }[size];

    return (
        <span
            className={`inline-flex items-center justify-center bg-gradient-to-br ${visual.badgeClass} ${sizeMap.outer} shadow-[0_10px_24px_rgba(15,23,42,0.12)] ring-1 ring-black/5`}
        >
            <span className={`inline-flex items-center justify-center bg-white/95 ${visual.iconClass} ${sizeMap.inner}`}>
                {renderLocationIcon(kind, sizeMap.icon)}
            </span>
        </span>
    );
};

export const renderSavedPlaceActionIcon = (
    action: 'use' | 'rename' | 'delete',
    className = 'h-3.5 w-3.5'
) => {
    if (action === 'use') {
        return (
            <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
        );
    }

    if (action === 'rename') {
        return (
            <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.768-6.768a2.5 2.5 0 113.536 3.536L12.536 16.536A4 4 0 019.708 17.7L7 18l.3-2.708A4 4 0 018.464 12.536L9 12z" />
            </svg>
        );
    }

    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12m-9 0V5a1 1 0 011-1h4a1 1 0 011 1v2m-7 0l1 12h6l1-12M10 11v5m4-5v5" />
        </svg>
    );
};

export const getSavedPlaceActionClassName = (action: 'use' | 'rename' | 'delete') => {
    if (action === 'use') {
        return 'border-bird-blue/20 bg-bird-blue/10 text-slate-900 hover:bg-bird-blue hover:text-white hover:shadow-[0_12px_24px_rgba(29,78,216,0.18)]';
    }
    if (action === 'rename') {
        return 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-400 hover:border-amber-400 hover:text-white hover:shadow-[0_12px_24px_rgba(245,158,11,0.22)]';
    }
    return 'border-amber-100 bg-white text-slate-500 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700';
};

export const getInitials = (value: string) => {
    const parts = String(value || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return 'PR';
};

export const createLeafletPinIcon = (L: any, kind: SavedLocation['kind'] | 'current') => {
    const visual = getLocationVisual(kind);

    return L.divIcon({
        className: 'fixlife-location-pin',
        iconSize: [30, 42],
        iconAnchor: [15, 40],
        popupAnchor: [0, -34],
        html: `
          <div style="position:relative;width:30px;height:42px;">
            <div style="position:absolute;left:50%;top:0;transform:translateX(-50%);width:30px;height:30px;border-radius:999px 999px 999px 0;background:${visual.color};border:3px solid #ffffff;box-shadow:0 10px 18px rgba(15,23,42,.22);transform-origin:center;rotate:-45deg;"></div>
            <div style="position:absolute;left:50%;top:6px;transform:translateX(-50%);width:16px;height:16px;border-radius:999px;background:#ffffff;color:${visual.color};display:flex;align-items:center;justify-content:center;">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="${visual.filled ? 'currentColor' : 'none'}" stroke="${visual.filled ? 'none' : 'currentColor'}" stroke-width="${visual.filled ? '0' : '2'}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="${visual.iconPath}"></path>
              </svg>
            </div>
          </div>
        `,
    });
};
