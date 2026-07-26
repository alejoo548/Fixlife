import type {
  ChatMessage,
  SimulatedTrafficSegment,
  SimulatedTrafficSummary,
  WorkerRequest,
} from './workerRequestTypes';

export const getLatestChatMessageId = (messages: ChatMessage[]) =>
  messages.length > 0 ? Number(messages[messages.length - 1].id_message || 0) : 0;

export const toFiniteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const isValidCoord = (coords: { lat: number; lng: number } | null | undefined) =>
  !!coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng);

export const isValidLatLngTuple = (point: [number, number] | null | undefined) =>
  Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]);

export const isValidLatLngList = (points: [number, number][] | null | undefined) =>
  Array.isArray(points) && points.length > 0 && points.every(isValidLatLngTuple);

export const mergeChatMessages = (current: ChatMessage[], incoming: ChatMessage[]) => {
  const byId = new Map<number, ChatMessage>();
  current.forEach((message) => byId.set(Number(message.id_message), message));
  incoming.forEach((message) => byId.set(Number(message.id_message), message));
  return Array.from(byId.values()).sort(
    (left, right) => Number(left.id_message || 0) - Number(right.id_message || 0)
  );
};

export const formatEta = (durationMin: number) => {
  if (!Number.isFinite(durationMin) || durationMin <= 0) return '--';
  if (durationMin < 60) return `${Math.ceil(durationMin)} min`;
  const hours = Math.floor(durationMin / 60);
  const minutes = Math.ceil(durationMin % 60);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
};

export const getServiceIconLabel = (icon: string | null | undefined, serviceName = 'Service') => {
  const normalized = String(icon || '').trim();
  if (normalized && normalized.length <= 3) return normalized;
  return String(serviceName || 'Service').trim().charAt(0).toUpperCase() || 'F';
};

export const workerRequestStatusLabel = (statusRaw: string) => {
  const status = String(statusRaw || '').toLowerCase();
  if (status === 'assigned') return 'Ready for route';
  if (status === 'route_in_progress') return 'On the way';
  if (status === 'arrived') return 'Arrival verified';
  if (status === 'start_pending') return 'Start approval';
  if (status === 'finish_pending') return 'Finish approval';
  if (status === 'payment_pending') return 'Payment pending';
  if (status === 'completion_pending') return 'Final approval';
  if (status === 'awaiting_confirmation') return 'Client confirmation';
  if (status === 'in_progress') return 'In progress';
  if (status === 'done') return 'Completed';
  if (status === 'paid') return 'Final approval';
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Pending';
};

export const isScheduledRequest = (
  request: Pick<WorkerRequest, 'booking_type'> | null | undefined
) => String(request?.booking_type || 'express').toLowerCase() === 'scheduled';

export const formatScheduledWindow = (
  request: Pick<
    WorkerRequest,
    'scheduled_start_time' | 'scheduled_end_time' | 'scheduled_date' | 'scheduled_time'
  >
) => {
  const startValue =
    request.scheduled_start_time ||
    (request.scheduled_date && request.scheduled_time
      ? `${request.scheduled_date}T${request.scheduled_time}`
      : null);
  if (!startValue) return 'Time pending';
  const start = new Date(startValue);
  const end = request.scheduled_end_time ? new Date(request.scheduled_end_time) : null;
  if (Number.isNaN(start.getTime())) return 'Time pending';
  const dateLabel = start.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const startLabel = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const endLabel =
    end && !Number.isNaN(end.getTime())
      ? end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : null;
  return endLabel ? `${dateLabel} · ${startLabel} - ${endLabel}` : `${dateLabel} · ${startLabel}`;
};

// Shared fallback average speed used whenever OSRM routing is unavailable
// and duration must be estimated from straight-line distance. Keep this the
// single source of truth so client and worker views never disagree on ETA.
export const FALLBACK_AVG_SPEED_KMH = 22;

export const durationMinFromDistanceKm = (distanceKm: number) =>
  (distanceKm / FALLBACK_AVG_SPEED_KMH) * 60;

