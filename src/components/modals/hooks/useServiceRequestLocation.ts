import { useEffect, useRef, useState } from 'react';
import { API_ENDPOINTS } from '../../../config/api';
import i18n from '../../../i18n';

type ToastType = 'success' | 'error' | 'info';

export interface ServiceRequestLocationSuggestion {
  label: string;
  lat: number;
  lng: number;
  source?: 'local' | 'nominatim' | string;
  kind?: string;
  short_label?: string;
  context_label?: string;
}

interface DetectLocationOptions {
  toastMessage?: string;
  fallbackLabel?: string;
}

interface UseServiceRequestLocationOptions {
  isOpen: boolean;
  locationText: string;
  parseCoordinateInput: (value: string) => unknown;
  reverseGeocodeCoords: (
    coords: { lat: number; lng: number },
    options?: DetectLocationOptions
  ) => Promise<unknown>;
  showToast: (type: ToastType, message: string) => void;
}

const LOCATION_SUGGESTION_MIN_CHARS = 3;
const LOCATION_SUGGESTION_DEBOUNCE_MS = 350;
const GEOLOCATION_TIMEOUT_MS = 16000;
const GEOLOCATION_SAMPLE_MS = 6500;
const GEOLOCATION_TARGET_ACCURACY_M = 35;

