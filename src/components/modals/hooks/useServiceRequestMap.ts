import { useEffect, useRef, useState } from 'react';
import { addResilientTileLayer, loadLeaflet } from '../../../utils/leafletLoader';

declare global {
  interface Window {
    L?: any;
  }
}

type PinKind = 'home' | 'work' | 'recent' | 'favorite' | 'current';

interface CoordinatesLike {
  lat: number;
  lng: number;
}

interface QuickAccessLocationLike extends CoordinatesLike {
  kind: Exclude<PinKind, 'current'>;
  title: string;
  label: string;
}

interface NearbyWorkerLike {
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  distance_km: number | null;
}

interface UseServiceRequestMapOptions {
  isOpen: boolean;
  currentCoords: CoordinatesLike | null;
  radiusKm: number;
  activeLocationKind: PinKind;
  quickAccessLocations: QuickAccessLocationLike[];
  nearbyWorkers: NearbyWorkerLike[];
  sameCoords: (
    left: CoordinatesLike | QuickAccessLocationLike | null | undefined,
    right: CoordinatesLike | QuickAccessLocationLike | null | undefined
  ) => boolean;
  createLeafletPinIcon: (leaflet: any, kind: PinKind | QuickAccessLocationLike['kind']) => any;
  getLocationVisual: (kind: PinKind | QuickAccessLocationLike['kind']) => { label: string };
}

export function useServiceRequestMap({
  isOpen,
  currentCoords,
  radiusKm,
  activeLocationKind,
  quickAccessLocations,
  nearbyWorkers,
  sameCoords,
  createLeafletPinIcon,
  getLocationVisual,
}: UseServiceRequestMapOptions) {
  const [leafletReady, setLeafletReady] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const currentMarkerRef = useRef<any>(null);
  const currentRadiusRef = useRef<any>(null);
  const savedPlaceMarkersRef = useRef<any[]>([]);
  const nearbyWorkerMarkersRef = useRef<any[]>([]);
  const lastCenteredCoordsRef = useRef<CoordinatesLike | null>(null);

  useEffect(() => {
    loadLeaflet('service-request').then(setLeafletReady).catch((err) => console.error(err));
  }, []);

  useEffect(() => {
    if (!isOpen || !mapContainerRef.current || !window.L || !leafletReady) return;
    if (mapInstanceRef.current) return;

    let cancelled = false;

    const initTimer = window.setTimeout(() => {
      if (cancelled || !mapContainerRef.current || !window.L) return;
      if (mapInstanceRef.current) return;

      const L = window.L;
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: true,
        preferCanvas: true,
        maxZoom: 17,
      }).setView([13.6929, -89.2182], 12);

      addResilientTileLayer(L, map);
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      mapInstanceRef.current = map;

      window.setTimeout(() => {
        try { map.invalidateSize(); } catch { /* ignore */ }
      }, 120);
    }, 50);

    return () => {
      cancelled = true;
      window.clearTimeout(initTimer);
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
    };
  }, [isOpen, leafletReady]);

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
      if (lastCenteredCoordsRef.current !== null) {
        map.setView([13.6929, -89.2182], 12);
        lastCenteredCoordsRef.current = null;
      }
      return;
    }

    const shouldRecenter =
      !lastCenteredCoordsRef.current || !sameCoords(lastCenteredCoordsRef.current, currentCoords);

    if (shouldRecenter) {
      map.setView([currentCoords.lat, currentCoords.lng], 14);
      lastCenteredCoordsRef.current = currentCoords;
    }

    const selectedVisual = getLocationVisual(activeLocationKind);

    if (!currentMarkerRef.current) {
      const me = L.marker([currentCoords.lat, currentCoords.lng], {
        draggable: false,
        icon: createLeafletPinIcon(L, activeLocationKind),
        zIndexOffset: 1200,
      })
        .addTo(map)
        .bindPopup(
          `<b>${selectedVisual.label}</b><br/>Confirmed service location.`
        );

      currentMarkerRef.current = me;
    } else {
      currentMarkerRef.current.setLatLng([currentCoords.lat, currentCoords.lng]);
      currentMarkerRef.current.setIcon(createLeafletPinIcon(L, activeLocationKind));
      currentMarkerRef.current.setPopupContent(
        `<b>${selectedVisual.label}</b><br/>Confirmed service location.`
      );
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
  }, [
    currentCoords,
    radiusKm,
    activeLocationKind,
    sameCoords,
    createLeafletPinIcon,
    getLocationVisual,
  ]);

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

        savedPlaceMarkersRef.current.push(pin);
      });
  }, [quickAccessLocations, currentCoords, sameCoords, createLeafletPinIcon]);

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
      })
        .addTo(map)
        .bindPopup(
          `<b>${worker.name}</b><br/>${
            worker.distance_km != null ? `${worker.distance_km.toFixed(1)} km` : ''
          }`
        );

      nearbyWorkerMarkersRef.current.push(marker);
    });
  }, [nearbyWorkers]);

  return {
    leafletReady,
    mapContainerRef,
  };
}
