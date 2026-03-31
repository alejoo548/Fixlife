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
    if (!map || !L || !points.length) return;

    const isDesktop = typeof window !== 'undefined' ? window.innerWidth >= 1024 : true;
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    const latSpan = Math.abs(firstPoint[0] - lastPoint[0]);
    const lngSpan = Math.abs(firstPoint[1] - lastPoint[1]);
    const routeKm = polylineDistanceKm(points);
    const isVeryShortRoute = latSpan < 0.0018 && lngSpan < 0.0018;

    if (isVeryShortRoute) {
        const centerLat = (firstPoint[0] + lastPoint[0]) / 2;
        const centerLng = (firstPoint[1] + lastPoint[1]) / 2;
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
        map.flyTo([centerLat, centerLng], closeZoom, {
            animate: true,
            duration: 0.45,
        });
        return;
    }

    const bounds = L.polyline(points).getBounds().pad(
        isLiveRoute ? (cameraMode === 'close' ? 0.0015 : 0.004) : 0.05
    );
    const fitOptions = isDesktop
        ? {
              paddingTopLeft: cameraMode === 'close' ? [18, 18] : [36, 36],
              paddingBottomRight: cameraMode === 'close' ? [18, 24] : [36, 48],
              maxZoom: isLiveRoute ? (cameraMode === 'close' ? 19 : 18) : 16,
              animate: true,
              duration: 0.45,
          }
        : {
              paddingTopLeft: cameraMode === 'close' ? [12, 16] : [18, 24],
              paddingBottomRight: cameraMode === 'close' ? [12, 18] : [18, 30],
              maxZoom: isLiveRoute ? (cameraMode === 'close' ? 18 : 17) : 15,
              animate: true,
              duration: 0.45,
          };

    if (typeof map.flyToBounds === 'function') {
        map.flyToBounds(bounds, fitOptions);
        return;
    }

    map.fitBounds(bounds, fitOptions);
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

const statusToStage = (statusRaw: RequestStatus): TrackerStage => {
    const status = String(statusRaw || '').toLowerCase();
    if (status === 'done') return 'completed';
    if (status === 'awaiting_confirmation' || status === 'in_progress') return 'work_in_progress';
    if (status === 'paid') return 'on_the_way';
    if (status === 'payment_pending') return 'awaiting_payment';
    return 'worker_accepted';
};

const stageVisual = (stage: TrackerStage) => {
    if (stage === 'completed') {
        return {
            label: 'Completed',
            toneClass: 'bg-emerald-100 text-emerald-700 border-emerald-200',
            note: 'The service is complete and saved in your history.',
        };
    }
    if (stage === 'work_in_progress') {
        return {
            label: 'Work in progress',
            toneClass: 'bg-indigo-100 text-indigo-700 border-indigo-200',
            note: 'The worker arrived and is actively working on the service.',
        };
    }
    if (stage === 'arrived') {
        return {
            label: 'Arrived',
            toneClass: 'bg-violet-100 text-violet-700 border-violet-200',
            note: 'Your worker is already at the destination.',
        };
    }
    if (stage === 'nearby') {
        return {
            label: 'Arriving now',
            toneClass: 'bg-amber-100 text-amber-700 border-amber-200',
            note: 'The worker is very close to your location.',
        };
    }
    if (stage === 'on_the_way') {
        return {
            label: 'On the way',
            toneClass: 'bg-blue-100 text-blue-700 border-blue-200',
            note: 'The worker is heading to your address right now.',
        };
    }
    if (stage === 'payment_secured') {
        return {
            label: 'Payment secured',
            toneClass: 'bg-cyan-100 text-cyan-700 border-cyan-200',
            note: 'Funds are secured. Your worker can head out any moment.',
        };
    }
    if (stage === 'awaiting_payment') {
        return {
            label: 'Waiting for payment',
            toneClass: 'bg-yellow-100 text-yellow-700 border-yellow-200',
            note: 'Your worker accepted. Secure payment so the trip can start.',
        };
    }
    return {
        label: 'Worker accepted',
        toneClass: 'bg-sky-100 text-sky-700 border-sky-200',
        note: 'A worker is assigned and standing by for this service.',
    };
};

