import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useSSE } from '../../hooks/useSSE';
import { motion, AnimatePresence } from 'framer-motion';
import { ServiceRequestData } from '../../types';
import { API_ENDPOINTS } from '../../config/api';
import { getAuthUser, getToken, isAuthenticated } from '../../utils/session';
import { Notyf } from 'notyf';
import { NotificationCenter } from '../common/NotificationCenter';
import { ServiceRequestMapOverlays } from './ServiceRequestMapOverlays';
import { ServiceRequestPanelShell } from './ServiceRequestPanelShell';
import { ServiceRequestServiceStep } from './ServiceRequestServiceStep';
import { ServiceRequestDetailsHeader } from './ServiceRequestDetailsHeader';
import { ServiceRequestLocationSection } from './ServiceRequestLocationSection';
import { ServiceRequestProblemSection } from './ServiceRequestProblemSection';
import { ServiceRequestHistorySection } from './ServiceRequestHistorySection';
import { ServiceRequestAssignedWorkerCard } from './ServiceRequestAssignedWorkerCard';
import { ServiceRequestPaymentModal } from './ServiceRequestPaymentModal';
import { ServiceRequestFixesSuccessModal } from './ServiceRequestFixesSuccessModal';
import { useResponsiveSheet } from '../../hooks/useResponsiveSheet';
import { useServiceRequestChat } from './hooks/useServiceRequestChat';
import { useServiceRequestLocation } from './hooks/useServiceRequestLocation';
import { useServiceRequestMap } from './hooks/useServiceRequestMap';
import {
    statusBadgeClasses,
    statusLabel,
    getClientTimelineState,
    timelineSteps,
    hasPendingCounter,
    hasPendingWorkerApproval,
    canUseRequestChat,
    counterBadge,
} from './serviceRequestHelpers';
import type {
    LocationSuggestion,
    MyServiceRequest,
    NearbyWorker,
    RatingMetricKey,
    RequestWorkerProfileResponse,
    SavedLocation,
    ServiceOption,
    ServiceRequestWizardProps,
} from './ServiceRequestWizard.types';
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

const RATING_METRIC_LABELS: Record<RatingMetricKey, string> = {
    punctuality: 'Punctuality',
    quality: 'Quality',
    price_fairness: 'Price fairness',
};

