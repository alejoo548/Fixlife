import { useEffect, useMemo, useRef, useState } from 'react';
import { addResilientTileLayer, loadLeaflet } from '../../../utils/leafletLoader';
import type {
  RouteAlert,
  SimulatedTrafficSummary,
  WorkerRequest,
} from './workerRequestTypes';
import {
  buildSimulatedTraffic,
  createDestinationPinIcon,
  focusRouteViewport,
  getRemainingRoutePoints,
  haversineKm,
  isValidCoord,
  isValidLatLngList,
  isValidLatLngTuple,
  polylineDistanceKm,
  toFiniteNumber,
} from './workerRequestUtils';

type Coordinates = { lat: number; lng: number };
type RoutePreview = {
  points: [number, number][];
  distanceKm: number;
  durationMin: number;
};

interface UseWorkerRequestsMapOptions {
  active: boolean;
  activeRouteRequestId: number | null;
  mobileView: 'list' | 'map';
  requests: WorkerRequest[];
  selectedRequest: WorkerRequest | null;
  selectedRequestId: number | null;
  statusFilter: 'new' | 'accepted' | 'rejected';
  workerCoords: Coordinates | null;
  onActiveRouteChange: (idRequest: number | null) => void;
  onSelectRequest: (idRequest: number) => void;
}

const FALLBACK_CENTER: [number, number] = [13.6929, -89.2182];

const nearestRouteDistanceKm = (position: Coordinates, points: [number, number][]) =>
  points.reduce((nearest, point) => {
    const distance = haversineKm(position, { lat: point[0], lng: point[1] });
    return Math.min(nearest, distance);
  }, Number.POSITIVE_INFINITY);

