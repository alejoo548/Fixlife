import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Notyf } from 'notyf';

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

const trackerNotyf = new Notyf({ position: { x: 'left', y: 'bottom' }, ripple: true });

const haversineKm = (
    pointA: { lat: number; lng: number },
    pointB: { lat: number; lng: number }
) => {
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

const polylineDistanceKm = (points: [number, number][]) => {
    if (points.length < 2) return 0;

    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
        total += haversineKm(
            { lat: points[index - 1][0], lng: points[index - 1][1] },
            { lat: points[index][0], lng: points[index][1] }
        );
    }

    return total;
};

const distancePointToSegmentSquared = (
    point: { lat: number; lng: number },
    start: [number, number],
    end: [number, number]
) => {
    const px = point.lng;
    const py = point.lat;
    const x1 = start[1];
    const y1 = start[0];
    const x2 = end[1];
    const y2 = end[0];
    const dx = x2 - x1;
    const dy = y2 - y1;

    if (dx === 0 && dy === 0) {
        const ddx = px - x1;
        const ddy = py - y1;
        return ddx * ddx + ddy * ddy;
    }

    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    const ddx = px - projX;
    const ddy = py - projY;
    return ddx * ddx + ddy * ddy;
};

const findNearestSegmentIndex = (
    source: { lat: number; lng: number },
    points: [number, number][]
) => {
    if (points.length < 2) return points.length === 1 ? 0 : -1;

    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < points.length - 1; index += 1) {
        const distance = distancePointToSegmentSquared(source, points[index], points[index + 1]);
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = index;
        }
    }

    return nearestIndex;
};

const getRemainingRoutePoints = (
    points: [number, number][],
    currentCoords: { lat: number; lng: number } | null
) => {
    if (!currentCoords || points.length === 0) return points;
    if (points.length === 1) {
        return [
            [currentCoords.lat, currentCoords.lng] as [number, number],
            [currentCoords.lat, currentCoords.lng] as [number, number],
        ];
    }

    const nearestSegmentIndex = findNearestSegmentIndex(currentCoords, points);
    if (nearestSegmentIndex < 0) return points;

    const segmentEnd = points[Math.min(nearestSegmentIndex + 1, points.length - 1)];
    const nextPoints: [number, number][] = [[currentCoords.lat, currentCoords.lng] as [number, number]];

    if (segmentEnd && haversineKm(currentCoords, { lat: segmentEnd[0], lng: segmentEnd[1] }) > 0.002) {
        nextPoints.push(segmentEnd);
    }

    const tail = points.slice(Math.min(nearestSegmentIndex + 2, points.length)) as [number, number][];
    nextPoints.push(...tail);

    if (nextPoints.length === 1) {
        return [nextPoints[0], nextPoints[0]];
    }

    return nextPoints;
};

const getLiveViewportPoints = (
    points: [number, number][],
    currentCoords: { lat: number; lng: number } | null,
    cameraMode: CameraMode = 'balanced'
) => {
    const remainingPoints = getRemainingRoutePoints(points, currentCoords);
    if (remainingPoints.length <= 2) return remainingPoints;

    const totalRemainingKm = polylineDistanceKm(remainingPoints);
    const targetViewportKm =
        cameraMode === 'close'
            ? Math.min(Math.max(totalRemainingKm * 0.12, 0.05), 0.1)
            : Math.min(Math.max(totalRemainingKm * 0.2, 0.08), 0.18);
    const nextViewportPoints: [number, number][] = [remainingPoints[0]];
    let coveredKm = 0;

    for (let index = 1; index < remainingPoints.length; index += 1) {
        coveredKm += haversineKm(
            { lat: remainingPoints[index - 1][0], lng: remainingPoints[index - 1][1] },
            { lat: remainingPoints[index][0], lng: remainingPoints[index][1] }
        );
        nextViewportPoints.push(remainingPoints[index]);
        if (coveredKm >= targetViewportKm) break;
    }

    if (nextViewportPoints.length === 1 && remainingPoints[1]) {
        nextViewportPoints.push(remainingPoints[1]);
    }

    return nextViewportPoints;
};

