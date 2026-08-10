import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { showSweetToast } from '../../utils/sweetAlert';
import i18n from '../../i18n';
import { addResilientTileLayer, loadLeaflet } from '../../utils/leafletLoader';
import { API_ENDPOINTS } from '../../config/api';
import { useIsDarkTheme } from '../../hooks/useIsDarkTheme';
import { ServiceCompleteCelebration } from '../shared/ServiceCompleteCelebration';
import {
    buildRouteDistanceProfile,
    durationMinFromDistanceKm,
    focusRouteViewport,
    formatEta,
    getLiveViewportPoints,
    getRemainingRoutePoints,
    haversineKm,
    polylineDistanceKm,
} from '../dashboard/requests/workerRequestUtils';

declare global {
    interface Window {
        L?: any;
    }
}

type RequestStatus =
    | 'pending'
    | 'payment_pending'
    | 'paid'
    | 'assigned'
    | 'in_progress'
    | 'awaiting_confirmation'
    | 'done'
    | 'cancelled'
    | string;

interface TrackableRequest {
    id_request: number;
    service_name: string;
    location_text: string;
    booking_type?: 'express' | 'scheduled' | string;
    scheduled_date?: string | null;
    scheduled_time?: string | null;
    scheduled_start_time?: string | null;
    scheduled_end_time?: string | null;
    worker_arrived_at?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    status: RequestStatus;
    assigned_worker: {
        id_worker_profile: number;
        name: string;
        latitude?: number | null;
        longitude?: number | null;
        is_online?: boolean | null;
    } | null;
}

interface ClientLiveRequestTrackerProps {
    leafletReady: boolean;
    request: TrackableRequest;
    onClose?: () => void;
}

type TrackerStage =
    | 'worker_accepted'
    | 'awaiting_payment'
    | 'payment_secured'
    | 'on_the_way'
    | 'nearby'
    | 'arrived'
    | 'work_in_progress'
    | 'completed';

type CameraMode = 'balanced' | 'close';
const CLIENT_TRACKER_CAMERA_KEY = 'fixlife.clientTracker.cameraMode';

const trackerNotyf = {
    success: (message: string) => void showSweetToast({ tone: 'success', message }),
    open: (input: { message: string; duration?: number; type?: string; background?: string }) =>
        void showSweetToast({ tone: 'info', message: input.message, duration: input.duration }),
};

const isScheduledRequest = (request: TrackableRequest) =>
    String(request.booking_type || 'express').toLowerCase() === 'scheduled';

const formatScheduledWindow = (request: TrackableRequest) => {
    const startValue = request.scheduled_start_time || (
        request.scheduled_date && request.scheduled_time
            ? `${request.scheduled_date}T${request.scheduled_time}`
            : ''
    );
    if (!startValue) return '';

    const start = new Date(startValue);
    const end = request.scheduled_end_time ? new Date(request.scheduled_end_time) : null;
    if (Number.isNaN(start.getTime())) return '';

    const dateLabel = start.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    });
    const startLabel = start.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
    });
    const endLabel = end && !Number.isNaN(end.getTime())
        ? end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : '';

    return endLabel ? `${dateLabel}, ${startLabel} - ${endLabel}` : `${dateLabel}, ${startLabel}`;
};

const statusToStage = (statusRaw: RequestStatus): TrackerStage => {
    const status = String(statusRaw || '').toLowerCase();
    if (status === 'done') return 'completed';
    if (['paid', 'completion_pending'].includes(status)) return 'payment_secured';
    if (['in_progress', 'finish_pending'].includes(status)) return 'work_in_progress';
    if (['arrived', 'start_pending'].includes(status)) return 'arrived';
    if (status === 'route_in_progress') return 'on_the_way';
    if (status === 'payment_pending') return 'awaiting_payment';
    return 'worker_accepted';
};

const stageVisual = (stage: TrackerStage) => {
    if (stage === 'completed') {
        return {
            label: i18n.t('clientLiveTracker.stages.completed'),
            toneClass: 'bg-gray-100 text-gray-700 border-gray-200',
            note: 'The service is complete and saved in your history.',
        };
    }
    if (stage === 'work_in_progress') {
        return {
            label: i18n.t('clientLiveTracker.stages.workInProgress'),
            toneClass: 'bg-gray-100 text-gray-700 border-gray-200',
            note: 'The worker arrived and is actively working on the service.',
        };
    }
    if (stage === 'arrived') {
        return {
            label: i18n.t('clientLiveTracker.stages.arrived'),
            toneClass: 'bg-gray-100 text-gray-700 border-gray-200',
            note: 'Your worker is already at the destination.',
        };
    }
    if (stage === 'nearby') {
        return {
            label: i18n.t('clientLiveTracker.stages.arrivingNow'),
            toneClass: 'bg-gray-100 text-gray-700 border-gray-200',
            note: 'The worker is very close to your location.',
        };
    }
    if (stage === 'on_the_way') {
        return {
            label: i18n.t('clientLiveTracker.stages.onTheWay'),
            toneClass: 'bg-gray-100 text-gray-700 border-gray-200',
            note: 'The worker is heading to your address right now.',
        };
    }
    if (stage === 'payment_secured') {
        return {
            label: i18n.t('clientLiveTracker.stages.paymentCompleted'),
            toneClass: 'bg-gray-100 text-gray-700 border-gray-200',
            note: 'Payment succeeded. Both parties must approve final service closure.',
        };
    }
    if (stage === 'awaiting_payment') {
        return {
            label: i18n.t('clientLiveTracker.stages.workFinishedPaymentDue'),
            toneClass: 'bg-gray-100 text-gray-700 border-gray-200',
            note: 'Both parties confirmed work finish. Complete payment to continue.',
        };
    }
    return {
        label: i18n.t('clientLiveTracker.stages.workerAccepted'),
        toneClass: 'bg-gray-100 text-gray-700 border-gray-200',
        note: 'A worker is assigned and standing by for this service.',
    };
};

