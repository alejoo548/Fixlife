import { useEffect, useRef, useState } from 'react';
import { API_ENDPOINTS } from '../../../config/api';

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

    setGeoLoading(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(7));
        const lng = Number(pos.coords.longitude.toFixed(7));
        setCurrentCoords({ lat, lng });
        void (async () => {
          try {
            await reverseGeocodeCoords(
              { lat, lng },
              {
                toastMessage: 'Current location detected.',
                fallbackLabel: `${lat}, ${lng}`,
              }
            );
          } finally {
            setGeoLoading(false);
          }
        })();
      },
      () => {
        setGeoError('Could not access your location. Allow permission and try again.');
        showToast('error', 'Could not read your location.');
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
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
  };
}
