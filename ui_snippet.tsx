import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ServiceRequestData } from '../../types';
import { API_ENDPOINTS } from '../../config/api';
import { getAuthUser, getToken, isAuthenticated } from '../../utils/session';
import { Notyf } from 'notyf';
import { NotificationCenter } from '../common/NotificationCenter';
import 'notyf/notyf.min.css';

const ClientLiveRequestTracker = lazy(() => import('./ClientLiveRequestTracker'));

class TrackerErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean }
> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidUpdate(prevProps: { children: React.ReactNode }) {
        if (this.state.hasError && prevProps.children !== this.props.children) {
            this.setState({ hasError: false });
        }
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="rounded-3xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-sky-50 p-5 shadow-sm">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">Tracker paused</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                        The live route hit a temporary issue and was reset safely.
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                        Refresh the page or reopen the request to continue tracking.
                    </p>
                </div>
            );
        }

        return this.props.children;
    }
}

interface ServiceRequestWizardProps {
    isOpen: boolean;
    onClose: () => void;
    initialServiceId?: number;
    initialServiceName?: string;
}

interface ServiceOption {
    id_service: number;
    name: string;
    description: string | null;
    icon: string | null;
}

interface NearbyWorker {
    id_user: number;
    id_worker_profile: number;
    name: string;
    bio: string;
    profile_image: string | null;
    latitude?: number | null;
    longitude?: number | null;
    distance_km: number | null;
}

interface MyServiceRequest {
    id_request: number;
    id_service: number;
    service_name: string;
    description: string;
    location_text: string;
    latitude?: number | null;
    longitude?: number | null;
    initial_budget?: number | null;
    budget: number;
    final_budget?: number | null;
    radius_km: number;
    status: 'pending' | 'payment_pending' | 'paid' | 'assigned' | 'in_progress' | 'awaiting_confirmation' | 'done' | 'cancelled' | string;
    created_at: string;
    assigned_worker: {
        id_worker_profile: number;
        name: string;
        phone_number?: string | null;
        bio?: string;
        profile_image_url?: string | null;
        latitude?: number | null;
        longitude?: number | null;
        is_online?: boolean | null;
    } | null;
    proposed_budget?: number | null;
    counter_message?: string | null;
    counter_status?: 'pending' | 'accepted' | 'declined' | null;
    payment?: {
        provider: string;
        checkout_reference: string | null;
        amount: number;
        status: 'pending' | 'paid' | 'released' | 'refunded' | 'failed' | 'cancelled' | string;
        paid_at: string | null;
        released_at: string | null;
    } | null;
    images: { file_name: string; url: string }[];
}

interface WorkerPortfolioPhoto {
    id_photo: number;
    description: string;
    uploaded_at: string | null;
    image_url: string | null;
}

interface RequestWorkerProfileResponse {
    worker: {
        id_worker_profile: number;
        name: string;
        phone_number: string | null;
        bio: string;
        is_online: boolean | null;
        profile_image_url: string | null;
        years_of_experience: number | null;
        experience_label: string;
        rating_average: number | null;
        rating_count: number;
        completed_jobs: number;
        services_offered: string[];
    };
    portfolio: WorkerPortfolioPhoto[];
}

interface ChatMessage {
    id_message: number;
    id_request: number;
    sender_role: 'client' | 'worker';
    message: string | null;
    image_url: string | null;
    created_at: string;
}

interface LocationSuggestion {
    label: string;
    lat: number;
    lng: number;
    source?: 'local' | 'nominatim' | string;
    kind?: string;
    short_label?: string;
    context_label?: string;
}

interface SavedLocation extends LocationSuggestion {
    id_saved_location?: number | null;
    kind: 'home' | 'work' | 'recent' | 'favorite';
    title: string;
    last_used_at?: number | null;
}

type RatingMetricKey = 'punctuality' | 'quality' | 'price_fairness';

const RATING_METRIC_LABELS: Record<RatingMetricKey, string> = {
    punctuality: 'Punctuality',
    quality: 'Quality',
    price_fairness: 'Price fairness',
};

const notyf = new Notyf({ position: { x: 'left', y: 'bottom' }, ripple: true });
const CHAT_POLL_MS = 3000;
const SAVED_LOCATIONS_KEY = 'fixlife.saved_locations.v1';
const HOME_ICON = "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6";
const WORK_ICON = "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4";
const RECENT_ICON = "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z";
const FAVORITE_ICON = "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.539 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.783.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81H7.03a1 1 0 00.95-.69l1.07-3.292z";
const CURRENT_ICON = "M12 21c-4.35-4.56-7-8.28-7-12a7 7 0 1114 0c0 3.72-2.65 7.44-7 12zm0-8.5A2.5 2.5 0 1012 7a2.5 2.5 0 000 5.5z";

const InlineTrackerFallback: React.FC = () => (
    <div className="rounded-[28px] border border-bird-blue/10 bg-white/95 p-4 shadow-[0_18px_38px_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-3">
            <div className="h-3.5 w-3.5 rounded-full border-2 border-bird-blue/20 border-t-bird-blue animate-spin" />
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-bird-blue">Preparing live tracker</p>
        </div>
    </div>
);

const renderStarSummary = (ratingAverage: number | null) => {
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
                        {'★'}
                    </span>
                );
            })}
        </div>
    );
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const first = touches[0];
    const second = touches[1];
    return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
};

declare global {
    interface Window {
        L?: any;
    }
}

const parseCoordinateInput = (value: string) => {
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

const readSavedLocations = () => {
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

const writeSavedLocations = (payload: {
    home: SavedLocation | null;
    work: SavedLocation | null;
    favorites: SavedLocation[];
    recent: SavedLocation[];
}) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SAVED_LOCATIONS_KEY, JSON.stringify(payload));
};

const compactLocationTitle = (label: string) => {
    const firstPart = String(label || '').split(',')[0]?.trim();
    if (!firstPart) return 'Recent';
    return firstPart.slice(0, 28);
};

