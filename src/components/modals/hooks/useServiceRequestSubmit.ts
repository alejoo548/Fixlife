import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { API_ENDPOINTS } from '../../../config/api';
import type { ServiceRequestData } from '../../../types';
import { clearAuthSession, getAuthUser, getToken, isAuthenticated } from '../../../utils/session';
import type { ServiceRequestHistoryStatus } from './useServiceRequestHistory';

interface Coordinates {
  lat: number;
  lng: number;
}

interface ServiceOptionLike {
  id_service: number;
  name: string;
}

interface UseServiceRequestSubmitOptions {
  currentCoords: Coordinates | null;
  data: ServiceRequestData;
  fetchMyRequests: (status?: ServiceRequestHistoryStatus, silent?: boolean) => Promise<void>;
  historyStatus: ServiceRequestHistoryStatus;
  problemFiles: File[];
  radiusKm: number;
  resolveLocationInput: () => Promise<Coordinates | null>;
  services: ServiceOptionLike[];
  setCurrentCoords: Dispatch<SetStateAction<Coordinates | null>>;
  setData: Dispatch<SetStateAction<ServiceRequestData>>;
  setGeoError: Dispatch<SetStateAction<string | null>>;
  setIsSubmittingRequest: Dispatch<SetStateAction<boolean>>;
  setProblemFiles: Dispatch<SetStateAction<File[]>>;
  showAlert?: (input: { title: string; message: string; tone?: 'warning' | 'error' | 'success' | 'info'; confirmText?: string }) => void;
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const useServiceRequestSubmit = ({
  currentCoords,
  data,
  fetchMyRequests,
  historyStatus,
  problemFiles,
  radiusKm,
  resolveLocationInput,
  services,
  setCurrentCoords,
  setData,
  setGeoError,
  setIsSubmittingRequest,
  setProblemFiles,
  showAlert,
  showToast,
}: UseServiceRequestSubmitOptions) =>
  useCallback(async () => {
    if (!isAuthenticated() || !getToken() || !getAuthUser()) {
      showToast('error', 'You need an account and active session to create a request.');
      return;
    }

    const selectedService = services.find((svc) => svc.name === data.category);
    if (!selectedService?.id_service) {
      showToast('error', 'Select a service first.');
      return;
    }
    if (!data.location.trim()) {
      showToast('error', 'Location is required.');
      return;
    }
    const resolvedCoords = currentCoords ?? (await resolveLocationInput());
    if (!resolvedCoords) {
      showToast('error', 'We need a valid location before creating the request.');
      return;
    }
    if (!data.description.trim() || data.description.trim().length < 10) {
      showToast('error', 'Description must have at least 10 characters.');
      return;
    }
    const budgetValue = Number(data.price);
    if (!Number.isFinite(budgetValue) || budgetValue <= 0) {
      showToast('error', 'Budget must be greater than 0.');
      return;
    }
    if (problemFiles.length === 0) {
      showToast('error', 'Add at least one problem image.');
      return;
    }
    if (data.booking_type === 'scheduled' && (!data.scheduled_date || !data.scheduled_time)) {
      showToast('error', 'Select a date and time window for the scheduled visit.');
      return;
    }

    try {
      setIsSubmittingRequest(true);
      const form = new FormData();
      form.append('id_service', String(selectedService.id_service));
      form.append('description', data.description.trim());
      form.append('location', data.location.trim());
      form.append('budget', String(budgetValue));
      form.append('radius_km', String(radiusKm));
      form.append('urgency_level', String(data.urgency_level || 'standard'));
      form.append('booking_type', data.booking_type || 'express');
      if (data.booking_type === 'scheduled') {
        const scheduledStart = new Date(`${data.scheduled_date}T${data.scheduled_time}:00`);
        if (Number.isNaN(scheduledStart.getTime())) {
          showToast('error', 'Select a valid date and time for the scheduled visit.');
          return;
        }
        form.append('scheduled_date', data.scheduled_date);
        form.append('scheduled_time', data.scheduled_time);
        form.append('scheduled_start_time', scheduledStart.toISOString());
      }
      form.append('lat', String(resolvedCoords.lat));
      form.append('lng', String(resolvedCoords.lng));
      problemFiles.forEach((file) => form.append('problem_images', file));

      const token = getToken();
      const res = await fetch(API_ENDPOINTS.services.createRequest, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      const payload = await res.json();
      if (!res.ok || !payload?.success) {
        if (res.status === 401 || res.status === 403) {
          clearAuthSession('client');
          showAlert?.({
            title: 'Session expired',
            message: 'Please sign in again before creating a service request.',
            tone: 'warning',
            confirmText: 'Sign in again',
          });
          return;
        }
        if (res.status === 409 && payload?.id_request) {
          showToast('error', `You already have an active request (#${payload.id_request}).`);
          void fetchMyRequests(historyStatus);
          return;
        }
        showToast('error', payload?.error || 'Could not create request.');
        return;
      }

      showToast('success', `Request #${payload.request?.id_request || ''} created successfully.`);
      setProblemFiles([]);
      setCurrentCoords(null);
      setGeoError(null);
      setData((prev) => ({
        ...prev,
        description: '',
        location: '',
        price: '',
        urgency_level: 'standard',
        booking_type: 'express',
        scheduled_date: '',
        scheduled_time: '',
        images: [],
      }));
      void fetchMyRequests(historyStatus);
    } catch {
      showToast('error', 'Network error creating request.');
    } finally {
      setIsSubmittingRequest(false);
    }
  }, [
    currentCoords,
    data,
    fetchMyRequests,
    historyStatus,
    problemFiles,
    radiusKm,
    resolveLocationInput,
    services,
    setCurrentCoords,
    setData,
    setGeoError,
    setIsSubmittingRequest,
    setProblemFiles,
    showAlert,
    showToast,
  ]);