const createTrackerIcon = (L: any, kind: 'worker' | 'client') =>
    L.divIcon({
        className: 'client-live-tracker-icon',
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        html:
            kind === 'worker'
                ? `
                    <div style="position:relative;width:34px;height:34px;">
                        <div style="position:absolute;inset:0;border-radius:999px;background:rgba(56,189,248,.18);animation:pulse-glow 1.9s ease-in-out infinite;"></div>
                        <div style="position:absolute;inset:5px;border-radius:999px;background:#0ea5e9;border:3px solid #ffffff;box-shadow:0 10px 24px rgba(14,165,233,.35);"></div>
                    </div>
                  `
                : `
                    <div style="position:relative;width:34px;height:34px;">
                        <div style="position:absolute;inset:0;border-radius:999px;background:rgba(251,191,36,.20);animation:pulse-glow 2.1s ease-in-out infinite;"></div>
                        <div style="position:absolute;left:50%;top:2px;transform:translateX(-50%);width:24px;height:24px;border-radius:999px 999px 999px 0;background:#f59e0b;border:3px solid #ffffff;box-shadow:0 12px 22px rgba(245,158,11,.32);rotate:-45deg;"></div>
                    </div>
                  `,
    });

const ClientLiveRequestTracker: React.FC<ClientLiveRequestTrackerProps> = ({ leafletReady, request }) => {
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

    const [routeLoading, setRouteLoading] = useState(false);
    const [routePreview, setRoutePreview] = useState<{
        points: [number, number][];
        distanceKm: number;
        durationMin: number;
        cumulativeKm: number[];
    } | null>(null);
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

    const isLiveRoute = String(request.status || '').toLowerCase() === 'paid';
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
    }, [leafletReady]);

    useEffect(() => {
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
    }, []);

    useEffect(() => {
        if (!workerStartCoords || !destinationCoords) {
            setRoutePreview(null);
            return;
        }

        let aborted = false;

        const loadRoute = async () => {
            setRouteLoading(true);
            try {
                const params = new URLSearchParams({
                    overview: 'full',
                    geometries: 'geojson',
                    steps: 'false',
                });
                const routeUrl = `https://router.project-osrm.org/route/v1/driving/${workerStartCoords.lng},${workerStartCoords.lat};${destinationCoords.lng},${destinationCoords.lat}?${params.toString()}`;
                const res = await fetch(routeUrl);
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
                        [workerStartCoords.lat, workerStartCoords.lng],
                        [destinationCoords.lat, destinationCoords.lng],
                    ];
                }

                if (
                    points.length === 0 ||
                    points[0][0] !== workerStartCoords.lat ||
                    points[0][1] !== workerStartCoords.lng
                ) {
                    points.unshift([workerStartCoords.lat, workerStartCoords.lng]);
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
                const fallbackDistanceKm = haversineKm(workerStartCoords, destinationCoords);
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

                if (!aborted) {
                    setRoutePreview({
                        points,
                        distanceKm: Number(exactDistanceKm.toFixed(2)),
                        durationMin: Number(exactDurationMin.toFixed(1)),
                        cumulativeKm: profile.cumulativeKm,
                    });
                }
            } catch {
                const fallbackDistanceKm = haversineKm(workerStartCoords, destinationCoords);
                const points: [number, number][] = [
                    [workerStartCoords.lat, workerStartCoords.lng],
                    [destinationCoords.lat, destinationCoords.lng],
                ];
                const profile = buildRouteDistanceProfile(points);
                if (!aborted) {
                    setRoutePreview({
                        points,
                        distanceKm: Number(fallbackDistanceKm.toFixed(2)),
                        durationMin: Number(Math.max((fallbackDistanceKm / 22) * 60, 2).toFixed(1)),
                        cumulativeKm: profile.cumulativeKm,
                    });
                }
            } finally {
                if (!aborted) setRouteLoading(false);
            }
        };

        void loadRoute();

        return () => {
            aborted = true;
        };
    }, [destinationCoords, request.id_request, workerStartCoords]);

    useEffect(() => {
        if (animationFrameRef.current) {
            window.cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }

        if (!routePreview || !workerStartCoords || !destinationCoords) {
            setDisplayedWorkerCoords(workerStartCoords);
            setMetrics(null);
            setTrackerStage(statusToStage(request.status));
            return;
        }

        const status = String(request.status || '').toLowerCase();

        if (status === 'done') {
            setDisplayedWorkerCoords(destinationCoords);
            setMetrics({ distanceKm: 0, durationMin: 0 });
            setTrackerStage('completed');
            return;
        }

        if (status === 'in_progress' || status === 'awaiting_confirmation') {
            setDisplayedWorkerCoords(destinationCoords);
            setMetrics({ distanceKm: 0, durationMin: 0 });
            setTrackerStage('work_in_progress');
            return;
        }

        if (status === 'assigned') {
            setDisplayedWorkerCoords(workerStartCoords);
            setMetrics({
                distanceKm: routePreview.distanceKm,
                durationMin: routePreview.durationMin,
            });
            setTrackerStage('worker_accepted');
            return;
        }

        if (status === 'payment_pending') {
            setDisplayedWorkerCoords(workerStartCoords);
            setMetrics({
                distanceKm: routePreview.distanceKm,
                durationMin: routePreview.durationMin,
            });
            setTrackerStage('awaiting_payment');
            return;
        }

        if (status !== 'paid') {
            setDisplayedWorkerCoords(workerStartCoords);
            setMetrics({
                distanceKm: routePreview.distanceKm,
                durationMin: routePreview.durationMin,
            });
            setTrackerStage(statusToStage(status));
            return;
        }

        const totalKm = routePreview.distanceKm;
        const totalDurationMin = routePreview.durationMin;
        const totalDurationMs = Math.min(Math.max(totalDurationMin * 60 * 1000 * 0.09, 9000), 22000);
        const startTime = performance.now();

        const tick = (now: number) => {
            const progress = Math.min((now - startTime) / totalDurationMs, 1);
            const eased = 1 - Math.pow(1 - progress, 1.45);
            const travelledKm = totalKm * eased;
            const point =
                getPointAtDistanceKm(routePreview.points, routePreview.cumulativeKm, travelledKm) ||
                destinationCoords;
            const remainingDistanceKm = Math.max(totalKm - travelledKm, 0);
            const remainingDurationMin = Math.max(totalDurationMin * (1 - eased), 0);

            setDisplayedWorkerCoords(point);
            setMetrics({
                distanceKm: Number(remainingDistanceKm.toFixed(2)),
                durationMin: Number(remainingDurationMin.toFixed(1)),
            });

            if (eased >= 1) {
                setTrackerStage('arrived');
                animationFrameRef.current = null;
                return;
            }

            if (eased >= 0.86) {
                setTrackerStage('nearby');
            } else {
                setTrackerStage('on_the_way');
            }

            animationFrameRef.current = window.requestAnimationFrame(tick);
        };

        setTrackerStage('payment_secured');
        animationFrameRef.current = window.requestAnimationFrame(tick);

        return () => {
            if (animationFrameRef.current) {
                window.cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
        };
    }, [destinationCoords, request.id_request, request.status, routePreview, workerStartCoords]);

    useEffect(() => {
        if (!mapInstanceRef.current || !window.L || !routePreview) return;

        const L = window.L;
        const map = mapInstanceRef.current;
        const routePoints = visibleRoutePoints && visibleRoutePoints.length >= 2 ? visibleRoutePoints : routePreview.points;

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

        routeGlowRef.current = L.polyline(routePoints, {
            color: '#93c5fd',
            weight: 14,
            opacity: 0.22,
            lineCap: 'round',
            lineJoin: 'round',
            className: 'worker-route-glow',
        }).addTo(map);

        routeLineRef.current = L.polyline(routePoints, {
            color: '#2563eb',
            weight: 6,
            opacity: 0.94,
            lineCap: 'round',
            lineJoin: 'round',
            dashArray: '14 10',
            className: 'worker-route-line worker-route-live',
        }).addTo(map);

        if (lastFitRequestIdRef.current !== request.id_request) {
            focusRouteViewport(map, L, routePoints, isLiveRoute, cameraMode);
            lastFitRequestIdRef.current = request.id_request;
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

        workerMarkerRef.current.bindPopup(`<b>${request.assigned_worker?.name || 'Worker'}</b><br/>Live demo position`);
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

    const etaLabel = routeLoading ? 'Syncing' : formatEta(metrics?.durationMin ?? routePreview?.durationMin ?? 0);
    const distanceLabel = routeLoading ? 'Updating' : `${(metrics?.distanceKm ?? routePreview?.distanceKm ?? 0).toFixed(1)} km`;

    return (
        <>
            <AnimatePresence>
                {isMapExpanded && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[60] bg-slate-950/45 backdrop-blur-[4px]"
                            onClick={() => setIsMapExpanded(false)}
                        />
                    </>
                )}
            </AnimatePresence>

            <div className="overflow-hidden rounded-[32px] border border-bird-blue/12 bg-white shadow-[0_28px_70px_rgba(15,23,42,0.09)]">
            <div className="border-b border-slate-100 bg-gradient-to-r from-sky-50 via-white to-amber-50 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-bird-blue shadow-sm">
                            <span className="h-2.5 w-2.5 rounded-full bg-bird-yellow" />
                            Client tracker
                        </div>
                        <h3 className="mt-3 text-xl font-black text-slate-950">{workerName} is handling this request</h3>
                        <p className="mt-1 max-w-xl text-sm text-slate-500">{visual.note}</p>
                    </div>
                    <div className={`rounded-full border px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] shadow-sm ${visual.toneClass}`}>
                        {visual.label}
                    </div>
                </div>
            </div>

            <div className="grid gap-0">
                <div
                    className={
                        isMapExpanded
                            ? 'fixed inset-4 z-[70] min-h-0 overflow-hidden rounded-[32px] border border-white/70 bg-slate-100 shadow-[0_32px_90px_rgba(15,23,42,0.22)]'
                            : 'relative min-h-[340px] bg-slate-100'
                    }
                >
                    <div ref={mapContainerRef} className={isMapExpanded ? 'absolute inset-0 rounded-[32px]' : 'absolute inset-0'} />
                    <div className="pointer-events-none absolute inset-0">
                        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/70 via-white/10 to-transparent" />
                        <div className="absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-white/35 via-white/10 to-transparent" />
                        <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-white/25 via-white/5 to-transparent" />
                    </div>
                    {!leafletReady && (
                        <div className="absolute right-4 top-4 h-2.5 w-2.5 rounded-full bg-bird-blue/40 animate-pulse" />
                    )}

                    <div className="absolute left-4 top-4 right-4 flex items-start justify-between gap-3">
                        <div className="rounded-2xl border border-white/70 bg-white/92 px-3 py-2 shadow-lg backdrop-blur">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Destination</p>
                            <p className="mt-1 max-w-[210px] text-xs font-semibold text-slate-700 line-clamp-2">{request.location_text}</p>
                        </div>
                        <div className="rounded-2xl border border-white/70 bg-white/92 px-3 py-2 text-right shadow-lg backdrop-blur">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Request</p>
                            <p className="mt-1 text-xs font-black text-slate-900">#{request.id_request}</p>
                        </div>
                    </div>

                    {isMapExpanded && (
                        <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
                            <div className="hidden rounded-full border border-white/70 bg-white/92 p-1 shadow-lg backdrop-blur md:flex">
                                <button
                                    type="button"
                                    onClick={() => setCameraMode('balanced')}
                                    className={`rounded-full px-3 py-2 text-[11px] font-black transition ${
                                        cameraMode === 'balanced'
                                            ? 'bg-bird-blue text-white shadow-sm'
                                            : 'text-slate-600 hover:bg-slate-100'
                                    }`}
                                >
                                    Balanced
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCameraMode('close')}
                                    className={`rounded-full px-3 py-2 text-[11px] font-black transition ${
                                        cameraMode === 'close'
                                            ? 'bg-bird-blue text-white shadow-sm'
                                            : 'text-slate-600 hover:bg-slate-100'
                                    }`}
                                >
                                    Close Follow
                                </button>
                            </div>
                            <span className="rounded-full border border-white/70 bg-white/92 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-bird-blue shadow-lg backdrop-blur">
                                Expanded map
                            </span>
                            <button
                                type="button"
                                onClick={() => setIsMapExpanded(false)}
                                className="rounded-full border border-white/70 bg-white/92 px-3 py-2 text-[11px] font-black text-slate-700 shadow-lg backdrop-blur hover:bg-white"
                            >
                                Close
                            </button>
                        </div>
                    )}

                    <div
                        className={`absolute z-10 rounded-[26px] border border-white/75 bg-white/92 shadow-[0_18px_45px_rgba(15,23,42,0.12)] backdrop-blur-xl transition-all ${
                            isMapExpanded
                                ? 'bottom-4 left-1/2 w-[min(340px,calc(100%-32px))] -translate-x-1/2 p-3'
                                : 'bottom-4 left-4 right-4 p-4'
                        }`}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-bird-blue">Worker on route</p>
                                <h4 className={`mt-2 truncate font-black text-slate-950 ${isMapExpanded ? 'text-base' : 'text-lg'}`}>{workerName}</h4>
                                <p className={`mt-1 truncate text-slate-500 ${isMapExpanded ? 'text-xs' : 'text-sm'}`}>{request.service_name}</p>
                            </div>
                            <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${visual.toneClass}`}>
                                {visual.label}
                            </span>
                        </div>
                        <div className={`mt-3 grid gap-2 ${isMapExpanded ? 'grid-cols-3' : 'grid-cols-3'}`}>
                            <div className="rounded-2xl border border-sky-100 bg-sky-50/90 px-3 py-2.5">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-700">ETA</p>
                                <p className="mt-1 text-sm font-black text-sky-950">{etaLabel}</p>
                            </div>
                            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/90 px-3 py-2.5">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Distance</p>
                                <p className="mt-1 text-sm font-black text-emerald-950">{distanceLabel}</p>
                            </div>
                            <div className="rounded-2xl border border-amber-100 bg-amber-50/90 px-3 py-2.5">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Route</p>
                                <p className="mt-1 text-sm font-black text-amber-950">
                                    {request.status === 'paid' ? 'Live demo' : request.status === 'done' ? 'Finished' : 'Stand by'}
                                </p>
                            </div>
                        </div>
                        {isMapExpanded && (
                            <div className="mt-3 flex items-center justify-between gap-2 text-[11px] font-bold text-slate-500">
                                <span className="truncate">Following your worker in real time</span>
                                <button
                                    type="button"
                                    onClick={() => setCameraMode((prev) => (prev === 'close' ? 'balanced' : 'close'))}
                                    className="shrink-0 rounded-full border border-bird-blue/15 bg-bird-blue/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-bird-blue"
                                >
                                    {cameraMode === 'close' ? 'Close follow' : 'Balanced'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-white px-5 py-5 lg:px-6">
                    <div className="rounded-[28px] border border-slate-200 bg-slate-50/90 p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Request summary</p>
                                <h4 className="mt-2 truncate text-xl font-black text-slate-950">{request.service_name}</h4>
                                <p className="mt-2 text-sm leading-6 text-slate-500 line-clamp-2">{request.location_text}</p>
                            </div>
                            <span className="shrink-0 rounded-full border border-bird-blue/10 bg-bird-blue/10 px-3 py-1 text-[11px] font-black text-bird-blue">
                                #{request.id_request}
                            </span>
                        </div>

                        <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
                            <div className="rounded-2xl border border-sky-100 bg-sky-50/90 p-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-700">ETA</p>
                                <p className="mt-2 text-xl font-black text-sky-950">{etaLabel}</p>
                            </div>
                            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/90 p-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Distance</p>
                                <p className="mt-2 text-xl font-black text-emerald-950">{distanceLabel}</p>
                            </div>
                            <div className="rounded-2xl border border-amber-100 bg-amber-50/90 p-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Stage</p>
                                <p className="mt-2 text-base font-black text-amber-950">{visual.label}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Worker</p>
                                <p className="mt-2 text-base font-black text-slate-900">
                                    {request.assigned_worker?.is_online ? 'Online now' : 'Assigned'}
                                </p>
                            </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            <button
                                type="button"
                                onClick={() => setIsMapExpanded((prev) => !prev)}
                                className="rounded-2xl border border-bird-blue/15 bg-bird-blue/10 px-4 py-3 text-sm font-black text-bird-blue transition hover:bg-bird-blue hover:text-white"
                            >
                                {isMapExpanded ? 'Collapse map' : 'Expand map'}
                            </button>
                            <div className="rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
                                <div className="grid grid-cols-2 gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setCameraMode('balanced')}
                                        className={`rounded-xl px-3 py-2 text-xs font-black transition ${
                                            cameraMode === 'balanced'
                                                ? 'bg-bird-blue text-white shadow-sm'
                                                : 'text-slate-600 hover:bg-slate-100'
                                        }`}
                                    >
                                        Balanced
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCameraMode('close')}
                                        className={`rounded-xl px-3 py-2 text-xs font-black transition ${
                                            cameraMode === 'close'
                                                ? 'bg-bird-blue text-white shadow-sm'
                                                : 'text-slate-600 hover:bg-slate-100'
                                        }`}
                                    >
                                        Close Follow
                                    </button>
                                </div>
                            </div>
                            <div className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
                                {request.status === 'paid' ? 'Live route' : request.status === 'done' ? 'Finished' : 'Stand by'}
                            </div>
                        </div>
                    </div>
                </div>
                </div>
            </div>
        </>
    );
};

export default ClientLiveRequestTracker;
