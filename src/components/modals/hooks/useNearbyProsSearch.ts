import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { API_ENDPOINTS } from '../../../config/api';

interface Coordinates {
  lat: number;
  lng: number;
}

interface ServiceOptionLike {
  id_service: number;
  name: string;
}

interface UseNearbyProsSearchOptions<TWorker> {
  currentCoords: Coordinates | null;
  radiusKm: number;
  resolveLocationInput: () => Promise<Coordinates | null>;
  selectedCategory: string;
  services: ServiceOptionLike[];
  setNearbyWorkers: Dispatch<SetStateAction<TWorker[]>>;
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const useNearbyProsSearch = <TWorker,>({
  currentCoords,
  radiusKm,
  resolveLocationInput,
  selectedCategory,
  services,
  setNearbyWorkers,
  showToast,
}: UseNearbyProsSearchOptions<TWorker>) =>
  useCallback(async () => {
    const selectedService = services.find((svc) => svc.name === selectedCategory);
    if (!selectedService?.id_service) {
      showToast('error', 'Select a service first.');
      return;
    }

    const resolvedCoords = currentCoords ?? (await resolveLocationInput());
    if (!resolvedCoords) {
      return;
    }

    try {
      const params = new URLSearchParams({
        id_service: String(selectedService.id_service),
        lat: String(resolvedCoords.lat),
        lng: String(resolvedCoords.lng),
        radius_km: String(radiusKm),
      });
      const res = await fetch(`${API_ENDPOINTS.services.nearbyWorkers}?${params.toString()}`);
      const payload = await res.json();
      if (!res.ok || !payload?.success) {
        showToast('error', payload?.error || 'Could not search nearby workers.');
        return;
      }
      setNearbyWorkers(Array.isArray(payload.workers) ? payload.workers : []);
      showToast('success', 'Nearby workers loaded.');
    } catch {
      showToast('error', 'Network error searching nearby workers.');
    }
  }, [currentCoords, radiusKm, resolveLocationInput, selectedCategory, services, setNearbyWorkers, showToast]);