const focusRouteViewport = (
    map: any,
    L: any,
    points: [number, number][],
    isLiveRoute: boolean,
    cameraMode: CameraMode = 'balanced'
) => {
    const validPoints = points.filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    if (!map || !L || validPoints.length === 0) return;
    
    // We override points with validPoints but let's make doubly sure for Leaflet bounds
    const cleanPoints = validPoints.map(([lat, lng]) => [Number(lat), Number(lng)] as [number, number]);

    const isDesktop = typeof window !== 'undefined' ? window.innerWidth >= 1024 : true;
    const firstPoint = cleanPoints[0];
    const lastPoint = cleanPoints[cleanPoints.length - 1];
    const latSpan = Math.abs(firstPoint[0] - lastPoint[0]);
    const lngSpan = Math.abs(firstPoint[1] - lastPoint[1]);
    const routeKm = polylineDistanceKm(cleanPoints);
    const isVeryShortRoute = latSpan < 0.0018 && lngSpan < 0.0018;

    if (isVeryShortRoute) {
        const centerLat = (firstPoint[0] + lastPoint[0]) / 2;
        const centerLng = (firstPoint[1] + lastPoint[1]) / 2;
        
        if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) return;

        const closeZoom =
            cameraMode === 'close'
                ? routeKm < 0.12
                    ? 19
                    : routeKm < 0.24
                      ? 18
                      : isDesktop
                        ? 17
                        : 16
                : routeKm < 0.18
                  ? 18
                  : routeKm < 0.35
                    ? 17
                    : isDesktop
                      ? 16
                      : 15;
        try {
            map.flyTo([centerLat, centerLng], closeZoom, {
                animate: false,
                duration: 0,
            });
        } catch (error) {
            console.warn('Leaflet flyTo error gracefully handled:', error);
        }
        return;
    }

    try {
        const bounds = L.polyline(cleanPoints).getBounds();
        if (!bounds || !bounds.isValid()) return;
        
        const mapSize = map.getSize();
        if (!mapSize || mapSize.x === 0 || mapSize.y === 0) {
            // Container size is 0 (e.g., rendering during animation), skip bounds calculation to avoid NaN
            return;
        }

        const paddedBounds = bounds.pad(
            isLiveRoute ? (cameraMode === 'close' ? 0.0015 : 0.004) : 0.05
        );
        
        const fitOptions = isDesktop
            ? {
                  paddingTopLeft: cameraMode === 'close' ? [18, 18] : [36, 36],
                  paddingBottomRight: cameraMode === 'close' ? [18, 24] : [36, 48],
                  maxZoom: isLiveRoute ? (cameraMode === 'close' ? 19 : 18) : 16,
                  animate: false,
                  duration: 0,
              }
            : {
                  paddingTopLeft: cameraMode === 'close' ? [12, 16] : [18, 24],
                  paddingBottomRight: cameraMode === 'close' ? [12, 18] : [18, 30],
                  maxZoom: isLiveRoute ? (cameraMode === 'close' ? 18 : 17) : 15,
                  animate: false,
                  duration: 0,
              };

        if (typeof map.flyToBounds === 'function') {
            map.flyToBounds(paddedBounds, fitOptions);
            return;
        }

        map.fitBounds(paddedBounds, fitOptions);
    } catch (error) {
        console.warn('Leaflet fitBounds error gracefully handled:', error);
    }
};

const buildRouteDistanceProfile = (points: [number, number][]) => {
    const cumulativeKm: number[] = [0];
    let totalKm = 0;

    for (let index = 1; index < points.length; index += 1) {
        totalKm += haversineKm(
            { lat: points[index - 1][0], lng: points[index - 1][1] },
            { lat: points[index][0], lng: points[index][1] }
        );
        cumulativeKm.push(totalKm);
    }

    return {
        totalKm,
        cumulativeKm,
    };
};

