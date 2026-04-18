import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSSE } from '../../hooks/useSSE';
import { API_ENDPOINTS } from '../../config/api';
import { Notyf } from 'notyf';
import { motion, AnimatePresence } from 'framer-motion';
import 'notyf/notyf.min.css';

interface RequestsViewProps {
  isOnline: boolean;
  mobileView: 'list' | 'map';
  token: string | null;
}

interface WorkerRequest {
  id_request: number;
  id_service: number;
  service_name: string;
  service_icon: string | null;
  description: string;
  location_text: string;
  latitude: number | null;
  longitude: number | null;
  budget: number;
  request_status: 'open' | 'payment_pending' | 'paid' | 'assigned' | 'in_progress' | 'awaiting_confirmation' | 'done' | 'cancelled';
  worker_status: 'new' | 'accepted' | 'rejected' | 'expired';
  distance_km: number | null;
  created_at: string;
  route_url: string | null;
  proposed_budget?: number | null;
  counter_message?: string | null;
}

interface ChatMessage {
  id_message: number;
  id_request: number;
  sender_role: 'client' | 'worker';
  message: string | null;
  image_url: string | null;
  created_at: string;
}

interface WorkerRequestsPayload {
  success: boolean;
  status: string;
  worker_profile?: {
    id_worker_profile: number;
    latitude: number | null;
    longitude: number | null;
    active_request_id?: number | null;
    active_request_status?: string | null;
  };
  requests: WorkerRequest[];
}

declare global {
  interface Window {
    L?: any;
  }
}

interface RouteAlert {
  tone: 'info' | 'success' | 'warning';
  title: string;
  message: string;
}

interface SimulatedTrafficSegment {
  points: [number, number][];
  level: 'light' | 'moderate' | 'heavy';
  color: string;
  label: string;
}

interface SimulatedTrafficSummary {
  level: 'Light' | 'Moderate' | 'Heavy';
  delayMin: number;
  segments: SimulatedTrafficSegment[];
  note: string;
}

const notyf = new Notyf({ position: { x: 'left', y: 'bottom' }, ripple: true });
const CHAT_POLL_MS = 3000;

const getLatestChatMessageId = (messages: ChatMessage[]) =>
  messages.length > 0 ? Number(messages[messages.length - 1].id_message || 0) : 0;

const mergeChatMessages = (current: ChatMessage[], incoming: ChatMessage[]) => {
  const byId = new Map<number, ChatMessage>();

  for (const message of current) {
    byId.set(Number(message.id_message), message);
  }

  for (const message of incoming) {
    byId.set(Number(message.id_message), message);
  }

  return Array.from(byId.values()).sort((left, right) => {
    const leftId = Number(left.id_message || 0);
    const rightId = Number(right.id_message || 0);
    return leftId - rightId;
  });
};

const formatEta = (durationMin: number) => {
  if (!Number.isFinite(durationMin) || durationMin <= 0) return '--';
  if (durationMin < 60) return `${Math.ceil(durationMin)} min`;

  const hours = Math.floor(durationMin / 60);
  const minutes = Math.ceil(durationMin % 60);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
};

const workerRequestStatusLabel = (statusRaw: string) => {
  const status = String(statusRaw || '').toLowerCase();
  if (status === 'assigned') return 'Client review';
  if (status === 'payment_pending') return 'Payment pending';
  if (status === 'awaiting_confirmation') return 'Client confirmation';
  if (status === 'in_progress') return 'In progress';
  if (status === 'done') return 'Completed';
  if (status === 'paid') return 'Ready to go';
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Pending';
};

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