const createTrackerIcon = (L: any, kind: 'worker' | 'client') =>
    L.divIcon({
        className: 'client-live-tracker-icon',
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        html:
            kind === 'worker'
                ? `
                    <div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
                        <div style="position:absolute;inset:0;border-radius:999px;background:rgba(59,130,246,0.15);animation:pulse-glow 2s ease-in-out infinite;"></div>
                        <div style="position:absolute;inset:4px;border-radius:999px;background:rgba(59,130,246,0.3);"></div>
                        <div style="position:relative;width:20px;height:20px;border-radius:999px;background:#2563eb;border:2.5px solid #ffffff;box-shadow:0 8px 16px rgba(37,99,235,0.4);"></div>
                    </div>
                  `
                : `
                    <div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
                        <div style="position:absolute;inset:0;border-radius:999px;background:rgba(15,23,42,0.1);animation:pulse-glow 2s ease-in-out infinite;"></div>
                        <div style="position:relative;width:18px;height:18px;border-radius:2px;background:#0f172a;border:2.5px solid #ffffff;box-shadow:0 8px 16px rgba(15,23,42,0.3);transform:rotate(45deg);"></div>
                    </div>
                  `,
    });

const ClientLiveRequestTracker: React.FC<ClientLiveRequestTrackerProps> = ({ leafletReady, request, onClose }) => {
    const { t } = useTranslation();
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const mapInstanceRef = useRef<any>(null);
    const routeGlowRef = useRef<any>(null);
    const routeLineRef = useRef<any>(null);
    const workerMarkerRef = useRef<any>(null);
    const clientMarkerRef = useRef<any>(null);
    const animationFrameRef = useRef<number | null>(null);
    const lastFitRequestIdRef = useRef<number | null>(null);
    const previousStageRef = useRef<TrackerStage | null>(null);
    const previousRequestIdRef = useRef<number | null>(null);
    const lastToastRef = useRef<{ tone: 'success' | 'info'; message: string; at: number } | null>(null);
    const routeOriginRequestIdRef = useRef<number | null>(null);
    const tileLayerRef = useRef<any>(null);
    const isDarkMode = useIsDarkTheme();
    const isDarkModeRef = useRef(isDarkMode);
    isDarkModeRef.current = isDarkMode;

    const [routeLoading, setRouteLoading] = useState(false);
    const [routePreview, setRoutePreview] = useState<{
        points: [number, number][];
        distanceKm: number;
        durationMin: number;
        cumulativeKm: number[];
    } | null>(null);
    const [routeOriginCoords, setRouteOriginCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [displayedWorkerCoords, setDisplayedWorkerCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [metrics, setMetrics] = useState<{ distanceKm: number; durationMin: number } | null>(null);
    const [trackerStage, setTrackerStage] = useState<TrackerStage>(statusToStage(request.status));
    const [showCompletionCelebration, setShowCompletionCelebration] = useState(false);
    const [isMapExpanded, setIsMapExpanded] = useState(false);
    const [manualLeafletReady, setManualLeafletReady] = useState(false);
    const [showLoadFailure, setShowLoadFailure] = useState(false);
    const effectiveLeafletReady = leafletReady || manualLeafletReady;
    const [cameraMode, setCameraMode] = useState<CameraMode>(() => {
        if (typeof window === 'undefined') return 'close';
        const stored = window.localStorage.getItem(CLIENT_TRACKER_CAMERA_KEY);
        return stored === 'balanced' || stored === 'close' ? stored : 'close';
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(CLIENT_TRACKER_CAMERA_KEY, cameraMode);
    }, [cameraMode]);

    // If Leaflet hasn't loaded within a reasonable window (both CDN mirrors
    // blocked/unreachable), surface an explicit error instead of leaving the
    // user staring at a blank gray box with no explanation.
    useEffect(() => {
        if (effectiveLeafletReady) {
            setShowLoadFailure(false);
            return;
        }
        const timer = window.setTimeout(() => setShowLoadFailure(true), 9000);
        return () => window.clearTimeout(timer);
    }, [effectiveLeafletReady]);

    const retryLeafletLoad = () => {
        setShowLoadFailure(false);
        void loadLeaflet('client-tracker-retry').then((ready) => {
            if (ready) setManualLeafletReady(true);
            else setShowLoadFailure(true);
        });
    };

    const destinationCoords = useMemo(() => {
        if (request.latitude == null || request.longitude == null) return null;
        const lat = Number(request.latitude);
        const lng = Number(request.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
        return { lat, lng };
    }, [request.latitude, request.longitude]);

    // Guard: if no valid location on the request, render a safe placeholder instead of running map/route logic.
    // This prevents "Invalid LatLng (NaN, NaN)" when opening My Requests History with completed or location-less requests.
    if (!destinationCoords) {
        return (
            <div className="h-full w-full flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
                <div>
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl">📍</div>
                    <p className="text-sm font-bold text-slate-700">{t('clientLiveTracker.noLiveLocationTitle')}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{t('clientLiveTracker.requestRef', { id: request.id_request, service: request.service_name })}</p>
                    <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-slate-400">{t('clientLiveTracker.noCoordinatesHelp')}</p>
                </div>
            </div>
        );
    }

    const workerStartCoords = useMemo(() => {
        if (request.assigned_worker?.latitude != null && request.assigned_worker?.longitude != null) {
            const lat = Number(request.assigned_worker.latitude);
            const lng = Number(request.assigned_worker.longitude);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                return { lat, lng };
            }
        }

        if (!destinationCoords) return null;
        // No real GPS from the assigned worker yet (backend hasn't received a
        // presence push). Placeholder point ~1km NE of the destination so the
        // map has something to draw before real coordinates arrive; replaced
        // the moment liveWorkerCoords resolves below.
        return {
            lat: Number((destinationCoords.lat + 0.0078).toFixed(7)),
            lng: Number((destinationCoords.lng - 0.0094).toFixed(7)),
        };
    }, [destinationCoords, request.assigned_worker?.latitude, request.assigned_worker?.longitude]);

    // True while workerStartCoords is the fabricated offset above rather than
    // a real GPS fix reported by the backend.
    const isPlaceholderWorkerCoords =
        !!workerStartCoords &&
        (request.assigned_worker?.latitude == null || request.assigned_worker?.longitude == null);

    const liveWorkerCoords = useMemo(() => {
        if (request.assigned_worker?.latitude == null || request.assigned_worker?.longitude == null) return null;
        const lat = Number(request.assigned_worker.latitude);
        const lng = Number(request.assigned_worker.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return { lat, lng };
    }, [request.assigned_worker?.latitude, request.assigned_worker?.longitude]);

    useEffect(() => {
        if (routeOriginRequestIdRef.current !== request.id_request) {
            routeOriginRequestIdRef.current = request.id_request;
            setRouteOriginCoords(workerStartCoords);
            setDisplayedWorkerCoords(workerStartCoords);
            return;
        }

        if (!routeOriginCoords && workerStartCoords) {
            setRouteOriginCoords(workerStartCoords);
        }
    }, [request.id_request, routeOriginCoords, workerStartCoords]);

    const requestStatus = String(request.status || '').toLowerCase();
    const scheduledStart = useMemo(() => {
        const startValue = request.scheduled_start_time || (
            request.scheduled_date && request.scheduled_time
                ? `${request.scheduled_date}T${request.scheduled_time}`
                : ''
        );
        if (!startValue) return null;
        const value = new Date(startValue);
        return Number.isNaN(value.getTime()) ? null : value;
    }, [request.scheduled_date, request.scheduled_start_time, request.scheduled_time]);
    const scheduledWindow = useMemo(() => formatScheduledWindow(request), [request]);
    const isScheduledFuture = isScheduledRequest(request)
        && !!scheduledStart
        && scheduledStart.getTime() > Date.now()
        && !['in_progress', 'awaiting_confirmation', 'done'].includes(requestStatus);
    const isLiveRoute = requestStatus === 'route_in_progress' && !isScheduledFuture;
    const visibleRoutePoints = useMemo(() => {
        if (!routePreview) return null;
        if (!isLiveRoute) return routePreview.points;
        return getRemainingRoutePoints(routePreview.points, displayedWorkerCoords);
    }, [displayedWorkerCoords, isLiveRoute, routePreview]);

    const liveViewportPoints = useMemo(() => {
        if (!routePreview) return null;
        if (!isLiveRoute) return routePreview.points;
        return getLiveViewportPoints(routePreview.points, displayedWorkerCoords, cameraMode);
    }, [cameraMode, displayedWorkerCoords, isLiveRoute, routePreview]);

    useEffect(() => {
        if (!effectiveLeafletReady || !mapContainerRef.current || !window.L) return;
        if (mapInstanceRef.current) return;

        let cancelled = false;
        const initTimer = window.setTimeout(() => {
            if (cancelled || !mapContainerRef.current || !window.L || mapInstanceRef.current) return;

            const L = window.L;
            const map = L.map(mapContainerRef.current, {
                zoomControl: false,
                attributionControl: true,
                dragging: true,
                scrollWheelZoom: false,
                preferCanvas: true,
                maxZoom: 17,
            }).setView([13.6929, -89.2182], 13);

            // CARTO tiles with an OSM fallback if CARTO is unreachable/blocked --
            // without this the map stayed permanently blank gray on networks that can't reach CARTO.
            tileLayerRef.current = addResilientTileLayer(L, map, isDarkModeRef.current);

            L.control.zoom({ position: 'bottomright' }).addTo(map);
            mapInstanceRef.current = map;
        }, 50);

        return () => {
            cancelled = true;
            window.clearTimeout(initTimer);
            if (animationFrameRef.current) {
                window.cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
            if (mapInstanceRef.current) {
                try {
                    mapInstanceRef.current.remove();
                } catch {
                    // ignore cleanup errors
                }
                mapInstanceRef.current = null;
            }
        };
    }, [effectiveLeafletReady]);

    useEffect(() => {
        if (!mapInstanceRef.current || !window.L || !tileLayerRef.current) return;
        const L = window.L;
        const map = mapInstanceRef.current;
        try {
            map.removeLayer(tileLayerRef.current);
        } catch {
            // ignore
        }
        tileLayerRef.current = addResilientTileLayer(L, map, isDarkMode);
        tileLayerRef.current.bringToBack();
    }, [isDarkMode]);

    useEffect(() => {
        if (!routeOriginCoords || !destinationCoords) {
            setRoutePreview(null);
            return;
        }

        const controller = new AbortController();

        const loadRoute = async (isRetry = false) => {
            setRouteLoading(true);
            try {
                const params = new URLSearchParams({
                    origin_lat: String(routeOriginCoords.lat),
                    origin_lng: String(routeOriginCoords.lng),
                    dest_lat: String(destinationCoords.lat),
                    dest_lng: String(destinationCoords.lng),
                });
                const timeout = window.setTimeout(() => controller.abort(), 12000);
                const res = await fetch(`${API_ENDPOINTS.services.route}?${params.toString()}`, { signal: controller.signal });
                window.clearTimeout(timeout);
                const payload = await res.json();
                const route = payload?.route;

                let points: [number, number][] = Array.isArray(route?.points)
                    ? (route.points as [number, number][]).filter(
                        (point) => Number.isFinite(point[0]) && Number.isFinite(point[1])
                    )
                    : [];

                if (points.length < 2) {
                    if (!isRetry && !controller.signal.aborted) {
                        await new Promise((r) => setTimeout(r, 1000));
                        return loadRoute(true);
                    }
                    points = [
                        [routeOriginCoords.lat, routeOriginCoords.lng],
                        [destinationCoords.lat, destinationCoords.lng],
                    ];
                }

                if (
                    points.length === 0 ||
                    points[0][0] !== routeOriginCoords.lat ||
                    points[0][1] !== routeOriginCoords.lng
                ) {
                    points.unshift([routeOriginCoords.lat, routeOriginCoords.lng]);
                }

                const lastPoint = points[points.length - 1];
                if (
                    !lastPoint ||
                    lastPoint[0] !== destinationCoords.lat ||
                    lastPoint[1] !== destinationCoords.lng
                ) {
                    points.push([destinationCoords.lat, destinationCoords.lng]);
                }

                const profile = buildRouteDistanceProfile(points);
                const fallbackDistanceKm = haversineKm(routeOriginCoords, destinationCoords);
                const exactDistanceKm = Math.max(
                    profile.totalKm,
                    Number(route?.distanceKm || 0),
                    fallbackDistanceKm
                );
                const exactDurationMin = Math.max(
                    Number(route?.durationMin || 0),
                    durationMinFromDistanceKm(exactDistanceKm),
                    2
                );

                if (!controller.signal.aborted) {
                    setRoutePreview({
                        points,
                        distanceKm: Number(exactDistanceKm.toFixed(2)),
                        durationMin: Number(exactDurationMin.toFixed(1)),
                        cumulativeKm: profile.cumulativeKm,
                    });
                }
            } catch (err) {
                if ((err as DOMException)?.name === 'AbortError') return;
                if (!isRetry && !controller.signal.aborted) {
                    await new Promise((r) => setTimeout(r, 800));
                    return loadRoute(true);
                }
                const fallbackDistanceKm = haversineKm(routeOriginCoords, destinationCoords);
                const points: [number, number][] = [
                    [routeOriginCoords.lat, routeOriginCoords.lng],
                    [destinationCoords.lat, destinationCoords.lng],
                ];
                const profile = buildRouteDistanceProfile(points);
                if (!controller.signal.aborted) {
                    setRoutePreview({
                        points,
                        distanceKm: Number(fallbackDistanceKm.toFixed(2)),
                        durationMin: Number(Math.max(durationMinFromDistanceKm(fallbackDistanceKm), 2).toFixed(1)),
                        cumulativeKm: profile.cumulativeKm,
                    });
                }
            } finally {
                if (!controller.signal.aborted) setRouteLoading(false);
            }
        };

        void loadRoute();

        return () => {
            controller.abort();
        };
    }, [destinationCoords, request.id_request, routeOriginCoords]);

    useEffect(() => {
        if (animationFrameRef.current) {
            window.cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }

        if (!routePreview || !workerStartCoords || !destinationCoords) {
            setDisplayedWorkerCoords(liveWorkerCoords || workerStartCoords);
            setMetrics(null);
            setTrackerStage(statusToStage(request.status));
            return;
        }

        const status = String(request.status || '').toLowerCase();
        const currentWorkerCoords = liveWorkerCoords || workerStartCoords;

        if (status === 'done') {
            setDisplayedWorkerCoords(destinationCoords);
            setMetrics({ distanceKm: 0, durationMin: 0 });
            setTrackerStage('completed');
            return;
        }

        if (status === 'awaiting_confirmation') {
            setDisplayedWorkerCoords(destinationCoords);
            setMetrics({ distanceKm: 0, durationMin: 0 });
            setTrackerStage('work_in_progress');
            return;
        }

        if (status === 'assigned') {
            setDisplayedWorkerCoords(currentWorkerCoords);
            setMetrics({
                distanceKm: routePreview.distanceKm,
                durationMin: routePreview.durationMin,
            });
            setTrackerStage('worker_accepted');
            return;
        }

        if (status === 'payment_pending') {
            setDisplayedWorkerCoords(currentWorkerCoords);
            setMetrics({
                distanceKm: routePreview.distanceKm,
                durationMin: routePreview.durationMin,
            });
            setTrackerStage('awaiting_payment');
            return;
        }

        if (status !== 'route_in_progress') {
            setDisplayedWorkerCoords(currentWorkerCoords);
            setMetrics({
                distanceKm: routePreview.distanceKm,
                durationMin: routePreview.durationMin,
            });
            setTrackerStage(statusToStage(status));
            return;
        }

        setDisplayedWorkerCoords(currentWorkerCoords);
        const remainingPoints = getRemainingRoutePoints(routePreview.points, currentWorkerCoords);
        const remainingDistanceKm = Math.min(
            polylineDistanceKm(remainingPoints),
            haversineKm(currentWorkerCoords, destinationCoords) * 1.35 || routePreview.distanceKm
        );
        const remainingDurationMin = Math.max(durationMinFromDistanceKm(remainingDistanceKm), remainingDistanceKm > 0.04 ? 1 : 0);
        setMetrics({
            distanceKm: Number(remainingDistanceKm.toFixed(2)),
            durationMin: Number(remainingDurationMin.toFixed(1)),
        });

        if (remainingDistanceKm <= 0.04) {
            setTrackerStage('arrived');
        } else if (remainingDistanceKm <= 0.25) {
            setTrackerStage('nearby');
        } else {
            setTrackerStage('on_the_way');
        }
    }, [destinationCoords, liveWorkerCoords, request.id_request, request.status, routePreview, workerStartCoords]);

    useEffect(() => {
        if (!mapInstanceRef.current || !window.L || !routePreview) return;

        const L = window.L;
        const map = mapInstanceRef.current;
        const routePoints = visibleRoutePoints && visibleRoutePoints.length >= 2 ? visibleRoutePoints : routePreview.points;
        const cleanRoutePoints = routePoints
            .filter(p => p && Number.isFinite(p[0]) && Number.isFinite(p[1]))
            .map(p => [Number(p[0]), Number(p[1])] as [number, number]);

        if (cleanRoutePoints.length < 2) return;

        if (routeGlowRef.current) {
            try {
                map.removeLayer(routeGlowRef.current);
            } catch {
                // ignore
            }
            routeGlowRef.current = null;
        }
        if (routeLineRef.current) {
            try {
                map.removeLayer(routeLineRef.current);
            } catch {
                // ignore
            }
            routeLineRef.current = null;
        }

        try {
            routeGlowRef.current = L.polyline(cleanRoutePoints, {
                color: '#0090FF',
                weight: 16,
                opacity: 0.3,
                lineCap: 'round',
                lineJoin: 'round',
                className: 'worker-route-glow',
            }).addTo(map);

            routeLineRef.current = L.polyline(cleanRoutePoints, {
                color: '#38bdf8',
                weight: 6,
                opacity: 0.95,
                lineCap: 'round',
                lineJoin: 'round',
                className: 'worker-route-line worker-route-live',
            }).addTo(map);

            if (lastFitRequestIdRef.current !== request.id_request) {
                focusRouteViewport(map, L, cleanRoutePoints, isLiveRoute, cameraMode);
                lastFitRequestIdRef.current = request.id_request;
            }
        } catch (error) {
            console.warn('Leaflet polyline creation error:', error);
        }
    }, [cameraMode, isLiveRoute, request.id_request, routePreview, visibleRoutePoints]);

    useEffect(() => {
        if (!mapInstanceRef.current || !window.L || !liveViewportPoints || liveViewportPoints.length < 2) return;
        if (!isLiveRoute || !displayedWorkerCoords) return;

        const map = mapInstanceRef.current;
        const L = window.L;
        focusRouteViewport(map, L, liveViewportPoints, true, cameraMode);
    }, [cameraMode, displayedWorkerCoords, isLiveRoute, liveViewportPoints]);

    useEffect(() => {
        if (!mapInstanceRef.current || !window.L || !destinationCoords) return;
        if (!Number.isFinite(destinationCoords.lat) || !Number.isFinite(destinationCoords.lng)) return;
        
        const L = window.L;
        const map = mapInstanceRef.current;

        if (!clientMarkerRef.current) {
            clientMarkerRef.current = L.marker([destinationCoords.lat, destinationCoords.lng], {
                icon: createTrackerIcon(L, 'client'),
                zIndexOffset: 900,
            }).addTo(map);
            clientMarkerRef.current.bindTooltip(i18n.t('clientLiveTracker.yourLocation'), {
                permanent: true,
                direction: 'bottom',
                offset: [0, 8],
                className: 'client-live-tracker-label',
            });
        } else {
            clientMarkerRef.current.setLatLng([destinationCoords.lat, destinationCoords.lng]);
        }

        clientMarkerRef.current.bindPopup(`<b>${i18n.t('clientLiveTracker.yourLocation')}</b><br/>${request.location_text}`);
    }, [destinationCoords, request.location_text]);

    useEffect(() => {
        if (!mapInstanceRef.current || !window.L || !displayedWorkerCoords) return;
        if (!Number.isFinite(displayedWorkerCoords.lat) || !Number.isFinite(displayedWorkerCoords.lng)) return;
        
        const L = window.L;
        const map = mapInstanceRef.current;

        const workerLabel = request.assigned_worker?.name || i18n.t('clientLiveTracker.workerFallback');

        if (!workerMarkerRef.current) {
            workerMarkerRef.current = L.marker([displayedWorkerCoords.lat, displayedWorkerCoords.lng], {
                icon: createTrackerIcon(L, 'worker'),
                zIndexOffset: 1000,
            }).addTo(map);
            workerMarkerRef.current.bindTooltip(workerLabel, {
                permanent: true,
                direction: 'top',
                offset: [0, -8],
                className: 'client-live-tracker-label client-live-tracker-label--worker',
            });
        } else {
            workerMarkerRef.current.setLatLng([displayedWorkerCoords.lat, displayedWorkerCoords.lng]);
            workerMarkerRef.current.setTooltipContent(workerLabel);
        }

        workerMarkerRef.current.bindPopup(
            `<b>${workerLabel}</b><br/>${isPlaceholderWorkerCoords ? i18n.t('clientLiveTracker.waitingForGps') : i18n.t('clientLiveTracker.livePosition')}`
        );
    }, [displayedWorkerCoords, isPlaceholderWorkerCoords, request.assigned_worker?.name]);

    useEffect(() => {
        if (typeof document === 'undefined') return undefined;

        const previousOverflow = document.body.style.overflow;
        if (isMapExpanded) {
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isMapExpanded]);

    useEffect(() => {
        if (!mapInstanceRef.current || !window.L) return undefined;

        const map = mapInstanceRef.current;
        const L = window.L;
        const points =
            (isLiveRoute ? liveViewportPoints : null) && (isLiveRoute ? liveViewportPoints?.length : 0)! >= 2
                ? liveViewportPoints
                : visibleRoutePoints && visibleRoutePoints.length >= 2
                  ? visibleRoutePoints
                  : routePreview?.points || null;

        const timeout = window.setTimeout(() => {
            try {
                map.invalidateSize();
                if (points && points.length >= 2) {
                    focusRouteViewport(map, L, points, isLiveRoute, cameraMode);
                }
            } catch {
                // ignore map resize issues
            }
        }, isMapExpanded ? 160 : 80);

        return () => {
            window.clearTimeout(timeout);
        };
    }, [cameraMode, isMapExpanded, isLiveRoute, liveViewportPoints, routePreview?.points, visibleRoutePoints]);

    const visual = stageVisual(trackerStage);
    const workerName = request.assigned_worker?.name || t('clientLiveTracker.yourWorkerFallback');
    const displayedVisual = isScheduledFuture
        ? {
            ...visual,
            label: t('clientLiveTracker.scheduledVisit'),
            note: scheduledWindow || 'Your visit is reserved for the selected time.',
        }
        : visual;

    const showTrackerToast = (tone: 'success' | 'info', message: string) => {
        const now = Date.now();
        const last = lastToastRef.current;
        if (last && last.tone === tone && last.message === message && now - last.at < 1200) {
            return;
        }

        lastToastRef.current = { tone, message, at: now };
        if (tone === 'success') {
            trackerNotyf.success(message);
            return;
        }

        trackerNotyf.open({
            type: 'info',
            message,
            background: '#1d4ed8',
            duration: 2600,
        });
    };

    useEffect(() => {
        if (previousRequestIdRef.current !== request.id_request) {
            previousRequestIdRef.current = request.id_request;
            previousStageRef.current = trackerStage;
            return;
        }

        if (!previousStageRef.current || previousStageRef.current === trackerStage) {
            previousStageRef.current = trackerStage;
            return;
        }

        if (trackerStage === 'on_the_way') {
            showTrackerToast('info', `${workerName} is on the way to your address.`);
        } else if (trackerStage === 'nearby') {
            showTrackerToast('info', `${workerName} is arriving now.`);
        } else if (trackerStage === 'arrived') {
            showTrackerToast('success', `${workerName} has arrived.`);
        } else if (trackerStage === 'completed') {
            setShowCompletionCelebration(true);
        }

        previousStageRef.current = trackerStage;
    }, [request.id_request, request.service_name, trackerStage, workerName]);

    const etaLabel = isScheduledFuture
        ? scheduledWindow || 'Scheduled'
        : routeLoading
          ? t('clientLiveTracker.syncing')
          : formatEta(metrics?.durationMin ?? routePreview?.durationMin ?? 0);
    const etaMetaLabel = isScheduledFuture ? t('clientLiveTracker.visit') : t('clientLiveTracker.eta');
    const distanceLabel = routeLoading ? t('clientLiveTracker.updating') : `${(metrics?.distanceKm ?? routePreview?.distanceKm ?? 0).toFixed(1)} km`;

    return (
        <div className={`relative h-full min-h-[620px] w-full overflow-hidden bg-slate-100 dark:bg-slate-900 ${isMapExpanded ? 'fixed inset-4 z-[70] rounded-[2.5rem] border border-slate-200/70 dark:border-white/10 shadow-2xl' : 'rounded-[1.8rem]'}`}>
            {/* Map Background */}
            <div ref={mapContainerRef} className="absolute inset-0 z-0" />
            
            {/* Soft edge overlays keep controls readable without hiding the map. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-28 bg-gradient-to-b from-white/70 dark:from-slate-950/80 via-white/30 dark:via-slate-950/30 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-48 bg-gradient-to-t from-white/85 dark:from-slate-950/90 via-white/40 dark:via-slate-950/40 to-transparent" />

            {!effectiveLeafletReady && !showLoadFailure && (
                <div className="absolute right-6 top-6 z-20 h-3.5 w-3.5 rounded-full bg-blue-500 animate-pulse shadow-[0_0_15px_rgba(59,130,246,0.9)]" />
            )}

            {showLoadFailure && !effectiveLeafletReady && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-100 dark:bg-slate-900 p-8 text-center">
                    <div>
                        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white dark:bg-slate-800 text-3xl shadow-sm">🗺️</div>
                        <p className="text-base font-black text-slate-800 dark:text-slate-100">{t('clientLiveTracker.mapFailedTitle')}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('clientLiveTracker.mapFailedHelp')}</p>
                        <button
                            type="button"
                            onClick={retryLeafletLoad}
                            className="mt-4 rounded-full bg-slate-900 dark:bg-slate-700 px-6 py-2.5 text-xs font-black text-white shadow-md transition-colors hover:bg-slate-800 dark:hover:bg-slate-600"
                        >
                            {t('clientLiveTracker.retry')}
                        </button>
                    </div>
                </div>
            )}

            {/* Top Floating Header */}
            <div className="absolute left-5 right-5 top-5 z-20 flex flex-col justify-between gap-3 pointer-events-none sm:flex-row sm:items-center">
                <div className="flex items-center justify-between w-full sm:w-auto gap-3">
                    {onClose && (
                        <motion.button
                            initial={{ y: -20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            onClick={onClose}
                            className="pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200/80 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 shadow-[0_10px_28px_rgba(15,23,42,0.14)] backdrop-blur-md transition-all hover:scale-105 active:scale-95 hover:text-slate-950 dark:hover:text-white"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                            </svg>
                        </motion.button>
                    )}

                    {/* Status Pill */}
                    <motion.div 
                        initial={{ y: -20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="pointer-events-auto flex flex-1 items-center gap-3 rounded-full border border-slate-200/80 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 px-5 py-3 shadow-[0_10px_28px_rgba(15,23,42,0.12)] backdrop-blur-md sm:flex-none"
                    >
                        <div className="relative flex items-center justify-center shrink-0">
                            <div className={`absolute inset-0 rounded-full blur-md opacity-50 ${displayedVisual.toneClass.includes('emerald') || displayedVisual.toneClass.includes('green') ? 'bg-emerald-500' : 'bg-bird-blue'}`}></div>
                            <div className="h-3 w-3 rounded-full bg-bird-blue relative z-10 animate-pulse"></div>
                        </div>
                        <div className="min-w-0">
                            <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 leading-none mb-1">{t('clientLiveTracker.status')}</p>
                            <p className="text-xs sm:text-sm font-black text-slate-950 dark:text-slate-100 leading-none truncate">{displayedVisual.label}</p>
                        </div>
                    </motion.div>
                </div>

                {/* Right controls */}
                <motion.div 
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="pointer-events-auto self-end rounded-full border border-slate-200/80 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 px-5 py-3 text-right shadow-[0_10px_28px_rgba(15,23,42,0.12)] backdrop-blur-md sm:self-auto"
                >
                    <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 leading-none mb-1">{t('clientLiveTracker.request')}</p>
                    <p className="text-xs sm:text-sm font-black text-slate-950 dark:text-slate-100 leading-none">#{request.id_request}</p>
                </motion.div>
            </div>

            {/* Bottom Floating Card (Uber / Lyft Style - Spacious & Wide) */}
            <div className="pointer-events-none absolute bottom-5 left-5 right-5 z-20 flex justify-center">
                <motion.div 
                    initial={{ y: 40, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="pointer-events-auto relative w-full max-w-3xl overflow-hidden rounded-[2rem] border border-white/80 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 p-5 sm:p-6 shadow-[0_20px_60px_rgba(15,23,42,0.22)] backdrop-blur-2xl"
                >
                    {/* Drag handle decoration */}
                    <div className="absolute left-1/2 top-3 h-1.5 w-14 -translate-x-1/2 rounded-full bg-slate-200/80 dark:bg-slate-700/80" />
                    
                    {/* Main Worker Info & ETA */}
                    <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-4">
                            <div className="h-14 w-14 shrink-0 rounded-full bg-gradient-to-tr from-bird-blue to-indigo-500 p-[2.5px] shadow-[0_12px_28px_rgba(0,144,255,0.28)]">
                                <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-white dark:border-slate-800 bg-white dark:bg-slate-800">
                                    <span className="text-xl font-black text-bird-blue">
                                        {workerName.charAt(0).toUpperCase()}
                                    </span>
                                </div>
                            </div>
                            <div className="min-w-0">
                                <h3 className="truncate text-lg sm:text-xl font-black text-slate-950 dark:text-slate-100 tracking-tight">{workerName}</h3>
                                <p className="truncate text-sm font-bold text-slate-500 dark:text-slate-400 mt-0.5">{request.service_name}</p>
                                {isScheduledRequest(request) && scheduledWindow && (
                                    <p className="mt-1 truncate text-xs font-black text-bird-blue">{scheduledWindow}</p>
                                )}
                            </div>
                        </div>

                        <div className="flex shrink-0 items-center justify-between gap-5 rounded-2xl bg-sky-50/90 dark:bg-slate-800/90 border border-sky-100 dark:border-white/10 px-5 py-3.5 text-left sm:min-w-[160px] sm:text-right shadow-sm">
                            <div className="sm:hidden">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">{etaMetaLabel}</p>
                            </div>
                            <div>
                                <div className={`${isScheduledFuture ? 'max-w-[160px] text-sm leading-tight' : 'text-3xl'} font-black tracking-tight text-slate-950 dark:text-slate-100`}>{etaLabel}</div>
                                <div className="mt-0.5 hidden text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-400 sm:block">{etaMetaLabel}</div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3.5">
                        <div className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-slate-50/80 dark:bg-slate-800/60 p-3.5">
                            <div className="flex items-center gap-2 mb-1.5">
                                <svg className="w-4 h-4 text-bird-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">{t('clientLiveTracker.distance')}</p>
                            </div>
                            <p className="text-base font-black text-slate-950 dark:text-slate-100">{distanceLabel}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-slate-50/80 dark:bg-slate-800/60 p-3.5">
                            <div className="flex items-center gap-2 mb-1.5">
                                <svg className="w-4 h-4 text-bird-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.243-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">{t('clientLiveTracker.destination')}</p>
                            </div>
                            <p className="truncate text-xs sm:text-sm font-black text-slate-950 dark:text-slate-100">{request.location_text.split(',')[0]}</p>
                        </div>
                    </div>

                    <div className="mt-4 flex gap-3">
                        <button
                            type="button"
                            onClick={() => setCameraMode(prev => prev === 'close' ? 'balanced' : 'close')}
                            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 dark:bg-bird-blue hover:bg-black dark:hover:bg-bird-darkBlue py-3.5 text-sm font-black text-white shadow-md transition-all active:scale-[0.98]"
                        >
                            <svg className="w-4 h-4 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            {cameraMode === 'close' ? t('clientLiveTracker.viewFullRoute') : t('clientLiveTracker.followWorker')}
                        </button>
                    </div>
                </motion.div>
            </div>

            <ServiceCompleteCelebration
                open={showCompletionCelebration}
                onDone={() => setShowCompletionCelebration(false)}
            />
        </div>
    );
};

export default ClientLiveRequestTracker;