const notyf = new Notyf({ position: { x: 'left', y: 'bottom' }, ripple: true });
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
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-900">Preparing live tracker</p>
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
        chipClass: 'border-sky-200 bg-sky-50 text-gray-500',
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
        return 'border-bird-blue/20 bg-bird-blue/10 text-slate-900 hover:bg-bird-blue hover:text-white hover:shadow-[0_12px_24px_rgba(29,78,216,0.18)]';
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
export const ServiceRequestWizard: React.FC<ServiceRequestWizardProps> = ({ isOpen, onClose, initialServiceId, initialServiceName, onOpenCheckout }) => {
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
    const [resolvingLocation, setResolvingLocation] = useState(false);
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
    const [workerAvatarBroken, setWorkerAvatarBroken] = useState(false);
    const [brokenPortfolioPhotos, setBrokenPortfolioPhotos] = useState<Record<number, boolean>>({});
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
    const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
    const [myRequests, setMyRequests] = useState<MyServiceRequest[]>([]);
    const [historyStatus, setHistoryStatus] = useState<'all' | 'pending' | 'payment_pending' | 'paid' | 'assigned' | 'in_progress' | 'awaiting_confirmation' | 'done' | 'cancelled'>('all');
    const [historyLoading, setHistoryLoading] = useState(false);
    const [counterBusyId, setCounterBusyId] = useState<number | null>(null);
    const [workerApprovalBusyId, setWorkerApprovalBusyId] = useState<number | null>(null);
    const [cancelBusyId, setCancelBusyId] = useState<number | null>(null);
    const [paymentBusyId, setPaymentBusyId] = useState<number | null>(null);
    const [completionBusyId, setCompletionBusyId] = useState<number | null>(null);
    const [ratingBusyId, setRatingBusyId] = useState<number | null>(null);
    const [ratingForm, setRatingForm] = useState<Record<number, { punctuality: number; quality: number; price_fairness: number; comment: string }>>({});
    const [ratingModalRequest, setRatingModalRequest] = useState<MyServiceRequest | null>(null);
    const [fixesSuccessRequest, setFixesSuccessRequest] = useState<MyServiceRequest | null>(null);
    const [isRequestPanelExpanded, setIsRequestPanelExpanded] = useState(() => !initialServiceId);
    const isDesktopSheet = useResponsiveSheet();
    const lastToastRef = useRef<{ type: 'success' | 'error' | 'info'; message: string; at: number } | null>(null);
    const previousRequestStatusesRef = useRef<Record<number, string>>({});
    const clientChatEndRef = useRef<HTMLDivElement | null>(null);
    const workerPortfolioPinchRef = useRef<{ startDistance: number; startScale: number } | null>(null);
    const workerPortfolioTapRef = useRef<number>(0);
    const {
        geoLoading,
        geoError,
        setGeoError,
        currentCoords,
        setCurrentCoords,
        locationSuggestions,
        setLocationSuggestions,
        showLocationSuggestions,
        setShowLocationSuggestions,
        highlightedSuggestionIndex,
        setHighlightedSuggestionIndex,
        suggestionsLoading,
        detectCurrentLocation,
    } = useServiceRequestLocation({
        isOpen,
        locationText: data.location,
        parseCoordinateInput,
        reverseGeocodeCoords,
        showToast,
    });
    const {
        openChatRequestId,
        setOpenChatRequestId,
        chatByRequest,
        chatMessage,
        setChatMessage,
        chatImage,
        setChatImage,
        chatBusyId,
        fetchRequestChat,
        sendRequestChat,
    } = useServiceRequestChat({
        isOpen,
        requests: myRequests,
        token: getToken(),
        canUseRequestChat,
        showToast,
    });

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
        setIsRequestPanelExpanded(!initialServiceId);
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

    const getLocationChipClass = (kind: SavedLocation['kind']) => getLocationVisual(kind).chipClass;

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
    const { leafletReady, mapContainerRef } = useServiceRequestMap({
        isOpen,
        currentCoords,
        radiusKm,
        activeLocationKind,
        quickAccessLocations,
        nearbyWorkers,
        reverseGeocodeCoords,
        useSavedLocation,
        sameCoords,
        createLeafletPinIcon,
        getLocationVisual,
    });

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
        setWorkerAvatarBroken(false);
        setBrokenPortfolioPhotos({});
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
            <div className="mt-2 rounded-2xl border-none bg-gray-50/80 hover:bg-gray-100 transition-colors shadow-lg overflow-hidden">
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

    useSSE({
        token: getToken(),
        events: { request_updated: () => { if (isOpen && isAuthenticated()) void fetchMyRequests(historyStatus, true); } },
        enabled: isOpen && isAuthenticated(),
    });

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

    const selectedServiceTitle = useMemo(() => {
        if (!data.category) return null;
        const found = services.find((svc) => svc.name === data.category);
        return found?.name || data.category;
    }, [data.category, services]);

    const compactLocationLabel = useMemo(() => {
        if (data.location.trim()) return data.location.trim();
        if (currentCoords) return `${currentCoords.lat.toFixed(4)}, ${currentCoords.lng.toFixed(4)}`;
        return 'Choose your address';
    }, [currentCoords, data.location]);

    const canSearchPros = !!data.location.trim() && !resolvingLocation;
    const canSubmitRequest =
        !isSubmittingRequest &&
        isAuthenticated() &&
        !!data.price &&
        !!data.location.trim() &&
        problemFiles.length > 0 &&
        !resolvingLocation;

    const shouldShowCollapsedBookingCard = step === 1 && !activeTrackedRequest;

    const openBookingDetails = () => {
        setIsRequestPanelExpanded(true);
    };

    const collapseBookingDetails = () => {
        if (step === 1) {
            setIsRequestPanelExpanded(false);
        }
    };

    const handleFloatingFindPro = async () => {
        if (step !== 1) return;
        if (!isRequestPanelExpanded) {
            setIsRequestPanelExpanded(true);
        }
        if (!canSearchPros) return;
        setIsSearching(true);
        await fetchNearbyPros();
        setTimeout(() => setIsSearching(false), 700);
    };

    function showToast(type: 'success' | 'error' | 'info', message: string) {
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
    }

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

    function applyResolvedLocation(
        label: string,
        coords: { lat: number; lng: number },
        options?: { toastMessage?: string; remember?: boolean }
    ) {
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
    }

    async function reverseGeocodeCoords(
        coords: { lat: number; lng: number },
        options?: { toastMessage?: string; fallbackLabel?: string; remember?: boolean }
    ) {
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
    }

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

        onOpenCheckout?.(request.id_request);
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

    useEffect(() => {
        if (!isOpen || !openChatRequestId) return;
        clientChatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [isOpen, openChatRequestId, openChatRequestId ? (chatByRequest[openChatRequestId] || []).length : 0]);

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
            className="fixed inset-0 z-40 flex font-sans pointer-events-auto bg-black/5"
        >
            {/* Map View Background */}
            <div className="absolute inset-0 z-0 bg-gray-100">
                <div ref={mapContainerRef} className={`absolute inset-0 z-0 ${activeTrackedRequest && isDesktopSheet ? 'md:invisible' : ''}`} />
                <ServiceRequestMapOverlays
                    leafletReady={leafletReady}
                    activeTrackedRequest={activeTrackedRequest ? { id_request: activeTrackedRequest.id_request } : null}
                    currentCoords={currentCoords}
                    locationLabel={data.location}
                    nearbyWorkersCount={nearbyWorkers.length}
                    radiusKm={radiusKm}
                    shouldShowCollapsedBookingCard={shouldShowCollapsedBookingCard}
                    selectedServiceTitle={selectedServiceTitle}
                    compactLocationLabel={compactLocationLabel}
                    onOpenBookingDetails={openBookingDetails}
                    trackerContent={
                        <TrackerErrorBoundary>
                            <Suspense fallback={<InlineTrackerFallback />}>
                                {activeTrackedRequest ? (
                                    <ClientLiveRequestTracker
                                        key={`desktop-${activeTrackedRequest.id_request}`}
                                        leafletReady={leafletReady}
                                        request={activeTrackedRequest}
                                    />
                                ) : null}
                            </Suspense>
                        </TrackerErrorBoundary>
                    }
                />
            </div>

            <ServiceRequestPanelShell
                isDesktopSheet={isDesktopSheet}
                step={step}
                hasActiveTrackedRequest={!!activeTrackedRequest}
                isRequestPanelExpanded={isRequestPanelExpanded}
                selectedServiceTitle={selectedServiceTitle}
                compactLocationLabel={compactLocationLabel}
                nearbyWorkersCount={nearbyWorkers.length}
                radiusKm={radiusKm}
                onClose={onClose}
                onToggleExpanded={() => setIsRequestPanelExpanded((prev) => !prev)}
                onOpenBookingDetails={openBookingDetails}
                notificationCenter={<NotificationCenter token={getToken()} variant="panel" />}
            >
                <AnimatePresence mode="wait">
                        {step === 0 && (
                            <ServiceRequestServiceStep
                                servicesLoading={servicesLoading}
                                services={services}
                                onSelectService={(serviceName) => {
                                    setData({ ...data, category: serviceName });
                                    setStep(1);
                                    setIsRequestPanelExpanded(false);
                                }}
                            />
                        )}
                        {step === 1 && (
                            <motion.div
                                key="step1"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3 }}
                                className="p-6 pb-6 h-full flex flex-col"
                            >
                                <ServiceRequestDetailsHeader
                                    selectedServiceTitle={selectedServiceTitle}
                                    onBack={() => {
                                        setStep(0);
                                        setIsRequestPanelExpanded(true);
                                    }}
                                    onChangeService={() => setStep(0)}
                                />

                                <div className="flex-1 space-y-6">
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.1 }}
                                    >
                                        <ServiceRequestLocationSection
                                            location={data.location}
                                            currentCoords={currentCoords}
                                            resolvingLocation={resolvingLocation}
                                            geoLoading={geoLoading}
                                            locationInputContext={locationInputContext}
                                            showSaveLocationPanel={showSaveLocationPanel}
                                            saveLocationKind={saveLocationKind}
                                            saveLocationTitle={saveLocationTitle}
                                            geoError={geoError}
                                            quickAccessLocationsCount={quickAccessLocations.length}
                                            savedPlacesPreview={savedPlacesPreview}
                                            radiusKm={radiusKm}
                                            mainSuggestionsDropdown={locationInputContext === 'main' ? renderLocationSuggestionsDropdown() : null}
                                            saveSuggestionsDropdown={locationInputContext === 'save-panel' ? renderLocationSuggestionsDropdown() : null}
                                            renderLocationBadge={renderLocationBadge}
                                            getLocationChipClass={getLocationChipClass}
                                            onOpenSaveLocationPanel={openSaveLocationPanel}
                                            onResolveLocationInput={() => void resolveLocationInput()}
                                            onDetectCurrentLocation={detectCurrentLocation}
                                            onMainInputFocus={() => {
                                                setLocationInputContext('main');
                                                setShowLocationSuggestions(true);
                                            }}
                                            onSavePanelInputFocus={() => {
                                                setLocationInputContext('save-panel');
                                                setShowLocationSuggestions(true);
                                            }}
                                            onInputBlur={() => window.setTimeout(() => setShowLocationSuggestions(false), 120)}
                                            onLocationKeyDown={handleLocationKeyDown}
                                            onLocationChange={handleLocationChange}
                                            onCloseSaveLocationPanel={() => setShowSaveLocationPanel(false)}
                                            onSelectSaveLocationKind={(kind) => {
                                                setSaveLocationKind(kind);
                                                setSaveLocationTitle(
                                                    kind === 'favorite'
                                                        ? compactLocationTitle(data.location.trim())
                                                        : kind === 'home'
                                                            ? 'Home'
                                                            : 'Work'
                                                );
                                            }}
                                            onSaveLocation={() => void handleSaveLocationFromPanel()}
                                            onOpenSavedPlacesModal={() => setShowSavedPlacesModal(true)}
                                            onUseSavedLocation={(location) => useSavedLocation(location as SavedLocation)}
                                            onSaveLocationTitleChange={setSaveLocationTitle}
                                            onRadiusChange={setRadiusKm}
                                        />
                                    </motion.div>

                                    <ServiceRequestProblemSection
                                        description={data.description}
                                        price={data.price}
                                        problemFilesCount={problemFiles.length}
                                        problemPreviewUrls={problemPreviewUrls}
                                        nearbyWorkers={nearbyWorkers}
                                        canSearchPros={canSearchPros}
                                        canSubmitRequest={canSubmitRequest}
                                        isSubmittingRequest={isSubmittingRequest}
                                        isAuthenticated={isAuthenticated()}
                                        onDescriptionChange={(value) => setData({ ...data, description: value })}
                                        onPriceChange={(nextValue) => {
                                            if (nextValue === '') {
                                                setData({ ...data, price: '' });
                                                return;
                                            }
                                            const parsed = Number(nextValue);
                                            if (!Number.isFinite(parsed) || parsed < 0) {
                                                return;
                                            }
                                            setData({ ...data, price: nextValue });
                                        }}
                                        onProblemFilesChange={handleProblemFiles}
                                        onRemoveProblemImage={removeProblemImage}
                                        onFindPro={handleFloatingFindPro}
                                        onSubmitRequest={submitServiceRequest}
                                    />
                                </div>
                                <ServiceRequestHistorySection
                                    historyStatus={historyStatus}
                                    historyLoading={historyLoading}
                                    hasRequests={myRequests.length > 0}
                                    activeTrackedRequest={activeTrackedRequest}
                                    statusBadgeClass={activeTrackedRequest ? statusBadgeClasses(activeTrackedRequest.status) : ''}
                                    statusLabel={activeTrackedRequest ? statusLabel(activeTrackedRequest.status, activeTrackedRequest) : ''}
                                    mobileTracker={activeTrackedRequest ? (
                                        <div className="mb-4 md:hidden relative h-[400px] w-full rounded-[2rem] overflow-hidden shadow-sm">
                                            <TrackerErrorBoundary>
                                                <Suspense fallback={<InlineTrackerFallback />}>
                                                    <ClientLiveRequestTracker
                                                        key={`mobile-${activeTrackedRequest.id_request}`}
                                                        leafletReady={leafletReady}
                                                        request={activeTrackedRequest}
                                                    />
                                                </Suspense>
                                            </TrackerErrorBoundary>
                                        </div>
                                    ) : null}
                                    onHistoryStatusChange={(value) => setHistoryStatus(value as any)}
                                >

                                            {historyLoading && myRequests.length === 0 ? (
                                                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                                                    <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                                                    Loading requests
                                                </div>
                                            ) : !historyLoading && myRequests.length === 0 ? (
                                                <div className="text-sm font-semibold text-slate-500 bg-slate-50 border border-slate-100 rounded-xl p-4 text-center">No requests yet.</div>
                                            ) : (
                                                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                                            {myRequests.map((request) => {
                                                const pendingCounter = hasPendingCounter(request);
                                                const pendingWorkerApproval = hasPendingWorkerApproval(request);
                                                const requestStatus = String(request.status || '').toLowerCase();
                                                const canUseChat = canUseRequestChat(request);
                                                const canRate = requestStatus === 'done';
                                                const canCancel = ['pending', 'payment_pending', 'assigned'].includes(requestStatus);
                                                const canPayNow = requestStatus === 'payment_pending';
                                                const canConfirmCompletion = requestStatus === 'awaiting_confirmation';
                                                const paymentStatus = String(request.payment?.status || '').toLowerCase();
                                                const timelineState = getClientTimelineState(request);
                                                const isTrackingActive = activeTrackedRequest?.id_request === request.id_request;

                                                return (
                                                    <div key={request.id_request} className={`rounded-[1.5rem] border bg-white p-5 transition-all shadow-sm hover:shadow-md ${isTrackingActive ? 'border-blue-300 ring-4 ring-blue-50' : 'border-slate-200'}`}>
                                                        <div className="flex items-start justify-between gap-3 mb-4">
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-2 mb-1.5">
                                                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Req #{request.id_request}</span>
                                                                    <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                                                    <span className="text-[10px] font-bold text-slate-500">{new Date(request.created_at).toLocaleDateString()}</span>
                                                                </div>
                                                                <h3 className="text-lg font-black text-slate-900 truncate leading-tight">{request.service_name}</h3>
                                                            </div>
                                                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                                                                <span className={`text-[10px] font-black uppercase tracking-[0.1em] px-2.5 py-1 rounded-full border ${statusBadgeClasses(request.status)}`}>
                                                                    {statusLabel(request.status, request)}
                                                                </span>
                                                                {counterBadge(request)}
                                                            </div>
                                                        </div>

                                                        {isTrackingActive && (
                                                            <div className="mb-4 rounded-xl bg-blue-50 border border-blue-200/60 p-4">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="relative flex items-center justify-center shrink-0 w-8 h-8">
                                                                        <div className="absolute inset-0 rounded-full bg-blue-400 opacity-20 blur-[2px] animate-pulse"></div>
                                                                        <div className="h-2.5 w-2.5 rounded-full bg-blue-500 relative z-10 animate-ping"></div>
                                                                    </div>
                                                                    <div className="min-w-0 flex-1">
                                                                        <p className="text-xs font-black text-slate-900">Live Tracking Active</p>
                                                                        <p className="text-[11px] font-medium text-slate-600 truncate">Check the main map to see your pro's location</p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}

                                                        <p className="text-sm text-slate-600 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                            {request.description}
                                                        </p>

                                                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-slate-500 mb-4">
                                                            <div className="flex items-center gap-1.5">
                                                                <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                                <span>{new Date(request.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                            </div>
                                                            {request.payment?.checkout_reference && (
                                                                <div className="flex items-center gap-1.5 min-w-0">
                                                                    <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                                    <span className="truncate">Ref: {request.payment.checkout_reference}</span>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {request.assigned_worker && (
                                                            <ServiceRequestAssignedWorkerCard
                                                                worker={request.assigned_worker}
                                                                pendingWorkerApproval={pendingWorkerApproval}
                                                                workerApprovalBusy={workerApprovalBusyId === request.id_request}
                                                                getInitials={getInitials}
                                                                onViewProfile={() => void openWorkerProfileModal(request)}
                                                                onDecline={() => handleWorkerApprovalDecision(request, 'decline')}
                                                                onAccept={() => handleWorkerApprovalDecision(request, 'accept')}
                                                            />
                                                        )}

                                                        {(timelineState.workerAccepted || timelineState.paymentSecured || timelineState.onTheWay || timelineState.workInProgress || timelineState.completed) && (
                                                            <div className="mt-3 flex flex-wrap gap-2">
                                                                {timelineState.workerAccepted && (
                                                                    <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-gray-500">
                                                                        Worker accepted
                                                                    </span>
                                                                )}
                                                                {timelineState.paymentSecured && (
                                                                    <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-700">
                                                                        Payment secured
                                                                    </span>
                                                                )}
                                                                {timelineState.onTheWay && requestStatus === 'paid' && (
                                                                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">
                                                                        On the way
                                                                    </span>
                                                                )}
                                                                {timelineState.arrived && requestStatus !== 'done' && (
                                                                    <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">
                                                                        Arrived
                                                                    </span>
                                                                )}
                                                                {timelineState.workInProgress && requestStatus !== 'done' && (
                                                                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-indigo-700">
                                                                        Work in progress
                                                                    </span>
                                                                )}
                                                                {timelineState.completed && (
                                                                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">
                                                                        Completed
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}

                                                        {canCancel && (
                                                            <div className="mt-3 flex justify-end">
                                                                <button
                                                                    type="button"
                                                                    disabled={cancelBusyId === request.id_request}
                                                                    onClick={() => handleCancelRequest(request)}
                                                                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600 hover:bg-red-100 disabled:opacity-50"
                                                                >
                                                                    {cancelBusyId === request.id_request ? 'Cancelling...' : 'Cancel request'}
                                                                </button>
                                                            </div>
                                                        )}

                                                        {(canPayNow || request.payment) && (
                                                            <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div>
                                                                        <p className="text-[10px] uppercase tracking-[0.18em] font-black text-slate-400">Payment Status</p>
                                                                        <div className="mt-1 flex items-baseline gap-2">
                                                                            <span className="text-xl font-black text-slate-900">
                                                                                {request.payment?.amount != null ? `$${Number(request.payment.amount).toFixed(2)}` : `$${Number(request.final_budget ?? request.budget ?? 0).toFixed(2)}`}
                                                                            </span>
                                                                            <span className="text-xs font-bold text-slate-500 uppercase">USD</span>
                                                                        </div>
                                                                        <p className="text-xs font-medium text-slate-600 mt-2">
                                                                            {paymentStatus === 'released'
                                                                                ? 'Funds released to the worker.'
                                                                                : paymentStatus === 'paid'
                                                                                    ? 'Funds secured. The worker can start now.'
                                                                                    : canPayNow
                                                                                        ? 'Secure the funds so your worker can begin.'
                                                                                        : 'Checkout is ready for this request.'}
                                                                        </p>
                                                                    </div>
                                                                    {request.payment && (
                                                                        <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full border ${
                                                                            paymentStatus === 'released'
                                                                                ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                                                                : paymentStatus === 'paid'
                                                                                    ? 'bg-blue-100 text-blue-700 border-blue-200'
                                                                                    : 'bg-white text-slate-700 border-slate-200'
                                                                        }`}>
                                                                            {paymentStatus || 'pending'}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {canPayNow && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleSecurePayment(request)}
                                                                        disabled={paymentBusyId === request.id_request}
                                                                        className="mt-4 w-full py-3.5 rounded-xl bg-slate-900 text-white text-[13px] font-bold hover:bg-black disabled:opacity-40 transition-colors shadow-md"
                                                                    >
                                                                        {paymentBusyId === request.id_request ? 'Processing...' : 'Secure Payment via Checkout'}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}

                                                        <div className="mt-4 grid grid-cols-3 gap-3">
                                                            <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                                                                <p className="text-[10px] uppercase font-black tracking-widest text-slate-400">Initial</p>
                                                                <p className="font-black text-slate-800 mt-0.5">${Number(request.initial_budget ?? request.budget ?? 0).toFixed(2)}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 shadow-sm">
                                                                <p className="text-[10px] uppercase font-black tracking-widest text-amber-600">Counter</p>
                                                                <p className="font-black text-amber-800 mt-0.5">
                                                                    {request.proposed_budget != null ? `$${request.proposed_budget.toFixed(2)}` : '--'}
                                                                </p>
                                                            </div>
                                                            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 shadow-sm">
                                                                <p className="text-[10px] uppercase font-black tracking-widest text-emerald-600">Final</p>
                                                                <p className="font-black text-emerald-800 mt-0.5">
                                                                    {request.final_budget != null ? `$${request.final_budget.toFixed(2)}` : '--'}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                                                            <div className="mb-4 flex items-center justify-between">
                                                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Service timeline</p>
                                                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-white px-2 py-1 rounded-md border border-slate-200">
                                                                    {requestStatus === 'pending' ? 'Waiting for pro' : 'Live track'}
                                                                </span>
                                                            </div>
                                                            <div className="grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-6 relative">
                                                                {/* Optional connecting line could go here */}
                                                                {timelineSteps.map((step) => {
                                                                    const done = timelineState[step.key];
                                                                    return (
                                                                        <div key={`${request.id_request}-${step.key}`} className="flex flex-col items-center text-center relative z-10">
                                                                            <span className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-[10px] font-black transition-colors ${
                                                                                done
                                                                                    ? 'border-blue-500 bg-blue-500 text-white shadow-md'
                                                                                    : 'border-slate-200 bg-white text-slate-300'
                                                                            }`}>
                                                                                {done ? '✓' : ''}
                                                                            </span>
                                                                            <span className={`mt-2 text-[9px] font-bold uppercase tracking-wide leading-tight px-1 ${
                                                                                done ? 'text-slate-700' : 'text-slate-400'
                                                                            }`}>
                                                                                {step.label}
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>

                                                        {request.proposed_budget != null && (
                                                            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-amber-700">
                                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                                    </span>
                                                                    <p className="text-[11px] uppercase tracking-[0.15em] font-black text-amber-700">Counter offer received</p>
                                                                </div>
                                                                <p className="text-xl font-black text-amber-900 mt-1">${request.proposed_budget.toFixed(2)}</p>
                                                                {request.counter_message && (
                                                                    <p className="text-sm font-medium text-amber-800/80 mt-2 bg-white/50 p-2.5 rounded-lg border border-amber-100">
                                                                        "{request.counter_message}"
                                                                    </p>
                                                                )}

                                                                {pendingCounter && (
                                                                    <div className="mt-4 grid grid-cols-2 gap-3">
                                                                        <button
                                                                            type="button"
                                                                            disabled={counterBusyId === request.id_request}
                                                                            onClick={() => handleCounterDecision(request, 'decline')}
                                                                            className="py-3 rounded-xl bg-white border-2 border-red-200 text-red-600 font-bold text-[13px] hover:bg-red-50 disabled:opacity-50 transition-colors"
                                                                        >
                                                                            Decline Offer
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            disabled={counterBusyId === request.id_request}
                                                                            onClick={() => handleCounterDecision(request, 'accept')}
                                                                            className="py-3 rounded-xl bg-slate-900 border-2 border-slate-900 text-white font-bold text-[13px] hover:bg-black disabled:opacity-50 transition-colors shadow-md"
                                                                        >
                                                                            Accept Offer
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                                                            {canCancel && (
                                                                <button
                                                                    type="button"
                                                                    disabled={cancelBusyId === request.id_request}
                                                                    onClick={() => handleCancelRequest(request)}
                                                                    className="rounded-xl border border-red-100 bg-white px-4 py-2.5 text-xs font-bold text-red-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 transition-colors"
                                                                >
                                                                    {cancelBusyId === request.id_request ? 'Cancelling...' : 'Cancel Request'}
                                                                </button>
                                                            )}
                                                            {canConfirmCompletion && (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        e.preventDefault();
                                                                        handleClientCompletion(request);
                                                                    }}
                                                                    disabled={completionBusyId === request.id_request}
                                                                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-blue-600 text-white text-[13px] font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
                                                                >
                                                                    {completionBusyId === request.id_request ? 'Confirming...' : 'Confirm Completion'}
                                                                </button>
                                                            )}
                                                        </div>

                                                        <div className="mt-4 rounded-2xl border-none bg-slate-50 hover:bg-slate-100 transition-colors p-4">
                                                            <div className="flex items-center justify-between">
                                                                <p className="text-[11px] uppercase tracking-widest font-black text-slate-500">Chat</p>
                                                                <button
                                                                    type="button"
                                                                    onClick={async () => {
                                                                        if (!canUseChat) return;
                                                                        const open = openChatRequestId === request.id_request;
                                                                        if (open) {
                                                                            setOpenChatRequestId(null);
                                                                        } else {
                                                                            setOpenChatRequestId(request.id_request);
                                                                            await fetchRequestChat(request.id_request, { silent: true });
                                                                        }
                                                                    }}
                                                                    disabled={!canUseChat}
                                                                    className="text-xs font-bold px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                                                                >
                                                                    {openChatRequestId === request.id_request ? 'Hide Chat' : 'Open Chat'}
                                                                </button>
                                                            </div>
                                                            {!canUseChat && (
                                                                <p className="mt-2 text-xs font-semibold text-slate-500">
                                                                    Chat unlocks once a pro is assigned to your request.
                                                                </p>
                                                            )}

                                                            {openChatRequestId === request.id_request && (
                                                                <div className="mt-4 space-y-3">
                                                                    <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 space-y-4 flex flex-col">
                                                                        {(chatByRequest[request.id_request] || []).length === 0 ? (
                                                                            <p className="text-sm text-slate-500 font-medium text-center py-6">No messages yet. Say hi!</p>
                                                                        ) : (
                                                                            <AnimatePresence>
                                                                                {(chatByRequest[request.id_request] || []).map((msg) => {
                                                                                    const isMe = msg.sender_role === 'client';
                                                                                    return (
                                                                                        <motion.div 
                                                                                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                                                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                                                                            key={msg.id_message} 
                                                                                            className={`max-w-[85%] rounded-[1.25rem] px-4 py-3 text-sm shadow-sm flex flex-col ${isMe ? 'self-end bg-slate-900 text-white rounded-tr-sm' : 'self-start bg-slate-100 text-slate-800 rounded-tl-sm'}`}
                                                                                        >
                                                                                            <p className={`font-bold text-[10px] uppercase tracking-wider mb-1 ${isMe ? 'text-slate-400' : 'text-slate-500'}`}>
                                                                                                {isMe ? 'You' : 'Pro'}
                                                                                            </p>
                                                                                            {msg.message && <p className="leading-relaxed">{msg.message}</p>}
                                                                                            {msg.image_url && (
                                                                                                <a href={msg.image_url} target="_blank" rel="noreferrer" className="mt-2 block rounded-xl overflow-hidden border border-black/10 shadow-sm">
                                                                                                    <img src={msg.image_url} alt="Chat attachment" className="max-h-40 w-full object-cover hover:scale-105 transition-transform" />
                                                                                                </a>
                                                                                            )}
                                                                                            <p className={`text-[10px] text-right mt-1.5 ${isMe ? 'text-slate-400' : 'text-slate-400'}`}>
                                                                                                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                                            </p>
                                                                                        </motion.div>
                                                                                    );
                                                                                })}
                                                                            </AnimatePresence>
                                                                        )}
                                                                        <div ref={clientChatEndRef} />
                                                                    </div>

                                                                    <div className="flex gap-2">
                                                                        <div className="relative flex-1">
                                                                            <input
                                                                                type="text"
                                                                                value={chatMessage[request.id_request] || ''}
                                                                                onChange={(e) => setChatMessage((prev) => ({ ...prev, [request.id_request]: e.target.value }))}
                                                                                onKeyDown={(event) => {
                                                                                    if (event.key === 'Enter' && !event.shiftKey) {
                                                                                        event.preventDefault();
                                                                                        void sendRequestChat(request.id_request);
                                                                                    }
                                                                                }}
                                                                                placeholder="Write a message..."
                                                                                className="w-full pl-4 pr-10 py-3 rounded-xl border border-slate-200 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all shadow-sm"
                                                                            />
                                                                            <label className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors">
                                                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                                                                <input
                                                                                    type="file"
                                                                                    accept="image/png,image/jpeg,image/jpg,image/webp"
                                                                                    onChange={(e) => setChatImage((prev) => ({ ...prev, [request.id_request]: e.target.files?.[0] || null }))}
                                                                                    className="hidden"
                                                                                />
                                                                            </label>
                                                                        </div>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => sendRequestChat(request.id_request)}
                                                                            disabled={chatBusyId === request.id_request}
                                                                            className="px-5 py-3 rounded-xl bg-slate-900 text-white text-sm font-bold disabled:opacity-50 hover:bg-black transition-colors shadow-md"
                                                                        >
                                                                            Send
                                                                        </button>
                                                                    </div>
                                                                    {chatImage[request.id_request] && (
                                                                        <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-lg text-xs font-semibold text-slate-600">
                                                                            <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                                                            <span className="truncate max-w-[200px]">{chatImage[request.id_request]?.name}</span>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setChatImage((prev) => ({ ...prev, [request.id_request]: null }))}
                                                                                className="ml-auto text-slate-400 hover:text-red-500"
                                                                            >
                                                                                ×
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="mt-4 rounded-2xl border border-blue-200/50 bg-blue-50/30 p-4">
                                                            <div className="flex items-center justify-between gap-3">
                                                                <div>
                                                                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-600">Fixes & Rating</p>
                                                                    <p className="mt-1 text-xs font-semibold text-slate-600">
                                                                        {canRate
                                                                            ? 'The job is complete. You can now leave your review.'
                                                                            : 'Review unlocks after the job is finished.'}
                                                                    </p>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => canRate && setRatingModalRequest(request)}
                                                                    disabled={!canRate}
                                                                    className={`rounded-xl px-4 py-2.5 text-xs font-bold transition-all shadow-sm ${
                                                                        canRate
                                                                            ? 'border-2 border-blue-600 bg-white text-blue-600 hover:bg-blue-600 hover:text-white'
                                                                            : 'border border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                                                                    }`}
                                                                >
                                                                    {canRate ? 'Review Pro' : 'Locked'}
                                                                </button>
                                                            </div>
                                                            <div className="mt-3 flex items-center gap-1.5">
                                                                {Array.from({ length: 5 }).map((_, index) => (
                                                                    <span
                                                                        key={`fix-preview-${request.id_request}-${index}`}
                                                                        className={`text-lg ${canRate ? 'text-amber-400 drop-shadow-sm' : 'text-slate-200'}`}
                                                                    >
                                                                        {'★'}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </ServiceRequestHistorySection>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <AnimatePresence>
                        {ratingModalRequest && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[80] bg-slate-950/35 backdrop-blur-[3px] flex items-center justify-center p-4"
                            >
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.96, y: 12 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.96, y: 12 }}
                                    transition={{ type: 'spring', damping: 24, stiffness: 260 }}
                                    className="w-full max-w-2xl overflow-hidden rounded-[30px] border border-gray-200 bg-white shadow-2xl"
                                >
                                    <div className="bg-gradient-to-r from-bird-blue via-sky-500 to-bird-yellow px-6 py-5 text-white">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/80">Fixes review</p>
                                                <h3 className="mt-1 text-2xl font-black">Rate this completed job</h3>
                                                <p className="mt-2 text-sm text-white/85">
                                                    Share how the pro did after finishing <span className="font-black">{ratingModalRequest.service_name}</span>.
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setRatingModalRequest(null)}
                                                className="rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-white hover:bg-white/20"
                                            >
                                                Close
                                            </button>
                                        </div>
                                    </div>

                                    <div className="p-6">
                                        <div className="rounded-3xl border border-bird-blue/10 bg-gradient-to-r from-sky-50 via-white to-amber-50 p-4">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-900">Completed service</p>
                                                    <p className="mt-1 text-lg font-black text-slate-900">
                                                        {ratingModalRequest.service_name}
                                                    </p>
                                                    <p className="mt-1 text-sm text-slate-600">
                                                        {ratingModalRequest.assigned_worker?.name || 'Your pro'}
                                                    </p>
                                                </div>
                                                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
                                                    Unlocked
                                                </span>
                                            </div>
                                        </div>

                                        <div className="mt-5 space-y-4">
                                            {(['punctuality', 'quality', 'price_fairness'] as RatingMetricKey[]).map((key) => {
                                                const currentValue = getRatingDraft(ratingModalRequest.id_request)[key];
                                                return (
                                                    <div key={key} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div>
                                                                <p className="text-sm font-black text-slate-900">{RATING_METRIC_LABELS[key]}</p>
                                                                <p className="mt-1 text-xs text-slate-500">
                                                                    Leave your Fixes stars for this part of the service.
                                                                </p>
                                                            </div>
                                                            <span className="rounded-full border border-bird-yellow/25 bg-bird-yellow/10 px-3 py-1 text-[11px] font-black text-amber-700">
                                                                {currentValue}/5
                                                            </span>
                                                        </div>
                                                        <div className="mt-4 flex flex-wrap gap-2">
                                                            {Array.from({ length: 5 }).map((_, index) => {
                                                                const starValue = index + 1;
                                                                const active = starValue <= currentValue;
                                                                return (
                                                                    <button
                                                                        key={`${key}-${starValue}`}
                                                                        type="button"
                                                                        onClick={() => updateRatingDraft(ratingModalRequest.id_request, { [key]: starValue })}
                                                                        className={`flex h-11 w-11 items-center justify-center rounded-2xl border text-xl transition ${
                                                                            active
                                                                                ? 'border-bird-yellow/30 bg-bird-yellow/15 text-bird-yellow shadow-sm'
                                                                                : 'border-slate-200 bg-white text-slate-300 hover:border-bird-blue/20 hover:text-slate-900'
                                                                        }`}
                                                                    >
                                                                        {'★'}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-4">
                                            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Comment</p>
                                            <textarea
                                                value={getRatingDraft(ratingModalRequest.id_request).comment}
                                                onChange={(e) => updateRatingDraft(ratingModalRequest.id_request, { comment: e.target.value })}
                                                placeholder="Tell us how the service went, what stood out, or what could be better..."
                                                className="mt-3 min-h-[120px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-bird-blue/40 focus:ring-2 focus:ring-bird-blue/10"
                                            />
                                        </div>

                                        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                                            <button
                                                type="button"
                                                onClick={() => setRatingModalRequest(null)}
                                                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                                            >
                                                Maybe later
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => submitRating(ratingModalRequest)}
                                                disabled={ratingBusyId === ratingModalRequest.id_request}
                                                className="rounded-2xl bg-bird-blue px-5 py-3 text-sm font-black text-white shadow-[0_16px_30px_rgba(0,144,255,0.18)] transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:opacity-50"
                                            >
                                                {ratingBusyId === ratingModalRequest.id_request ? 'Sending Fixes...' : 'Submit Fixes'}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur">
                                        {workerProfileRequest && hasPendingWorkerApproval(workerProfileRequest) ? (
                                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                                <div className="min-w-0">
                                                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-900">Approve this pro</p>
                                                    <p className="mt-1 text-sm text-slate-500">
                                                        Review the profile and portfolio, then confirm this worker to move the request to payment.
                                                    </p>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3 lg:w-[380px]">
                                                    <button
                                                        type="button"
                                                        disabled={workerApprovalBusyId === workerProfileRequest.id_request}
                                                        onClick={() => handleWorkerApprovalDecision(workerProfileRequest, 'decline')}
                                                        className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                                                    >
                                                        {workerApprovalBusyId === workerProfileRequest.id_request ? 'Saving...' : 'Decline worker'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={workerApprovalBusyId === workerProfileRequest.id_request}
                                                        onClick={() => handleWorkerApprovalDecision(workerProfileRequest, 'accept')}
                                                        className="rounded-2xl bg-gradient-to-r from-bird-blue to-sky-500 px-4 py-3 text-sm font-black text-white shadow-[0_14px_30px_rgba(14,165,233,0.22)] transition hover:translate-y-[-1px] disabled:opacity-50"
                                                    >
                                                        {workerApprovalBusyId === workerProfileRequest.id_request ? 'Saving...' : 'Accept this worker'}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-end">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setWorkerProfileRequest(null);
                                                        setWorkerProfileData(null);
                                                        setWorkerProfileLoading(false);
                                                    }}
                                                    className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-200"
                                                >
                                                    Close profile
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <AnimatePresence>
                        {fixesSuccessRequest && (
                            <ServiceRequestFixesSuccessModal
                                request={fixesSuccessRequest}
                                punctuality={getRatingDraft(fixesSuccessRequest.id_request).punctuality}
                                quality={getRatingDraft(fixesSuccessRequest.id_request).quality}
                                priceFairness={getRatingDraft(fixesSuccessRequest.id_request).price_fairness}
                                onClose={() => setFixesSuccessRequest(null)}
                            />
                        )}
                    </AnimatePresence>

                    <AnimatePresence>
                        {showSavedPlacesModal && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 z-30 bg-slate-950/20 backdrop-blur-[2px] flex justify-end"
                            >
                                <motion.div
                                    initial={{ x: 36, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    exit={{ x: 36, opacity: 0 }}
                                    transition={{ type: 'spring', damping: 24, stiffness: 220 }}
                                    className="h-full w-full max-w-[420px] border-l border-gray-200 bg-white shadow-2xl"
                                >
                                    <div className="flex h-full flex-col">
                                        <div className="border-b border-gray-200 px-5 py-4">
                                            <div className="flex items-center justify-between gap-4">
                                                <div>
                                                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">Saved places</p>
                                                    <h3 className="mt-1 text-lg font-black text-gray-900">Your location library</h3>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowSavedPlacesModal(false)}
                                                    className="rounded-2xl border-none bg-gray-50/80 hover:bg-gray-100 transition-colors px-3 py-2 text-xs font-bold text-gray-500 hover:text-gray-700"
                                                >
                                                    Close
                                                </button>
                                            </div>

                                            <div className="mt-4 space-y-3">
                                                <div className="relative">
                                                    <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                    </svg>
                                                    <input
                                                        type="text"
                                                        value={savedPlacesSearch}
                                                        onChange={(e) => setSavedPlacesSearch(e.target.value)}
                                                        placeholder="Search by name, address or type"
                                                        className="w-full rounded-2xl border border-gray-200 bg-gray-50 pl-10 pr-10 py-3 text-sm text-gray-900 focus:border-bird-blue focus:bg-white focus:outline-none"
                                                    />
                                                    {savedPlacesSearch.trim() && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setSavedPlacesSearch('')}
                                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-gray-400 hover:text-gray-600"
                                                        >
                                                            x
                                                        </button>
                                                    )}
                                                </div>

                                                <div className="flex flex-wrap gap-2">
                                                    {[
                                                        { key: 'all', label: 'All', count: quickAccessLocations.length },
                                                        { key: 'primary', label: 'Home & Work', count: groupedSavedLocations.primary.length },
                                                        { key: 'favorite', label: 'Favorites', count: groupedSavedLocations.favorites.length },
                                                        { key: 'recent', label: 'Recent', count: groupedSavedLocations.recents.length },
                                                    ].map((option) => (
                                                        <button
                                                            key={option.key}
                                                            type="button"
                                                            onClick={() => setSavedPlacesFilter(option.key as 'all' | 'primary' | 'favorite' | 'recent')}
                                                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold transition ${
                                                                savedPlacesFilter === option.key
                                                                    ? 'border-bird-blue bg-bird-blue text-white shadow-sm'
                                                                    : 'border-gray-200 bg-white text-gray-600 hover:border-bird-blue/40 hover:text-slate-900'
                                                            }`}
                                                        >
                                                            <span>{option.label}</span>
                                                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                                                                savedPlacesFilter === option.key
                                                                    ? 'bg-white/20 text-white'
                                                                    : 'bg-gray-100 text-gray-500'
                                                            }`}>
                                                                {option.count}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex-1 overflow-y-auto p-5 space-y-5">
                                            {quickAccessLocations.length === 0 ? (
                                                <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-500">
                                                    You do not have saved places yet. Resolve a location first, then use <span className="font-bold text-gray-700">Add location</span>.
                                                </div>
                                            ) : filteredSavedLocations.total === 0 ? (
                                                <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-500">
                                                    No saved places match your current search or filter.
                                                </div>
                                            ) : (
                                                <>
                                                    {filteredSavedLocations.primary.length > 0 && (
                                                        <div>
                                                            <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">Home & Work</p>
                                                            <div className="space-y-3">
                                                                {filteredSavedLocations.primary.map((location, index) => {
                                                                    const visual = getLocationVisual(location.kind);
                                                                    const distanceLabel = currentCoords && !sameCoords(currentCoords, location)
                                                                        ? formatDistanceLabel(distanceKmBetween(currentCoords, location))
                                                                        : sameCoords(currentCoords, location)
                                                                            ? 'Current place'
                                                                            : null;

                                                                    return (
                                                                        <div
                                                                            key={`${location.kind}-modal-${index}-${location.label}`}
                                                                            className="rounded-2xl border border-gray-200 bg-slate-50 p-3"
                                                                        >
                                                                            <div className="flex items-center gap-3">
                                                                                {renderLocationBadge(location.kind, 'md')}
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => handleUseSavedLocation(location)}
                                                                                    className="min-w-0 flex-1 text-left"
                                                                                >
                                                                                    <p className="text-[15px] font-bold text-slate-800">{location.title}</p>
                                                                                    <p className="mt-1 line-clamp-2 text-xs text-gray-500">{location.label}</p>
                                                                                    <p className={`mt-1 inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${visual.chipClass}`}>
                                                                                        {distanceLabel || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`}
                                                                                    </p>
                                                                                </button>
                                                                                <div className="shrink-0">
                                                                                    {renderSavedPlaceActions(location, { compact: true })}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {filteredSavedLocations.favorites.length > 0 && (
                                                        <div>
                                                            <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">Favorites</p>
                                                            <div className="space-y-3">
                                                                {filteredSavedLocations.favorites.map((location, index) => {
                                                                    const visual = getLocationVisual(location.kind);
                                                                    const distanceLabel = currentCoords && !sameCoords(currentCoords, location)
                                                                        ? formatDistanceLabel(distanceKmBetween(currentCoords, location))
                                                                        : sameCoords(currentCoords, location)
                                                                            ? 'Current place'
                                                                            : null;

                                                                    return (
                                                                        <div
                                                                            key={`${location.kind}-modal-favorite-${index}-${location.label}`}
                                                                            className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3"
                                                                        >
                                                                            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-gray-200 bg-slate-100">
                                                                                <img src={getPreviewTileUrl(location.lat, location.lng)} alt={location.title} className="h-full w-full object-cover" />
                                                                                <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-white/10" />
                                                                                <span className="absolute left-2 top-2">
                                                                                    {renderLocationBadge(location.kind, 'sm')}
                                                                                </span>
                                                                            </div>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleUseSavedLocation(location)}
                                                                                className="min-w-0 flex-1 text-left"
                                                                            >
                                                                                <p className="truncate text-[15px] font-bold text-slate-800">{location.title}</p>
                                                                                <p className="mt-1 truncate text-xs text-gray-500">{location.label}</p>
                                                                                <p className={`mt-1 inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${visual.chipClass}`}>
                                                                                    {distanceLabel || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`}
                                                                                </p>
                                                                            </button>
                                                                            <div className="shrink-0">
                                                                                {renderSavedPlaceActions(location, { compact: true })}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {filteredSavedLocations.recents.length > 0 && (
                                                        <div>
                                                            <div className="mb-3 flex items-center justify-between gap-3">
                                                                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Recent</p>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void clearRecentLocations()}
                                                                    className="text-[11px] font-bold text-red-500 hover:text-red-600"
                                                                >
                                                                    Clear
                                                                </button>
                                                            </div>
                                                            <div className="flex flex-wrap gap-2">
                                                                {filteredSavedLocations.recents.map((location, index) => {
                                                                    const visual = getLocationVisual(location.kind);
                                                                    return (
                                                                        <button
                                                                            key={`${location.kind}-modal-recent-${index}-${location.label}`}
                                                                            type="button"
                                                                            onClick={() => handleUseSavedLocation(location)}
                                                                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold transition ${visual.chipClass} hover:shadow-sm`}
                                                                        >
                                                                            {renderLocationBadge(location.kind, 'sm')}
                                                                            {location.title}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                            <div className="mt-3 space-y-2">
                                                                {filteredSavedLocations.recents.map((location, index) => (
                                                                    <div
                                                                        key={`${location.kind}-actions-${index}-${location.label}`}
                                                                        className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-3 py-2"
                                                                    >
                                                                        <div className="min-w-0">
                                                                            <p className="truncate text-xs font-bold text-gray-800">{location.title}</p>
                                                                            <p className="truncate text-[11px] text-gray-400">{location.label}</p>
                                                                        </div>
                                                                        <div className="shrink-0">
                                                                            {renderSavedPlaceActions(location, { compact: true })}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <AnimatePresence>
                        {workerProfileRequest && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={closeWorkerProfileModal}
                                className="fixed inset-0 z-[9999] bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
                            >
                                <motion.div
                                    initial={{ opacity: 0, y: 60, scale: 0.97 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 60, scale: 0.97 }}
                                    transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex w-full max-w-2xl max-h-[92vh] sm:max-h-[88vh] flex-col overflow-hidden rounded-t-[2rem] sm:rounded-[2rem] bg-white shadow-2xl"
                                >
                                    {/* Drag handle (mobile) */}
                                    <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
                                        <div className="w-10 h-1.5 rounded-full bg-slate-200" />
                                    </div>

                                    {/* Header */}
                                    <div className="relative bg-slate-900 px-6 py-7 shrink-0 overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-950" />
                                        <button
                                            type="button"
                                            onClick={closeWorkerProfileModal}
                                            className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                                        >
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                        <div className="relative z-10 flex items-center gap-4">
                                            {selectedWorkerProfile?.profile_image_url && !workerAvatarBroken ? (
                                                <img
                                                    src={selectedWorkerProfile.profile_image_url}
                                                    alt={selectedWorkerProfile.name}
                                                    onError={() => setWorkerAvatarBroken(true)}
                                                    className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-2 ring-white/20 shadow-lg"
                                                />
                                            ) : (
                                                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-xl font-black text-white ring-2 ring-white/10">
                                                    {getInitials(selectedWorkerProfile?.name || 'Pro')}
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">Verified Pro</span>
                                                    {selectedWorkerProfile?.is_online && (
                                                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                                            Online
                                                        </span>
                                                    )}
                                                </div>
                                                <h3 className="text-xl font-black text-white truncate">
                                                    {selectedWorkerProfile?.name || 'Assigned Pro'}
                                                </h3>
                                                <div className="flex items-center gap-2 mt-1.5">
                                                    {renderStarSummary(selectedWorkerProfile?.rating_average ?? null)}
                                                    <span className="text-xs font-bold text-slate-400">
                                                        {selectedWorkerProfile?.rating_average != null
                                                            ? `${selectedWorkerProfile.rating_average.toFixed(1)} · ${selectedWorkerProfile.rating_count} reviews`
                                                            : 'New Pro'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Stats row */}
                                        <div className="relative z-10 mt-5 grid grid-cols-3 gap-3">
                                            {[
                                                { label: 'Jobs', value: selectedWorkerProfile?.completed_jobs ?? 0 },
                                                { label: 'Experience', value: selectedWorkerProfile?.years_of_experience != null ? `${selectedWorkerProfile.years_of_experience}y` : '--' },
                                                { label: 'Rating', value: selectedWorkerProfile?.rating_average != null ? selectedWorkerProfile.rating_average.toFixed(1) : '--' },
                                            ].map((stat) => (
                                                <div key={stat.label} className="rounded-xl bg-white/8 border border-white/10 px-3 py-2.5 text-center backdrop-blur-sm">
                                                    <p className="text-base font-black text-white">{stat.value}</p>
                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">{stat.label}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Body */}
                                    <div className="flex-1 overflow-y-auto bg-white">
                                        {workerProfileLoading ? (
                                            <div className="flex items-center justify-center gap-3 py-16">
                                                <div className="h-5 w-5 rounded-full border-2 border-slate-200 border-t-slate-700 animate-spin" />
                                                <p className="text-sm font-bold text-slate-500">Loading profile...</p>
                                            </div>
                                        ) : (
                                            <div className="divide-y divide-slate-100">
                                                {/* Bio */}
                                                {selectedWorkerProfile?.bio && (
                                                    <div className="px-6 py-5">
                                                        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">About</p>
                                                        <p className="text-sm leading-relaxed text-slate-700">{selectedWorkerProfile.bio}</p>
                                                    </div>
                                                )}

                                                {/* Info row */}
                                                <div className="px-6 py-5 grid grid-cols-2 gap-4">
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Phone</p>
                                                        <p className="text-sm font-bold text-slate-900">{selectedWorkerProfile?.phone_number || 'Hidden'}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Level</p>
                                                        <p className="text-sm font-bold text-slate-900">{selectedWorkerProfile?.experience_label || '—'}</p>
                                                    </div>
                                                </div>

                                                {/* Services */}
                                                {(selectedWorkerProfile?.services_offered || []).length > 0 && (
                                                    <div className="px-6 py-5">
                                                        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">Services</p>
                                                        <div className="flex flex-wrap gap-2">
                                                            {selectedWorkerProfile!.services_offered.map((s) => (
                                                                <span key={s} className="rounded-xl bg-slate-100 border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700">
                                                                    {s}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Portfolio */}
                                                <div className="px-6 py-5">
                                                    <div className="flex items-center justify-between mb-4">
                                                        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Portfolio</p>
                                                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">{workerPortfolio.length} photos</span>
                                                    </div>
                                                    {workerPortfolio.length === 0 ? (
                                                        <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center text-center">
                                                            <svg className="w-8 h-8 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                                            <p className="text-sm font-bold text-slate-500">No portfolio yet</p>
                                                        </div>
                                                    ) : (
                                                        <div className="grid grid-cols-3 gap-2 pb-2">
                                                            {workerPortfolio.slice(0, 6).map((item, index) => (
                                                                <button
                                                                    key={item.id_photo}
                                                                    type="button"
                                                                    onClick={() => { setWorkerPortfolioIndex(index); setIsWorkerPortfolioFullscreen(true); }}
                                                                    className="group relative aspect-square overflow-hidden rounded-xl bg-slate-100 border border-slate-200"
                                                                >
                                                                    {item.image_url && !brokenPortfolioPhotos[item.id_photo] ? (
                                                                        <img
                                                                            src={item.image_url}
                                                                            alt=""
                                                                            onError={() => setBrokenPortfolioPhotos((prev) => ({ ...prev, [item.id_photo]: true }))}
                                                                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                                        />
                                                                    ) : (
                                                                        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 text-slate-400">
                                                                            <svg className="w-6 h-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                                                            <span className="text-[9px] font-bold uppercase tracking-wider">Unavailable</span>
                                                                        </div>
                                                                    )}
                                                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                                                        <svg className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
                                                                    </div>
                                                                </button>
                                                            ))}
                                                            {workerPortfolio.length > 6 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => { setWorkerPortfolioIndex(6); setIsWorkerPortfolioFullscreen(true); }}
                                                                    className="aspect-square rounded-xl bg-slate-900 text-white text-sm font-black flex items-center justify-center hover:bg-black transition-colors"
                                                                >
                                                                    +{workerPortfolio.length - 6}
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <AnimatePresence>
                        {workerProfileRequest && isWorkerPortfolioFullscreen && activeWorkerPortfolioPhoto && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[10000] bg-slate-950/80 backdrop-blur-md"
                                onClick={() => setIsWorkerPortfolioFullscreen(false)}
                            >
                                <motion.div
                                    initial={{ opacity: 0, y: 16, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 16, scale: 0.98 }}
                                    transition={{ type: 'spring', damping: 24, stiffness: 260 }}
                                    className="absolute inset-4 overflow-hidden rounded-[34px] border border-white/10 bg-slate-950 shadow-[0_30px_90px_rgba(15,23,42,0.45)]"
                                    onClick={(event) => event.stopPropagation()}
                                >
                                    <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 p-5">
                                        <div className="rounded-full border border-white/15 bg-slate-950/70 px-4 py-2 text-white backdrop-blur">
                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">Portfolio</p>
                                            <p className="mt-1 text-sm font-black">
                                                {activeWorkerPortfolioIndex + 1} / {workerPortfolio.length}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={toggleWorkerPortfolioZoom}
                                                className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.16em] backdrop-blur transition ${
                                                    isWorkerPortfolioZoomed
                                                        ? 'border-bird-yellow/70 bg-bird-yellow/20 text-bird-yellow'
                                                        : 'border-white/15 bg-white/10 text-white hover:bg-white/15'
                                                }`}
                                            >
                                                {isWorkerPortfolioZoomed ? 'Zoom out' : 'Zoom in'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setIsWorkerPortfolioFullscreen(false)}
                                                className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white backdrop-blur hover:bg-white/15"
                                            >
                                                Close
                                            </button>
                                        </div>
                                    </div>

                                    <div className="absolute inset-0">
                                        {activeWorkerPortfolioPhoto.image_url ? (
                                            <motion.div
                                                drag={isWorkerPortfolioZoomed ? false : 'x'}
                                                dragConstraints={{ left: 0, right: 0 }}
                                                dragElastic={0.16}
                                                onTouchStart={handleWorkerPortfolioTouchStart}
                                                onTouchMove={handleWorkerPortfolioTouchMove}
                                                onTouchEnd={handleWorkerPortfolioTouchEnd}
                                                onDragEnd={(_, info) => {
                                                    if (isWorkerPortfolioZoomed || workerPortfolio.length <= 1) return;
                                                    if (info.offset.x <= -90) {
                                                        shiftWorkerPortfolio('next');
                                                    } else if (info.offset.x >= 90) {
                                                        shiftWorkerPortfolio('prev');
                                                    }
                                                }}
                                                style={{ touchAction: isWorkerPortfolioZoomed ? 'none' : 'pan-y' }}
                                                className="flex h-full w-full items-center justify-center px-4 pb-24 pt-24 sm:px-8"
                                            >
                                                <motion.img
                                                    key={`${activeWorkerPortfolioPhoto.id_photo}`}
                                                    src={activeWorkerPortfolioPhoto.image_url}
                                                    alt={activeWorkerPortfolioPhoto.description || 'Portfolio work'}
                                                    initial={{ opacity: 0.45, scale: 0.96 }}
                                                    animate={{ opacity: 1, scale: workerPortfolioScale }}
                                                    transition={{ type: 'spring', stiffness: 220, damping: 24 }}
                                                    onClick={handleWorkerPortfolioImageTap}
                                                    onDoubleClick={handleWorkerPortfolioImageDoubleTap}
                                                    style={{ transformOrigin: workerPortfolioTransformOrigin }}
                                                    className={`max-h-full max-w-full rounded-[28px] object-contain shadow-[0_24px_60px_rgba(15,23,42,0.38)] transition ${
                                                        isWorkerPortfolioZoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'
                                                    }`}
                                                />
                                            </motion.div>
                                        ) : (
                                            <div className="h-full w-full bg-slate-900" />
                                        )}
                                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-950/75 to-transparent px-6 pb-6 pt-20 text-white">
                                            <div className="flex flex-wrap items-end justify-between gap-4">
                                                <div className="flex flex-wrap items-start gap-4">
                                                    <div className="flex items-center gap-3 rounded-[24px] border border-white/12 bg-white/10 px-4 py-3 backdrop-blur-md">
                                                        {selectedWorkerProfile?.profile_image_url ? (
                                                            <img
                                                                src={selectedWorkerProfile.profile_image_url}
                                                                alt={selectedWorkerProfile.name || 'Worker'}
                                                                className="h-14 w-14 rounded-2xl object-cover ring-2 ring-white/10"
                                                            />
                                                        ) : (
                                                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-lg font-black text-white">
                                                                {getInitials(selectedWorkerProfile?.name || 'Pro')}
                                                            </div>
                                                        )}
                                                        <div>
                                                            <p className="text-base font-black text-white">
                                                                {selectedWorkerProfile?.name || 'Assigned pro'}
                                                            </p>
                                                            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-white/55">
                                                                {selectedWorkerProfile?.experience_label || 'Verified professional'}
                                                            </p>
                                                            <p className="mt-1 text-sm text-white/70">
                                                                {selectedWorkerProfile?.phone_number || 'Phone shared after approval'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/55">Image note</p>
                                                        <p className="mt-2 text-lg font-black">
                                                            {activeWorkerPortfolioPhoto.description || 'Recent portfolio work'}
                                                        </p>
                                                        <p className="mt-2 text-sm text-white/70">
                                                            {activeWorkerPortfolioPhoto.uploaded_at
                                                                ? new Date(activeWorkerPortfolioPhoto.uploaded_at).toLocaleDateString()
                                                                : 'Recently uploaded'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-black backdrop-blur">
                                                    {(selectedWorkerProfile?.services_offered || []).slice(0, 2).join(' • ') || 'Assigned pro'}
                                                </div>
                                            </div>
                                            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/65">
                                                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                                                    {isWorkerPortfolioZoomed ? `Zoom ${workerPortfolioScale.toFixed(1)}x active` : 'Tap image to zoom'}
                                                </span>
                                                {workerPortfolio.length > 1 && !isWorkerPortfolioZoomed && (
                                                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                                                        Swipe left or right to browse
                                                    </span>
                                                )}
                                                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                                                    Pinch with two fingers to zoom
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {workerPortfolio.length > 1 && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => shiftWorkerPortfolio('prev')}
                                                className="absolute left-6 top-1/2 z-20 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-white/10 text-3xl font-black text-white backdrop-blur transition hover:bg-white/20"
                                            >
                                                {'‹'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => shiftWorkerPortfolio('next')}
                                                className="absolute right-6 top-1/2 z-20 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-white/10 text-3xl font-black text-white backdrop-blur transition hover:bg-white/20"
                                            >
                                                {'›'}
                                            </button>

                                            <div className="absolute inset-x-0 bottom-5 z-20 px-6">
                                                <div className="mx-auto grid max-w-3xl grid-cols-4 gap-3 rounded-[24px] border border-white/10 bg-slate-950/65 p-3 backdrop-blur-md">
                                                    {workerPortfolio.map((item, index) => (
                                                        <button
                                                            key={item.id_photo}
                                                            type="button"
                                                            onClick={() => setWorkerPortfolioIndex(index)}
                                                            className={`group overflow-hidden rounded-2xl border transition ${
                                                                index === activeWorkerPortfolioIndex
                                                                    ? 'border-bird-blue bg-bird-blue/10 shadow-[0_12px_28px_rgba(29,78,216,0.2)]'
                                                                    : 'border-white/10 bg-white/5 hover:border-bird-blue/35'
                                                            }`}
                                                        >
                                                            {item.image_url ? (
                                                                <img
                                                                    src={item.image_url}
                                                                    alt={item.description || 'Portfolio thumbnail'}
                                                                    className="aspect-square w-full object-cover transition duration-300 group-hover:scale-[1.04]"
                                                                />
                                                            ) : (
                                                                <div className="aspect-square w-full bg-slate-800" />
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <AnimatePresence>
                        {pendingDeleteLocation && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 z-40 bg-slate-950/35 backdrop-blur-[3px] flex items-center justify-center p-4"
                            >
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.96, y: 12 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.96, y: 12 }}
                                    transition={{ type: 'spring', damping: 24, stiffness: 260 }}
                                    className="w-full max-w-md overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-2xl"
                                >
                                    <div className="bg-gradient-to-r from-amber-400 via-yellow-300 to-bird-blue px-6 py-5">
                                        <div className="flex items-center gap-4">
                                            {renderLocationBadge(pendingDeleteLocation.kind, 'lg')}
                                            <div className="text-slate-900">
                                                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-700">Delete saved place</p>
                                                <h3 className="mt-1 text-xl font-black">{pendingDeleteLocation.title}</h3>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-6">
                                        <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                                            <p className="text-sm font-bold text-slate-900">Are you sure you want to remove this location?</p>
                                            <p className="mt-2 text-sm text-slate-600">{pendingDeleteLocation.label}</p>
                                            <div className="mt-3 inline-flex rounded-full border border-bird-blue/20 bg-bird-blue/10 px-3 py-1 text-[11px] font-bold text-slate-900">
                                                {pendingDeleteLocation.lat.toFixed(4)}, {pendingDeleteLocation.lng.toFixed(4)}
                                            </div>
                                        </div>

                                        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                                            <motion.button
                                                type="button"
                                                onClick={() => closeDeleteSavedLocationPrompt(true)}
                                                whileHover={{ y: -2, scale: 1.01 }}
                                                whileTap={{ scale: 0.98 }}
                                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-bird-blue/20 bg-bird-blue/10 px-4 py-3 text-sm font-black text-slate-900 transition hover:bg-bird-blue hover:text-white"
                                            >
                                                {renderSavedPlaceActionIcon('use')}
                                                Keep place
                                            </motion.button>
                                            <motion.button
                                                type="button"
                                                onClick={() => void confirmDeleteSavedLocation()}
                                                whileHover={{ y: -2, scale: 1.01 }}
                                                whileTap={{ scale: 0.98 }}
                                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-300 to-yellow-300 px-4 py-3 text-sm font-black text-slate-900 transition hover:shadow-[0_12px_28px_rgba(245,158,11,0.28)]"
                                            >
                                                {renderSavedPlaceActionIcon('delete')}
                                                Delete saved place
                                            </motion.button>
                                        </div>
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <AnimatePresence>
                        {pendingRenameLocation && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 z-40 bg-slate-950/35 backdrop-blur-[3px] flex items-center justify-center p-4"
                            >
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.96, y: 12 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.96, y: 12 }}
                                    transition={{ type: 'spring', damping: 24, stiffness: 260 }}
                                    className="w-full max-w-md overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-2xl"
                                >
                                    <div className="bg-gradient-to-r from-bird-blue via-sky-500 to-yellow-300 px-6 py-5">
                                        <div className="flex items-center gap-4">
                                            {renderLocationBadge(pendingRenameLocation.kind, 'lg')}
                                            <div className="text-slate-900">
                                                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-700">Rename saved place</p>
                                                <h3 className="mt-1 text-xl font-black">{pendingRenameLocation.title}</h3>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-6">
                                        <label className="block text-[11px] font-black uppercase tracking-[0.18em] text-gray-500">
                                            New label
                                        </label>
                                        <input
                                            type="text"
                                            value={pendingRenameTitle}
                                            autoFocus
                                            autoComplete="off"
                                            onChange={(e) => setPendingRenameTitle(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    void confirmRenameSavedLocation();
                                                }
                                                if (e.key === 'Escape') {
                                                    e.preventDefault();
                                                    closeRenameSavedLocationPrompt(true);
                                                }
                                            }}
                                            className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 focus:border-bird-blue focus:bg-white focus:outline-none"
                                            placeholder="Ex: Home, Office, Mom's house"
                                        />
                                        <p className="mt-3 text-sm text-gray-500">
                                            Update the name without touching the saved coordinates.
                                        </p>

                                        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                                            <motion.button
                                                type="button"
                                                onClick={() => closeRenameSavedLocationPrompt(true)}
                                                whileHover={{ y: -2, scale: 1.01 }}
                                                whileTap={{ scale: 0.98 }}
                                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-700 transition hover:bg-amber-400 hover:text-white"
                                            >
                                                {renderSavedPlaceActionIcon('delete')}
                                                Cancel
                                            </motion.button>
                                            <motion.button
                                                type="button"
                                                onClick={() => void confirmRenameSavedLocation()}
                                                whileHover={{ y: -2, scale: 1.01 }}
                                                whileTap={{ scale: 0.98 }}
                                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-bird-blue/20 bg-bird-blue px-4 py-3 text-sm font-black text-white transition hover:shadow-[0_12px_28px_rgba(29,78,216,0.28)]"
                                            >
                                                {renderSavedPlaceActionIcon('rename')}
                                                Save name
                                            </motion.button>
                                        </div>
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <AnimatePresence>
                        {pendingRequestAction && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[100] bg-slate-950/35 backdrop-blur-[3px] flex items-center justify-center p-4"
                            >
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.96, y: 12 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.96, y: 12 }}
                                    transition={{ type: 'spring', damping: 24, stiffness: 260 }}
                                    className="w-full max-w-md overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-2xl"
                                >
                                    <div className={`px-6 py-5 ${
                                        pendingRequestAction.type === 'cancel'
                                            ? 'bg-gradient-to-r from-amber-400 via-yellow-300 to-orange-300'
                                            : 'bg-gradient-to-r from-bird-blue via-sky-500 to-cyan-400'
                                    }`}>
                                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-700">
                                            {pendingRequestAction.type === 'cancel' ? 'Cancel request' : 'Confirm completion'}
                                        </p>
                                        <h3 className="mt-2 text-xl font-black text-slate-900">
                                            #{pendingRequestAction.request.id_request} - {pendingRequestAction.request.service_name}
                                        </h3>
                                    </div>

                                    <div className="p-6">
                                        <div className={`rounded-2xl border p-4 ${
                                            pendingRequestAction.type === 'cancel'
                                                ? 'border-amber-200 bg-amber-50/70'
                                                : 'border-blue-200 bg-blue-50/70'
                                        }`}>
                                            <p className="text-sm font-bold text-slate-900">
                                                {pendingRequestAction.type === 'cancel'
                                                    ? 'Are you sure you want to cancel this request?'
                                                    : 'Confirm that the work is completed and release the payment?'}
                                            </p>
                                            <p className="mt-2 text-sm text-slate-600 line-clamp-3">
                                                {pendingRequestAction.request.description}
                                            </p>
                                        </div>

                                        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                                            <motion.button
                                                type="button"
                                                onClick={() => closeRequestActionPrompt(true)}
                                                whileHover={{ y: -2, scale: 1.01 }}
                                                whileTap={{ scale: 0.98 }}
                                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-700 transition hover:bg-amber-400 hover:text-white"
                                            >
                                                {renderSavedPlaceActionIcon('delete')}
                                                Back
                                            </motion.button>
                                            <motion.button
                                                type="button"
                                                onClick={() => void confirmPendingRequestAction()}
                                                whileHover={{ y: -2, scale: 1.01 }}
                                                whileTap={{ scale: 0.98 }}
                                                className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black text-white transition ${
                                                    pendingRequestAction.type === 'cancel'
                                                        ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:shadow-[0_12px_28px_rgba(245,158,11,0.28)]'
                                                        : 'bg-bird-blue hover:shadow-[0_12px_28px_rgba(29,78,216,0.28)]'
                                                }`}
                                            >
                                                {renderSavedPlaceActionIcon(pendingRequestAction.type === 'cancel' ? 'delete' : 'use')}
                                                {pendingRequestAction.type === 'cancel' ? 'Yes, cancel request' : 'Yes, confirm completion'}
                                            </motion.button>
                                        </div>
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <AnimatePresence>
                        {paymentModalRequest && (
                            <ServiceRequestPaymentModal
                                paymentModalRequest={paymentModalRequest}
                                paymentMethod={paymentMethod}
                                paymentForm={paymentForm}
                                paymentBusyId={paymentBusyId}
                                onClose={() => setPaymentModalRequest(null)}
                                onSelectMethod={setPaymentMethod}
                                onPaymentFormChange={(patch) => setPaymentForm((prev) => ({ ...prev, ...patch }))}
                                onConfirmPayment={() => void confirmPaymentThroughModal()}
                            />
                        )}
                    </AnimatePresence>

                    {/* Searching Overlay */}
                    <AnimatePresence>
                        {isSearching && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 z-30 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center"
                            >
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                    className="w-20 h-20 border-4 border-bird-blue/20 border-t-bird-blue rounded-full mb-6"
                                />
                                <motion.h2
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-2xl font-bold text-gray-900 mb-2"
                                >
                                    Finding the best pro...
                                </motion.h2>
                                <motion.p
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.1 }}
                                    className="text-gray-600 mb-8"
                                >
                                    This will only take a moment
                                </motion.p>
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => setIsSearching(false)}
                                    className="px-6 py-2 rounded-full border-2 border-gray-200 text-gray-600 font-bold hover:border-gray-300 hover:bg-gray-50 transition-all"
                                >
                                    Cancel
                                </motion.button>
                            </motion.div>
                        )}
                    </AnimatePresence>
            </ServiceRequestPanelShell>

            {step === 1 && !activeTrackedRequest && (
                <div className="pointer-events-none absolute inset-x-0 bottom-4 z-[430] flex justify-end px-4 md:bottom-6 md:px-6">
                    <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => void handleFloatingFindPro()}
                        disabled={!canSearchPros}
                        className="pointer-events-auto inline-flex items-center gap-3 rounded-full bg-slate-950 px-6 py-4 text-sm font-black text-white shadow-[0_20px_40px_rgba(15,23,42,0.28)] transition hover:bg-black disabled:opacity-60"
                    >
                        <span>Find a Pro</span>
                        <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-white/10 px-2 text-xs font-black">
                            {nearbyWorkers.length}
                        </span>
                    </motion.button>
                </div>
            )}


        </motion.div>
    );
};