export const haversineKm = (
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
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const polylineDistanceKm = (points: [number, number][]) => {
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
  const dx = end[1] - x1;
  const dy = end[0] - y1;
  if (dx === 0 && dy === 0) return (px - x1) ** 2 + (py - y1) ** 2;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const projectedX = x1 + t * dx;
  const projectedY = y1 + t * dy;
  return (px - projectedX) ** 2 + (py - projectedY) ** 2;
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

export const buildRouteDistanceProfile = (points: [number, number][]) => {
  const cumulativeKm: number[] = [0];
  let totalKm = 0;
  for (let index = 1; index < points.length; index += 1) {
    totalKm += haversineKm(
      { lat: points[index - 1][0], lng: points[index - 1][1] },
      { lat: points[index][0], lng: points[index][1] }
    );
    cumulativeKm.push(totalKm);
  }
  return { totalKm, cumulativeKm };
};

export const getPointAtDistanceKm = (
  points: [number, number][],
  cumulativeKm: number[],
  targetKm: number
) => {
  if (points.length === 0) return null;
  if (points.length === 1 || targetKm <= 0) return { lat: points[0][0], lng: points[0][1] };
  const totalKm = cumulativeKm[cumulativeKm.length - 1] || 0;
  if (targetKm >= totalKm) {
    const lastPoint = points[points.length - 1];
    return { lat: lastPoint[0], lng: lastPoint[1] };
  }
  for (let index = 1; index < cumulativeKm.length; index += 1) {
    if (cumulativeKm[index] < targetKm) continue;
    const startDistance = cumulativeKm[index - 1];
    const span = Math.max(cumulativeKm[index] - startDistance, 0.000001);
    const ratio = (targetKm - startDistance) / span;
    const start = points[index - 1];
    const end = points[index];
    return {
      lat: start[0] + (end[0] - start[0]) * ratio,
      lng: start[1] + (end[1] - start[1]) * ratio,
    };
  }
  const fallback = points[points.length - 1];
  return { lat: fallback[0], lng: fallback[1] };
};

const seededUnit = (seed: number) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

export const buildSimulatedTraffic = (
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
    return { level: 'Light', delayMin: 0, segments: [], note: 'Traffic simulation is light on this route.' };
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
    segments.push({ points: segmentPoints, level, color: config.color, label: config.label });
    totalDelayMin += segmentDistance * 6 * config.factor;
    heaviestRank = Math.max(heaviestRank, level === 'heavy' ? 3 : level === 'moderate' ? 2 : 1);
  }
  const level = heaviestRank >= 3 ? 'Heavy' : heaviestRank === 2 ? 'Moderate' : 'Light';
  return {
    level,
    delayMin: Number(totalDelayMin.toFixed(1)),
    segments,
    note:
      level === 'Heavy'
        ? 'Demo traffic is slow around the client area.'
        : level === 'Moderate'
          ? 'Demo traffic shows some slower segments on the route.'
          : 'Demo traffic is mostly clear on this route.',
  };
};

export const getRemainingRoutePoints = (
  points: [number, number][],
  currentCoords: { lat: number; lng: number } | null
) => {
  const safePoints = points.filter(isValidLatLngTuple);
  if (safePoints.length === 0) return [];
  if (!isValidCoord(currentCoords)) return safePoints;
  if (!currentCoords) return safePoints;
  if (safePoints.length === 1) {
    return [
      [currentCoords.lat, currentCoords.lng],
      [currentCoords.lat, currentCoords.lng],
    ] as [number, number][];
  }
  const nearestSegmentIndex = findNearestSegmentIndex(currentCoords, safePoints);
  if (nearestSegmentIndex < 0) return safePoints;
  const segmentEnd = safePoints[Math.min(nearestSegmentIndex + 1, safePoints.length - 1)];
  const nextPoints: [number, number][] = [[currentCoords.lat, currentCoords.lng]];
  if (segmentEnd && haversineKm(currentCoords, { lat: segmentEnd[0], lng: segmentEnd[1] }) > 0.002) {
    nextPoints.push(segmentEnd);
  }
  nextPoints.push(...safePoints.slice(Math.min(nearestSegmentIndex + 2, safePoints.length)));
  return nextPoints.length === 1 ? [nextPoints[0], nextPoints[0]] : nextPoints;
};

export const getLiveViewportPoints = (
  points: [number, number][],
  currentCoords: { lat: number; lng: number } | null,
  mode: 'balanced' | 'close'
) => {
  if (!isValidLatLngList(points)) return [];
  const remaining = getRemainingRoutePoints(points, currentCoords);
  if (remaining.length <= 2) return remaining;
  const totalRemainingKm = polylineDistanceKm(remaining);
  const targetKm =
    mode === 'close'
      ? Math.min(Math.max(totalRemainingKm * 0.12, 0.06), 0.12)
      : Math.min(Math.max(totalRemainingKm * 0.32, 0.14), 0.42);
  const viewport: [number, number][] = [remaining[0]];
  let coveredKm = 0;
  for (let index = 1; index < remaining.length; index += 1) {
    coveredKm += haversineKm(
      { lat: remaining[index - 1][0], lng: remaining[index - 1][1] },
      { lat: remaining[index][0], lng: remaining[index][1] }
    );
    viewport.push(remaining[index]);
    if (coveredKm >= targetKm) break;
  }
  if (viewport.length === 1 && remaining[1]) viewport.push(remaining[1]);
  return viewport;
};

export const createDestinationPinIcon = (leaflet: any, active: boolean) =>
  leaflet.divIcon({
    className: 'worker-client-destination-icon',
    iconSize: [34, 44],
    iconAnchor: [17, 40],
    popupAnchor: [0, -34],
    html: `
      <div style="position:relative;width:34px;height:44px;">
        ${active ? '<div style="position:absolute;left:50%;top:6px;transform:translateX(-50%);width:28px;height:28px;border-radius:999px;background:rgba(251,146,60,.20);animation:pulse-glow 1.7s ease-in-out infinite;"></div>' : ''}
        <div style="position:absolute;left:50%;top:2px;transform:translateX(-50%);width:26px;height:26px;border-radius:999px 999px 999px 0;background:${active ? '#f97316' : '#0284c7'};border:3px solid #ffffff;box-shadow:0 10px 22px rgba(15,23,42,.18);rotate:-45deg;"></div>
        <div style="position:absolute;left:50%;top:8px;transform:translateX(-50%);width:10px;height:10px;border-radius:999px;background:#ffffff;"></div>
      </div>`,
  });

export const focusRouteViewport = (
  map: any,
  leaflet: any,
  points: [number, number][],
  isLiveRoute: boolean,
  mode: 'balanced' | 'close' = 'balanced'
) => {
  if (!map || !leaflet || !isValidLatLngList(points)) return;
  const isDesktop = typeof window !== 'undefined' ? window.innerWidth >= 1280 : true;
  const first = points[0];
  const last = points[points.length - 1];
  const routeKm = polylineDistanceKm(points);
  if (Math.abs(first[0] - last[0]) < 0.0018 && Math.abs(first[1] - last[1]) < 0.0018) {
    const center = [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2];
    const closeZoom = routeKm < 0.12 ? 18 : routeKm < 0.25 ? 17 : routeKm < 0.4 ? 16 : isDesktop ? 15 : 14;
    const balancedZoom = routeKm < 0.18 ? 17 : routeKm < 0.35 ? 16 : isDesktop ? 15 : 14;
    map.flyTo(center, mode === 'close' ? closeZoom : balancedZoom, { animate: true, duration: 0.45 });
    return;
  }
  const bounds = leaflet
    .polyline(points)
    .getBounds()
    .pad(isLiveRoute ? (mode === 'close' ? 0.0015 : 0.02) : 0.12);
  if (!bounds.isValid()) return;
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  if (!sw || !ne || sw.lat === ne.lat || sw.lng === ne.lng) return;
  const options = isDesktop
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
  try {
    if (typeof map.flyToBounds === 'function') map.flyToBounds(bounds, options);
    else map.fitBounds(bounds, options);
  } catch {
    // degenerate bounds; skip fly animation
  }
};