export const useWorkerRequestsMap = ({
  active,
  activeRouteRequestId,
  mobileView,
  requests,
  selectedRequest,
  selectedRequestId,
  statusFilter,
  workerCoords,
  onActiveRouteChange,
  onSelectRequest,
}: UseWorkerRequestsMapOptions) => {
  const [leafletReady, setLeafletReady] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [routePreview, setRoutePreview] = useState<RoutePreview | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [trafficEnabled, setTrafficEnabled] = useState(true);
  const [simulatedTraffic, setSimulatedTraffic] = useState<SimulatedTrafficSummary | null>(null);
  const [routeAlert, setRouteAlert] = useState<RouteAlert | null>(null);
  const [routeCameraMode, setRouteCameraMode] = useState<'balanced' | 'close'>('close');
  const [routeStatusLabel, setRouteStatusLabel] =
    useState<'Idle' | 'Live Route' | 'Rerouting' | 'Nearby' | 'Arrived'>('Idle');

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const routeLayersRef = useRef<any[]>([]);
  const requestMarkersRef = useRef<any[]>([]);
  const workerMarkerRef = useRef<any>(null);
  const routeAbortRef = useRef<AbortController | null>(null);
  const alertTimerRef = useRef<number | null>(null);
  const lastRouteFetchRef = useRef({ requestId: 0, lat: 0, lng: 0, at: 0 });
  const lastViewportKeyRef = useRef<string | null>(null);
  const arrivalSoonRef = useRef<Set<number>>(new Set());
  const arrivedRef = useRef<Set<number>>(new Set());
  const hasCenteredOnWorkerRef = useRef(false);

  const selectedRequestCoords = useMemo(() => {
    const lat = toFiniteNumber(selectedRequest?.latitude);
    const lng = toFiniteNumber(selectedRequest?.longitude);
    return lat == null || lng == null ? null : { lat, lng };
  }, [selectedRequest?.latitude, selectedRequest?.longitude]);
  const routeActive =
    !!selectedRequest && activeRouteRequestId === selectedRequest.id_request;
  const trafficDelayMin = trafficEnabled ? simulatedTraffic?.delayMin ?? 0 : 0;
  const remainingPoints = useMemo(
    () =>
      routePreview
        ? routeActive
          ? getRemainingRoutePoints(routePreview.points, workerCoords)
          : routePreview.points
        : null,
    [routeActive, routePreview, workerCoords?.lat, workerCoords?.lng]
  );
  const displayedRouteMetrics = useMemo(() => {
    if (!routePreview) return null;
    if (!routeActive || !isValidCoord(workerCoords)) {
      return {
        distanceKm: routePreview.distanceKm,
        durationMin: routePreview.durationMin + trafficDelayMin,
      };
    }
    const points = getRemainingRoutePoints(routePreview.points, workerCoords);
    const distanceKm = Math.min(routePreview.distanceKm, polylineDistanceKm(points));
    const ratio = routePreview.distanceKm > 0 ? distanceKm / routePreview.distanceKm : 0;
    return {
      distanceKm,
      durationMin: (routePreview.durationMin + trafficDelayMin) * ratio,
    };
  }, [routeActive, routePreview, trafficDelayMin, workerCoords?.lat, workerCoords?.lng]);

  const showRouteAlert = (alert: RouteAlert) => {
    setRouteAlert(alert);
    if (alertTimerRef.current) window.clearTimeout(alertTimerRef.current);
    alertTimerRef.current = window.setTimeout(() => setRouteAlert(null), 4800);
  };

  useEffect(() => {
    void loadLeaflet('worker-requests').then(setLeafletReady).catch(console.error);
  }, []);

  useEffect(() => {
    if (!leafletReady || !mapContainerRef.current || !window.L || mapInstanceRef.current) return;

    let cancelled = false;
    const initTimer = window.setTimeout(() => {
      if (cancelled || !mapContainerRef.current || !window.L || mapInstanceRef.current) return;
      const L = window.L;
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: true,
        preferCanvas: true,
        maxZoom: 17,
      }).setView(FALLBACK_CENTER, 12);
      addResilientTileLayer(L, map);
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      mapInstanceRef.current = map;
      // Flip state so marker/route/request effects re-run now that the map
      // exists. Without this, any data (coords, requests, route) that was ready
      // before this async init never gets drawn until an unrelated dep changes.
      setMapReady(true);
    }, 50);

    return () => {
      cancelled = true;
      window.clearTimeout(initTimer);
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch {
          // Leaflet may already be detached during hot reload.
        }
        mapInstanceRef.current = null;
      }
      setMapReady(false);
    };
  }, [leafletReady]);

  useEffect(() => {
    if (active) return;
    onActiveRouteChange(null);
    setRoutePreview(null);
    setRouteError(null);
    setRouteAlert(null);
  }, [active]);

  useEffect(() => {
    if (!activeRouteRequestId) return;
    if (!requests.some((request) => request.id_request === activeRouteRequestId)) {
      onActiveRouteChange(null);
    }
  }, [activeRouteRequestId, onActiveRouteChange, requests]);

  useEffect(() => {
    if (!isValidCoord(workerCoords) || !selectedRequest || !selectedRequestCoords) {
      setRoutePreview(null);
      setRouteError(selectedRequest && !selectedRequestCoords ? 'Client location is missing for this request.' : null);
      return;
    }

    const now = Date.now();
    const last = lastRouteFetchRef.current;
    const movedKm = haversineKm(workerCoords, { lat: last.lat, lng: last.lng });
    const unchanged = last.requestId === selectedRequest.id_request;
    if (unchanged && movedKm < (routeActive ? 0.12 : 0.08) && now - last.at < (routeActive ? 60_000 : 12_000)) {
      return;
    }

    routeAbortRef.current?.abort();
    const controller = new AbortController();
    routeAbortRef.current = controller;
    lastRouteFetchRef.current = {
      requestId: selectedRequest.id_request,
      lat: workerCoords.lat,
      lng: workerCoords.lng,
      at: now,
    };
    const fallback = (): RoutePreview => {
      const distanceKm = haversineKm(workerCoords, selectedRequestCoords);
      return {
        points: [
          [workerCoords.lat, workerCoords.lng],
          [selectedRequestCoords.lat, selectedRequestCoords.lng],
        ],
        distanceKm,
        durationMin: distanceKm * 2.4,
      };
    };

    const loadRoute = async () => {
      setRouteLoading(true);
      setRouteError(null);
      try {
        const params = new URLSearchParams({
          overview: 'full',
          geometries: 'geojson',
          steps: 'false',
        });
        const url = `https://router.project-osrm.org/route/v1/driving/${workerCoords.lng},${workerCoords.lat};${selectedRequestCoords.lng},${selectedRequestCoords.lat}?${params}`;
        const timeout = window.setTimeout(() => controller.abort(), 6000);
        const response = await fetch(url, { signal: controller.signal });
        window.clearTimeout(timeout);
        const payload = await response.json().catch(() => null);
        const route = payload?.routes?.[0];
        if (!response.ok || !route?.geometry?.coordinates?.length) {
          setRoutePreview(fallback());
          return;
        }
        const points = route.geometry.coordinates
          .map(([lng, lat]: [number, number]) => [Number(lat), Number(lng)] as [number, number])
          .filter(isValidLatLngTuple);
        if (points.length < 2) {
          setRoutePreview(fallback());
          return;
        }
        if (haversineKm(workerCoords, { lat: points[0][0], lng: points[0][1] }) > 0.02) {
          points.unshift([workerCoords.lat, workerCoords.lng]);
        }
        const end = points[points.length - 1];
        if (haversineKm(selectedRequestCoords, { lat: end[0], lng: end[1] }) > 0.02) {
          points.push([selectedRequestCoords.lat, selectedRequestCoords.lng]);
        }
        const routedDistanceKm = Number(route.distance || 0) / 1000;
        const distanceKm = Math.max(polylineDistanceKm(points), routedDistanceKm);
        const routedDurationMin = Number(route.duration || 0) / 60;
        setRoutePreview({
          points,
          distanceKm,
          durationMin:
            routedDistanceKm > 0
              ? routedDurationMin * (distanceKm / routedDistanceKm)
              : routedDurationMin,
        });
      } catch {
        if (!controller.signal.aborted || routeAbortRef.current === controller) {
          setRoutePreview(fallback());
        }
      } finally {
        if (routeAbortRef.current === controller) setRouteLoading(false);
      }
    };
    void loadRoute();
    return () => controller.abort();
  }, [
    routeActive,
    selectedRequest?.id_request,
    selectedRequestCoords?.lat,
    selectedRequestCoords?.lng,
    workerCoords?.lat,
    workerCoords?.lng,
  ]);

  useEffect(() => {
    setSimulatedTraffic(
      routePreview && selectedRequest
        ? buildSimulatedTraffic(selectedRequest.id_request, routePreview.points, routePreview.distanceKm)
        : null
    );
  }, [routePreview, selectedRequest?.id_request]);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;
    const map = mapInstanceRef.current;
    const L = window.L;
    routeLayersRef.current.forEach((layer) => {
      try {
        map.removeLayer(layer);
      } catch {}
    });
    routeLayersRef.current = [];
    if (!isValidLatLngList(remainingPoints) || !selectedRequestCoords) return;

    const glow = L.polyline(remainingPoints, {
      color: '#60a5fa',
      weight: 12,
      opacity: 0.2,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);
    const line = L.polyline(remainingPoints, {
      color: '#2563eb',
      weight: 6,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
      dashArray: routeActive ? '20 14' : '14 10',
    }).addTo(map);
    routeLayersRef.current.push(glow, line);

    if (trafficEnabled) {
      simulatedTraffic?.segments.forEach((segment) => {
        const points = routeActive
          ? getRemainingRoutePoints(segment.points, workerCoords)
          : segment.points;
        if (points.length < 2) return;
        const layer = L.polyline(points, {
          color: segment.color,
          weight: 4,
          opacity: 0.92,
          dashArray: '10 14',
        }).addTo(map);
        routeLayersRef.current.push(layer);
      });
    }
    const viewportKey = `${selectedRequest?.id_request}-${routeActive}-${routeCameraMode}`;
    if (lastViewportKeyRef.current !== viewportKey) {
      focusRouteViewport(map, L, remainingPoints, routeActive, routeCameraMode);
      lastViewportKeyRef.current = viewportKey;
    }
  }, [mapReady, remainingPoints, routeActive, routeCameraMode, simulatedTraffic, trafficEnabled]);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;
    const map = mapInstanceRef.current;
    const L = window.L;
    requestMarkersRef.current.forEach((marker) => {
      try {
        map.removeLayer(marker);
      } catch {}
    });
    requestMarkersRef.current = [];
    requests.forEach((request) => {
      const lat = toFiniteNumber(request.latitude);
      const lng = toFiniteNumber(request.longitude);
      if (lat == null || lng == null) return;
      const selected = request.id_request === selectedRequest?.id_request;
      const marker = selected
        ? L.marker([lat, lng], { icon: createDestinationPinIcon(L, true), zIndexOffset: 900 })
        : L.circleMarker([lat, lng], {
            radius: 7,
            color: '#fff',
            weight: 2,
            fillColor: '#0284c7',
            fillOpacity: 0.96,
          });
      marker
        .addTo(map)
        .bindPopup(`<b>${request.service_name}</b><br/>$${request.budget.toFixed(2)}`)
        .on('click', () => onSelectRequest(request.id_request));
      requestMarkersRef.current.push(marker);
    });
  }, [mapReady, onSelectRequest, requests, selectedRequest?.id_request]);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.L) return;
    const map = mapInstanceRef.current;
    if (!isValidCoord(workerCoords)) {
      if (workerMarkerRef.current) map.removeLayer(workerMarkerRef.current);
      workerMarkerRef.current = null;
      return;
    }
    if (!workerMarkerRef.current) {
      workerMarkerRef.current = window.L
        .circleMarker([workerCoords.lat, workerCoords.lng], {
          radius: 10,
          color: '#fff',
          weight: 3,
          fillColor: '#38bdf8',
          fillOpacity: 1,
        })
        .addTo(map)
        .bindPopup('Your current GPS position');
    } else {
      workerMarkerRef.current.setLatLng([workerCoords.lat, workerCoords.lng]);
    }
    if (routeActive && isValidLatLngList(remainingPoints)) {
      focusRouteViewport(map, window.L, remainingPoints, true, routeCameraMode);
    } else if (!routePreview && !hasCenteredOnWorkerRef.current) {
      // Center on the worker only the first time we get a fix. Re-centering on
      // every GPS update fights the user panning the map and causes jank on
      // low-power devices (Raspberry Pi).
      map.setView([workerCoords.lat, workerCoords.lng], 12);
      hasCenteredOnWorkerRef.current = true;
    }
  }, [mapReady, remainingPoints, routeActive, routeCameraMode, routePreview, workerCoords?.lat, workerCoords?.lng]);

  useEffect(() => {
    if (!routeActive || !selectedRequest || !routePreview || !isValidCoord(workerCoords)) {
      setRouteStatusLabel('Idle');
      return;
    }
    const remainingKm = displayedRouteMetrics?.distanceKm ?? routePreview.distanceKm;
    if (remainingKm <= 0.08) {
      setRouteStatusLabel('Arrived');
      if (!arrivedRef.current.has(selectedRequest.id_request)) {
        arrivedRef.current.add(selectedRequest.id_request);
        showRouteAlert({
          tone: 'success',
          title: 'You are at the destination',
          message: 'Confirm arrival with the client before starting the work.',
        });
      }
    } else if (remainingKm <= 0.3) {
      setRouteStatusLabel('Nearby');
      if (!arrivalSoonRef.current.has(selectedRequest.id_request)) {
        arrivalSoonRef.current.add(selectedRequest.id_request);
        showRouteAlert({
          tone: 'success',
          title: 'Almost there',
          message: 'You are within a few minutes of the client location.',
        });
      }
    } else if (nearestRouteDistanceKm(workerCoords, routePreview.points) > 0.12) {
      setRouteStatusLabel('Rerouting');
    } else {
      setRouteStatusLabel('Live Route');
    }
  }, [displayedRouteMetrics?.distanceKm, routeActive, routePreview, selectedRequest, workerCoords]);

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const timer = window.setTimeout(() => mapInstanceRef.current?.invalidateSize(), 120);
    return () => window.clearTimeout(timer);
  }, [leafletReady, mobileView, requests.length, selectedRequestId, statusFilter]);

  useEffect(
    () => () => {
      routeAbortRef.current?.abort();
      if (alertTimerRef.current) window.clearTimeout(alertTimerRef.current);
    },
    []
  );

  const centerRoute = () => {
    if (!mapInstanceRef.current || !window.L || !routePreview) return;
    focusRouteViewport(
      mapInstanceRef.current,
      window.L,
      routePreview.points,
      routeActive,
      routeCameraMode
    );
  };

  return {
    centerRoute,
    displayedRouteMetrics,
    leafletReady,
    mapContainerRef,
    mapInstanceRef,
    routeActive,
    routeAlert,
    routeCameraMode,
    routeError,
    routeLoading,
    routePreview,
    routeStatusLabel,
    setRouteCameraMode,
    setTrafficEnabled,
    showRouteAlert,
    simulatedTraffic,
    trafficEnabled,
  };
};
