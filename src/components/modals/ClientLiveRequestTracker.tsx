import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { showSweetToast } from '../../utils/sweetAlert';
import { addResilientTileLayer } from '../../utils/leafletLoader';
import { localizeClientServiceName } from '../../utils/clientTranslations';
import {
    buildRouteDistanceProfile,
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

const stageVisual = (stage: TrackerStage, isSpanish: boolean) => {
    if (stage === 'completed') {
        return {
            label: isSpanish ? 'Completado' : 'Completed',
            toneClass: 'bg-gray-100 text-gray-700 border-gray-200',
            note: isSpanish ? 'El servicio está completo y guardado en tu historial.' : 'The service is complete and saved in your history.',
        };
    }
    if (stage === 'work_in_progress') {
        return {
            label: isSpanish ? 'Trabajo en progreso' : 'Work in progress',
            toneClass: 'bg-gray-100 text-gray-700 border-gray-200',
            note: isSpanish ? 'El profesional ya llegó y está trabajando en el servicio.' : 'The worker arrived and is actively working on the service.',
        };
    }
    if (stage === 'arrived') {
        return {
            label: isSpanish ? 'Llegó' : 'Arrived',
            toneClass: 'bg-gray-100 text-gray-700 border-gray-200',
            note: isSpanish ? 'Tu profesional ya está en el destino.' : 'Your worker is already at the destination.',
        };
    }
    if (stage === 'nearby') {
        return {
            label: isSpanish ? 'Está por llegar' : 'Arriving now',
            toneClass: 'bg-gray-100 text-gray-700 border-gray-200',
            note: isSpanish ? 'El profesional está muy cerca de tu ubicación.' : 'The worker is very close to your location.',
        };
    }
    if (stage === 'on_the_way') {
        return {
            label: isSpanish ? 'En camino' : 'On the way',
            toneClass: 'bg-gray-100 text-gray-700 border-gray-200',
            note: isSpanish ? 'El profesional va en camino a tu dirección.' : 'The worker is heading to your address right now.',
        };
    }
    if (stage === 'payment_secured') {
        return {
            label: isSpanish ? 'Pago completado' : 'Payment completed',
            toneClass: 'bg-gray-100 text-gray-700 border-gray-200',
            note: isSpanish ? 'El pago fue exitoso. Ambas partes deben aprobar el cierre final del servicio.' : 'Payment succeeded. Both parties must approve final service closure.',
        };
    }
    if (stage === 'awaiting_payment') {
        return {
            label: isSpanish ? 'Trabajo finalizado - pago pendiente' : 'Work finished - payment due',
            toneClass: 'bg-gray-100 text-gray-700 border-gray-200',
            note: isSpanish ? 'Ambas partes confirmaron el fin del trabajo. Completa el pago para continuar.' : 'Both parties confirmed work finish. Complete payment to continue.',
        };
    }
    return {
        label: isSpanish ? 'Profesional aceptó' : 'Worker accepted',
        toneClass: 'bg-gray-100 text-gray-700 border-gray-200',
        note: isSpanish ? 'Un profesional fue asignado y está listo para este servicio.' : 'A worker is assigned and standing by for this service.',
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
    const { i18n } = useTranslation();
    const isSpanish = i18n.language.startsWith('es');
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
    const [isMapExpanded, setIsMapExpanded] = useState(false);
    const [cameraMode, setCameraMode] = useState<CameraMode>(() => {
        if (typeof window === 'undefined') return 'close';
        const stored = window.localStorage.getItem(CLIENT_TRACKER_CAMERA_KEY);
        return stored === 'balanced' || stored === 'close' ? stored : 'close';
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(CLIENT_TRACKER_CAMERA_KEY, cameraMode);
    }, [cameraMode]);

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
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white text-xs font-black text-bird-blue">PIN</div>
                    <p className="text-sm font-bold text-slate-700">{isSpanish ? 'Ubicación en vivo no disponible' : 'No live location available'}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{isSpanish ? 'Solicitud' : 'Request'} #{request.id_request} • {localizeClientServiceName(request.service_name, i18n.language)}</p>
                    <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-slate-400">{isSpanish ? 'Este servicio no tiene coordenadas para seguimiento en mapa.' : 'This service does not have coordinates for map tracking.'}</p>
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
        return {
            lat: Number((destinationCoords.lat + 0.0078).toFixed(7)),
            lng: Number((destinationCoords.lng - 0.0094).toFixed(7)),
        };
    }, [destinationCoords, request.assigned_worker?.latitude, request.assigned_worker?.longitude]);

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
        if (!leafletReady || !mapContainerRef.current || !window.L) return;
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
            addResilientTileLayer(L, map);

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
    }, [leafletReady]);

    useEffect(() => {
        if (!routeOriginCoords || !destinationCoords) {
            setRoutePreview(null);
            return;
        }

        const controller = new AbortController();

        const loadRoute = async () => {
            setRouteLoading(true);
            try {
                const params = new URLSearchParams({
                    overview: 'full',
                    geometries: 'geojson',
                    steps: 'false',
                });
                const routeUrl = `https://router.project-osrm.org/route/v1/driving/${routeOriginCoords.lng},${routeOriginCoords.lat};${destinationCoords.lng},${destinationCoords.lat}?${params.toString()}`;
                const res = await fetch(routeUrl, { signal: controller.signal });
                const payload = await res.json();
                const route = payload?.routes?.[0];
                const coordinates = Array.isArray(route?.geometry?.coordinates)
                    ? route.geometry.coordinates
                    : [];

                let points: [number, number][] = coordinates
                    .map((point: [number, number]) => [Number(point[1]), Number(point[0])] as [number, number])
                    .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));

                if (points.length < 2) {
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
                    Number(route?.distance || 0) / 1000,
                    fallbackDistanceKm
                );
                const exactDurationMin = Math.max(
                    Number(route?.duration || 0) / 60,
                    (exactDistanceKm / 22) * 60,
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
                        durationMin: Number(Math.max((fallbackDistanceKm / 22) * 60, 2).toFixed(1)),
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
        const remainingDurationMin = Math.max((remainingDistanceKm / 22) * 60, remainingDistanceKm > 0.04 ? 1 : 0);
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
                color: '#3b82f6',
                weight: 12,
                opacity: 0.15,
                lineCap: 'round',
                lineJoin: 'round',
                className: 'worker-route-glow',
            }).addTo(map);

            routeLineRef.current = L.polyline(cleanRoutePoints, {
                color: '#1d4ed8',
                weight: 4,
                opacity: 0.8,
                lineCap: 'round',
                lineJoin: 'round',
                dashArray: '10 8',
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
        } else {
            clientMarkerRef.current.setLatLng([destinationCoords.lat, destinationCoords.lng]);
        }

        clientMarkerRef.current.bindPopup(`<b>${isSpanish ? 'Tu ubicación' : 'Your location'}</b><br/>${request.location_text}`);
    }, [destinationCoords, isSpanish, request.location_text]);

    useEffect(() => {
        if (!mapInstanceRef.current || !window.L || !displayedWorkerCoords) return;
        if (!Number.isFinite(displayedWorkerCoords.lat) || !Number.isFinite(displayedWorkerCoords.lng)) return;
        
        const L = window.L;
        const map = mapInstanceRef.current;

        if (!workerMarkerRef.current) {
            workerMarkerRef.current = L.marker([displayedWorkerCoords.lat, displayedWorkerCoords.lng], {
                icon: createTrackerIcon(L, 'worker'),
                zIndexOffset: 1000,
            }).addTo(map);
        } else {
            workerMarkerRef.current.setLatLng([displayedWorkerCoords.lat, displayedWorkerCoords.lng]);
        }

        workerMarkerRef.current.bindPopup(`<b>${request.assigned_worker?.name || (isSpanish ? 'Profesional' : 'Worker')}</b><br/>${isSpanish ? 'Posición en vivo' : 'Live position'}`);
    }, [displayedWorkerCoords, isSpanish, request.assigned_worker?.name]);

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

    const trackerCopy = {
        status: isSpanish ? 'Estado' : 'Status',
        request: isSpanish ? 'Solicitud' : 'Request',
        scheduled: isSpanish ? 'Programado' : 'Scheduled',
        scheduledVisit: isSpanish ? 'Visita programada' : 'Scheduled visit',
        scheduledNote: isSpanish ? 'Tu visita está reservada para el horario seleccionado.' : 'Your visit is reserved for the selected time.',
        syncing: isSpanish ? 'Sincronizando' : 'Syncing',
        visit: isSpanish ? 'Visita' : 'Visit',
        eta: 'ETA',
        updating: isSpanish ? 'Actualizando' : 'Updating',
        distance: isSpanish ? 'Distancia' : 'Distance',
        destination: isSpanish ? 'Destino' : 'Dest.',
        viewRoute: isSpanish ? 'Ver ruta' : 'View Route',
        followWorker: isSpanish ? 'Seguir profesional' : 'Follow Worker',
        yourLocation: isSpanish ? 'Tu ubicación' : 'Your location',
        worker: isSpanish ? 'Profesional' : 'Worker',
        yourWorker: isSpanish ? 'Tu profesional' : 'Your worker',
        livePosition: isSpanish ? 'Posición en vivo' : 'Live position',
        onTheWay: (name: string) => isSpanish ? `${name} va en camino a tu dirección.` : `${name} is on the way to your address.`,
        arriving: (name: string) => isSpanish ? `${name} está por llegar.` : `${name} is arriving now.`,
        arrived: (name: string) => isSpanish ? `${name} llegó.` : `${name} has arrived.`,
    };
    const localizedServiceName = localizeClientServiceName(request.service_name, i18n.language);
    const visual = stageVisual(trackerStage, isSpanish);
    const workerName = request.assigned_worker?.name || trackerCopy.yourWorker;
    const displayedVisual = isScheduledFuture
        ? {
            ...visual,
            label: trackerCopy.scheduledVisit,
            note: scheduledWindow || trackerCopy.scheduledNote,
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
            showTrackerToast('info', trackerCopy.onTheWay(workerName));
        } else if (trackerStage === 'nearby') {
            showTrackerToast('info', trackerCopy.arriving(workerName));
        } else if (trackerStage === 'arrived') {
            showTrackerToast('success', trackerCopy.arrived(workerName));
        }

        previousStageRef.current = trackerStage;
    }, [request.id_request, request.service_name, trackerCopy, trackerStage, workerName]);

    const etaLabel = isScheduledFuture
        ? scheduledWindow || trackerCopy.scheduled
        : routeLoading
          ? trackerCopy.syncing
          : formatEta(metrics?.durationMin ?? routePreview?.durationMin ?? 0);
    const etaMetaLabel = isScheduledFuture ? trackerCopy.visit : trackerCopy.eta;
    const distanceLabel = routeLoading ? trackerCopy.updating : `${(metrics?.distanceKm ?? routePreview?.distanceKm ?? 0).toFixed(1)} km`;

    return (
        <div className={`relative h-full min-h-[600px] w-full overflow-hidden bg-slate-100 ${isMapExpanded ? 'fixed inset-4 z-[70] rounded-[2rem] border border-slate-200/70 shadow-2xl' : 'rounded-[1.5rem]'}`}>
            {/* Map Background */}
            <div ref={mapContainerRef} className="absolute inset-0 z-0" />
            
            {/* Soft edge overlays keep controls readable without hiding the map. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-white/70 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-44 bg-gradient-to-t from-white/80 to-transparent" />

            {!leafletReady && (
                <div className="absolute right-6 top-6 z-20 h-3 w-3 rounded-full bg-blue-500 animate-pulse shadow-[0_0_12px_rgba(59,130,246,0.8)]" />
            )}

            {/* Top Floating Header */}
            <div className="absolute left-4 right-4 top-4 z-20 flex flex-col justify-between gap-3 pointer-events-none sm:flex-row sm:items-start">
                <div className="flex items-center justify-between w-full sm:w-auto gap-3">
                    {onClose && (
                        <motion.button
                            initial={{ y: -20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            onClick={onClose}
                            className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-700 shadow-[0_10px_28px_rgba(15,23,42,0.14)] backdrop-blur-md transition-colors hover:text-slate-950 sm:h-11 sm:w-11"
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
                        className="pointer-events-auto flex flex-1 items-center gap-3 rounded-full border border-slate-200 bg-white/95 px-4 py-2.5 shadow-[0_10px_28px_rgba(15,23,42,0.12)] backdrop-blur-md sm:flex-none"
                    >
                        <div className="relative flex items-center justify-center shrink-0">
                            <div className={`absolute inset-0 rounded-full blur-md opacity-40 ${displayedVisual.toneClass.includes('emerald') || displayedVisual.toneClass.includes('green') ? 'bg-emerald-500' : 'bg-blue-500'}`}></div>
                            <div className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full bg-blue-500 relative z-10 animate-pulse"></div>
                        </div>
                        <div className="min-w-0">
                            <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 leading-none mb-1 sm:mb-1.5">{trackerCopy.status}</p>
                            <p className="text-xs sm:text-sm font-black text-slate-900 leading-none truncate">{displayedVisual.label}</p>
                        </div>
                    </motion.div>
                </div>

                {/* Right controls (e.g. Expand Map if needed, or Request ID) */}
                <motion.div 
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="pointer-events-auto self-end rounded-2xl border border-slate-200 bg-white/95 px-4 py-2.5 text-right shadow-[0_10px_28px_rgba(15,23,42,0.12)] backdrop-blur-md sm:self-auto"
                >
                    <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 leading-none mb-1 sm:mb-1.5">{trackerCopy.request}</p>
                    <p className="text-xs sm:text-sm font-black text-slate-900 leading-none">#{request.id_request}</p>
                </motion.div>
            </div>

            {/* Bottom Floating Card (Uber Style) */}
            <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-20 flex justify-center sm:bottom-5">
                <motion.div 
                    initial={{ y: 40, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="pointer-events-auto relative w-full max-w-2xl overflow-hidden rounded-[1.6rem] border border-slate-200/90 bg-white/96 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.16)] backdrop-blur-xl sm:p-5"
                >
                    {/* Drag handle decoration */}
                    <div className="absolute left-1/2 top-2.5 h-1 w-12 -translate-x-1/2 rounded-full bg-slate-200" />
                    
                    {/* Main Worker Info & ETA */}
                    <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="h-12 w-12 shrink-0 rounded-full bg-bird-blue p-[2px] shadow-[0_12px_28px_rgba(0,144,255,0.24)]">
                                <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-white bg-white">
                                    <span className="text-lg font-black text-bird-blue">
                                        {workerName.charAt(0).toUpperCase()}
                                    </span>
                                </div>
                            </div>
                            <div className="min-w-0">
                                <h3 className="truncate text-base font-black text-slate-950 sm:text-lg">{workerName}</h3>
                                <p className="truncate text-sm font-semibold text-slate-500">{localizedServiceName}</p>
                                {isScheduledRequest(request) && scheduledWindow && (
                                    <p className="mt-0.5 truncate text-xs font-bold text-bird-blue">{scheduledWindow}</p>
                                )}
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center justify-between gap-4 rounded-2xl bg-sky-50 px-4 py-3 text-left sm:min-w-[135px] sm:text-right">
                            <div className="sm:hidden">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{etaMetaLabel}</p>
                            </div>
                            <div>
                                <div className={`${isScheduledFuture ? 'max-w-[150px] text-sm leading-tight' : 'text-2xl'} font-black tracking-tight text-slate-950`}>{etaLabel}</div>
                                <div className="mt-0.5 hidden text-[10px] font-black uppercase tracking-widest text-slate-400 sm:block">{etaMetaLabel}</div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                            <div className="flex items-center gap-2 mb-1">
                                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{trackerCopy.distance}</p>
                            </div>
                            <p className="text-sm font-black text-slate-950">{distanceLabel}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                            <div className="flex items-center gap-2 mb-1">
                                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.243-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{trackerCopy.destination}</p>
                            </div>
                            <p className="truncate text-xs font-black text-slate-950">{request.location_text.split(',')[0]}</p>
                        </div>
                    </div>

                    <div className="mt-4 flex gap-3">
                        <button
                            type="button"
                            onClick={() => setCameraMode(prev => prev === 'close' ? 'balanced' : 'close')}
                            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 py-3 text-sm font-black text-white shadow-md transition-colors hover:bg-black"
                        >
                            <svg className="w-4 h-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            {cameraMode === 'close' ? trackerCopy.viewRoute : trackerCopy.followWorker}
                        </button>
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default ClientLiveRequestTracker;