const getPointAtDistanceKm = (
    points: [number, number][],
    cumulativeKm: number[],
    targetKm: number
) => {
    if (points.length === 0) return null;
    if (points.length === 1) return { lat: points[0][0], lng: points[0][1] };
    if (targetKm <= 0) return { lat: points[0][0], lng: points[0][1] };

    const totalKm = cumulativeKm[cumulativeKm.length - 1] || 0;
    if (targetKm >= totalKm) {
        const lastPoint = points[points.length - 1];
        return { lat: lastPoint[0], lng: lastPoint[1] };
    }

    for (let index = 1; index < cumulativeKm.length; index += 1) {
        if (cumulativeKm[index] < targetKm) continue;

        const startDistance = cumulativeKm[index - 1];
        const endDistance = cumulativeKm[index];
        const segmentSpan = Math.max(endDistance - startDistance, 0.000001);
        const ratio = (targetKm - startDistance) / segmentSpan;
        const startPoint = points[index - 1];
        const endPoint = points[index];

        return {
            lat: startPoint[0] + (endPoint[0] - startPoint[0]) * ratio,
            lng: startPoint[1] + (endPoint[1] - startPoint[1]) * ratio,
        };
    }

    const fallbackPoint = points[points.length - 1];
    return { lat: fallbackPoint[0], lng: fallbackPoint[1] };
};

const formatEta = (durationMin: number) => {
    if (!Number.isFinite(durationMin) || durationMin <= 0) return '0 min';
    if (durationMin < 60) return `${Math.max(1, Math.ceil(durationMin))} min`;

    const hours = Math.floor(durationMin / 60);
    const minutes = Math.ceil(durationMin % 60);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
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

    const dateLabel = start.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    });
    const startLabel = start.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
    });
    const endLabel = end && !Number.isNaN(end.getTime())
        ? end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
        : '';

    return endLabel ? `${dateLabel}, ${startLabel} - ${endLabel}` : `${dateLabel}, ${startLabel}`;
};

const statusToStage = (statusRaw: RequestStatus): TrackerStage => {
    const status = String(statusRaw || '').toLowerCase();
    if (status === 'done') return 'completed';
    if (status === 'awaiting_confirmation') return 'work_in_progress';
    if (status === 'in_progress') return 'on_the_way';
    if (status === 'paid') return 'on_the_way';
    if (status === 'payment_pending') return 'awaiting_payment';
    return 'worker_accepted';
};