const toSavedLocation = (row: any): SavedLocation | null => {
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

const getPreviewTileUrl = (lat: number, lng: number, zoom = 15) => {
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

const sameCoords = (
    pointA: { lat: number; lng: number } | null | undefined,
    pointB: { lat: number; lng: number } | null | undefined
) => {
    if (!pointA || !pointB) return false;
    return (
        Math.abs(Number(pointA.lat) - Number(pointB.lat)) < 0.00005 &&
        Math.abs(Number(pointA.lng) - Number(pointB.lng)) < 0.00005
    );
};

const distanceKmBetween = (
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

const formatDistanceLabel = (distanceKm: number | null) => {
    if (distanceKm == null || !Number.isFinite(distanceKm)) return null;
    if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m away`;
    return `${distanceKm.toFixed(1)} km away`;
};

const getSuggestionDisplay = (suggestion: LocationSuggestion) => {
    const fallbackParts = String(suggestion.label || '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .filter((part) => part.toLowerCase() !== 'el salvador');

    return {
        title: (suggestion.short_label || fallbackParts[0] || suggestion.label || 'Saved place').trim(),
        context:
            (suggestion.context_label ||
                fallbackParts.slice(1, 3).join(' â€¢ ') ||
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

const getSuggestionBadgeLabel = (suggestion: LocationSuggestion) => {
    if (suggestion.source === 'local') {
        return `SV â€¢ ${getSuggestionKindLabel(suggestion.kind)}`;
    }

    if (suggestion.kind) {
        return getSuggestionKindLabel(suggestion.kind);
    }

    return 'Map';
};

const getLocationVisual = (kind: SavedLocation['kind'] | 'current') => {
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
        chipClass: 'border-sky-200 bg-sky-50 text-sky-700',
    };
};

const renderLocationIcon = (
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

const renderLocationBadge = (
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

const renderSavedPlaceActionIcon = (
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

const getSavedPlaceActionClassName = (action: 'use' | 'rename' | 'delete') => {
    if (action === 'use') {
        return 'border-bird-blue/20 bg-bird-blue/10 text-bird-blue hover:bg-bird-blue hover:text-white hover:shadow-[0_12px_24px_rgba(29,78,216,0.18)]';
    }
    if (action === 'rename') {
        return 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-400 hover:border-amber-400 hover:text-white hover:shadow-[0_12px_24px_rgba(245,158,11,0.22)]';
    }
    return 'border-amber-100 bg-white text-slate-500 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700';
};

const getInitials = (value: string) => {
    const parts = String(value || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return 'PR';
};

const createLeafletPinIcon = (L: any, kind: SavedLocation['kind'] | 'current') => {
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
export const ServiceRequestWizard: React.FC<ServiceRequestWizardProps> = ({ isOpen, onClose, initialServiceId, initialServiceName }) => {
    const [step, setStep] = useState(initialServiceId ? 1 : 0);
    const [services, setServices] = useState<ServiceOption[]>([]);
    const [servicesLoading, setServicesLoading] = useState(false);
    const [data, setData] = useState<ServiceRequestData>({
        category: initialServiceName || '',
        description: '',
        location: '',
        price: '',
        images: []
    });
    const [isSearching, setIsSearching] = useState(false);
    const [problemFiles, setProblemFiles] = useState<File[]>([]);
    const [problemPreviewUrls, setProblemPreviewUrls] = useState<string[]>([]);
    const [geoLoading, setGeoLoading] = useState(false);
    const [resolvingLocation, setResolvingLocation] = useState(false);
    const [suggestionsLoading, setSuggestionsLoading] = useState(false);
    const [geoError, setGeoError] = useState<string | null>(null);
    const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
    const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
    const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(-1);
    const [locationInputContext, setLocationInputContext] = useState<'main' | 'save-panel'>('main');
    const [savedHome, setSavedHome] = useState<SavedLocation | null>(null);
    const [savedWork, setSavedWork] = useState<SavedLocation | null>(null);
    const [favoriteLocations, setFavoriteLocations] = useState<SavedLocation[]>([]);
    const [recentLocations, setRecentLocations] = useState<SavedLocation[]>([]);
    const [showSaveLocationPanel, setShowSaveLocationPanel] = useState(false);
    const [showSavedPlacesModal, setShowSavedPlacesModal] = useState(false);
    const [savedPlacesSearch, setSavedPlacesSearch] = useState('');
    const [savedPlacesFilter, setSavedPlacesFilter] = useState<'all' | 'primary' | 'favorite' | 'recent'>('all');
    const [pendingDeleteLocation, setPendingDeleteLocation] = useState<SavedLocation | null>(null);
    const [pendingRenameLocation, setPendingRenameLocation] = useState<SavedLocation | null>(null);
    const [pendingRenameTitle, setPendingRenameTitle] = useState('');
    const [pendingRequestAction, setPendingRequestAction] = useState<{ type: 'cancel' | 'complete'; request: MyServiceRequest } | null>(null);
    const [workerProfileRequest, setWorkerProfileRequest] = useState<MyServiceRequest | null>(null);
    const [workerProfileLoading, setWorkerProfileLoading] = useState(false);
    const [workerProfileData, setWorkerProfileData] = useState<RequestWorkerProfileResponse | null>(null);
    const [workerPortfolioIndex, setWorkerPortfolioIndex] = useState(0);
    const [isWorkerPortfolioFullscreen, setIsWorkerPortfolioFullscreen] = useState(false);
    const [isWorkerPortfolioZoomed, setIsWorkerPortfolioZoomed] = useState(false);
    const [workerPortfolioScale, setWorkerPortfolioScale] = useState(1);
    const [workerPortfolioTransformOrigin, setWorkerPortfolioTransformOrigin] = useState('center center');
    const [saveLocationKind, setSaveLocationKind] = useState<'home' | 'work' | 'favorite'>('favorite');
    const [saveLocationTitle, setSaveLocationTitle] = useState('');
    const [paymentModalRequest, setPaymentModalRequest] = useState<MyServiceRequest | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<'card' | 'paypal'>('card');
    const [paymentForm, setPaymentForm] = useState({
        fullName: '',
        email: '',
        phone: '',
        city: '',
        country: 'Guatemala',
        cardNumber: '',
        expiry: '',
        cvv: '',
    });
    const [nearbyWorkers, setNearbyWorkers] = useState<NearbyWorker[]>([]);
    const [radiusKm, setRadiusKm] = useState<number>(8);
    const [leafletReady, setLeafletReady] = useState(false);
    const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
    const [myRequests, setMyRequests] = useState<MyServiceRequest[]>([]);
    const [historyStatus, setHistoryStatus] = useState<'all' | 'pending' | 'payment_pending' | 'paid' | 'assigned' | 'in_progress' | 'awaiting_confirmation' | 'done' | 'cancelled'>('all');
    const [historyLoading, setHistoryLoading] = useState(false);
    const [counterBusyId, setCounterBusyId] = useState<number | null>(null);
    const [workerApprovalBusyId, setWorkerApprovalBusyId] = useState<number | null>(null);
    const [cancelBusyId, setCancelBusyId] = useState<number | null>(null);
    const [paymentBusyId, setPaymentBusyId] = useState<number | null>(null);
    const [completionBusyId, setCompletionBusyId] = useState<number | null>(null);
    const [openChatRequestId, setOpenChatRequestId] = useState<number | null>(null);
    const [chatByRequest, setChatByRequest] = useState<Record<number, ChatMessage[]>>({});
    const [chatMessage, setChatMessage] = useState<Record<number, string>>({});
    const [chatImage, setChatImage] = useState<Record<number, File | null>>({});
    const [chatBusyId, setChatBusyId] = useState<number | null>(null);
    const [ratingBusyId, setRatingBusyId] = useState<number | null>(null);
    const [ratingForm, setRatingForm] = useState<Record<number, { punctuality: number; quality: number; price_fairness: number; comment: string }>>({});
    const [ratingModalRequest, setRatingModalRequest] = useState<MyServiceRequest | null>(null);
    const [fixesSuccessRequest, setFixesSuccessRequest] = useState<MyServiceRequest | null>(null);
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const mapInstanceRef = useRef<any>(null);
    const currentMarkerRef = useRef<any>(null);
    const currentRadiusRef = useRef<any>(null);
    const savedPlaceMarkersRef = useRef<any[]>([]);
    const nearbyWorkerMarkersRef = useRef<any[]>([]);
    const lastCenteredCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
    const lastToastRef = useRef<{ type: 'success' | 'error' | 'info'; message: string; at: number } | null>(null);
    const locationSuggestionTimerRef = useRef<number | null>(null);
    const previousRequestStatusesRef = useRef<Record<number, string>>({});
    const workerPortfolioPinchRef = useRef<{ startDistance: number; startScale: number } | null>(null);
    const workerPortfolioTapRef = useRef<number>(0);

    useEffect(() => {
        if (!isOpen) return;

        setStep(initialServiceId ? 1 : 0);
        setData((prev) => ({
            ...prev,
            category: initialServiceName || '',
        }));
        setGeoError(null);
        setNearbyWorkers([]);
        setRadiusKm(8);
        setShowSaveLocationPanel(false);
        setShowSavedPlacesModal(false);
        setPendingDeleteLocation(null);
        setPendingRenameLocation(null);
        setPendingRenameTitle('');
        setPendingRequestAction(null);
        setWorkerProfileRequest(null);
        setWorkerProfileData(null);
        setWorkerProfileLoading(false);
        setWorkerPortfolioIndex(0);
        setIsWorkerPortfolioFullscreen(false);
        setIsWorkerPortfolioZoomed(false);
        setWorkerPortfolioScale(1);
        setWorkerPortfolioTransformOrigin('center center');
        setSavedPlacesSearch('');
        setSavedPlacesFilter('all');
        setSaveLocationKind('favorite');
        setSaveLocationTitle('');
        setPaymentModalRequest(null);
        setPaymentMethod('card');
        setRatingModalRequest(null);
        setFixesSuccessRequest(null);
    }, [isOpen, initialServiceId, initialServiceName]);

    useEffect(() => {
        if (!showSavedPlacesModal) {
            setSavedPlacesSearch('');
            setSavedPlacesFilter('all');
            setPendingDeleteLocation(null);
            setPendingRenameLocation(null);
            setPendingRenameTitle('');
            setPendingRequestAction(null);
        }
    }, [showSavedPlacesModal]);

    useEffect(() => {
        const saved = readSavedLocations();
        setSavedHome(saved.home);
        setSavedWork(saved.work);
        setFavoriteLocations(saved.favorites);
        setRecentLocations(saved.recent);
    }, []);

    const hydrateSavedLocations = (
        nextHome: SavedLocation | null,
        nextWork: SavedLocation | null,
        nextFavorites: SavedLocation[],
        nextRecent: SavedLocation[]
    ) => {
        setSavedHome(nextHome);
        setSavedWork(nextWork);
        setFavoriteLocations(nextFavorites);
        setRecentLocations(nextRecent);
    };

    const persistSavedLocations = (
        nextHome: SavedLocation | null,
        nextWork: SavedLocation | null,
        nextFavorites: SavedLocation[],
        nextRecent: SavedLocation[]
    ) => {
        hydrateSavedLocations(nextHome, nextWork, nextFavorites, nextRecent);
        writeSavedLocations({ home: nextHome, work: nextWork, favorites: nextFavorites, recent: nextRecent });
    };

    const applySavedLocationsPayload = (rows: any[]) => {
        const locations = Array.isArray(rows) ? rows.map(toSavedLocation).filter(Boolean) as SavedLocation[] : [];
        const nextHome = locations.find((item) => item.kind === 'home') || null;
        const nextWork = locations.find((item) => item.kind === 'work') || null;
        const nextFavorites = locations
            .filter((item) => item.kind === 'favorite')
            .sort((a, b) => Number(b.last_used_at || 0) - Number(a.last_used_at || 0));
        const nextRecent = locations
            .filter((item) => item.kind === 'recent')
            .sort((a, b) => Number(b.last_used_at || 0) - Number(a.last_used_at || 0));

        persistSavedLocations(nextHome, nextWork, nextFavorites, nextRecent);
    };

    const fetchSavedLocationsFromBackend = async (silent = true) => {
        const token = getToken();
        if (!token || !isAuthenticated()) return null;

        try {
            const res = await fetch(API_ENDPOINTS.services.savedLocations, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const payload = await res.json();
            if (!res.ok || !payload?.success) {
                if (!silent) showToast('error', payload?.error || 'Could not load saved locations.');
                return null;
            }
            applySavedLocationsPayload(payload.locations);
            return Array.isArray(payload.locations) ? payload.locations.length : 0;
        } catch {
            if (!silent) showToast('error', 'Could not load saved locations.');
            return null;
        }
    };

    const syncLocalSavedLocationsToBackend = async () => {
        const token = getToken();
        if (!token || !isAuthenticated()) return false;

        const cached = readSavedLocations();
        const entries = [
            ...(cached.home ? [cached.home] : []),
            ...(cached.work ? [cached.work] : []),
            ...(Array.isArray(cached.favorites) ? cached.favorites : []),
            ...(Array.isArray(cached.recent) ? cached.recent : []),
        ];

        if (entries.length === 0) return false;

        try {
            for (const entry of entries) {
                await fetch(API_ENDPOINTS.services.savedLocations, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        kind: entry.kind,
                        title: entry.title,
                        label: entry.label,
                        lat: entry.lat,
                        lng: entry.lng,
                    }),
                });
            }

            await fetchSavedLocationsFromBackend(true);
            return true;
        } catch {
            return false;
        }
    };

    const upsertSavedLocationToBackend = async (location: SavedLocation, successMessage?: string) => {
        const token = getToken();
        if (!token || !isAuthenticated()) return false;

        try {
            const res = await fetch(API_ENDPOINTS.services.savedLocations, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    kind: location.kind,
                    title: location.title,
                    label: location.label,
                    lat: location.lat,
                    lng: location.lng,
                }),
            });
            const payload = await res.json();
            if (!res.ok || !payload?.success) {
                showToast('error', payload?.error || 'Could not save this place.');
                return false;
            }
            applySavedLocationsPayload(payload.locations);
            if (successMessage) showToast('success', successMessage);
            return true;
        } catch {
            showToast('error', 'Could not save this place.');
            return false;
        }
    };

    const updateSavedLocationOnBackend = async (
        idSavedLocation: number,
        body: Record<string, unknown>,
        successMessage?: string
    ) => {
        const token = getToken();
        if (!token || !isAuthenticated()) return false;

        try {
            const res = await fetch(API_ENDPOINTS.services.savedLocation(idSavedLocation), {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(body),
            });
            const payload = await res.json();
            if (!res.ok || !payload?.success) {
                showToast('error', payload?.error || 'Could not update this saved place.');
                return false;
            }
            applySavedLocationsPayload(payload.locations);
            if (successMessage) showToast('success', successMessage);
            return true;
        } catch {
            showToast('error', 'Could not update this saved place.');
            return false;
        }
    };

    const deleteSavedLocationOnBackend = async (idSavedLocation: number, successMessage?: string) => {
        const token = getToken();
        if (!token || !isAuthenticated()) return false;

        try {
            const res = await fetch(API_ENDPOINTS.services.savedLocation(idSavedLocation), {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            const payload = await res.json();
            if (!res.ok || !payload?.success) {
                showToast('error', payload?.error || 'Could not remove this saved place.');
                return false;
            }
            await fetchSavedLocationsFromBackend(true);
            if (successMessage) showToast('success', successMessage);
            return true;
        } catch {
            showToast('error', 'Could not remove this saved place.');
            return false;
        }
    };

    const clearRecentLocationsOnBackend = async () => {
        const token = getToken();
        if (!token || !isAuthenticated()) return false;

        try {
            const res = await fetch(`${API_ENDPOINTS.services.savedLocations}?kind=recent`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            const payload = await res.json();
            if (!res.ok || !payload?.success) {
                showToast('error', payload?.error || 'Could not clear recent locations.');
                return false;
            }
            await fetchSavedLocationsFromBackend(true);
            showToast('success', 'Recent locations cleared.');
            return true;
        } catch {
            showToast('error', 'Could not clear recent locations.');
            return false;
        }
    };

    const rememberRecentLocation = (label: string, coords: { lat: number; lng: number }) => {
        const normalizedLabel = String(label || '').trim();
        if (!normalizedLabel) return;

        const recentEntry: SavedLocation = {
            kind: 'recent',
            title: compactLocationTitle(normalizedLabel),
            label: normalizedLabel,
            lat: Number(coords.lat.toFixed(7)),
            lng: Number(coords.lng.toFixed(7)),
            last_used_at: Date.now(),
        };

        if (isAuthenticated() && getToken()) {
            void upsertSavedLocationToBackend(recentEntry);
            return;
        }

        const nextRecent = [
            recentEntry,
            ...recentLocations.filter(
                (item) =>
                    item.label !== normalizedLabel &&
                    `${item.lat.toFixed(5)},${item.lng.toFixed(5)}` !==
                        `${coords.lat.toFixed(5)},${coords.lng.toFixed(5)}`
            ),
        ].slice(0, 4);

        persistSavedLocations(savedHome, savedWork, favoriteLocations, nextRecent);
    };

    const saveCurrentLocationAs = async (kind: 'home' | 'work') => {
        if (!currentCoords || !data.location.trim()) {
            showToast('error', 'Resolve a location first, then save it.');
            return;
        }

        const entry: SavedLocation = {
            kind,
            title: kind === 'home' ? 'Home' : 'Work',
            label: data.location.trim(),
            lat: Number(currentCoords.lat.toFixed(7)),
            lng: Number(currentCoords.lng.toFixed(7)),
            last_used_at: Date.now(),
        };

        const nextHome = kind === 'home' ? entry : savedHome;
        const nextWork = kind === 'work' ? entry : savedWork;
        if (isAuthenticated() && getToken()) {
            await upsertSavedLocationToBackend(entry, `${entry.title} location saved.`);
            return;
        }
        persistSavedLocations(nextHome, nextWork, favoriteLocations, recentLocations);
        showToast('success', `${entry.title} location saved.`);
    };

    const saveCurrentLocationAsFavorite = async (customTitle?: string) => {
        if (!currentCoords || !data.location.trim()) {
            showToast('error', 'Resolve a location first, then save it.');
            return;
        }

        const fallbackName = compactLocationTitle(data.location.trim());
        const favoriteName = customTitle ?? fallbackName;
        const normalizedName = String(favoriteName || '').trim();
        if (!normalizedName) return;

        const nextFavorites = [
            {
                kind: 'favorite' as const,
                title: normalizedName.slice(0, 28),
                label: data.location.trim(),
                lat: Number(currentCoords.lat.toFixed(7)),
                lng: Number(currentCoords.lng.toFixed(7)),
                last_used_at: Date.now(),
            },
            ...favoriteLocations.filter(
                (item) =>
                    item.title.toLowerCase() !== normalizedName.toLowerCase() &&
                    !sameCoords(item, currentCoords)
            ),
        ].slice(0, 8);

        if (isAuthenticated() && getToken()) {
            await upsertSavedLocationToBackend(nextFavorites[0], `Favorite "${normalizedName}" saved.`);
            return;
        }
        persistSavedLocations(savedHome, savedWork, nextFavorites, recentLocations);
        showToast('success', `Favorite "${normalizedName}" saved.`);
    };

    const openSaveLocationPanel = () => {
        if (!currentCoords || !data.location.trim()) {
            showToast('error', 'Resolve a location first, then save it.');
            return;
        }

        setSaveLocationKind('favorite');
        setSaveLocationTitle(compactLocationTitle(data.location.trim()));
        setShowSaveLocationPanel(true);
    };

    const handleSaveLocationFromPanel = async () => {
        if (!currentCoords || !data.location.trim()) {
            showToast('error', 'Resolve a location first, then save it.');
            return;
        }

        if (saveLocationKind === 'home' || saveLocationKind === 'work') {
            await saveCurrentLocationAs(saveLocationKind);
            setShowSaveLocationPanel(false);
            setSaveLocationTitle('');
            return;
        }

        const normalizedTitle = saveLocationTitle.trim();
        if (!normalizedTitle) {
            showToast('error', 'Add a name for this location.');
            return;
        }

        await saveCurrentLocationAsFavorite(normalizedTitle);
        setShowSaveLocationPanel(false);
        setSaveLocationTitle('');
    };

    const removeSavedLocation = async (location: SavedLocation) => {
        if (location.id_saved_location && isAuthenticated() && getToken()) {
            await deleteSavedLocationOnBackend(location.id_saved_location, `${location.title} removed.`);
            return;
        }

        const sameLocation = (item: SavedLocation) =>
            item.label === location.label &&
            `${item.lat.toFixed(5)},${item.lng.toFixed(5)}` === `${location.lat.toFixed(5)},${location.lng.toFixed(5)}`;

        const nextHome = location.kind === 'home' ? null : savedHome;
        const nextWork = location.kind === 'work' ? null : savedWork;
        const nextFavorites = location.kind === 'favorite'
            ? favoriteLocations.filter((item) => !sameLocation(item))
            : favoriteLocations;
        const nextRecent = location.kind === 'recent'
            ? recentLocations.filter((item) => !sameLocation(item))
            : recentLocations;

        persistSavedLocations(nextHome, nextWork, nextFavorites, nextRecent);
        showToast('success', `${location.title} removed.`);
    };

    const clearRecentLocations = async () => {
        if (isAuthenticated() && getToken()) {
            await clearRecentLocationsOnBackend();
            return;
        }
        if (recentLocations.length === 0) return;
        persistSavedLocations(savedHome, savedWork, favoriteLocations, []);
        showToast('success', 'Recent locations cleared.');
    };

    const requestDeleteSavedLocation = (location: SavedLocation) => {
        setPendingDeleteLocation(location);
    };

    const closeDeleteSavedLocationPrompt = (notify = true) => {
        setPendingDeleteLocation(null);
        if (notify) {
            showToast('info', 'Delete cancelled.');
        }
    };

    const confirmDeleteSavedLocation = async () => {
        if (!pendingDeleteLocation) return;
        const target = pendingDeleteLocation;
        setPendingDeleteLocation(null);
        await removeSavedLocation(target);
    };

    const requestRenameSavedLocation = (location: SavedLocation) => {
        setPendingRenameLocation(location);
        setPendingRenameTitle(location.title);
    };

    const closeRenameSavedLocationPrompt = (notify = true) => {
        setPendingRenameLocation(null);
        setPendingRenameTitle('');
        if (notify) {
            showToast('info', 'Rename cancelled.');
        }
    };

    const renameSavedLocation = async (location: SavedLocation, nextName: string) => {
        const normalizedName = String(nextName || '').trim();
        if (!normalizedName || normalizedName === location.title) return;

        if (location.id_saved_location && isAuthenticated() && getToken()) {
            await updateSavedLocationOnBackend(location.id_saved_location, { title: normalizedName }, 'Saved place renamed.');
            return;
        }

        const renamedLocation = {
            ...location,
            title: normalizedName.slice(0, 28),
        };
        const nextHome = location.kind === 'home' && savedHome && sameCoords(savedHome, location)
            ? renamedLocation
            : savedHome;
        const nextWork = location.kind === 'work' && savedWork && sameCoords(savedWork, location)
            ? renamedLocation
            : savedWork;
        const nextFavorites = favoriteLocations.map((item) =>
            item.kind === location.kind && sameCoords(item, location)
                ? { ...item, title: normalizedName.slice(0, 28) }
                : item
        );
        const nextRecent = recentLocations.map((item) =>
            item.kind === location.kind && sameCoords(item, location)
                ? { ...item, title: normalizedName.slice(0, 28) }
                : item
        );

        persistSavedLocations(nextHome, nextWork, nextFavorites, nextRecent);
        showToast('success', 'Saved place renamed.');
    };

    const confirmRenameSavedLocation = async () => {
        if (!pendingRenameLocation) return;
        const target = pendingRenameLocation;
        const nextName = pendingRenameTitle;
        setPendingRenameLocation(null);
        setPendingRenameTitle('');
        await renameSavedLocation(target, nextName);
    };

    const requestConfirmRequestAction = (type: 'cancel' | 'complete', request: MyServiceRequest) => {
        setPendingRequestAction({ type, request });
    };

    const closeRequestActionPrompt = (notify = true) => {
        setPendingRequestAction(null);
        if (notify) {
            showToast('info', 'Action cancelled.');
        }
    };

    const handleUseSavedLocation = (location: SavedLocation, nextStep?: number) => {
        useSavedLocation(location);
        if (typeof nextStep === 'number') {
            setStep(nextStep);
        }
    };

    const renderSavedPlaceActions = (
        location: SavedLocation,
        options?: {
            nextStep?: number;
            compact?: boolean;
        }
    ) => {
        const compact = options?.compact ?? false;
        const buttonClass = compact
            ? 'group inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition'
            : 'group inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-bold transition';

        return (
            <div className={`flex flex-wrap items-center gap-2 ${compact ? '' : 'pt-1'}`}>
                <motion.button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleUseSavedLocation(location, options?.nextStep);
                    }}
                    whileHover={{ y: -2, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                    className={`${buttonClass} ${getSavedPlaceActionClassName('use')}`}
                >
                    {renderSavedPlaceActionIcon('use', 'h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:scale-110')}
                    Use
                </motion.button>
                <motion.button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        requestRenameSavedLocation(location);
                    }}
                    whileHover={{ y: -2, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                    className={`${buttonClass} ${getSavedPlaceActionClassName('rename')}`}
                >
                    {renderSavedPlaceActionIcon('rename', 'h-3.5 w-3.5 transition-transform duration-200 group-hover:-rotate-6 group-hover:scale-110')}
                    Rename
                </motion.button>
                <motion.button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        requestDeleteSavedLocation(location);
                    }}
                    whileHover={{ y: -2, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                    className={`${buttonClass} ${getSavedPlaceActionClassName('delete')}`}
                >
                    {renderSavedPlaceActionIcon('delete', 'h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:scale-105')}
                    Delete
                </motion.button>
            </div>
        );
    };

    const confirmPendingRequestAction = async () => {
        if (!pendingRequestAction) return;
        const action = pendingRequestAction;
        setPendingRequestAction(null);

        if (action.type === 'cancel') {
            await submitCancelRequest(action.request);
            return;
        }

        await submitClientCompletion(action.request);
    };

    const useSavedLocation = (location: SavedLocation) => {
        if (location.kind === 'favorite') {
            if (location.id_saved_location && isAuthenticated() && getToken()) {
                void updateSavedLocationOnBackend(location.id_saved_location, { touch: true });
            } else {
                const nextFavorites = favoriteLocations
                    .map((item) =>
                        sameCoords(item, location)
                            ? {
                                  ...item,
                                  last_used_at: Date.now(),
                              }
                            : item
                    )
                    .sort((a, b) => Number(b.last_used_at || 0) - Number(a.last_used_at || 0));

                persistSavedLocations(savedHome, savedWork, nextFavorites, recentLocations);
            }
        }

        setData((prev) => ({ ...prev, location: location.label }));
        setCurrentCoords({ lat: location.lat, lng: location.lng });
        setGeoError(null);
        setShowLocationSuggestions(false);
        setShowSaveLocationPanel(false);
        setShowSavedPlacesModal(false);
        showToast('success', `${location.title} location loaded.`);
    };

    const quickAccessLocations = useMemo(() => {
        const items: Array<SavedLocation & { icon: string }> = [];
        if (savedHome) items.push({ ...savedHome, icon: HOME_ICON });
        if (savedWork) items.push({ ...savedWork, icon: WORK_ICON });
        [...favoriteLocations]
            .sort((a, b) => Number(b.last_used_at || 0) - Number(a.last_used_at || 0))
            .forEach((location) => items.push({ ...location, icon: FAVORITE_ICON }));
        recentLocations.forEach((location) => items.push({ ...location, icon: RECENT_ICON }));
        return items;
    }, [savedHome, savedWork, favoriteLocations, recentLocations]);

    const groupedSavedLocations = useMemo(
        () => ({
            primary: [savedHome, savedWork].filter(Boolean) as SavedLocation[],
            favorites: [...favoriteLocations].sort((a, b) => Number(b.last_used_at || 0) - Number(a.last_used_at || 0)),
            recents: [...recentLocations],
        }),
        [savedHome, savedWork, favoriteLocations, recentLocations]
    );

    const filteredSavedLocations = useMemo(() => {
        const search = savedPlacesSearch.trim().toLowerCase();
        const matchesSearch = (location: SavedLocation) => {
            if (!search) return true;
            return [
                location.title,
                location.label,
                location.kind,
                getLocationVisual(location.kind).label,
            ]
                .join(' ')
                .toLowerCase()
                .includes(search);
        };

        const matchesSection = (section: 'primary' | 'favorite' | 'recent') =>
            savedPlacesFilter === 'all' || savedPlacesFilter === section;

        const primary = matchesSection('primary')
            ? groupedSavedLocations.primary.filter(matchesSearch)
            : [];
        const favorites = matchesSection('favorite')
            ? groupedSavedLocations.favorites.filter(matchesSearch)
            : [];
        const recents = matchesSection('recent')
            ? groupedSavedLocations.recents.filter(matchesSearch)
            : [];

        return {
            primary,
            favorites,
            recents,
            total: primary.length + favorites.length + recents.length,
        };
    }, [groupedSavedLocations, savedPlacesFilter, savedPlacesSearch]);

    const savedPlacesPreview = useMemo(
        () => quickAccessLocations.slice(0, 3),
        [quickAccessLocations]
    );

    const activeLocationKind = useMemo<SavedLocation['kind'] | 'current'>(() => {
        if (!currentCoords) return 'current';
        if (savedHome && sameCoords(savedHome, currentCoords)) return 'home';
        if (savedWork && sameCoords(savedWork, currentCoords)) return 'work';
        const favoriteMatch = favoriteLocations.find((location) => sameCoords(location, currentCoords));
        if (favoriteMatch) return 'favorite';
        const recentMatch = recentLocations.find((location) => sameCoords(location, currentCoords));
        if (recentMatch) return 'recent';
        return 'current';
    }, [currentCoords, savedHome, savedWork, favoriteLocations, recentLocations]);

    const activeTrackedRequest = useMemo(() => {
        const priority = ['in_progress', 'awaiting_confirmation', 'paid', 'payment_pending'];
        return [...myRequests]
            .filter((request) => {
                const status = String(request.status || '').toLowerCase();
                return (
                    priority.includes(status) &&
                    !!request.assigned_worker &&
                    request.latitude != null &&
                    request.longitude != null
                );
            })
            .sort((left, right) => {
                const leftStatus = String(left.status || '').toLowerCase();
                const rightStatus = String(right.status || '').toLowerCase();
                return (
                    priority.indexOf(leftStatus) - priority.indexOf(rightStatus) ||
                    new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
                );
            })[0] || null;
    }, [myRequests]);

    const workerPortfolio = useMemo(
        () => workerProfileData?.portfolio || [],
        [workerProfileData]
    );

    const activeWorkerPortfolioIndex = useMemo(() => {
        if (workerPortfolio.length === 0) return 0;
        return Math.min(workerPortfolioIndex, workerPortfolio.length - 1);
    }, [workerPortfolio, workerPortfolioIndex]);

    const activeWorkerPortfolioPhoto = useMemo(
        () => workerPortfolio[activeWorkerPortfolioIndex] || null,
        [workerPortfolio, activeWorkerPortfolioIndex]
    );

    const selectedWorkerProfile = useMemo(() => {
        if (!workerProfileRequest) return null;

        return {
            id_worker_profile:
                workerProfileData?.worker.id_worker_profile ||
                workerProfileRequest.assigned_worker?.id_worker_profile ||
                0,
            name:
                workerProfileData?.worker.name ||
                workerProfileRequest.assigned_worker?.name ||
                'Assigned pro',
            phone_number:
                workerProfileData?.worker.phone_number ??
                workerProfileRequest.assigned_worker?.phone_number ??
                null,
            bio:
                workerProfileData?.worker.bio ||
                workerProfileRequest.assigned_worker?.bio ||
                '',
            is_online:
                workerProfileData?.worker.is_online ??
                workerProfileRequest.assigned_worker?.is_online ??
                null,
            profile_image_url:
                workerProfileData?.worker.profile_image_url ??
                workerProfileRequest.assigned_worker?.profile_image_url ??
                null,
            years_of_experience: workerProfileData?.worker.years_of_experience ?? null,
            experience_label:
                workerProfileData?.worker.experience_label || 'Experience not available',
            rating_average: workerProfileData?.worker.rating_average ?? null,
            rating_count: workerProfileData?.worker.rating_count ?? 0,
            completed_jobs: workerProfileData?.worker.completed_jobs ?? 0,
            services_offered: workerProfileData?.worker.services_offered || [],
        };
    }, [workerProfileData, workerProfileRequest]);

    useEffect(() => {
        if (workerPortfolio.length === 0 && workerPortfolioIndex !== 0) {
            setWorkerPortfolioIndex(0);
            return;
        }

        if (workerPortfolio.length > 0 && workerPortfolioIndex > workerPortfolio.length - 1) {
            setWorkerPortfolioIndex(workerPortfolio.length - 1);
        }
    }, [workerPortfolio, workerPortfolioIndex]);

    useEffect(() => {
        if (!workerProfileRequest) {
            setIsWorkerPortfolioFullscreen(false);
            setIsWorkerPortfolioZoomed(false);
            setWorkerPortfolioScale(1);
        }
    }, [workerProfileRequest]);

    useEffect(() => {
        if (!isWorkerPortfolioFullscreen) {
            setIsWorkerPortfolioZoomed(false);
            setWorkerPortfolioScale(1);
        }
    }, [isWorkerPortfolioFullscreen]);

    const closeWorkerProfileModal = () => {
        setWorkerProfileRequest(null);
        setWorkerProfileData(null);
        setWorkerProfileLoading(false);
        setIsWorkerPortfolioFullscreen(false);
        setIsWorkerPortfolioZoomed(false);
        setWorkerPortfolioScale(1);
    };

    const shiftWorkerPortfolio = (direction: 'prev' | 'next') => {
        if (workerPortfolio.length <= 1) return;
        setIsWorkerPortfolioZoomed(false);
        setWorkerPortfolioScale(1);
        setWorkerPortfolioIndex((prev) => {
            if (direction === 'prev') {
                return prev === 0 ? workerPortfolio.length - 1 : prev - 1;
            }
            return prev === workerPortfolio.length - 1 ? 0 : prev + 1;
        });
    };

    const setWorkerPortfolioZoomOrigin = (event: React.MouseEvent<HTMLImageElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const x = ((event.clientX - rect.left) / rect.width) * 100;
        const y = ((event.clientY - rect.top) / rect.height) * 100;
        setWorkerPortfolioTransformOrigin(`${clamp(x, 0, 100)}% ${clamp(y, 0, 100)}%`);
    };

    const toggleWorkerPortfolioZoom = () => {
        setIsWorkerPortfolioZoomed((prev) => {
            const next = !prev;
            setWorkerPortfolioScale(next ? 1.65 : 1);
            if (!next) {
                setWorkerPortfolioTransformOrigin('center center');
            }
            return next;
        });
    };

    const handleWorkerPortfolioTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
        if (event.touches.length < 2) return;
        workerPortfolioPinchRef.current = {
            startDistance: getTouchDistance(event.touches),
            startScale: workerPortfolioScale,
        };
    };

    const handleWorkerPortfolioTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
        if (event.touches.length < 2 || !workerPortfolioPinchRef.current) return;
        const nextDistance = getTouchDistance(event.touches);
        if (!nextDistance) return;
        event.preventDefault();
        const ratio = nextDistance / workerPortfolioPinchRef.current.startDistance;
        const nextScale = clamp(workerPortfolioPinchRef.current.startScale * ratio, 1, 2.4);
        setWorkerPortfolioScale(nextScale);
        setIsWorkerPortfolioZoomed(nextScale > 1.04);
    };

    const handleWorkerPortfolioTouchEnd = () => {
        workerPortfolioPinchRef.current = null;
        setWorkerPortfolioScale((prev) => {
            if (prev < 1.04) {
                setIsWorkerPortfolioZoomed(false);
                return 1;
            }
            return prev;
        });
    };

    const handleWorkerPortfolioImageTap = (event: React.MouseEvent<HTMLImageElement>) => {
        setWorkerPortfolioZoomOrigin(event);
        const now = Date.now();
        if (now - workerPortfolioTapRef.current < 280) {
            toggleWorkerPortfolioZoom();
            workerPortfolioTapRef.current = 0;
            return;
        }

        workerPortfolioTapRef.current = now;
    };

    const handleWorkerPortfolioImageDoubleTap = (event: React.MouseEvent<HTMLImageElement>) => {
        setWorkerPortfolioZoomOrigin(event);
        toggleWorkerPortfolioZoom();
    };

    const renderLocationSuggestionsDropdown = () => {
        if (!(showLocationSuggestions && (suggestionsLoading || locationSuggestions.length > 0))) {
            return null;
        }

        return (
            <div className="mt-2 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                {suggestionsLoading ? (
                    <div className="px-4 py-3 text-sm font-medium text-gray-500">Searching places in El Salvador...</div>
                ) : (
                    locationSuggestions.map((suggestion, suggestionIndex) => {
                        const display = getSuggestionDisplay(suggestion);
                        return (
                            <button
                                key={`${suggestion.label}-${suggestion.lat}-${suggestion.lng}`}
                                type="button"
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    selectLocationSuggestion(suggestion);
                                }}
                                onMouseEnter={() => setHighlightedSuggestionIndex(suggestionIndex)}
                                className={`w-full border-b border-gray-100 last:border-b-0 px-4 py-3 text-left transition ${
                                    highlightedSuggestionIndex === suggestionIndex
                                        ? 'bg-bird-blue/10'
                                        : 'hover:bg-bird-blue/5'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-sm font-semibold text-gray-900 line-clamp-1">{display.title}</div>
                                        <div className="mt-1 text-xs text-gray-500 line-clamp-1">{display.context}</div>
                                    </div>
                                    <span
                                        className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide ${
                                            suggestion.source === 'local'
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-blue-100 text-blue-700'
                                        }`}
                                    >
                                        {getSuggestionBadgeLabel(suggestion)}
                                    </span>
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
        );
    };

    const fetchMyRequests = async (
        status: 'all' | 'pending' | 'payment_pending' | 'paid' | 'assigned' | 'in_progress' | 'awaiting_confirmation' | 'done' | 'cancelled' = historyStatus,
        silent = false
    ) => {
        const token = getToken();
        if (!token) {
            setMyRequests([]);
            return;
        }
        try {
            if (!silent) setHistoryLoading(true);
            const res = await fetch(`${API_ENDPOINTS.services.myRequests}?status=${status}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const payload = await res.json();
            if (!res.ok || !payload?.success) {
                return;
            }
            setMyRequests(Array.isArray(payload.requests) ? payload.requests : []);
        } catch {
            // silent
        } finally {
            if (!silent) setHistoryLoading(false);
        }
    };

    useEffect(() => {
        if (!isOpen) return;
        fetchMyRequests(historyStatus);
    }, [isOpen, historyStatus]);

    useEffect(() => {
        if (!isOpen) return;
        if (!isAuthenticated() || !getToken()) return;

        void (async () => {
            const backendCount = await fetchSavedLocationsFromBackend(true);
            if (backendCount == null) return;

            const cached = readSavedLocations();
            const cachedCount =
                (cached.home ? 1 : 0) +
                (cached.work ? 1 : 0) +
                (cached.favorites?.length || 0) +
                (cached.recent?.length || 0);

            if (backendCount === 0 && cachedCount > 0) {
                await syncLocalSavedLocationsToBackend();
            }
        })();
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        if (!isAuthenticated()) return;

        const interval = window.setInterval(() => {
            void fetchMyRequests(historyStatus, true);
        }, 5000);

        return () => window.clearInterval(interval);
    }, [isOpen, historyStatus]);

    useEffect(() => {
        if (!openChatRequestId) return;

        const activeRequest = myRequests.find((request) => request.id_request === openChatRequestId);
        if (!activeRequest) {
            setOpenChatRequestId(null);
            return;
        }

        const requestStatus = String(activeRequest.status || '').toLowerCase();
        const canUseChat = canUseRequestChat(activeRequest);
        if (!canUseChat) {
            setOpenChatRequestId(null);
        }
    }, [myRequests, openChatRequestId]);

    useEffect(() => {
        if (!isOpen) return;

        const previousStatuses = previousRequestStatusesRef.current;
        const nextStatuses: Record<number, string> = {};

        myRequests.forEach((request) => {
            const currentStatus = String(request.status || '').toLowerCase();
            nextStatuses[request.id_request] = currentStatus;

            const previousStatus = previousStatuses[request.id_request];
            if (!previousStatus || previousStatus === currentStatus) {
                return;
            }

            const notification = getRequestStageNotification(request);
            if (notification) {
                showToast(notification.type, notification.message);
            }
        });

        previousRequestStatusesRef.current = nextStatuses;
    }, [isOpen, myRequests]);

    useEffect(() => {
        const urls = problemFiles.map((file) => URL.createObjectURL(file));
        setProblemPreviewUrls(urls);
        setData((prev) => ({ ...prev, images: urls }));

        return () => {
            urls.forEach((url) => URL.revokeObjectURL(url));
        };
    }, [problemFiles]);

    useEffect(() => {
        const fetchServices = async () => {
            setServicesLoading(true);
            try {
                const res = await fetch(API_ENDPOINTS.services.getActive);
                const payload = await res.json();
                if (payload?.success && Array.isArray(payload.services)) {
                    setServices(payload.services);
                }
            } catch (error) {
                console.error('Could not fetch services for wizard:', error);
            } finally {
                setServicesLoading(false);
            }
        };

        fetchServices();
    }, []);

    useEffect(() => {
        const loadLeaflet = async () => {
            if (window.L) {
                setLeafletReady(true);
                return;
            }

            const cssId = 'leaflet-css-cdn';
            const jsId = 'leaflet-js-cdn';

            if (!document.getElementById(cssId)) {
                const link = document.createElement('link');
                link.id = cssId;
                link.rel = 'stylesheet';
                link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
                document.head.appendChild(link);
            }

            if (!document.getElementById(jsId)) {
                await new Promise<void>((resolve, reject) => {
                    const script = document.createElement('script');
                    script.id = jsId;
                    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
                    script.async = true;
                    script.onload = () => resolve();
                    script.onerror = () => reject(new Error('Could not load map library'));
                    document.body.appendChild(script);
                });
            }

            if (window.L) setLeafletReady(true);
        };

        loadLeaflet().catch((err) => console.error(err));
    }, []);

    useEffect(() => {
        if (!isOpen) return;

        const query = data.location.trim();
        const parsedCoords = parseCoordinateInput(query);

        if (locationSuggestionTimerRef.current) {
            window.clearTimeout(locationSuggestionTimerRef.current);
            locationSuggestionTimerRef.current = null;
        }

        if (!query || query.length < 2 || parsedCoords) {
            setLocationSuggestions([]);
            setSuggestionsLoading(false);
            return;
        }

        locationSuggestionTimerRef.current = window.setTimeout(async () => {
            try {
                setSuggestionsLoading(true);
                const params = new URLSearchParams({ q: query });
                const res = await fetch(`${API_ENDPOINTS.services.geocodeSuggest}?${params.toString()}`);
                const payload = await res.json();
                if (!res.ok || !payload?.success) {
                    setLocationSuggestions([]);
                    return;
                }
                setLocationSuggestions(Array.isArray(payload.suggestions) ? payload.suggestions : []);
            } catch {
                setLocationSuggestions([]);
            } finally {
                setSuggestionsLoading(false);
            }
        }, 220);

        return () => {
            if (locationSuggestionTimerRef.current) {
                window.clearTimeout(locationSuggestionTimerRef.current);
                locationSuggestionTimerRef.current = null;
            }
        };
    }, [data.location, isOpen]);

    useEffect(() => {
        if (!showLocationSuggestions || locationSuggestions.length === 0) {
            setHighlightedSuggestionIndex(-1);
            return;
        }

        setHighlightedSuggestionIndex((prev) => {
            if (prev >= 0 && prev < locationSuggestions.length) return prev;
            return 0;
        });
    }, [locationSuggestions, showLocationSuggestions]);

    useEffect(() => {
        if (!isOpen || !mapContainerRef.current || !window.L || !leafletReady) return;
        if (mapInstanceRef.current) return;

        const L = window.L;
        const map = L.map(mapContainerRef.current, {
            zoomControl: false,
            attributionControl: true,
        }).setView([13.6929, -89.2182], 12);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap &copy; CARTO',
        }).addTo(map);

        L.control.zoom({ position: 'bottomright' }).addTo(map);

        map.on('click', (event: any) => {
            const nextCoords = {
                lat: Number(event.latlng.lat.toFixed(7)),
                lng: Number(event.latlng.lng.toFixed(7)),
            };

            void reverseGeocodeCoords(nextCoords, {
                toastMessage: 'Location adjusted on the map.',
                fallbackLabel: `${nextCoords.lat}, ${nextCoords.lng}`,
            });
        });

        mapInstanceRef.current = map;
    }, [isOpen, leafletReady]);

    useEffect(() => {
        if (isOpen) return;
        if (mapInstanceRef.current) {
            try {
                mapInstanceRef.current.remove();
            } catch {
                // ignore map cleanup errors
            }
            mapInstanceRef.current = null;
            currentMarkerRef.current = null;
            currentRadiusRef.current = null;
            savedPlaceMarkersRef.current = [];
            nearbyWorkerMarkersRef.current = [];
            lastCenteredCoordsRef.current = null;
        }
    }, [isOpen]);

    useEffect(() => {
        if (!mapInstanceRef.current || !window.L) return;
        const L = window.L;
        const map = mapInstanceRef.current;

        if (!currentCoords) {
            if (currentMarkerRef.current) {
                try {
                    map.removeLayer(currentMarkerRef.current);
                } catch {
                    // ignore
                }
                currentMarkerRef.current = null;
            }
            if (currentRadiusRef.current) {
                try {
                    map.removeLayer(currentRadiusRef.current);
                } catch {
                    // ignore
                }
                currentRadiusRef.current = null;
            }
            map.setView([13.6929, -89.2182], 12);
            lastCenteredCoordsRef.current = null;
            return;
        }

        const shouldRecenter =
            !lastCenteredCoordsRef.current ||
            !sameCoords(lastCenteredCoordsRef.current, currentCoords);

        if (shouldRecenter) {
            map.setView([currentCoords.lat, currentCoords.lng], 14);
            lastCenteredCoordsRef.current = currentCoords;
        }

        const selectedVisual = getLocationVisual(activeLocationKind);

        if (!currentMarkerRef.current) {
            const me = L.marker([currentCoords.lat, currentCoords.lng], {
                draggable: true,
                icon: createLeafletPinIcon(L, activeLocationKind),
                zIndexOffset: 1200,
            })
                .addTo(map)
                .bindPopup(`<b>${selectedVisual.label}</b><br/>Drag or tap the map to fine-tune the exact point.`);

            me.on('dragend', () => {
                const position = me.getLatLng();
                const nextCoords = {
                    lat: Number(position.lat.toFixed(7)),
                    lng: Number(position.lng.toFixed(7)),
                };
                void reverseGeocodeCoords(nextCoords, {
                    toastMessage: 'Location adjusted on the map.',
                    fallbackLabel: `${nextCoords.lat}, ${nextCoords.lng}`,
                });
            });

            currentMarkerRef.current = me;
        } else {
            currentMarkerRef.current.setLatLng([currentCoords.lat, currentCoords.lng]);
            currentMarkerRef.current.setIcon(createLeafletPinIcon(L, activeLocationKind));
            currentMarkerRef.current.setPopupContent(`<b>${selectedVisual.label}</b><br/>Drag or tap the map to fine-tune the exact point.`);
        }

        if (!currentRadiusRef.current) {
            currentRadiusRef.current = L.circle([currentCoords.lat, currentCoords.lng], {
                radius: radiusKm * 1000,
                color: '#3b82f6',
                weight: 1,
                fillColor: '#3b82f6',
                fillOpacity: 0.05,
            }).addTo(map);
        } else {
            currentRadiusRef.current.setLatLng([currentCoords.lat, currentCoords.lng]);
            currentRadiusRef.current.setRadius(radiusKm * 1000);
        }
    }, [currentCoords, radiusKm, activeLocationKind, isOpen]);

    useEffect(() => {
        if (!mapInstanceRef.current || !window.L) return;
        const L = window.L;
        const map = mapInstanceRef.current;

        savedPlaceMarkersRef.current.forEach((marker) => {
            try {
                map.removeLayer(marker);
            } catch {
                // ignore
            }
        });
        savedPlaceMarkersRef.current = [];

        quickAccessLocations
            .filter((location) => location.kind !== 'recent')
            .filter((location) => !sameCoords(location, currentCoords))
            .forEach((location) => {
                const pin = L.marker([location.lat, location.lng], {
                    icon: createLeafletPinIcon(L, location.kind),
                    zIndexOffset: 600,
                })
                    .addTo(map)
                    .bindPopup(`<b>${location.title}</b><br/>${location.label}`);

                pin.on('click', () => useSavedLocation(location));
                savedPlaceMarkersRef.current.push(pin);
            });
    }, [quickAccessLocations, currentCoords]);

    useEffect(() => {
        if (!mapInstanceRef.current || !window.L) return;
        const L = window.L;
        const map = mapInstanceRef.current;

        nearbyWorkerMarkersRef.current.forEach((marker) => {
            try {
                map.removeLayer(marker);
            } catch {
                // ignore
            }
        });
        nearbyWorkerMarkersRef.current = [];

        nearbyWorkers.forEach((worker) => {
            const lat = worker.latitude;
            const lng = worker.longitude;
            if (typeof lat !== 'number' || typeof lng !== 'number') return;

            const marker = L.circleMarker([lat, lng], {
                radius: 8,
                color: '#ffffff',
                weight: 2,
                fillColor: '#0284c7',
                fillOpacity: 1,
            }).addTo(map).bindPopup(
                `<b>${worker.name}</b><br/>${worker.distance_km != null ? `${worker.distance_km.toFixed(1)} km` : ''}`
            );

            nearbyWorkerMarkersRef.current.push(marker);
        });
    }, [nearbyWorkers]);

    const selectedServiceTitle = useMemo(() => {
        if (!data.category) return null;
        const found = services.find((svc) => svc.name === data.category);
        return found?.name || data.category;
    }, [data.category, services]);

    if (!isOpen) return null;

    const getColorClass = (color: string) => {
        const colors: Record<string, string> = {
            blue: 'group-hover:bg-bird-blue',
            yellow: 'group-hover:bg-bird-yellow',
            orange: 'group-hover:bg-bird-orange',
            green: 'group-hover:bg-green-500'
        };
        return colors[color] || colors.blue;
    };

    const showToast = (type: 'success' | 'error' | 'info', message: string) => {
        const now = Date.now();
        const last = lastToastRef.current;
        if (last && last.type === type && last.message === message && now - last.at < 900) {
            return;
        }
        lastToastRef.current = { type, message, at: now };
        if (type === 'success') {
            notyf.success(message);
            return;
        }
        if (type === 'error') {
            notyf.error(message);
            return;
        }
        notyf.open({
            type: 'info',
            message,
            background: '#1d4ed8',
            duration: 2200,
        });
    };

    const getRequestStageNotification = (request: MyServiceRequest) => {
        const status = String(request.status || '').toLowerCase();
        const workerName = request.assigned_worker?.name || 'Your worker';

        if (status === 'assigned') {
            return {
                type: 'info' as const,
                message: hasPendingWorkerApproval(request)
                    ? `${workerName} is waiting for your approval.`
                    : `${workerName} sent a counter offer for your review.`,
            };
        }
        if (status === 'payment_pending') {
            return {
                type: 'info' as const,
                message: `Secure payment so ${workerName} can head over.`,
            };
        }
        if (status === 'paid') {
            return {
                type: 'success' as const,
                message: `Payment secured. ${workerName} is getting ready to head over.`,
            };
        }
        if (status === 'in_progress') {
            return {
                type: 'info' as const,
                message: `${workerName} started working on your service.`,
            };
        }
        if (status === 'awaiting_confirmation') {
            return {
                type: 'info' as const,
                message: `${workerName} marked the job as done. Review and confirm when ready.`,
            };
        }
        if (status === 'done') {
            return {
                type: 'success' as const,
                message: 'Your service is completed. You can now leave a review.',
            };
        }
        return null;
    };

    const handleProblemFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
        const incoming = Array.from(event.target.files || []);
        if (incoming.length === 0) return;

        const allowedMime = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
        const valid: File[] = [];

        for (const file of incoming) {
            if (!allowedMime.has(file.type)) {
                showToast('error', `Invalid file: ${file.name}. Only PNG/JPG/WEBP.`);
                continue;
            }
            if (file.size > 8 * 1024 * 1024) {
                showToast('error', `Image too large: ${file.name} (max 8MB).`);
                continue;
            }
            valid.push(file);
        }

        const totalAfterAdd = problemFiles.length + valid.length;
        if (totalAfterAdd > 5) {
            showToast('error', 'Maximum 5 problem images.');
        } else if (valid.length > 0) {
            showToast('success', `${valid.length} image(s) added.`);
        }

        setProblemFiles((prev) => [...prev, ...valid].slice(0, 5));

        event.target.value = '';
    };

    const removeProblemImage = (index: number) => {
        setProblemFiles((prev) => prev.filter((_, i) => i !== index));
        showToast('success', 'Image removed.');
    };

    const handleLocationChange = (value: string) => {
        setData((prev) => ({ ...prev, location: value }));
        setShowLocationSuggestions(true);
        const parsedCoords = parseCoordinateInput(value);
        if (parsedCoords) {
            setCurrentCoords(parsedCoords);
            setGeoError(null);
            setLocationSuggestions([]);
            setShowLocationSuggestions(false);
            return;
        }

        setCurrentCoords(null);
    };

    const applyResolvedLocation = (
        label: string,
        coords: { lat: number; lng: number },
        options?: { toastMessage?: string; remember?: boolean }
    ) => {
        const nextLabel = String(label || '').trim();
        setCurrentCoords({ lat: Number(coords.lat), lng: Number(coords.lng) });
        setData((prev) => ({ ...prev, location: nextLabel }));
        setGeoError(null);
        setShowLocationSuggestions(false);
        if (options?.remember === true) {
            rememberRecentLocation(nextLabel, coords);
        }
        if (options?.toastMessage) {
            showToast('success', options.toastMessage);
        }
    };

    const reverseGeocodeCoords = async (
        coords: { lat: number; lng: number },
        options?: { toastMessage?: string; fallbackLabel?: string; remember?: boolean }
    ) => {
        try {
            const params = new URLSearchParams({ lat: String(coords.lat), lng: String(coords.lng) });
            const res = await fetch(`${API_ENDPOINTS.services.geocodeReverse}?${params.toString()}`);
            const payload = await res.json();
            if (res.ok && payload?.success && payload?.location?.label) {
                applyResolvedLocation(String(payload.location.label), coords, {
                    toastMessage: options?.toastMessage,
                    remember: options?.remember,
                });
                return;
            }
        } catch {
            // fallback below
        }

        applyResolvedLocation(
            options?.fallbackLabel || `${coords.lat.toFixed(7)}, ${coords.lng.toFixed(7)}`,
            coords,
            {
                toastMessage: options?.toastMessage,
                remember: options?.remember,
            }
        );
    };

    const selectLocationSuggestion = (suggestion: LocationSuggestion) => {
        applyResolvedLocation(suggestion.label, { lat: suggestion.lat, lng: suggestion.lng }, {
            toastMessage: 'Address selected from suggestions.',
        });
    };

    const handleLocationKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape') {
            setShowLocationSuggestions(false);
            setHighlightedSuggestionIndex(-1);
            return;
        }

        if (event.key === 'ArrowDown') {
            if (locationSuggestions.length === 0) return;
            event.preventDefault();
            setShowLocationSuggestions(true);
            setHighlightedSuggestionIndex((prev) =>
                prev < locationSuggestions.length - 1 ? prev + 1 : 0
            );
            return;
        }

        if (event.key === 'ArrowUp') {
            if (locationSuggestions.length === 0) return;
            event.preventDefault();
            setShowLocationSuggestions(true);
            setHighlightedSuggestionIndex((prev) =>
                prev > 0 ? prev - 1 : locationSuggestions.length - 1
            );
            return;
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            if (
                showLocationSuggestions &&
                highlightedSuggestionIndex >= 0 &&
                highlightedSuggestionIndex < locationSuggestions.length
            ) {
                selectLocationSuggestion(locationSuggestions[highlightedSuggestionIndex]);
                return;
            }

            void resolveLocationInput();
        }
    };

    const resolveLocationInput = async (silent = false) => {
        const trimmedLocation = data.location.trim();
        if (!trimmedLocation) {
            setGeoError('Enter an address reference or paste coordinates.');
            if (!silent) showToast('error', 'Enter an address or coordinates first.');
            return null;
        }

        const parsedCoords = parseCoordinateInput(trimmedLocation);
        if (parsedCoords) {
            applyResolvedLocation(trimmedLocation, parsedCoords, {
                toastMessage: !silent ? 'Coordinates loaded into the map.' : undefined,
            });
            return parsedCoords;
        }

        setResolvingLocation(true);
        setGeoError(null);
        try {
            const params = new URLSearchParams({ q: trimmedLocation });
            const res = await fetch(`${API_ENDPOINTS.services.geocode}?${params.toString()}`);
            const payload = await res.json();
            if (!res.ok || !payload?.success || payload?.location?.lat == null || payload?.location?.lng == null) {
                    const errorMessage = payload?.error || 'Could not resolve that address in El Salvador.';
                setGeoError(errorMessage);
                if (!silent) showToast('error', errorMessage);
                return null;
            }

            const resolved = {
                lat: Number(payload.location.lat),
                lng: Number(payload.location.lng),
            };

            applyResolvedLocation(String(payload.location.label || trimmedLocation), resolved, {
                toastMessage: !silent ? 'Address resolved on the map.' : undefined,
            });
            return resolved;
        } catch {
            setGeoError('Could not resolve that address in El Salvador right now.');
            if (!silent) showToast('error', 'Could not resolve that address in El Salvador right now.');
            return null;
        } finally {
            setResolvingLocation(false);
        }
    };

    const detectCurrentLocation = () => {
        if (!navigator.geolocation) {
            setGeoError('Geolocation is not supported in this browser.');
            showToast('error', 'Geolocation not supported.');
            return;
        }

        setGeoLoading(true);
        setGeoError(null);

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = Number(pos.coords.latitude.toFixed(7));
                const lng = Number(pos.coords.longitude.toFixed(7));
                setCurrentCoords({ lat, lng });
                void (async () => {
                    try {
                        await reverseGeocodeCoords({ lat, lng }, {
                            toastMessage: 'Current location detected.',
                            fallbackLabel: `${lat}, ${lng}`,
                        });
                    } finally {
                        setGeoLoading(false);
                    }
                })();
            },
            () => {
                setGeoError('Could not access your location. Allow permission and try again.');
                showToast('error', 'Could not read your location.');
                setGeoLoading(false);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    const fetchNearbyPros = async () => {
        const selectedService = services.find((svc) => svc.name === data.category);
        if (!selectedService?.id_service) {
            showToast('error', 'Select a service first.');
            return;
        }

        const resolvedCoords = currentCoords ?? (await resolveLocationInput());
        if (!resolvedCoords) {
            return;
        }

        try {
            const params = new URLSearchParams({
                id_service: String(selectedService.id_service),
                lat: String(resolvedCoords.lat),
                lng: String(resolvedCoords.lng),
                radius_km: String(radiusKm),
            });
            const res = await fetch(`${API_ENDPOINTS.services.nearbyWorkers}?${params.toString()}`);
            const payload = await res.json();
            if (!res.ok || !payload?.success) {
                showToast('error', payload?.error || 'Could not search nearby workers.');
                return;
            }
            setNearbyWorkers(Array.isArray(payload.workers) ? payload.workers : []);
            showToast('success', 'Nearby workers loaded.');
        } catch {
            showToast('error', 'Network error searching nearby workers.');
        }
    };

    const submitServiceRequest = async () => {
        if (!isAuthenticated() || !getToken() || !getAuthUser()) {
            showToast('error', 'You need an account and active session to create a request.');
            return;
        }

        const selectedService = services.find((svc) => svc.name === data.category);
        if (!selectedService?.id_service) {
            showToast('error', 'Select a service first.');
            return;
        }
        if (!data.location.trim()) {
            showToast('error', 'Location is required.');
            return;
        }
        const resolvedCoords = currentCoords ?? (await resolveLocationInput());
        if (!resolvedCoords) {
            showToast('error', 'We need a valid location before creating the request.');
            return;
        }
        if (!data.description.trim() || data.description.trim().length < 10) {
            showToast('error', 'Description must have at least 10 characters.');
            return;
        }
        const budgetValue = Number(data.price);
        if (!Number.isFinite(budgetValue) || budgetValue <= 0) {
            showToast('error', 'Budget must be greater than 0.');
            return;
        }
        if (problemFiles.length === 0) {
            showToast('error', 'Add at least one problem image.');
            return;
        }

        try {
            setIsSubmittingRequest(true);
            const form = new FormData();
            form.append('id_service', String(selectedService.id_service));
            form.append('description', data.description.trim());
            form.append('location', data.location.trim());
            form.append('budget', String(budgetValue));
            form.append('radius_km', String(radiusKm));
            form.append('lat', String(resolvedCoords.lat));
            form.append('lng', String(resolvedCoords.lng));
            problemFiles.forEach((file) => form.append('problem_images', file));

            const token = getToken();
            const res = await fetch(API_ENDPOINTS.services.createRequest, {
                method: 'POST',
                headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                body: form,
            });
            const payload = await res.json();
            if (!res.ok || !payload?.success) {
                if (res.status === 409 && payload?.id_request) {
                    showToast('error', `You already have an active request (#${payload.id_request}).`);
                    fetchMyRequests(historyStatus);
                    return;
                }
                showToast('error', payload?.error || 'Could not create request.');
                return;
            }

            showToast('success', `Request #${payload.request?.id_request || ''} created successfully.`);
            setProblemFiles([]);
            setCurrentCoords(null);
            setGeoError(null);
            setData((prev) => ({ ...prev, description: '', location: '', price: '', images: [] }));
            fetchMyRequests(historyStatus);
        } catch {
            showToast('error', 'Network error creating request.');
        } finally {
            setIsSubmittingRequest(false);
        }
    };

    const statusBadgeClasses = (statusRaw: string) => {
        const status = String(statusRaw || 'pending').toLowerCase();
        if (status === 'done') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
        if (status === 'awaiting_confirmation') return 'bg-violet-100 text-violet-700 border-violet-200';
        if (status === 'assigned') return 'bg-sky-100 text-sky-700 border-sky-200';
        if (status === 'payment_pending') return 'bg-yellow-100 text-yellow-700 border-yellow-200';
        if (status === 'paid') return 'bg-cyan-100 text-cyan-700 border-cyan-200';
        if (status === 'in_progress') return 'bg-indigo-100 text-indigo-700 border-indigo-200';
        if (status === 'cancelled') return 'bg-red-100 text-red-700 border-red-200';
        return 'bg-amber-100 text-amber-700 border-amber-200';
    };

    const statusLabel = (statusRaw: string, request?: MyServiceRequest) => {
        const status = String(statusRaw || 'pending').toLowerCase();
        if (status === 'assigned') {
            if (request && hasPendingWorkerApproval(request)) return 'Review Worker';
            if (request && hasPendingCounter(request)) return 'Counter Pending';
            return 'Worker Accepted';
        }
        if (status === 'payment_pending') return 'Payment Pending';
        if (status === 'paid') return 'Payment Secured';
        if (status === 'awaiting_confirmation') return 'Awaiting Confirmation';
        if (status === 'in_progress') return 'In Progress';
        if (status === 'done') return 'Completed';
        if (status === 'pending') return 'Finding Worker';
        return status.charAt(0).toUpperCase() + status.slice(1);
    };

    const getClientTimelineState = (request: MyServiceRequest) => {
        const status = String(request.status || 'pending').toLowerCase();
        const workerAccepted =
            !!request.assigned_worker &&
            ['assigned', 'payment_pending', 'paid', 'in_progress', 'awaiting_confirmation', 'done'].includes(status);
        const paymentSecured = ['paid', 'in_progress', 'awaiting_confirmation', 'done'].includes(status);
        const onTheWay = ['paid', 'in_progress', 'awaiting_confirmation', 'done'].includes(status);
        const arrived = ['in_progress', 'awaiting_confirmation', 'done'].includes(status);
        const workInProgress = ['in_progress', 'awaiting_confirmation', 'done'].includes(status);
        const completed = status === 'done';

        return {
            workerAccepted,
            paymentSecured,
            onTheWay,
            arrived,
            workInProgress,
            completed,
        };
    };

    const timelineSteps = [
        { key: 'workerAccepted', label: 'Worker accepted' },
        { key: 'paymentSecured', label: 'Payment secured' },
        { key: 'onTheWay', label: 'On the way' },
        { key: 'arrived', label: 'Arrived' },
        { key: 'workInProgress', label: 'Work in progress' },
        { key: 'completed', label: 'Completed' },
    ] as const;

    const hasPendingCounter = (request: MyServiceRequest) =>
        request.status === 'assigned' &&
        request.proposed_budget != null &&
        (request.counter_status == null || request.counter_status === 'pending');

    const hasPendingWorkerApproval = (request: MyServiceRequest) =>
        String(request.status || '').toLowerCase() === 'assigned' &&
        !!request.assigned_worker &&
        request.proposed_budget == null;

    const canUseRequestChat = (request: MyServiceRequest) => {
        const status = String(request.status || '').toLowerCase();
        return ['payment_pending', 'paid', 'in_progress', 'awaiting_confirmation', 'done'].includes(status) && !!request.assigned_worker;
    };

    const getTimelineProgress = (request: MyServiceRequest) => {
        const status = String(request.status || 'pending').toLowerCase();
        const hasCounter = request.proposed_budget != null;
        const counterAccepted = request.counter_status === 'accepted';

        if (status === 'done') return 6;
        if (status === 'awaiting_confirmation') return 5;
        if (status === 'in_progress') return 5;
        if (status === 'paid') return 4;
        if (status === 'payment_pending') return 3;
        if (status === 'cancelled') return 0;
        if (status === 'assigned') {
            if (hasCounter && !counterAccepted) return 2;
            if (counterAccepted) return 3;
            return 1;
        }
        return 0;
    };

    const counterBadge = (request: MyServiceRequest) => {
        if (request.proposed_budget == null) return null;
        if (request.counter_status === 'accepted') {
            return <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Counter Accepted</span>;
        }
        if (request.counter_status === 'declined') {
            return <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-red-100 text-red-700 border border-red-200">Counter Declined</span>;
        }
        return <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Counter Offer</span>;
    };

    const handleWorkerApprovalDecision = async (request: MyServiceRequest, decision: 'accept' | 'decline') => {
        const token = getToken();
        if (!token) {
            showToast('error', 'Login required.');
            return;
        }

        setWorkerApprovalBusyId(request.id_request);
        try {
            const endpoint =
                decision === 'accept'
                    ? API_ENDPOINTS.services.acceptAssignedWorker(request.id_request)
                    : API_ENDPOINTS.services.declineAssignedWorker(request.id_request);

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            const payload = await res.json();
            if (!res.ok || !payload?.success) {
                showToast('error', payload?.error || `Could not ${decision} this worker.`);
                return;
            }

            showToast(
                'success',
                decision === 'accept'
                    ? 'Worker approved. You can continue with payment now.'
                    : 'Worker declined. We will keep looking for another pro.'
            );
            setWorkerProfileRequest(null);
            setWorkerProfileData(null);
            setWorkerProfileLoading(false);
            await fetchMyRequests(historyStatus, true);
        } catch {
            showToast('error', `Network error trying to ${decision} this worker.`);
        } finally {
            setWorkerApprovalBusyId(null);
        }
    };

    const handleCounterDecision = async (request: MyServiceRequest, decision: 'accept' | 'decline') => {
        const token = getToken();
        if (!token) {
            showToast('error', 'Login required.');
            return;
        }

        setCounterBusyId(request.id_request);
        try {
            const endpoint =
                decision === 'accept'
                    ? API_ENDPOINTS.services.acceptCounter(request.id_request)
                    : API_ENDPOINTS.services.declineCounter(request.id_request);

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            const payload = await res.json();
            if (!res.ok || !payload?.success) {
                showToast('error', payload?.error || `Could not ${decision} counter offer.`);
                return;
            }

            showToast('success', decision === 'accept' ? 'Counter offer accepted.' : 'Counter offer declined.');
            await fetchMyRequests(historyStatus);
        } catch {
            showToast('error', `Network error trying to ${decision} counter offer.`);
        } finally {
            setCounterBusyId(null);
        }
    };

    const handleSecurePayment = (request: MyServiceRequest) => {
        const token = getToken();
        if (!token) {
            showToast('error', 'Login required.');
            return;
        }

        window.history.pushState({}, '', `/checkout/${request.id_request}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
    };

    const confirmPaymentThroughModal = async () => {
        const token = getToken();
        if (!token || !paymentModalRequest) {
            showToast('error', 'Login required.');
            return;
        }

        if (paymentMethod === 'paypal') {
            showToast('error', 'PayPal is visible in the demo but not configured yet. Use card checkout for now.');
            return;
        }

        if (
            !paymentForm.fullName.trim() ||
            !paymentForm.email.trim() ||
            !paymentForm.phone.trim() ||
            !paymentForm.city.trim() ||
            !paymentForm.country.trim() ||
            !paymentForm.cardNumber.trim() ||
            !paymentForm.expiry.trim() ||
            !paymentForm.cvv.trim()
        ) {
            showToast('error', 'Complete all card payment fields first.');
            return;
        }

        setPaymentBusyId(paymentModalRequest.id_request);
        try {
            const checkoutRes = await fetch(API_ENDPOINTS.services.paymentCheckout(paymentModalRequest.id_request), {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            const checkoutPayload = await checkoutRes.json();
            if (!checkoutRes.ok || !checkoutPayload?.success) {
                showToast('error', checkoutPayload?.error || 'Could not initialize payment.');
                return;
            }

            const payRes = await fetch(API_ENDPOINTS.services.confirmPayment(paymentModalRequest.id_request), {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            const payPayload = await payRes.json();
            if (!payRes.ok || !payPayload?.success) {
                showToast('error', payPayload?.error || 'Could not confirm payment.');
                return;
            }

            showToast('success', 'Payment secured. Your pro can now start the job.');
            setPaymentModalRequest(null);
            await fetchMyRequests(historyStatus, true);
        } catch {
            showToast('error', 'Network error processing payment.');
        } finally {
            setPaymentBusyId(null);
        }
    };

    const submitClientCompletion = async (request: MyServiceRequest) => {
        const token = getToken();
        if (!token) {
            showToast('error', 'Login required.');
            return;
        }

        setCompletionBusyId(request.id_request);
        try {
            const res = await fetch(API_ENDPOINTS.services.confirmCompletion(request.id_request), {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            const payload = await res.json();
            if (!res.ok || !payload?.success) {
                showToast('error', payload?.error || 'Could not confirm completion.');
                return;
            }

            showToast('success', 'Work completed. You can now leave a review.');
            await fetchMyRequests(historyStatus, true);
        } catch {
            showToast('error', 'Network error confirming completion.');
        } finally {
            setCompletionBusyId(null);
        }
    };

    const openWorkerProfileModal = async (request: MyServiceRequest) => {
        if (!request.assigned_worker) {
            showToast('info', 'This request does not have an assigned worker yet.');
            return;
        }

        const token = getToken();
        if (!token) {
            showToast('error', 'Login required.');
            return;
        }

        setWorkerProfileRequest(request);
        setWorkerProfileData(null);
        setWorkerProfileLoading(true);
        setWorkerPortfolioIndex(0);

        try {
            const res = await fetch(API_ENDPOINTS.services.requestWorkerProfile(request.id_request), {
                headers: { Authorization: `Bearer ${token}` },
            });
            const payload = await res.json();

            if (!res.ok || !payload?.success || !payload?.worker) {
                showToast('error', payload?.error || 'Could not load that worker profile.');
                setWorkerProfileRequest(null);
                return;
            }

            setWorkerProfileData({
                worker: payload.worker,
                portfolio: Array.isArray(payload.portfolio) ? payload.portfolio : [],
            });
            setWorkerPortfolioIndex(0);
        } catch {
            showToast('error', 'Network error loading worker profile.');
            setWorkerProfileRequest(null);
        } finally {
            setWorkerProfileLoading(false);
        }
    };

    const handleClientCompletion = async (request: MyServiceRequest) => {
        requestConfirmRequestAction('complete', request);
    };

    const submitCancelRequest = async (request: MyServiceRequest) => {
        const token = getToken();
        if (!token) {
            showToast('error', 'Please sign in again.');
            return;
        }

        const requestStatus = String(request.status || '').toLowerCase();
        if (!['pending', 'assigned', 'payment_pending'].includes(requestStatus)) {
            showToast('error', 'This request can no longer be cancelled.');
            return;
        }

        setCancelBusyId(request.id_request);
        try {
            const res = await fetch(API_ENDPOINTS.services.cancelRequest(request.id_request), {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            const payload = await res.json();
            if (!res.ok || !payload?.success) {
                showToast('error', payload?.error || 'Could not cancel this request.');
                return;
            }

            if (openChatRequestId === request.id_request) {
                setOpenChatRequestId(null);
            }

            showToast('success', payload?.message || 'Request cancelled.');
            await fetchMyRequests(historyStatus, true);
        } catch {
            showToast('error', 'Network error cancelling request.');
        } finally {
            setCancelBusyId(null);
        }
    };

    const handleCancelRequest = async (request: MyServiceRequest) => {
        const requestStatus = String(request.status || '').toLowerCase();
        if (!['pending', 'assigned', 'payment_pending'].includes(requestStatus)) {
            showToast('error', 'This request can no longer be cancelled.');
            return;
        }

        requestConfirmRequestAction('cancel', request);
    };

    const fetchRequestChat = async (idRequest: number, silent = false) => {
        const token = getToken();
        if (!token) return;
        try {
            const res = await fetch(API_ENDPOINTS.services.requestChat(idRequest), {
                headers: { Authorization: `Bearer ${token}` },
            });
            const payload = await res.json();
            if (!res.ok || !payload?.success) {
                if (!silent) {
                    showToast('error', payload?.error || 'Could not load chat.');
                }
                return;
            }
            const nextChat = Array.isArray(payload.chat) ? payload.chat : [];
            setChatByRequest((prev) => {
                const currentChat = prev[idRequest] || [];
                const currentLastId = currentChat[currentChat.length - 1]?.id_message ?? null;
                const nextLastId = nextChat[nextChat.length - 1]?.id_message ?? null;

                if (currentChat.length === nextChat.length && currentLastId === nextLastId) {
                    return prev;
                }

                return { ...prev, [idRequest]: nextChat };
            });
        } catch {
            if (!silent) {
                showToast('error', 'Network error loading chat.');
            }
        }
    };

    const sendRequestChat = async (idRequest: number) => {
        const token = getToken();
        if (!token) return;
        const text = (chatMessage[idRequest] || '').trim();
        const image = chatImage[idRequest] || null;
        if (!text && !image) {
            showToast('error', 'Write a message or attach an image.');
            return;
        }

        setChatBusyId(idRequest);
        try {
            const form = new FormData();
            if (text) form.append('message', text);
            if (image) form.append('chat_images', image);

            const res = await fetch(API_ENDPOINTS.services.requestChat(idRequest), {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: form,
            });
            const payload = await res.json();
            if (!res.ok || !payload?.success) {
                showToast('error', payload?.error || 'Could not send message.');
                return;
            }

            setChatMessage((prev) => ({ ...prev, [idRequest]: '' }));
            setChatImage((prev) => ({ ...prev, [idRequest]: null }));
            await fetchRequestChat(idRequest, true);
        } catch {
            showToast('error', 'Network error sending message.');
        } finally {
            setChatBusyId(null);
        }
    };

    useEffect(() => {
        if (!isOpen || !openChatRequestId) return;

        const activeRequest = myRequests.find((request) => request.id_request === openChatRequestId);
        if (!activeRequest) return;

        const requestStatus = String(activeRequest.status || '').toLowerCase();
        const canUseChat = canUseRequestChat(activeRequest);

        if (!canUseChat) return;

        const interval = window.setInterval(() => {
            void fetchRequestChat(openChatRequestId, true);
        }, CHAT_POLL_MS);

        return () => window.clearInterval(interval);
    }, [isOpen, openChatRequestId, myRequests]);

    const submitRating = async (request: MyServiceRequest) => {
        const token = getToken();
        if (!token) return;

        const current = ratingForm[request.id_request] || { punctuality: 5, quality: 5, price_fairness: 5, comment: '' };
        setRatingBusyId(request.id_request);
        try {
            const res = await fetch(API_ENDPOINTS.services.requestRating(request.id_request), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(current),
            });
            const payload = await res.json();
            if (!res.ok || !payload?.success) {
                showToast('error', payload?.error || 'Could not submit rating.');
                return;
            }
            showToast('success', 'Fixes submitted.');
            setRatingModalRequest(null);
            setFixesSuccessRequest(request);
        } catch {
            showToast('error', 'Network error submitting rating.');
        } finally {
            setRatingBusyId(null);
        }
    };

    const getRatingDraft = (requestId: number) =>
        ratingForm[requestId] || { punctuality: 5, quality: 5, price_fairness: 5, comment: '' };

    const updateRatingDraft = (
        requestId: number,
        patch: Partial<{ punctuality: number; quality: number; price_fairness: number; comment: string }>
    ) => {
        setRatingForm((prev) => ({
            ...prev,
            [requestId]: {
                punctuality: prev[requestId]?.punctuality ?? 5,
                quality: prev[requestId]?.quality ?? 5,
                price_fairness: prev[requestId]?.price_fairness ?? 5,
                comment: prev[requestId]?.comment ?? '',
                ...patch,
            },
        }));
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex flex-col md:flex-row font-sans pointer-events-auto bg-black/5"
        >
            {/* Map View Background */}
            <div className="absolute inset-0 z-0 bg-gray-100">
                <div ref={mapContainerRef} className="absolute inset-0 z-0" />
                {!leafletReady && <div className="absolute right-4 top-4 z-[500] h-2.5 w-2.5 rounded-full bg-bird-blue/40 animate-pulse" />}
                {!activeTrackedRequest && (
                    <div className="absolute top-4 right-4 md:left-[520px] md:top-4 z-[400] rounded-xl bg-white/95 border border-gray-200 shadow-xl px-4 py-3 pointer-events-auto hidden sm:block">
                    <p className="text-[11px] uppercase tracking-wider font-bold text-gray-500">Live Map</p>
                    <p className="text-sm font-bold text-gray-900">
                        {currentCoords
                            ? (data.location.trim() || `Lat ${currentCoords.lat.toFixed(4)}, Lng ${currentCoords.lng.toFixed(4)}`)
                            : 'Detect location to center'}
                    </p>
                    <p className="text-xs text-bird-blue font-bold mt-1">
                        {nearbyWorkers.length} nearby pro(s) in {radiusKm} km
                    </p>
                    </div>
                )}
                {activeTrackedRequest && (
                    <div className="absolute inset-y-4 right-4 z-[420] hidden md:block md:left-[466px] lg:left-[516px]">
                        <TrackerErrorBoundary>
                            <Suspense fallback={<InlineTrackerFallback />}>
                                <ClientLiveRequestTracker
                                    key={`desktop-${activeTrackedRequest.id_request}`}
                                    leafletReady={leafletReady}
                                    request={activeTrackedRequest}
                                />
                            </Suspense>
                        </TrackerErrorBoundary>
                    </div>
                )}
            </div>

            {/* Sidebar / Bottom Sheet */}
            <motion.div
                initial={{ y: "100%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "100%", opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="w-full h-[60vh] mt-auto md:mt-0 md:h-full md:w-[450px] lg:w-[500px] flex flex-col bg-white/95 backdrop-blur-lg relative z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.15)] md:shadow-2xl overflow-hidden rounded-t-[2rem] md:rounded-none md:border-r border-gray-200"
            >
                {/* Mobile Drag Handle */}
                <div className="w-full flex justify-center pt-4 pb-0 md:hidden bg-white">
                    <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
                </div>

                {/* Header */}
                <div className="h-16 md:h-20 flex items-center justify-between px-4 md:px-6 border-b border-gray-200 bg-white shrink-0">
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="flex items-center gap-2 group"
                        onClick={onClose}
                    >
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 group-hover:bg-bird-blue group-hover:text-white transition-all">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </div>
                        <span className="font-bold text-gray-900 text-lg">Fixlife</span>
                    </motion.button>

                    <div className="flex items-center gap-3">
                        <NotificationCenter token={getToken()} variant="panel" />
                        <div className="text-right hidden sm:block">
                            <div className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Balance</div>
                            <div className="text-sm font-bold text-bird-orange">$120.50</div>
                        </div>
                        <motion.div
                            whileHover={{ scale: 1.1, rotate: 5 }}
                            className="w-10 h-10 rounded-full bg-gradient-to-br from-bird-blue to-bird-darkBlue border-2 border-white shadow-lg cursor-pointer"
                        />
                    </div>
                </div>

                