const findNearestPointIndex = (
  source: { lat: number; lng: number },
  points: [number, number][]
) => {
  if (points.length === 0) return -1;

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  points.forEach(([lat, lng], index) => {
    const distance = haversineKm(source, { lat, lng });
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
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

const seededUnit = (seed: number) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

const buildSimulatedTraffic = (
  requestId: number,
  points: [number, number][],
  distanceKm: number
): SimulatedTrafficSummary => {
  const palette = {
    light: { color: '#22c55e', factor: 0.04, label: 'Smooth flow' },
    moderate: { color: '#f59e0b', factor: 0.11, label: 'Busy streets' },
    heavy: { color: '#ef4444', factor: 0.2, label: 'Slow traffic' },
  } as const;

  if (points.length < 2) {
    return {
      level: 'Light',
      delayMin: 0,
      segments: [],
      note: 'Traffic simulation is light on this route.',
    };
  }

  const segmentCount = Math.min(4, Math.max(2, Math.floor(points.length / 18)));
  const segments: SimulatedTrafficSegment[] = [];
  let totalDelayMin = 0;
  let heaviestRank = 0;

  for (let index = 0; index < segmentCount; index += 1) {
    const seeded = seededUnit(requestId * 17 + index * 29 + Math.round(distanceKm * 100));
    const level: SimulatedTrafficSegment['level'] =
      seeded > 0.8 ? 'heavy' : seeded > 0.44 ? 'moderate' : 'light';
    const config = palette[level];

    const startIndex = Math.floor(((points.length - 1) * index) / segmentCount);
    const endIndex =
      index === segmentCount - 1
        ? points.length - 1
        : Math.max(startIndex + 1, Math.floor(((points.length - 1) * (index + 1)) / segmentCount));
    const segmentPoints = points.slice(startIndex, endIndex + 1) as [number, number][];
    const segmentDistance = polylineDistanceKm(segmentPoints);

    segments.push({
      points: segmentPoints,
      level,
      color: config.color,
      label: config.label,
    });

    totalDelayMin += segmentDistance * 6 * config.factor;
    heaviestRank = Math.max(heaviestRank, level === 'heavy' ? 3 : level === 'moderate' ? 2 : 1);
  }

  const level = heaviestRank >= 3 ? 'Heavy' : heaviestRank === 2 ? 'Moderate' : 'Light';
  const note =
    level === 'Heavy'
      ? 'Demo traffic is slow around the client area.'
      : level === 'Moderate'
        ? 'Demo traffic shows some slower segments on the route.'
        : 'Demo traffic is mostly clear on this route.';

  return {
    level,
    delayMin: Number(totalDelayMin.toFixed(1)),
    segments,
    note,
  };
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

  if (
    segmentEnd &&
    haversineKm(currentCoords, { lat: segmentEnd[0], lng: segmentEnd[1] }) > 0.002
  ) {
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
  mode: 'balanced' | 'close'
) => {
  const remainingPoints = getRemainingRoutePoints(points, currentCoords);
  if (remainingPoints.length <= 2) return remainingPoints;

  const totalRemainingKm = polylineDistanceKm(remainingPoints);
  const targetViewportKm =
    mode === 'close'
      ? Math.min(Math.max(totalRemainingKm * 0.12, 0.06), 0.12)
      : Math.min(Math.max(totalRemainingKm * 0.32, 0.14), 0.42);
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

const createDestinationPinIcon = (L: any, active: boolean) =>
  L.divIcon({
    className: 'worker-client-destination-icon',
    iconSize: [34, 44],
    iconAnchor: [17, 40],
    popupAnchor: [0, -34],
    html: `
      <div style="position:relative;width:34px;height:44px;">
        ${
          active
            ? '<div style="position:absolute;left:50%;top:6px;transform:translateX(-50%);width:28px;height:28px;border-radius:999px;background:rgba(251,146,60,.20);animation:pulse-glow 1.7s ease-in-out infinite;"></div>'
            : ''
        }
        <div style="position:absolute;left:50%;top:2px;transform:translateX(-50%);width:26px;height:26px;border-radius:999px 999px 999px 0;background:${active ? '#f97316' : '#0284c7'};border:3px solid #ffffff;box-shadow:0 10px 22px rgba(15,23,42,.18);rotate:-45deg;"></div>
        <div style="position:absolute;left:50%;top:8px;transform:translateX(-50%);width:10px;height:10px;border-radius:999px;background:#ffffff;"></div>
      </div>
    `,
  });

const focusRouteViewport = (
  map: any,
  L: any,
  points: [number, number][],
  isLiveRoute: boolean,
  mode: 'balanced' | 'close' = 'balanced'
) => {
  if (!map || !L || !points.length) return;

  const isDesktop = typeof window !== 'undefined' ? window.innerWidth >= 1280 : true;
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const latSpan = Math.abs(firstPoint[0] - lastPoint[0]);
  const lngSpan = Math.abs(firstPoint[1] - lastPoint[1]);
  const routeKm = polylineDistanceKm(points);
  const isVeryShortRoute = latSpan < 0.0018 && lngSpan < 0.0018;

  if (isVeryShortRoute) {
    const centerLat = (firstPoint[0] + lastPoint[0]) / 2;
    const centerLng = (firstPoint[1] + lastPoint[1]) / 2;
    const closeZoom = routeKm < 0.12 ? 18 : routeKm < 0.25 ? 17 : routeKm < 0.4 ? 16 : isDesktop ? 15 : 14;
    const balancedZoom = routeKm < 0.18 ? 17 : routeKm < 0.35 ? 16 : isDesktop ? 15 : 14;
    map.flyTo([centerLat, centerLng], mode === 'close' ? closeZoom : balancedZoom, {
      animate: true,
      duration: 0.45,
    });
    return;
  }

  const livePad = mode === 'close' ? 0.0015 : 0.02;
  const bounds = L.polyline(points).getBounds().pad(isLiveRoute ? livePad : 0.12);
  const fitOptions = isDesktop
    ? {
        paddingTopLeft: mode === 'close' ? [260, 88] : [210, 78],
        paddingBottomRight: mode === 'close' ? [32, 44] : [72, 84],
        maxZoom: isLiveRoute ? (mode === 'close' ? 19 : 16) : 14,
        animate: true,
        duration: 0.42,
      }
    : {
        paddingTopLeft: mode === 'close' ? [14, 48] : [18, 68],
        paddingBottomRight: mode === 'close' ? [14, 70] : [18, 108],
        maxZoom: isLiveRoute ? (mode === 'close' ? 17 : 14) : 12,
        animate: true,
        duration: 0.42,
      };

  if (typeof map.flyToBounds === 'function') {
    map.flyToBounds(bounds, fitOptions);
    return;
  }

  map.fitBounds(bounds, fitOptions);
};

export const RequestsView: React.FC<RequestsViewProps> = ({ isOnline, mobileView, token }) => {
  const [statusFilter, setStatusFilter] = useState<'new' | 'accepted' | 'rejected'>('new');
  const [requests, setRequests] = useState<WorkerRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [workerCoords, setWorkerCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [activeWorkerRequest, setActiveWorkerRequest] = useState<{ id_request: number; status: string } | null>(null);
  const [leafletReady, setLeafletReady] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [presenceBusy, setPresenceBusy] = useState(false);
  const [chatByRequest, setChatByRequest] = useState<Record<number, ChatMessage[]>>({});
  const [chatTextByRequest, setChatTextByRequest] = useState<Record<number, string>>({});
  const [chatImageByRequest, setChatImageByRequest] = useState<Record<number, File | null>>({});
  const [chatBusyId, setChatBusyId] = useState<number | null>(null);
  const [routePreview, setRoutePreview] = useState<{
    points: [number, number][];
    distanceKm: number;
    durationMin: number;
  } | null>(null);
  const [liveRouteMetrics, setLiveRouteMetrics] = useState<{ distanceKm: number; durationMin: number } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [activeRouteRequestId, setActiveRouteRequestId] = useState<number | null>(null);
  const [trafficEnabled, setTrafficEnabled] = useState(true);
  const [simulatedTraffic, setSimulatedTraffic] = useState<SimulatedTrafficSummary | null>(null);
  const [routeFollowerCoords, setRouteFollowerCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [routeAlert, setRouteAlert] = useState<RouteAlert | null>(null);
  const [routeCameraMode, setRouteCameraMode] = useState<'balanced' | 'close'>('close');
  const [chatPanelOpen, setChatPanelOpen] = useState(false);
  const [routePanelExpanded, setRoutePanelExpanded] = useState(false);
  const [routeStatusLabel, setRouteStatusLabel] = useState<'Idle' | 'Live Route' | 'Rerouting' | 'Nearby' | 'Arrived'>('Idle');

  // Custom Modal State
  const [counterModalOpen, setCounterModalOpen] = useState(false);
  const [counterTargetId, setCounterTargetId] = useState<number | null>(null);
  const [counterAmount, setCounterAmount] = useState('');
  const [counterNote, setCounterNote] = useState('');

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const routeLayersRef = useRef<any[]>([]);
  const requestMarkersRef = useRef<any[]>([]);
  const workerMarkerRef = useRef<any>(null);
  const routeAbortRef = useRef<AbortController | null>(null);
  const routeAnimationFrameRef = useRef<number | null>(null);
  const routeAlertTimerRef = useRef<number | null>(null);
  const lastCameraFollowAtRef = useRef<number>(0);
  const workerChatEndRef = useRef<HTMLDivElement | null>(null);
  const lastRouteFetchRef = useRef<{
    requestId: number | null;
    lat: number | null;
    lng: number | null;
    at: number;
  }>({ requestId: null, lat: null, lng: null, at: 0 });
  const arrivalSoonAlertedRef = useRef<Set<number>>(new Set());
  const arrivedAlertedRef = useRef<Set<number>>(new Set());
  const lastDeviationAlertAtRef = useRef<number>(0);
  const firstLoadRef = useRef(true);
  const knownNewIdsRef = useRef<Set<number>>(new Set());
  const lastRouteViewportKeyRef = useRef<string | null>(null);

  const selectedRequest = useMemo(
    () => requests.find((r) => r.id_request === selectedRequestId) || requests[0] || null,
    [requests, selectedRequestId]
  );
  const isInPageRouteActive = !!selectedRequest && activeRouteRequestId === selectedRequest.id_request;
  const displayedWorkerCoords = routeFollowerCoords || workerCoords;
  const routeDistanceProfile = useMemo(
    () => (routePreview ? buildRouteDistanceProfile(routePreview.points) : null),
    [routePreview]
  );
  const visibleRoutePoints = useMemo(() => {
    if (!routePreview) return null;
    if (!isInPageRouteActive) return routePreview.points;
    return getRemainingRoutePoints(routePreview.points, displayedWorkerCoords);
  }, [routePreview, isInPageRouteActive, displayedWorkerCoords?.lat, displayedWorkerCoords?.lng]);
  const liveViewportPoints = useMemo(() => {
    if (!routePreview) return null;
    return getLiveViewportPoints(routePreview.points, displayedWorkerCoords, routeCameraMode);
  }, [routePreview, displayedWorkerCoords?.lat, displayedWorkerCoords?.lng, routeCameraMode]);
  const trafficDelayMin = trafficEnabled ? simulatedTraffic?.delayMin ?? 0 : 0;
  const displayedRouteMetrics = liveRouteMetrics || (
    routePreview
      ? {
          distanceKm: routePreview.distanceKm,
          durationMin: routePreview.durationMin + trafficDelayMin,
        }
      : null
  );
  const hasAnotherActiveJob =
    statusFilter === 'new' &&
    !!activeWorkerRequest &&
    (!selectedRequest || activeWorkerRequest.id_request !== selectedRequest.id_request);
  const canWorkerTravelToClient =
    !!selectedRequest &&
    ['payment_pending', 'paid', 'in_progress', 'awaiting_confirmation', 'done'].includes(
      String(selectedRequest.request_status || '').toLowerCase()
    );
  const canUseChatWithClient =
    !!selectedRequest &&
    ['assigned', 'payment_pending', 'paid', 'in_progress', 'awaiting_confirmation', 'done'].includes(String(selectedRequest.request_status || '').toLowerCase()) &&
    String(selectedRequest.worker_status || '').toLowerCase() === 'accepted';
  const selectedLocationCompact = selectedRequest?.location_text
    ? selectedRequest.location_text.split(',').slice(0, 3).join(', ').trim()
    : 'Location pending';
  const routeEtaLabel = routeLoading
    ? 'Calculating'
    : displayedRouteMetrics
      ? formatEta(displayedRouteMetrics.durationMin)
      : '--';
  const routeDistanceLabel = routeLoading
    ? 'Routing...'
    : displayedRouteMetrics
      ? `${displayedRouteMetrics.distanceKm.toFixed(1)} km`
      : '--';
  const requestListHint =
    statusFilter === 'accepted'
      ? 'Move each active job through its next step and keep the client informed.'
      : statusFilter === 'rejected'
        ? 'Rejected leads stay here for quick reference.'
        : isOnline
          ? `Live updates every 5s${presenceBusy ? ' - syncing location' : ''}`
          : 'Go online to receive nearby requests';
  const selectedServiceIcon = selectedRequest?.service_icon || 'Fix';
  const routeStatusDisplayLabel =
    routeStatusLabel === 'Idle'
      ? 'Ready'
      : routeStatusLabel === 'Live Route'
        ? 'On route'
        : routeStatusLabel === 'Rerouting'
          ? 'Re-centering'
          : routeStatusLabel;

  const showRouteAlert = (nextAlert: RouteAlert) => {
    setRouteAlert(nextAlert);
    if (routeAlertTimerRef.current) {
      window.clearTimeout(routeAlertTimerRef.current);
    }
    routeAlertTimerRef.current = window.setTimeout(() => {
      setRouteAlert(null);
      routeAlertTimerRef.current = null;
    }, 4800);
  };

  useEffect(() => {
    const loadLeaflet = async () => {
      if (window.L) {
        setLeafletReady(true);
        return;
      }

      const cssId = 'leaflet-css-worker-requests';
      const jsId = 'leaflet-js-worker-requests';

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
    if (!mapContainerRef.current || !window.L || !leafletReady) return;
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

    mapInstanceRef.current = map;
  }, [leafletReady]);

  useEffect(() => {
    return () => {
      if (routeAlertTimerRef.current) {
        window.clearTimeout(routeAlertTimerRef.current);
      }
      if (routeAnimationFrameRef.current) {
        window.cancelAnimationFrame(routeAnimationFrameRef.current);
      }
      if (mapInstanceRef.current) {
        routeLayersRef.current.forEach((layer) => {
          try {
            mapInstanceRef.current.removeLayer(layer);
          } catch {
            // ignore
          }
        });
        requestMarkersRef.current.forEach((layer) => {
          try {
            mapInstanceRef.current.removeLayer(layer);
          } catch {
            // ignore
          }
        });
      }
      if (workerMarkerRef.current && mapInstanceRef.current) {
        try {
          mapInstanceRef.current.removeLayer(workerMarkerRef.current);
        } catch {
          // ignore
        }
        workerMarkerRef.current = null;
      }
      routeLayersRef.current = [];
      requestMarkersRef.current = [];
      routeAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const loadRoutePreview = async () => {
      if (!workerCoords || selectedRequest?.latitude == null || selectedRequest.longitude == null) {
        setRoutePreview(null);
        setLiveRouteMetrics(null);
        setRouteError(null);
        setRouteLoading(false);
        return;
      }

      const now = Date.now();
      const movedKm =
        lastRouteFetchRef.current.lat != null && lastRouteFetchRef.current.lng != null
          ? haversineKm(workerCoords, {
              lat: lastRouteFetchRef.current.lat,
              lng: lastRouteFetchRef.current.lng,
            })
          : Number.POSITIVE_INFINITY;
      const requestChanged = lastRouteFetchRef.current.requestId !== selectedRequest.id_request;
      const fetchCooldownMs = isInPageRouteActive ? 60000 : 12000;
      const movementThresholdKm = isInPageRouteActive ? 0.12 : 0.08;

      if (
        routePreview &&
        !requestChanged &&
        movedKm < movementThresholdKm &&
        now - lastRouteFetchRef.current.at < fetchCooldownMs
      ) {
        return;
      }

      routeAbortRef.current?.abort();
      const controller = new AbortController();
      routeAbortRef.current = controller;
      setRouteLoading(true);
      setRouteError(null);
      lastRouteFetchRef.current = {
        requestId: selectedRequest.id_request,
        lat: workerCoords.lat,
        lng: workerCoords.lng,
        at: now,
      };

      const buildStraightLineFallback = () => {
        const straightDistanceKm = haversineKm(workerCoords!, {
          lat: selectedRequest!.latitude!,
          lng: selectedRequest!.longitude!,
        });
        const estimatedDurationMin = straightDistanceKm * 2.4;
        const points: [number, number][] = [
          [workerCoords!.lat, workerCoords!.lng],
          [selectedRequest!.latitude!, selectedRequest!.longitude!],
        ];
        return { points, distanceKm: straightDistanceKm, durationMin: estimatedDurationMin };
      };

      try {
        const params = new URLSearchParams({
          overview: 'full',
          geometries: 'geojson',
          steps: 'false',
        });
        const url =
          `https://router.project-osrm.org/route/v1/driving/` +
          `${workerCoords.lng},${workerCoords.lat};${selectedRequest.longitude},${selectedRequest.latitude}?${params.toString()}`;

        const timeoutId = setTimeout(() => controller.abort(), 6000);
        let res: Response;
        try {
          res = await fetch(url, { signal: controller.signal });
        } finally {
          clearTimeout(timeoutId);
        }

        let payload: any;
        try {
          payload = await res.json();
        } catch {
          // OSRM returned non-JSON (HTML error page) – use fallback
          setRoutePreview(buildStraightLineFallback());
          return;
        }

        const route = payload?.routes?.[0];

        if (!res.ok || !route?.geometry?.coordinates?.length) {
          setRoutePreview(buildStraightLineFallback());
          return;
        }

        const points = route.geometry.coordinates.map(
          ([lng, lat]: [number, number]) => [lat, lng] as [number, number]
        );

        if (
          points.length > 0 &&
          haversineKm(workerCoords, { lat: points[0][0], lng: points[0][1] }) > 0.02
        ) {
          points.unshift([workerCoords.lat, workerCoords.lng]);
        }

        if (
          points.length > 0 &&
          haversineKm(
            { lat: selectedRequest.latitude, lng: selectedRequest.longitude },
            { lat: points[points.length - 1][0], lng: points[points.length - 1][1] }
          ) > 0.02
        ) {
          points.push([selectedRequest.latitude, selectedRequest.longitude]);
        }

        const routedDistanceKm = Number(route.distance || 0) / 1000;
        const exactDistanceKm = Math.max(polylineDistanceKm(points), routedDistanceKm);
        const routedDurationMin = Number(route.duration || 0) / 60;
        const exactDurationMin =
          routedDistanceKm > 0 ? routedDurationMin * (exactDistanceKm / routedDistanceKm) : routedDurationMin;

        setRoutePreview({
          points,
          distanceKm: exactDistanceKm,
          durationMin: exactDurationMin,
        });
      } catch (error: any) {
        if (error?.name === 'AbortError') {
          // Timeout or manual abort – use straight-line fallback
          setRoutePreview(buildStraightLineFallback());
          return;
        }
        setRoutePreview(buildStraightLineFallback());
      } finally {
          setRouteLoading(false);
      }
    };

    void loadRoutePreview();

    return () => {
      routeAbortRef.current?.abort();
    };
  }, [workerCoords?.lat, workerCoords?.lng, selectedRequest?.id_request, selectedRequest?.latitude, selectedRequest?.longitude, isInPageRouteActive]);

  useEffect(() => {
    if (!routePreview || !selectedRequest) {
      setSimulatedTraffic(null);
      return;
    }

    setSimulatedTraffic(
      buildSimulatedTraffic(selectedRequest.id_request, routePreview.points, routePreview.distanceKm)
    );
  }, [routePreview, selectedRequest?.id_request]);

  useEffect(() => {
    if (routeAnimationFrameRef.current) {
      window.cancelAnimationFrame(routeAnimationFrameRef.current);
      routeAnimationFrameRef.current = null;
    }

    if (!isInPageRouteActive || !routePreview || !routeDistanceProfile || routePreview.points.length < 2) {
      setRouteFollowerCoords(null);
      return;
    }

    const totalDistanceKm = Math.max(routeDistanceProfile.totalKm, 0.001);
    const totalDurationMs = Math.min(
      Math.max((routePreview.durationMin + trafficDelayMin) * 60 * 1000 * 0.04, 5000),
      14000
    );
    const startedAt = performance.now();
    const startingPoint = routePreview.points[0];
    setRouteFollowerCoords({ lat: startingPoint[0], lng: startingPoint[1] });

    const animateFollower = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / totalDurationMs);
      const easedProgress = 1 - Math.pow(1 - progress, 1.35);
      const nextPoint = getPointAtDistanceKm(
        routePreview.points,
        routeDistanceProfile.cumulativeKm,
        totalDistanceKm * easedProgress
      );

      if (nextPoint) {
        setRouteFollowerCoords(nextPoint);
      }

      if (progress < 1) {
        routeAnimationFrameRef.current = window.requestAnimationFrame(animateFollower);
        return;
      }

      const destinationPoint = routePreview.points[routePreview.points.length - 1];
      setRouteFollowerCoords({ lat: destinationPoint[0], lng: destinationPoint[1] });
      routeAnimationFrameRef.current = null;
    };

    routeAnimationFrameRef.current = window.requestAnimationFrame(animateFollower);

    return () => {
      if (routeAnimationFrameRef.current) {
        window.cancelAnimationFrame(routeAnimationFrameRef.current);
        routeAnimationFrameRef.current = null;
      }
    };
  }, [
    isInPageRouteActive,
    selectedRequest?.id_request,
    routePreview,
    routeDistanceProfile,
    trafficDelayMin,
  ]);

  useEffect(() => {
    if (!routePreview || !displayedWorkerCoords) {
      setLiveRouteMetrics(null);
      return;
    }
    const remainingPoints = getRemainingRoutePoints(routePreview.points, displayedWorkerCoords);
    const remainingDistanceKm = Math.min(
      routePreview.distanceKm,
      Math.max(0, polylineDistanceKm(remainingPoints))
    );
    const durationRatio = routePreview.distanceKm > 0 ? remainingDistanceKm / routePreview.distanceKm : 0;
    const totalDurationMin = routePreview.durationMin + trafficDelayMin;

    setLiveRouteMetrics({
      distanceKm: remainingDistanceKm,
      durationMin: Math.max(0, totalDurationMin * durationRatio),
    });
  }, [displayedWorkerCoords?.lat, displayedWorkerCoords?.lng, routePreview, trafficDelayMin]);

  useEffect(() => {
    if (!selectedRequest && activeRouteRequestId != null) {
      setActiveRouteRequestId(null);
      return;
    }

    if (activeRouteRequestId == null) return;
    const requestStillExists = requests.some((request) => request.id_request === activeRouteRequestId);
    if (!requestStillExists) {
      setActiveRouteRequestId(null);
    }
  }, [requests, selectedRequest, activeRouteRequestId]);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;
    const L = window.L;
    const map = mapInstanceRef.current;

    routeLayersRef.current.forEach((layer) => {
      try {
        map.removeLayer(layer);
      } catch {
        // ignore
      }
    });
    routeLayersRef.current = [];

    if (visibleRoutePoints?.length && displayedWorkerCoords && selectedRequest?.latitude != null && selectedRequest.longitude != null) {
      const routeGlow = L.polyline(visibleRoutePoints, {
        color: '#60a5fa',
        weight: 12,
        opacity: 0.2,
        lineCap: 'round',
        lineJoin: 'round',
        className: 'worker-route-glow',
      }).addTo(map);

      const routeLine = L.polyline(visibleRoutePoints, {
        color: '#2563eb',
        weight: 6,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: isInPageRouteActive ? '20 14' : '14 10',
        className: isInPageRouteActive ? 'worker-route-line worker-route-live' : 'worker-route-line',
      }).addTo(map);

      routeLayersRef.current.push(routeGlow, routeLine);

      const viewportKey = `${selectedRequest.id_request}-${isInPageRouteActive ? 'live' : 'preview'}-${routeCameraMode}`;
      const viewportPoints = isInPageRouteActive && routePreview?.points?.length
        ? (liveViewportPoints || visibleRoutePoints)
        : visibleRoutePoints;
      if (lastRouteViewportKeyRef.current !== viewportKey) {
        focusRouteViewport(map, L, viewportPoints, isInPageRouteActive, routeCameraMode);
        lastRouteViewportKeyRef.current = viewportKey;
      }

      if (trafficEnabled && simulatedTraffic?.segments?.length) {
        simulatedTraffic.segments.forEach((segment) => {
          const visibleTrafficPoints = isInPageRouteActive
            ? getRemainingRoutePoints(segment.points, displayedWorkerCoords)
            : segment.points;
          if (visibleTrafficPoints.length < 2) return;
          const trafficSegment = L.polyline(visibleTrafficPoints, {
            color: segment.color,
            weight: 4,
            opacity: 0.92,
            lineCap: 'round',
            lineJoin: 'round',
            dashArray: '10 14',
            className: 'worker-route-traffic',
          }).addTo(map);
          routeLayersRef.current.push(trafficSegment);
        });
      }
    }
  }, [
    selectedRequest?.id_request,
    selectedRequest?.latitude,
    selectedRequest?.longitude,
    visibleRoutePoints,
    liveViewportPoints,
    routePreview?.points,
    displayedWorkerCoords?.lat,
    displayedWorkerCoords?.lng,
    isInPageRouteActive,
    simulatedTraffic,
    trafficEnabled,
    routeCameraMode,
  ]);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;
    const L = window.L;
    const map = mapInstanceRef.current;

    requestMarkersRef.current.forEach((layer) => {
      try {
        map.removeLayer(layer);
      } catch {
        // ignore
      }
    });
    requestMarkersRef.current = [];

    requests.forEach((request) => {
      if (request.latitude == null || request.longitude == null) return;
      const isSelected = request.id_request === selectedRequest?.id_request;
      const routeEndPoint =
        isSelected && routePreview?.points?.length
          ? routePreview.points[routePreview.points.length - 1]
          : null;
      const point: [number, number] = [
        routeEndPoint ? routeEndPoint[0] : request.latitude,
        routeEndPoint ? routeEndPoint[1] : request.longitude,
      ];

      const marker = isSelected
        ? L.marker(point, {
            icon: createDestinationPinIcon(L, true),
            zIndexOffset: 900,
          })
        : L.circleMarker(point, {
            radius: 7,
            color: '#ffffff',
            weight: 2,
            fillColor: '#0284c7',
            fillOpacity: 0.96,
            className: 'worker-destination-marker',
          });

      marker
        .addTo(map)
        .bindPopup(
          `<b>${request.service_name}</b><br/>$${request.budget.toFixed(2)}<br/>${
            request.distance_km != null ? `${request.distance_km.toFixed(1)} km` : ''
          }`
        );
      marker.on('click', () => setSelectedRequestId(request.id_request));
      requestMarkersRef.current.push(marker);
    });

    if (routePreview?.points?.length && selectedRequest?.latitude != null && selectedRequest.longitude != null) {
      return;
    }

    if (selectedRequest?.latitude != null && selectedRequest.longitude != null) {
      map.setView([selectedRequest.latitude, selectedRequest.longitude], 13);
    } else if (workerCoords) {
      map.setView([workerCoords.lat, workerCoords.lng], 12);
    }
  }, [requests, selectedRequest, workerCoords, routePreview]);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;
    const L = window.L;
    const map = mapInstanceRef.current;

    if (!displayedWorkerCoords) {
      if (workerMarkerRef.current) {
        try {
          map.removeLayer(workerMarkerRef.current);
        } catch {
          // ignore
        }
        workerMarkerRef.current = null;
      }
      return;
    }

    const markerClassName = isInPageRouteActive
      ? 'worker-current-marker worker-current-marker-live'
      : 'worker-current-marker';

    if (
      workerMarkerRef.current &&
      workerMarkerRef.current.__routeActive === isInPageRouteActive
    ) {
      workerMarkerRef.current.setLatLng([displayedWorkerCoords.lat, displayedWorkerCoords.lng]);
      return;
    }

    if (workerMarkerRef.current) {
      try {
        map.removeLayer(workerMarkerRef.current);
      } catch {
        // ignore
      }
      workerMarkerRef.current = null;
    }

    workerMarkerRef.current = L.circleMarker([displayedWorkerCoords.lat, displayedWorkerCoords.lng], {
      radius: 10,
      color: '#ffffff',
      weight: 3,
      fillColor: '#38bdf8',
      fillOpacity: 1,
      className: markerClassName,
    })
      .addTo(map)
      .bindPopup(isInPageRouteActive ? 'You are moving on this route' : 'Your position');
    workerMarkerRef.current.__routeActive = isInPageRouteActive;
  }, [displayedWorkerCoords?.lat, displayedWorkerCoords?.lng, isInPageRouteActive]);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.L || !displayedWorkerCoords || !selectedRequest || !isInPageRouteActive || !routePreview?.points?.length) {
      return;
    }

    const now = Date.now();
    if (now - lastCameraFollowAtRef.current < 1400) return;
    lastCameraFollowAtRef.current = now;

    const map = mapInstanceRef.current;
    const L = window.L;
    const viewportPoints = liveViewportPoints || routePreview.points;
    const timer = window.setTimeout(() => {
      try {
        if (typeof map.stop === 'function') {
          map.stop();
        }
        focusRouteViewport(map, L, viewportPoints, true, routeCameraMode);
      } catch {
        // ignore map animation issues
      }
    }, 80);

    return () => window.clearTimeout(timer);
  }, [
    displayedWorkerCoords?.lat,
    displayedWorkerCoords?.lng,
    selectedRequest?.id_request,
    isInPageRouteActive,
    routePreview?.points,
    liveViewportPoints,
    routeCameraMode,
  ]);

  useEffect(() => {
    if (!isInPageRouteActive || !selectedRequest || !routePreview || !displayedWorkerCoords) {
      setRouteStatusLabel('Idle');
      return;
    }

    const nearestIndex = findNearestPointIndex(displayedWorkerCoords, routePreview.points);
    const nearestPoint = nearestIndex >= 0 ? routePreview.points[nearestIndex] : null;
    const deviationKm = nearestPoint
      ? haversineKm(displayedWorkerCoords, { lat: nearestPoint[0], lng: nearestPoint[1] })
      : 0;
    const remainingDistanceKm = displayedRouteMetrics?.distanceKm ?? routePreview.distanceKm;

    if (routeLoading) {
      setRouteStatusLabel('Rerouting');
      return;
    }

    if (remainingDistanceKm <= 0.08) {
      setRouteStatusLabel('Arrived');
      if (!arrivedAlertedRef.current.has(selectedRequest.id_request)) {
        arrivedAlertedRef.current.add(selectedRequest.id_request);
        showRouteAlert({
          tone: 'success',
          title: 'You are at the destination',
          message: 'You can switch the job to in progress or confirm arrival with the client.',
        });
        notyf.success('Arrived at destination.');
      }
      return;
    }

    if (remainingDistanceKm <= 0.3) {
      setRouteStatusLabel('Nearby');
      if (!arrivalSoonAlertedRef.current.has(selectedRequest.id_request)) {
        arrivalSoonAlertedRef.current.add(selectedRequest.id_request);
        showRouteAlert({
          tone: 'success',
          title: 'Almost there',
          message: 'You are within a few minutes of the client location.',
        });
      }
      return;
    }

    if (deviationKm > 0.12) {
      setRouteStatusLabel('Rerouting');
      if (Date.now() - lastDeviationAlertAtRef.current > 12000) {
        lastDeviationAlertAtRef.current = Date.now();
        showRouteAlert({
          tone: 'warning',
          title: 'Route adjusted',
          message: 'We detected a small deviation and are refreshing your path.',
        });
      }
      return;
    }

    setRouteStatusLabel('Live Route');
  }, [
    isInPageRouteActive,
    selectedRequest?.id_request,
    routePreview,
    displayedWorkerCoords?.lat,
    displayedWorkerCoords?.lng,
    displayedRouteMetrics?.distanceKm,
    routeLoading,
  ]);

  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const timer = window.setTimeout(() => {
      try {
        mapInstanceRef.current.invalidateSize();
      } catch {
        // ignore
      }
    }, 120);

    return () => window.clearTimeout(timer);
  }, [leafletReady, mobileView, selectedRequestId, requests.length, statusFilter]);

  const fetchRequests = async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);

    try {
      const url = `${API_ENDPOINTS.worker.requests}?status=${statusFilter}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload: WorkerRequestsPayload = await res.json();
      if (!res.ok || !payload?.success) {
        if (!silent) notyf.error((payload as any)?.error || 'Could not load requests.');
        return;
      }

      const data = Array.isArray(payload.requests) ? payload.requests : [];
      setRequests(data);
      if (payload.worker_profile?.latitude != null && payload.worker_profile?.longitude != null) {
        const nextCoords = {
          lat: Number(payload.worker_profile.latitude),
          lng: Number(payload.worker_profile.longitude),
        };
        setWorkerCoords((prev) => {
          if (!prev) return nextCoords;
          return haversineKm(prev, nextCoords) < 0.003 ? prev : nextCoords;
        });
      }
      if (payload.worker_profile?.active_request_id) {
        setActiveWorkerRequest({
          id_request: Number(payload.worker_profile.active_request_id),
          status: String(payload.worker_profile.active_request_status || '').toLowerCase(),
        });
      } else {
        setActiveWorkerRequest(null);
      }
      if (data.length > 0 && !selectedRequestId) {
        setSelectedRequestId(data[0].id_request);
      }

      if (statusFilter === 'new') {
        const currentIds = new Set(data.map((r) => r.id_request));
        if (!firstLoadRef.current) {
          let freshCount = 0;
          currentIds.forEach((id) => {
            if (!knownNewIdsRef.current.has(id)) freshCount += 1;
          });
          if (freshCount > 0 && isOnline) {
            notyf.success(`${freshCount} new request(s) nearby.`);
          }
        }
        knownNewIdsRef.current = currentIds;
        firstLoadRef.current = false;
      }
    } catch (error) {
      if (!silent) notyf.error('Network error loading requests.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    firstLoadRef.current = true;
    knownNewIdsRef.current = new Set();
    fetchRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, token]);

  useSSE({
    token,
    events: { request_updated: () => { if (isOnline) fetchRequests(true); } },
    enabled: !!token && isOnline,
  });

  const handleAction = async (idRequest: number, action: 'accept' | 'reject') => {
    if (!token) return;
    setBusyId(idRequest);
    try {
      const endpoint =
        action === 'accept'
          ? API_ENDPOINTS.worker.acceptRequest(idRequest)
          : API_ENDPOINTS.worker.rejectRequest(idRequest);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await res.json();
      if (!res.ok || !payload?.success) {
        if (payload?.active_request_id) {
          setActiveWorkerRequest({
            id_request: Number(payload.active_request_id),
            status: String(payload.active_request_status || '').toLowerCase(),
          });
        }
        notyf.error(payload?.error || `Could not ${action} request.`);
        return;
      }
      notyf.success(action === 'accept' ? 'Request accepted.' : 'Request rejected.');
      await fetchRequests(true);
    } catch {
      notyf.error(`Network error trying to ${action} request.`);
    } finally {
      setBusyId(null);
    }
  };

  const handleRequestProgress = async (idRequest: number, action: 'start' | 'complete') => {
    if (!token) return;
    setBusyId(idRequest);
    try {
      const endpoint =
        action === 'start'
          ? API_ENDPOINTS.worker.startRequest(idRequest)
          : API_ENDPOINTS.worker.completeRequest(idRequest);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await res.json();
      if (!res.ok || !payload?.success) {
        notyf.error(payload?.error || `Could not ${action} this job.`);
        return;
      }

      notyf.success(action === 'start' ? 'Job started.' : 'Job marked as completed.');
      await fetchRequests(true);
    } catch {
      notyf.error(`Network error trying to ${action} this job.`);
    } finally {
      setBusyId(null);
    }
  };

  const openCounterModal = (idRequest: number, currentBudget: number) => {
    setCounterTargetId(idRequest);
    setCounterAmount(String(Math.max(1, Math.round(currentBudget))));
    setCounterNote('');
    setCounterModalOpen(true);
  };

  const toggleInPageRoute = () => {
    if (!selectedRequest || !routePreview || routeLoading) return;

    setActiveRouteRequestId((prev) => {
      const nextId = prev === selectedRequest.id_request ? null : selectedRequest.id_request;

      if (nextId) {
        showRouteAlert({
          tone: 'info',
          title: 'Navigation started',
          message: 'Fixlife will keep the route centered and update your ETA while you move.',
        });
      } else {
        showRouteAlert({
          tone: 'info',
          title: 'Navigation paused',
          message: 'Route tracking was stopped for this request.',
        });
      }

      return nextId;
    });
  };

  const confirmCounterOffer = async () => {
    if (!token || !counterTargetId) return;
    
    const amount = Number(counterAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      notyf.error('Invalid amount. Must be greater than 0.');
      return;
    }

    setBusyId(counterTargetId);
    setCounterModalOpen(false); // Close modal while processing

    try {
      const res = await fetch(API_ENDPOINTS.worker.counterOffer(counterTargetId), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ proposed_budget: amount, counter_message: counterNote }),
      });
      const payload = await res.json();
      if (!res.ok || !payload?.success) {
        if (payload?.active_request_id) {
          setActiveWorkerRequest({
            id_request: Number(payload.active_request_id),
            status: String(payload.active_request_status || '').toLowerCase(),
          });
        }
        notyf.error(payload?.error || 'Could not send counter offer.');
        return;
      }
      notyf.success('Counter offer sent successfully.');
      await fetchRequests(true);
    } catch {
      notyf.error('Network error sending counter offer.');
    } finally {
      setBusyId(null);
      setCounterTargetId(null);
    }
  };

  const pushPresence = async (isOnlineNow: boolean, lat?: number, lng?: number) => {
    if (!token) return;
    try {
      setPresenceBusy(true);
      await fetch(API_ENDPOINTS.worker.presence, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          is_online: isOnlineNow ? 1 : 0,
          lat,
          lng,
        }),
      });
    } catch {
      // silent
    } finally {
      setPresenceBusy(false);
    }
  };

  const fetchRequestChat = async (
    idRequest: number,
    options: { silent?: boolean; incremental?: boolean } = {}
  ) => {
    if (!token) return;
    const silent = options.silent === true;
    const currentChat = chatByRequest[idRequest] || [];
    const afterId = options.incremental ? getLatestChatMessageId(currentChat) : 0;
    const chatUrl =
      afterId > 0
        ? `${API_ENDPOINTS.services.requestChat(idRequest)}?after_id=${afterId}`
        : API_ENDPOINTS.services.requestChat(idRequest);
    try {
      const res = await fetch(chatUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await res.json();
      if (!res.ok || !payload?.success) {
        if (!silent) notyf.error(payload?.error || 'Could not load chat.');
        return;
      }
      const nextChat = Array.isArray(payload.chat) ? payload.chat : [];
      setChatByRequest((prev) => {
        const currentChat = prev[idRequest] || [];
        const mergedChat = afterId > 0 ? mergeChatMessages(currentChat, nextChat) : nextChat;
        const currentLastId = currentChat[currentChat.length - 1]?.id_message ?? null;
        const nextLastId = mergedChat[mergedChat.length - 1]?.id_message ?? null;

        if (currentChat.length === mergedChat.length && currentLastId === nextLastId) {
          return prev;
        }

        return { ...prev, [idRequest]: mergedChat };
      });
    } catch {
      if (!silent) notyf.error('Network error loading chat.');
    }
  };

  const sendChat = async (idRequest: number) => {
    if (!token) return;
    const text = (chatTextByRequest[idRequest] || '').trim();
    const image = chatImageByRequest[idRequest] || null;
    if (!text && !image) return;

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
        notyf.error(payload?.error || 'Could not send message.');
        return;
      }
      setChatTextByRequest((prev) => ({ ...prev, [idRequest]: '' }));
      setChatImageByRequest((prev) => ({ ...prev, [idRequest]: null }));
      const createdMessages = Array.isArray(payload?.messages) ? payload.messages : [];
      if (createdMessages.length > 0) {
        setChatByRequest((prev) => ({
          ...prev,
          [idRequest]: mergeChatMessages(prev[idRequest] || [], createdMessages),
        }));
      } else {
        await fetchRequestChat(idRequest, { silent: true });
      }
    } catch {
      notyf.error('Network error sending chat message.');
    } finally {
      setChatBusyId(null);
    }
  };

  useEffect(() => {
    if (!token) return;

    if (!isOnline) {
      pushPresence(false);
      return;
    }

    let watchId: number | null = null;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = Number(pos.coords.latitude.toFixed(7));
          const lng = Number(pos.coords.longitude.toFixed(7));
          setWorkerCoords({ lat, lng });
          pushPresence(true, lat, lng);
        },
        () => {
          pushPresence(true);
        },
        {
          enableHighAccuracy: true,
          timeout: isInPageRouteActive ? 6000 : 10000,
          maximumAge: isInPageRouteActive ? 2000 : 10000,
        }
      );
    } else {
      pushPresence(true);
    }

    return () => {
      if (watchId != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isOnline, isInPageRouteActive]);

  useEffect(() => {
    if (!selectedRequest?.id_request) return;
    if (!canUseChatWithClient) return;
    if (!chatPanelOpen) return;
    fetchRequestChat(selectedRequest.id_request);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRequest?.id_request, token, canUseChatWithClient, chatPanelOpen]);

  useSSE({
    token,
    events: {
      chat_message: (data: unknown) => {
        const d = data as { id_request?: number } | null;
        if (!selectedRequest?.id_request) return;
        if (!canUseChatWithClient || !chatPanelOpen) return;
        if (d?.id_request == null || d.id_request === selectedRequest.id_request) {
          void fetchRequestChat(selectedRequest.id_request, { silent: true, incremental: true });
        }
      },
    },
    enabled: !!token && !!selectedRequest?.id_request && canUseChatWithClient && chatPanelOpen,
  });

  useEffect(() => {
    if (!selectedRequest?.id_request || !canUseChatWithClient) {
      setChatPanelOpen(false);
    }
  }, [selectedRequest?.id_request, canUseChatWithClient]);

  useEffect(() => {
    if (!chatPanelOpen) return;
    workerChatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chatPanelOpen, selectedRequest?.id_request, selectedRequest ? (chatByRequest[selectedRequest.id_request] || []).length : 0]);

  useEffect(() => {
    setRoutePanelExpanded(false);
  }, [selectedRequest?.id_request]);

  return (
    <>
      <motion.div
        initial={mobileView === 'list' ? { y: 0 } : { y: "100%" }}
        animate={{ y: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className={`w-full h-[60vh] mt-auto md:mt-0 md:h-full md:w-[400px] lg:w-[450px] flex flex-col bg-white/95 backdrop-blur-lg relative z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.15)] md:shadow-2xl overflow-hidden rounded-t-[2rem] md:rounded-none md:border-r border-gray-200 ${
          mobileView === 'map' ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Mobile Drag Handle */}
        <div className="w-full flex justify-center pt-4 pb-0 md:hidden bg-white/95">
            <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
        </div>

        <div className="p-4 border-b border-gray-200 bg-white/95">
          <div className="grid grid-cols-3 gap-2">
            {(['new', 'accepted', 'rejected'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`py-2 px-2 rounded-lg text-xs font-bold uppercase tracking-wide transition ${
                  statusFilter === tab
                    ? 'bg-bird-blue text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="mt-2 text-xs text-gray-500 font-semibold">
            {requestListHint}
          </div>
          {statusFilter === 'new' && activeWorkerRequest && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-[11px] font-bold text-amber-700">Active job in progress</p>
              <p className="mt-1 text-[11px] text-amber-900/80">
                Finish request #{activeWorkerRequest.id_request} before accepting a new one.
              </p>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3 pb-20 md:pb-4">
          {loading ? (
            <div className="rounded-2xl border border-bird-blue/10 bg-white/85 px-4 py-6 text-center shadow-sm">
              <div className="mx-auto h-3.5 w-3.5 rounded-full border-2 border-bird-blue/25 border-t-bird-blue animate-spin" />
              <p className="mt-3 text-[11px] font-black uppercase tracking-[0.18em] text-bird-blue">Refreshing requests</p>
              <p className="mt-1 text-sm text-slate-500">We are syncing nearby leads for you.</p>
            </div>
          ) : requests.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 opacity-70">
              <h3 className="text-lg font-bold text-gray-900 mb-2">No requests in this tab</h3>
              <p className="text-sm text-gray-600">Try another tab or keep online for new requests.</p>
            </div>
          ) : (
            requests.map((req) => {
              const selected = req.id_request === selectedRequest?.id_request;
              const actionLockedByActiveJob =
                statusFilter === 'new' &&
                !!activeWorkerRequest &&
                activeWorkerRequest.id_request !== req.id_request;
              return (
                <div
                  key={req.id_request}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedRequestId(req.id_request)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedRequestId(req.id_request);
                    }
                  }}
                  className={`w-full text-left rounded-2xl p-4 border transition shadow-sm ${
                    selected
                      ? 'border-bird-blue bg-bird-blue/5'
                      : 'border-gray-200 bg-white hover:border-bird-orange/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-bold text-gray-900 text-base truncate">
                        {req.service_icon || 'Fix'} {req.service_name}
                      </h3>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <p className="text-xs text-gray-500">
                          {req.distance_km != null ? `${req.distance_km.toFixed(1)} km` : 'No distance'}
                        </p>
                        {statusFilter !== 'new' && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                            {workerRequestStatusLabel(req.request_status)}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="font-black text-bird-orange text-lg">${req.budget.toFixed(0)}</span>
                  </div>

                  <p className="text-sm text-gray-700 mt-2 line-clamp-2">{req.description}</p>
                  <p className="text-xs text-gray-500 mt-2 truncate">{req.location_text}</p>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {statusFilter === 'new' ? (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAction(req.id_request, 'reject');
                          }}
                          disabled={busyId === req.id_request || actionLockedByActiveJob}
                          className="py-2 rounded-lg bg-gray-100 text-gray-700 font-bold text-xs hover:bg-gray-200 disabled:opacity-50"
                        >
                          Reject
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openCounterModal(req.id_request, req.budget);
                          }}
                          disabled={busyId === req.id_request || actionLockedByActiveJob}
                          className="py-2 rounded-lg bg-amber-500 text-white font-bold text-xs hover:bg-amber-600 disabled:opacity-50 transition-colors"
                        >
                          Counter
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAction(req.id_request, 'accept');
                          }}
                          disabled={busyId === req.id_request || actionLockedByActiveJob}
                          className="py-2 rounded-lg bg-bird-blue text-white font-bold text-xs hover:bg-bird-darkBlue disabled:opacity-50"
                        >
                          Accept
                        </button>
                      </>
                    ) : req.request_status === 'assigned' ? (
                      <button
                        type="button"
                        disabled
                        className="col-span-3 py-2 rounded-lg bg-sky-100 text-sky-700 font-bold text-xs cursor-not-allowed"
                      >
                        Waiting for client approval
                      </button>
                    ) : req.request_status === 'payment_pending' ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRequestId(req.id_request);
                          setActiveRouteRequestId(req.id_request);
                        }}
                        className="col-span-3 py-2 rounded-lg bg-emerald-500 text-white font-bold text-xs hover:bg-emerald-600 disabled:opacity-50"
                        disabled={busyId === req.id_request}
                      >
                        Open In-App Route
                      </button>
                    ) : req.request_status === 'paid' ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRequestProgress(req.id_request, 'start');
                        }}
                        disabled={busyId === req.id_request}
                        className="col-span-3 py-2 rounded-lg bg-emerald-500 text-white font-bold text-xs hover:bg-emerald-600 disabled:opacity-50"
                      >
                        {busyId === req.id_request ? 'Starting...' : 'Start Job'}
                      </button>
                    ) : req.request_status === 'in_progress' ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRequestProgress(req.id_request, 'complete');
                        }}
                        disabled={busyId === req.id_request}
                        className="col-span-3 py-2 rounded-lg bg-violet-600 text-white font-bold text-xs hover:bg-violet-700 disabled:opacity-50"
                      >
                        {busyId === req.id_request ? 'Saving...' : 'Mark Work Done'}
                      </button>
                    ) : req.request_status === 'awaiting_confirmation' ? (
                      <button
                        type="button"
                        disabled
                        className="col-span-3 py-2 rounded-lg bg-violet-100 text-violet-700 font-bold text-xs cursor-not-allowed"
                      >
                        Waiting for client confirmation
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRequestId(req.id_request);
                          setActiveRouteRequestId(req.id_request);
                        }}
                        className="col-span-3 py-2 rounded-lg bg-emerald-500 text-white font-bold text-xs hover:bg-emerald-600 disabled:opacity-50"
                        disabled={busyId === req.id_request}
                      >
                        Open In-App Route
                      </button>
                    )}
                  </div>
                  {statusFilter === 'new' && actionLockedByActiveJob && (
                    <p className="mt-2 text-[11px] font-semibold text-amber-700">
                      Finish your current active job before taking another request.
                    </p>
                  )}
                  {req.proposed_budget != null && (
                    <p className="text-xs text-amber-700 font-semibold mt-2">
                      Counter offer: ${req.proposed_budget.toFixed(2)}{req.counter_message ? ` - ${req.counter_message}` : ''}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </motion.div>

      <div className={`flex-1 relative overflow-hidden ${mobileView === 'map' ? 'block' : 'hidden md:block'}`}>
        <div className="absolute inset-0 z-0 bg-gray-100">
          <div ref={mapContainerRef} className="absolute inset-0 z-0" />
          {!leafletReady && <div className="absolute right-4 top-4 z-[500] h-2.5 w-2.5 rounded-full bg-bird-blue/40 animate-pulse" />}
        </div>

        <div className="pointer-events-none absolute inset-0 z-[120]">
          <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-white/80 via-white/25 to-transparent" />
          <div className="absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-white/35 via-white/10 to-transparent md:w-40" />
          <div className="absolute inset-y-0 right-0 hidden w-40 bg-gradient-to-l from-white/35 via-white/10 to-transparent lg:block" />
        </div>

        {selectedRequest && (
          <div className="absolute left-4 top-4 z-[500] w-[340px] max-w-[calc(100%-2rem)] pointer-events-auto">
            <div className="rounded-[2rem] border border-white/75 bg-white/92 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur-xl">
              <div className="flex items-start justify-between gap-3">
                <div className="inline-flex items-center gap-2 rounded-full bg-bird-blue/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-bird-blue">
                  <span className="h-2 w-2 rounded-full bg-bird-yellow" />
                  Route ready
                </div>
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-black text-amber-800">
                    ${selectedRequest.budget.toFixed(0)}
                  </div>
                  <button
                    type="button"
                    onClick={() => setRoutePanelExpanded((prev) => !prev)}
                    className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600 transition hover:bg-slate-200"
                  >
                    {routePanelExpanded ? 'Hide' : 'Details'}
                  </button>
                </div>
              </div>

              <div className="mt-4 flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-bird-blue to-sky-500 text-xl font-black text-white shadow-[0_14px_30px_rgba(0,144,255,0.25)]">
                  {selectedServiceIcon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-xl font-black text-slate-950">{selectedRequest.service_name}</h3>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-600">{selectedRequest.description}</p>
                    </div>
                    <span className="whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-700">
                      {workerRequestStatusLabel(selectedRequest.request_status)}
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-xs font-medium text-slate-500">{selectedLocationCompact}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-blue-100 bg-blue-50/90 px-3 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-blue-700">ETA</p>
                  <p className="mt-1 text-lg font-black text-blue-950">{routeEtaLabel}</p>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/90 px-3 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Distance</p>
                  <p className="mt-1 text-lg font-black text-emerald-950">{routeDistanceLabel}</p>
                </div>
                <div className="rounded-2xl border border-amber-100 bg-amber-50/90 px-3 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Status</p>
                  <p className="mt-1 text-sm font-black text-amber-950">{routeStatusDisplayLabel}</p>
                </div>
              </div>

              {routeError && (
                <p className="mt-3 text-[11px] font-semibold text-amber-700">{routeError}</p>
              )}

              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  disabled={!routePreview || routeLoading || !canWorkerTravelToClient}
                  onClick={toggleInPageRoute}
                  className={`rounded-2xl py-3 text-sm font-black transition ${
                    isInPageRouteActive
                      ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      : 'bg-bird-blue text-white shadow-[0_14px_34px_rgba(0,144,255,0.26)] hover:bg-bird-darkBlue'
                  } disabled:opacity-50`}
                >
                  {!canWorkerTravelToClient ? 'Waiting approval' : isInPageRouteActive ? 'Pause route' : 'Start Route'}
                </button>
                <button
                  type="button"
                  onClick={() => setRoutePanelExpanded((prev) => !prev)}
                  className="rounded-2xl bg-slate-100 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-200"
                >
                  {routePanelExpanded ? 'Compact view' : 'Route tools'}
                </button>
              </div>

              <AnimatePresence initial={false}>
                {routePanelExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, y: -8 }}
                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -8 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/85 p-1">
                      <div className="grid grid-cols-2 gap-1">
                        <button
                          type="button"
                          onClick={() => setRouteCameraMode('balanced')}
                          className={`rounded-[1rem] px-3 py-2 text-[11px] font-black transition ${
                            routeCameraMode === 'balanced'
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-500 hover:bg-white/70'
                          }`}
                        >
                          Balanced
                        </button>
                        <button
                          type="button"
                          onClick={() => setRouteCameraMode('close')}
                          className={`rounded-[1rem] px-3 py-2 text-[11px] font-black transition ${
                            routeCameraMode === 'close'
                              ? 'bg-bird-blue text-white shadow-sm'
                              : 'text-slate-500 hover:bg-white/70'
                          }`}
                        >
                          Close Follow
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <button
                        disabled={!routePreview}
                        onClick={() => {
                          if (!mapInstanceRef.current || !window.L || !routePreview) return;
                          focusRouteViewport(mapInstanceRef.current, window.L, routePreview.points, isInPageRouteActive, routeCameraMode);
                        }}
                        className="rounded-2xl bg-slate-100 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-200 disabled:opacity-50"
                      >
                        Center Route
                      </button>
                      <button
                        type="button"
                        onClick={() => setChatPanelOpen(true)}
                        disabled={!canUseChatWithClient}
                        className="rounded-2xl border border-bird-blue/20 bg-white py-3 text-sm font-black text-bird-blue transition hover:bg-bird-blue/5 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Open chat
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/85 px-3 py-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Traffic</p>
                        <p className="mt-1 text-xs font-semibold text-slate-700">
                          {trafficEnabled && simulatedTraffic
                            ? `${simulatedTraffic.level} demo +${Math.ceil(simulatedTraffic.delayMin)} min`
                            : 'Simulation off'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTrafficEnabled((prev) => !prev)}
                        className={`relative inline-flex h-7 w-14 items-center rounded-full transition ${
                          trafficEnabled ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                            trafficEnabled ? 'translate-x-8' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    {selectedRequest.request_status === 'assigned' && (
                      <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-sky-700">Client review</p>
                        <p className="mt-1 text-[11px] text-sky-900/80">
                          The client is reviewing your profile and portfolio before approving you for this job.
                        </p>
                      </div>
                    )}

                    {selectedRequest.request_status === 'payment_pending' && (
                      <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">Payment pending</p>
                        <p className="mt-1 text-[11px] text-amber-900/80">
                          The client approved you. You can open the route now while payment is being secured.
                        </p>
                      </div>
                    )}

                    {selectedRequest.request_status === 'awaiting_confirmation' && (
                      <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50 px-3 py-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-700">Client confirmation</p>
                        <p className="mt-1 text-[11px] text-violet-900/80">
                          The client now needs to confirm the completed job.
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="mt-3">
                {selectedRequest.request_status === 'paid' ? (
                  <button
                    type="button"
                    onClick={() => handleRequestProgress(selectedRequest.id_request, 'start')}
                    disabled={busyId === selectedRequest.id_request}
                    className="w-full rounded-2xl bg-bird-blue py-3 text-sm font-black text-white shadow-[0_14px_34px_rgba(0,144,255,0.26)] transition hover:bg-bird-darkBlue disabled:opacity-50"
                  >
                    {busyId === selectedRequest.id_request ? 'Starting...' : 'Start Job'}
                  </button>
                ) : selectedRequest.request_status === 'in_progress' ? (
                  <button
                    type="button"
                    onClick={() => handleRequestProgress(selectedRequest.id_request, 'complete')}
                    disabled={busyId === selectedRequest.id_request}
                    className="w-full rounded-2xl bg-bird-blue py-3 text-sm font-black text-white shadow-[0_14px_34px_rgba(0,144,255,0.26)] transition hover:bg-bird-darkBlue disabled:opacity-50"
                  >
                    {busyId === selectedRequest.id_request ? 'Saving...' : 'Finish Job'}
                  </button>
                ) : (
                  <div className="flex items-center justify-center rounded-2xl bg-slate-100 px-3 py-3 text-center text-xs font-bold text-slate-600">
                    {canUseChatWithClient ? 'Chat ready' : 'Chat unlocks once the request is assigned to you'}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <AnimatePresence>
          {routeAlert && (
            <motion.div
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.96 }}
              className="absolute right-4 top-[304px] z-[520] hidden w-[300px] pointer-events-none xl:block"
            >
              <div className={`rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-xl ${
                routeAlert.tone === 'success'
                  ? 'border-emerald-200 bg-emerald-50/95'
                  : routeAlert.tone === 'warning'
                    ? 'border-amber-200 bg-amber-50/95'
                    : 'border-blue-200 bg-blue-50/95'
              }`}>
                <p className={`text-[10px] font-black uppercase tracking-[0.22em] ${
                  routeAlert.tone === 'success'
                    ? 'text-emerald-700'
                    : routeAlert.tone === 'warning'
                      ? 'text-amber-700'
                      : 'text-blue-700'
                }`}>
                  Route alert
                </p>
                <h4 className="mt-1 text-sm font-black text-gray-900">{routeAlert.title}</h4>
                <p className="mt-1 text-xs font-medium text-gray-700">{routeAlert.message}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {selectedRequest && chatPanelOpen && canUseChatWithClient && (
            <motion.div
              initial={{ opacity: 0, x: 22, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 22, scale: 0.98 }}
              className="absolute bottom-5 right-4 z-[520] w-[340px] max-w-[calc(100%-2rem)] pointer-events-auto"
            >
              <div className="rounded-[1.8rem] border border-white/75 bg-white/95 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.18)] backdrop-blur-xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-bird-blue">Client chat</p>
                    <h4 className="mt-1 text-sm font-black text-slate-950">{selectedRequest.service_name}</h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setChatPanelOpen(false)}
                    className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600 transition hover:bg-slate-200"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-4 max-h-52 space-y-2 overflow-y-auto pr-1">
                  {(chatByRequest[selectedRequest.id_request] || []).length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-[11px] font-semibold text-slate-500">
                      Chat ready. Send the first update to your client.
                    </div>
                  ) : (chatByRequest[selectedRequest.id_request] || []).slice(-30).map((msg) => (
                    <div
                      key={msg.id_message}
                      className={`rounded-2xl px-3 py-2 text-[11px] ${
                        msg.sender_role === 'worker' ? 'bg-bird-blue/10' : 'bg-emerald-100/70'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-bold">{msg.sender_role === 'worker' ? 'You' : 'Client'}</span>
                        <span className="text-[10px] font-medium text-slate-400">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {msg.message ? <p className="mt-1 leading-relaxed">{msg.message}</p> : null}
                      {msg.image_url && (
                        <a href={msg.image_url} target="_blank" rel="noreferrer" className="mt-2 block overflow-hidden rounded-xl border border-white/70 shadow-sm">
                          <img src={msg.image_url} alt="Chat attachment" className="max-h-40 w-full object-cover" />
                        </a>
                      )}
                    </div>
                  ))}
                  <div ref={workerChatEndRef} />
                </div>

                <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                  <input
                    id={`worker-chat-input-${selectedRequest.id_request}`}
                    value={chatTextByRequest[selectedRequest.id_request] || ''}
                    onChange={(e) => setChatTextByRequest((prev) => ({ ...prev, [selectedRequest.id_request]: e.target.value }))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void sendChat(selectedRequest.id_request);
                      }
                    }}
                    placeholder="Message..."
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-bird-blue/30"
                  />
                  <button
                    onClick={() => sendChat(selectedRequest.id_request)}
                    disabled={chatBusyId === selectedRequest.id_request}
                    className="rounded-xl bg-bird-blue px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
                {chatImageByRequest[selectedRequest.id_request] && (
                  <div className="mt-2 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
                    <span className="truncate">{chatImageByRequest[selectedRequest.id_request]?.name}</span>
                    <button
                      type="button"
                      onClick={() => setChatImageByRequest((prev) => ({ ...prev, [selectedRequest.id_request]: null }))}
                      className="ml-auto rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-slate-500 transition hover:bg-slate-100"
                    >
                      Remove
                    </button>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={(e) => setChatImageByRequest((prev) => ({ ...prev, [selectedRequest.id_request]: e.target.files?.[0] || null }))}
                  className="mt-2 text-[10px]"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Custom Counter Offer Modal */}
      <AnimatePresence>
        {counterModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-gray-200"
            >
              <h3 className="text-xl font-black text-gray-900 mb-2">Counter Offer</h3>
              <p className="text-sm text-gray-500 mb-6">Propose a new price for this job. The client will review it.</p>
              
              <label className="block text-xs uppercase tracking-wider font-bold text-gray-500 mb-2">New Budget (USD)</label>
              <div className="relative mb-4">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-900 font-bold text-lg">$</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={counterAmount}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    if (nextValue === '') {
                      setCounterAmount('');
                      return;
                    }

                    const parsed = Number(nextValue);
                    if (!Number.isFinite(parsed) || parsed < 0) {
                      return;
                    }

                    setCounterAmount(nextValue);
                  }}
                  className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl py-3 pl-10 pr-4 text-gray-900 font-bold focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              <label className="block text-xs uppercase tracking-wider font-bold text-gray-500 mb-2">Note (Optional)</label>
              <textarea
                value={counterNote}
                onChange={(e) => setCounterNote(e.target.value)}
                maxLength={255}
                placeholder="Explain why the price changed..."
                className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl py-3 px-4 resize-none h-24 text-sm focus:outline-none focus:border-amber-500 transition-colors mb-6"
              />

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCounterModalOpen(false)}
                  className="py-3 rounded-xl border-2 border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmCounterOffer}
                  className="py-3 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-white font-bold shadow-lg shadow-amber-500/30 hover:shadow-xl transition-all"
                >
                  Send Offer
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};