const stageVisual = (stage: TrackerStage) => {
    if (stage === 'completed') {
        return {
            label: 'Completed',
            toneClass: 'bg-gray-100 text-gray-700 border-gray-200',
            note: 'The service is complete and saved in your history.',
        };
    }
    if (stage === 'work_in_progress') {
        return {
            label: 'Work in progress',
            toneClass: 'bg-gray-100 text-gray-700 border-gray-200',
            note: 'The worker arrived and is actively working on the service.',
        };
    }
    if (stage === 'arrived') {
        return {
            label: 'Arrived',
            toneClass: 'bg-gray-100 text-gray-700 border-gray-200',
            note: 'Your worker is already at the destination.',
        };
    }
    if (stage === 'nearby') {
        return {
            label: 'Arriving now',
            toneClass: 'bg-gray-100 text-gray-700 border-gray-200',
            note: 'The worker is very close to your location.',
        };
    }
    if (stage === 'on_the_way') {
        return {
            label: 'On the way',
            toneClass: 'bg-gray-100 text-gray-700 border-gray-200',
            note: 'The worker is heading to your address right now.',
        };
    }
    if (stage === 'payment_secured') {
        return {
            label: 'Payment secured',
            toneClass: 'bg-gray-100 text-gray-700 border-gray-200',
            note: 'Funds are secured. Your worker can head out any moment.',
        };
    }
    if (stage === 'awaiting_payment') {
        return {
            label: 'Waiting for payment',
            toneClass: 'bg-gray-100 text-gray-700 border-gray-200',
            note: 'Your worker accepted. Secure payment so the trip can start.',
        };
    }
    return {
        label: 'Worker accepted',
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
        return {
            lat: Number(request.latitude),
            lng: Number(request.longitude),
        };
    }, [request.latitude, request.longitude]);

    const workerStartCoords = useMemo(() => {
        if (request.assigned_worker?.latitude != null && request.assigned_worker?.longitude != null) {
            return {
                lat: Number(request.assigned_worker.latitude),
                lng: Number(request.assigned_worker.longitude),
            };
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
    const isLiveRoute = ['paid', 'in_progress'].includes(requestStatus) && !isScheduledFuture;
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

        const L = window.L;
        const map = L.map(mapContainerRef.current, {
            zoomControl: false,
            attributionControl: true,
            dragging: true,
            scrollWheelZoom: false,
        }).setView([13.6929, -89.2182], 13);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap &copy; CARTO',
        }).addTo(map);

        L.control.zoom({ position: 'bottomright' }).addTo(map);
        mapInstanceRef.current = map;

        return () => {
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

        if (status !== 'paid' && status !== 'in_progress') {
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

        if (status === 'paid') {
            setTrackerStage('payment_secured');
        } else if (remainingDistanceKm <= 0.04) {
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

        clientMarkerRef.current.bindPopup(`<b>Your location</b><br/>${request.location_text}`);
    }, [destinationCoords, request.location_text]);

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

        workerMarkerRef.current.bindPopup(`<b>${request.assigned_worker?.name || 'Worker'}</b><br/>Live position`);
    }, [displayedWorkerCoords, request.assigned_worker?.name]);

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
    const workerName = request.assigned_worker?.name || 'Your worker';
    const displayedVisual = isScheduledFuture
        ? {
            ...visual,
            label: 'Scheduled visit',
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
        }

        previousStageRef.current = trackerStage;
    }, [request.id_request, request.service_name, trackerStage, workerName]);

    const etaLabel = isScheduledFuture
        ? scheduledWindow || 'Scheduled'
        : routeLoading
          ? 'Syncing'
          : formatEta(metrics?.durationMin ?? routePreview?.durationMin ?? 0);
    const etaMetaLabel = isScheduledFuture ? 'Visit' : 'ETA';
    const distanceLabel = routeLoading ? 'Updating' : `${(metrics?.distanceKm ?? routePreview?.distanceKm ?? 0).toFixed(1)} km`;

    return (
        <div className={`relative h-full min-h-[400px] w-full overflow-hidden bg-slate-100 ${isMapExpanded ? 'fixed inset-4 z-[70] rounded-[2rem] shadow-2xl border border-slate-200/50' : 'rounded-l-[2rem] border-l border-y border-slate-200/50 shadow-[-8px_0_32px_rgba(0,0,0,0.12)]'}`}>
            {/* Map Background */}
            <div ref={mapContainerRef} className="absolute inset-0 z-0" />
            
            {/* Subtle Gradient Overlays for better readability of floating elements */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/20 to-transparent z-10" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/10 to-transparent z-10" />

            {!leafletReady && (
                <div className="absolute right-6 top-6 z-20 h-3 w-3 rounded-full bg-blue-500 animate-pulse shadow-[0_0_12px_rgba(59,130,246,0.8)]" />
            )}

            {/* Top Floating Header */}
            <div className="absolute top-4 left-4 right-4 sm:top-6 sm:left-6 sm:right-6 z-20 flex flex-col sm:flex-row sm:items-start justify-between gap-3 pointer-events-none">
                <div className="flex items-center justify-between w-full sm:w-auto gap-3">
                    {onClose && (
                        <motion.button
                            initial={{ y: -20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            onClick={onClose}
                            className="pointer-events-auto h-10 w-10 sm:h-12 sm:w-12 shrink-0 flex items-center justify-center bg-white/95 backdrop-blur-md rounded-full shadow-lg border border-white/60 text-slate-700 hover:text-slate-900 transition-colors"
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
                        className="pointer-events-auto flex-1 sm:flex-none flex items-center gap-3 sm:gap-4 bg-white/95 backdrop-blur-md px-4 sm:px-5 py-2.5 sm:py-3.5 rounded-full sm:rounded-[1.25rem] shadow-lg border border-white/60"
                    >
                        <div className="relative flex items-center justify-center shrink-0">
                            <div className={`absolute inset-0 rounded-full blur-md opacity-40 ${displayedVisual.toneClass.includes('emerald') || displayedVisual.toneClass.includes('green') ? 'bg-emerald-500' : 'bg-blue-500'}`}></div>
                            <div className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full bg-blue-500 relative z-10 animate-pulse"></div>
                        </div>
                        <div className="min-w-0">
                            <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 leading-none mb-1 sm:mb-1.5">Status</p>
                            <p className="text-xs sm:text-sm font-black text-slate-900 leading-none truncate">{displayedVisual.label}</p>
                        </div>
                    </motion.div>
                </div>

                {/* Right controls (e.g. Expand Map if needed, or Request ID) */}
                <motion.div 
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="pointer-events-auto self-end sm:self-auto bg-white/95 backdrop-blur-md px-3 sm:px-4 py-2 sm:py-3 rounded-xl sm:rounded-2xl shadow-lg border border-white/60 text-right"
                >
                    <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 leading-none mb-1 sm:mb-1.5">Request</p>
                    <p className="text-xs sm:text-sm font-black text-slate-900 leading-none">#{request.id_request}</p>
                </motion.div>
            </div>

            {/* Bottom Floating Card (Uber Style) */}
            <div className="absolute bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-6 z-20 pointer-events-none flex justify-center">
                <motion.div 
                    initial={{ y: 40, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="pointer-events-auto w-full max-w-md bg-white rounded-[2rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] p-6 border border-slate-100 relative overflow-hidden"
                >
                    {/* Drag handle decoration */}
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-gray-200 rounded-full" />
                    
                    {/* Main Worker Info & ETA */}
                    <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-4 min-w-0">
                            <div className="w-14 h-14 shrink-0 rounded-full bg-gradient-to-tr from-blue-600 to-blue-400 p-[2px] shadow-md">
                                <div className="w-full h-full rounded-full bg-white border-2 border-white flex items-center justify-center overflow-hidden">
                                    <span className="text-blue-600 font-black text-xl">
                                        {workerName.charAt(0).toUpperCase()}
                                    </span>
                                </div>
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-lg font-black text-slate-900 truncate">{workerName}</h3>
                                <p className="text-sm font-semibold text-slate-500 truncate">{request.service_name}</p>
                                {isScheduledRequest(request) && scheduledWindow && (
                                    <p className="mt-0.5 text-xs font-bold text-blue-600 truncate">{scheduledWindow}</p>
                                )}
                            </div>
                        </div>
                        <div className="text-right shrink-0 pl-4 border-l border-slate-100 ml-4">
                            <div className={`${isScheduledFuture ? 'max-w-[140px] text-sm leading-tight' : 'text-2xl'} font-black text-slate-900 tracking-tight`}>{etaLabel}</div>
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{etaMetaLabel}</div>
                        </div>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3">
                        <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100">
                            <div className="flex items-center gap-2 mb-1">
                                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Distance</p>
                            </div>
                            <p className="text-sm font-bold text-slate-900">{distanceLabel}</p>
                        </div>
                        <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100">
                            <div className="flex items-center gap-2 mb-1">
                                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.243-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Dest.</p>
                            </div>
                            <p className="text-xs font-bold text-slate-900 truncate">{request.location_text.split(',')[0]}</p>
                        </div>
                    </div>

                    <div className="mt-5 flex gap-3">
                        <button
                            type="button"
                            onClick={() => setCameraMode(prev => prev === 'close' ? 'balanced' : 'close')}
                            className="flex-1 bg-slate-900 hover:bg-black text-white font-bold text-sm py-3.5 rounded-xl transition-colors shadow-md flex items-center justify-center gap-2"
                        >
                            <svg className="w-4 h-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            {cameraMode === 'close' ? 'View Route' : 'Follow Worker'}
                        </button>
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default ClientLiveRequestTracker;