export function useServiceRequestLocation({
  isOpen,
  locationText,
  parseCoordinateInput,
  reverseGeocodeCoords,
  showToast,
}: UseServiceRequestLocationOptions) {
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationSuggestions, setLocationSuggestions] = useState<ServiceRequestLocationSuggestion[]>([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(-1);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const locationSuggestionTimerRef = useRef<number | null>(null);
  const locationSuggestionAbortRef = useRef<AbortController | null>(null);
  const locationSuggestionCacheRef = useRef<Map<string, ServiceRequestLocationSuggestion[]>>(new Map());
  const geolocationWatchRef = useRef<number | null>(null);
  const geolocationTimerRef = useRef<number | null>(null);
  const geolocationSessionRef = useRef(0);

  const cancelLocationDetection = () => {
    geolocationSessionRef.current += 1;
    if (geolocationWatchRef.current !== null) {
      navigator.geolocation?.clearWatch(geolocationWatchRef.current);
      geolocationWatchRef.current = null;
    }
    if (geolocationTimerRef.current !== null) {
      window.clearTimeout(geolocationTimerRef.current);
      geolocationTimerRef.current = null;
    }
    setGeoLoading(false);
  };

  useEffect(() => cancelLocationDetection, []);

  useEffect(() => {
    if (!isOpen) return;

    const query = locationText.trim();
    const parsedCoords = parseCoordinateInput(query);
    const cacheKey = query.toLowerCase();

    if (locationSuggestionTimerRef.current) {
      window.clearTimeout(locationSuggestionTimerRef.current);
      locationSuggestionTimerRef.current = null;
    }

    locationSuggestionAbortRef.current?.abort();
    locationSuggestionAbortRef.current = null;

    if (!query || query.length < LOCATION_SUGGESTION_MIN_CHARS || parsedCoords) {
      setLocationSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }

    const cachedSuggestions = locationSuggestionCacheRef.current.get(cacheKey);
    if (cachedSuggestions) {
      setLocationSuggestions(cachedSuggestions);
      setSuggestionsLoading(false);
      return;
    }

    locationSuggestionTimerRef.current = window.setTimeout(async () => {
      const controller = new AbortController();
      locationSuggestionAbortRef.current = controller;
      try {
        setSuggestionsLoading(true);
        const params = new URLSearchParams({ q: query });
        const res = await fetch(`${API_ENDPOINTS.services.geocodeSuggest}?${params.toString()}`, {
          signal: controller.signal,
        });
        const payload = await res.json();
        if (!res.ok || !payload?.success) {
          setLocationSuggestions([]);
          return;
        }
        const nextSuggestions = Array.isArray(payload.suggestions) ? payload.suggestions : [];
        locationSuggestionCacheRef.current.set(cacheKey, nextSuggestions);
        if (locationSuggestionCacheRef.current.size > 30) {
          const oldestKey = locationSuggestionCacheRef.current.keys().next().value;
          if (oldestKey) locationSuggestionCacheRef.current.delete(oldestKey);
        }
        setLocationSuggestions(nextSuggestions);
      } catch {
        if (!controller.signal.aborted) {
          setLocationSuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSuggestionsLoading(false);
        }
        if (locationSuggestionAbortRef.current === controller) {
          locationSuggestionAbortRef.current = null;
        }
      }
    }, LOCATION_SUGGESTION_DEBOUNCE_MS);

    return () => {
      if (locationSuggestionTimerRef.current) {
        window.clearTimeout(locationSuggestionTimerRef.current);
        locationSuggestionTimerRef.current = null;
      }
      locationSuggestionAbortRef.current?.abort();
      locationSuggestionAbortRef.current = null;
    };
  }, [locationText, isOpen, parseCoordinateInput]);

  useEffect(() => {
    if (!showLocationSuggestions || locationSuggestions.length === 0) {
      setHighlightedSuggestionIndex(-1);
      return;
    }

    setHighlightedSuggestionIndex((prev) => {
      if (prev >= 0 && prev < locationSuggestions.length) return prev;
      return 0;
    });
  }, [locationSuggestions, showLocationSuggestions]);

  const detectCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported in this browser.');
      showToast('error', 'Geolocation not supported.');
      return;
    }

    cancelLocationDetection();
    const sessionId = geolocationSessionRef.current;
    setGeoLoading(true);
    setGeoError(null);

    let bestPosition: GeolocationPosition | null = null;
    let settled = false;

    const clearWatch = () => {
      if (geolocationWatchRef.current !== null) {
        navigator.geolocation.clearWatch(geolocationWatchRef.current);
        geolocationWatchRef.current = null;
      }
      if (geolocationTimerRef.current !== null) {
        window.clearTimeout(geolocationTimerRef.current);
        geolocationTimerRef.current = null;
      }
    };

    const applyPosition = (pos: GeolocationPosition) => {
      if (settled || sessionId !== geolocationSessionRef.current) return;
      settled = true;
      clearWatch();

      const lat = Number(pos.coords.latitude.toFixed(7));
      const lng = Number(pos.coords.longitude.toFixed(7));
      const accuracy = Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null;
      setCurrentCoords({ lat, lng });
      void (async () => {
        try {
          await reverseGeocodeCoords(
            { lat, lng },
            {
              toastMessage: accuracy
                ? i18n.t('serviceRequest.location.currentLocationDetectedAccuracy', { accuracy })
                : i18n.t('serviceRequest.location.currentLocationDetected'),
              fallbackLabel: `${lat}, ${lng}`,
            }
          );
        } finally {
          setGeoLoading(false);
        }
      })();
    };

    geolocationWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (sessionId !== geolocationSessionRef.current) return;
        if (!bestPosition || pos.coords.accuracy < bestPosition.coords.accuracy) {
          bestPosition = pos;
        }
        if (pos.coords.accuracy <= GEOLOCATION_TARGET_ACCURACY_M) {
          applyPosition(pos);
        }
      },
      () => {
        if (sessionId !== geolocationSessionRef.current) return;
        if (bestPosition) {
          applyPosition(bestPosition);
          return;
        }
        clearWatch();
        setGeoError(i18n.t('serviceRequest.location.exactLocationError'));
        showToast('error', i18n.t('serviceRequest.location.exactLocationToast'));
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 0 }
    );

    // Intermediate checkpoint: if we already have a usable fix, use it now
    // instead of waiting for the full accuracy target. Otherwise just inform
    // the user we're still searching — do NOT give up here, the real
    // deadline is the watchPosition `timeout` above (GEOLOCATION_TIMEOUT_MS),
    // which invokes the error callback below on its own.
    geolocationTimerRef.current = window.setTimeout(() => {
      if (sessionId !== geolocationSessionRef.current || settled) return;
      if (bestPosition) {
        applyPosition(bestPosition);
        return;
      }
      showToast('info', 'Still looking for a precise GPS signal…');
    }, GEOLOCATION_SAMPLE_MS);
  };

  return {
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
    cancelLocationDetection,
  };
}
