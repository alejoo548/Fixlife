import { useEffect, useRef, useState } from 'react';
import { API_ENDPOINTS } from '../../../config/api';
import { haversineKm } from './workerRequestUtils';

const PRESENCE_PUSH_IDLE_MS = 30_000;
const PRESENCE_PUSH_ACTIVE_ROUTE_MS = 8_000;
const PRESENCE_MOVE_IDLE_KM = 0.08;
const PRESENCE_MOVE_ACTIVE_ROUTE_KM = 0.02;
const PRESENCE_PUSH_BACKGROUND_MS = 60_000;

interface UseWorkerPresenceOptions {
  token: string | null;
  isOnline: boolean | null;
  routeActive: boolean;
}

export const useWorkerPresence = ({
  token,
  isOnline,
  routeActive,
}: UseWorkerPresenceOptions) => {
  const [workerCoords, setWorkerCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [presenceBusy, setPresenceBusy] = useState(false);
  const lastPushRef = useRef<{
    isOnline: boolean;
    lat?: number;
    lng?: number;
    at: number;
  } | null>(null);

  const pushPresence = async (
    isOnlineNow: boolean,
    lat?: number,
    lng?: number,
    force = false
  ) => {
    if (!token) return;
    const now = Date.now();
    const lastPush = lastPushRef.current;
    const isBackground =
      typeof document !== 'undefined' && document.visibilityState !== 'visible';
    const minIntervalMs = isBackground
      ? PRESENCE_PUSH_BACKGROUND_MS
      : routeActive
        ? PRESENCE_PUSH_ACTIVE_ROUTE_MS
        : PRESENCE_PUSH_IDLE_MS;
    const minMovementKm = routeActive ? PRESENCE_MOVE_ACTIVE_ROUTE_KM : PRESENCE_MOVE_IDLE_KM;

    if (!force && lastPush && lastPush.isOnline === isOnlineNow) {
      const hasValidCoords =
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        Number.isFinite(lastPush.lat) &&
        Number.isFinite(lastPush.lng);
      if (hasValidCoords) {
        const movedKm = haversineKm(
          { lat: Number(lat), lng: Number(lng) },
          { lat: Number(lastPush.lat), lng: Number(lastPush.lng) }
        );
        if (movedKm < minMovementKm && now - lastPush.at < minIntervalMs) return;
      } else if (now - lastPush.at < minIntervalMs) {
        return;
      }
    }

    lastPushRef.current = { isOnline: isOnlineNow, lat, lng, at: now };
    try {
      setPresenceBusy(true);
      await fetch(API_ENDPOINTS.worker.presence, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_online: isOnlineNow ? 1 : 0, lat, lng }),
      });
    } catch {
      lastPushRef.current = lastPush;
    } finally {
      setPresenceBusy(false);
    }
  };

  useEffect(() => {
    if (!token || typeof isOnline !== 'boolean') return;
    if (!isOnline) {
      void pushPresence(false);
      return;
    }

    let watchId: number | null = null;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const lat = Number(position.coords.latitude.toFixed(7));
          const lng = Number(position.coords.longitude.toFixed(7));
          setWorkerCoords({ lat, lng });
          void pushPresence(true, lat, lng);
        },
        () => void pushPresence(true),
        {
          enableHighAccuracy: routeActive,
          timeout: routeActive ? 6000 : 12000,
          maximumAge: routeActive ? 5000 : 30000,
        }
      );
    } else {
      void pushPresence(true);
    }

    return () => {
      if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
    };
    // pushPresence intentionally tracks the current route mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isOnline, routeActive]);

  return {
    presenceBusy,
    pushPresence,
    setWorkerCoords,
    workerCoords,
  };
};
