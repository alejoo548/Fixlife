import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { API_ENDPOINTS } from '../../../config/api';
import i18n from '../../../i18n';

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
  messages?: {
    selectServiceFirst: string;
    searchError: string;
    nearbyWorkersLoaded: string;
    networkError: string;
  };
}

export const useNearbyProsSearch = <TWorker,>({
  currentCoords,
  radiusKm,
  resolveLocationInput,
  selectedCategory,
  services,
  setNearbyWorkers,
  showToast,
  messages,
}: UseNearbyProsSearchOptions<TWorker>) =>
  useCallback(async () => {
    const selectedService = services.find((svc) => svc.name === selectedCategory);
    if (!selectedService?.id_service) {
      showToast('error', messages?.selectServiceFirst || i18n.t('serviceRequest.wizard.toasts.selectServiceFirst'));
      return [];
    }

    const resolvedCoords = currentCoords ?? (await resolveLocationInput());
    if (!resolvedCoords) {
      return [];
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
        showToast('error', payload?.error || messages?.searchError || i18n.t('serviceRequest.wizard.toasts.nearbySearchError'));
        return [];
      }
      const workers = Array.isArray(payload.workers) ? payload.workers : [];
      setNearbyWorkers(workers);
      if (workers.length > 0) {
        showToast('success', messages?.nearbyWorkersLoaded || i18n.t('serviceRequest.wizard.toasts.nearbyWorkersLoaded'));
      }
      return workers as TWorker[];
    } catch {
      showToast('error', messages?.networkError || i18n.t('serviceRequest.wizard.toasts.nearbyNetworkError'));
      return [];
    }
  }, [currentCoords, messages, radiusKm, resolveLocationInput, selectedCategory, services, setNearbyWorkers, showToast]);
