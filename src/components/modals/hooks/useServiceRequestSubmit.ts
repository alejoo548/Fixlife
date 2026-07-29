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
  min_budget?: number | null;
  max_budget?: number | null;
}

interface UseServiceRequestSubmitOptions {
  currentCoords: Coordinates | null;
  data: ServiceRequestData;
  fetchMyRequests: (status?: ServiceRequestHistoryStatus, silent?: boolean) => Promise<void>;
  historyStatus: ServiceRequestHistoryStatus;
  problemFiles: File[];
  radiusKm: number;
  services: ServiceOptionLike[];
  setCurrentCoords: Dispatch<SetStateAction<Coordinates | null>>;
  setData: Dispatch<SetStateAction<ServiceRequestData>>;
  setGeoError: Dispatch<SetStateAction<string | null>>;
  setIsSubmittingRequest: Dispatch<SetStateAction<boolean>>;
  setProblemFiles: Dispatch<SetStateAction<File[]>>;
  onRequestCreated?: (request: {
    id_request: number | null;
    status: string;
    selection_mode: 'auto_assign' | 'client_review';
    assigned_worker_profile: number | null;
    service_name: string;
    location: string;
    budget: number;
    radius_km: number;
    booking_type: string;
    urgency_level: string;
    scheduled_date: string | null;
    scheduled_time: string | null;
    scheduled_start_time: string | null;
    scheduled_end_time: string | null;
    image_count: number;
  }) => void | Promise<void>;
  showAlert?: (input: { title: string; message: string; html?: string; tone?: 'warning' | 'error' | 'success' | 'info'; confirmText?: string }) => void;
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
  messages?: {
    authRequired: string;
    selectServiceFirst: string;
    locationRequired: string;
    confirmLocation: string;
    specificLocation: string;
    descriptionRequired: string;
    budgetInvalid: string;
    imageRequired: string;
    scheduleRequired: string;
    scheduleDurationInvalid: string;
    scheduleInvalid: string;
    sessionExpiredTitle: string;
    sessionExpiredMessage: string;
    signInAgain: string;
    activeRequestExists: string;
    createError: string;
    networkError: string;
    incompleteRequest: string;
  };
}

export const useServiceRequestSubmit = ({
  currentCoords,
  data,
  fetchMyRequests,
  historyStatus,
  problemFiles,
  radiusKm,
  services,
  setCurrentCoords,
  setData,
  setGeoError,
  setIsSubmittingRequest,
  setProblemFiles,
  onRequestCreated,
  showAlert,
  showToast,
  messages,
}: UseServiceRequestSubmitOptions) =>
  useCallback(async () => {
    const msg = {
      authRequired: 'You need an account and active session to create a request.',
      selectServiceFirst: 'Select a service first.',
      locationRequired: 'Location is required.',
      confirmLocation: 'Confirm the exact service location before sending.',
      specificLocation: 'Choose a specific address, landmark, or coordinates.',
      descriptionRequired: 'Description must have at least 10 characters.',
      budgetInvalid: 'Budget must be between $0.01 and $1,000.00.',
      imageRequired: 'Add at least one problem image.',
      scheduleRequired: 'Select a date and time window for the scheduled visit.',
      scheduleDurationInvalid: 'Estimated visit duration must be between 1 and 7 hours.',
      scheduleInvalid: 'Select a valid date and time for the scheduled visit.',
      sessionExpiredTitle: 'Session expired',
      sessionExpiredMessage: 'Please sign in again before creating a service request.',
      signInAgain: 'Sign in again',
      activeRequestExists: 'You already have an active request (#{{id}}).',
      createError: 'Could not create request.',
      networkError: 'Network error creating request.',
      incompleteRequest: 'Complete the missing information before sending.',
      ...messages,
    };

    if (!isAuthenticated() || !getToken() || !getAuthUser()) {
      showToast('error', msg.authRequired);
      return;
    }

    const selectedService = services.find((svc) => svc.name === data.category);
    if (!selectedService?.id_service) {
      showToast('error', msg.selectServiceFirst);
      return;
    }
    if (!data.location.trim()) {
      showToast('error', msg.locationRequired);
      return;
    }
    if (!currentCoords) {
      showToast('error', msg.confirmLocation);
      return;
    }
    const normalizedLocation = data.location.trim().toLocaleLowerCase();
    if (normalizedLocation === 'el salvador' || normalizedLocation === 'salvador') {
      showToast('error', msg.specificLocation);
      return;
    }
    if (!data.description.trim() || data.description.trim().length < 10) {
      showToast('error', msg.descriptionRequired);
      return;
    }
    const budgetValue = Number(data.price);
    const minBudget = Number(selectedService.min_budget ?? 1);
    const maxBudget = Number(selectedService.max_budget ?? 1000);
    if (!Number.isFinite(budgetValue) || budgetValue < minBudget || budgetValue > maxBudget) {
      showToast('error', msg.budgetInvalid);
      return;
    }
    if (problemFiles.length === 0) {
      showToast('error', msg.imageRequired);
      return;
    }
    if (data.booking_type === 'scheduled' && (!data.scheduled_date || !data.scheduled_time)) {
      showToast('error', msg.scheduleRequired);
      return;
    }
    const scheduledDurationMinutes = Math.round(Number(data.scheduled_duration_minutes || 120) / 60) * 60;
    if (
      data.booking_type === 'scheduled' &&
      (!Number.isFinite(scheduledDurationMinutes) || scheduledDurationMinutes < 60 || scheduledDurationMinutes > 7 * 60)
    ) {
      showToast('error', msg.scheduleDurationInvalid);
      return;
    }
    const selectionMode = data.selection_mode === 'client_review' ? 'client_review' : 'auto_assign';

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
      form.append('selection_mode', selectionMode);
      if (data.booking_type === 'scheduled') {
        const scheduledStart = new Date(`${data.scheduled_date}T${data.scheduled_time}:00`);
        if (Number.isNaN(scheduledStart.getTime())) {
          showToast('error', msg.scheduleInvalid);
          return;
        }
        form.append('scheduled_date', data.scheduled_date);
        form.append('scheduled_time', data.scheduled_time);
        form.append('scheduled_start_time', scheduledStart.toISOString());
        form.append('scheduled_duration_minutes', String(scheduledDurationMinutes));
      }
      form.append('lat', String(currentCoords.lat));
      form.append('lng', String(currentCoords.lng));
      problemFiles.forEach((file) => form.append('problem_images', file));

      const token = getToken();
      const res = await fetch(API_ENDPOINTS.services.createRequest, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      const rawPayload = await res.text();
      let payload: any = null;
      try {
        payload = rawPayload ? JSON.parse(rawPayload) : null;
      } catch {
        payload = { error: rawPayload };
      }
      if (!res.ok || !payload?.success) {
        if (res.status === 401 || res.status === 403) {
          clearAuthSession('client');
          showAlert?.({
            title: msg.sessionExpiredTitle,
            message: msg.sessionExpiredMessage,
            tone: 'warning',
            confirmText: msg.signInAgain,
          });
          return;
        }
        if (res.status === 409 && payload?.id_request) {
          showToast('error', msg.activeRequestExists.replace('{{id}}', String(payload.id_request)));
          void fetchMyRequests(historyStatus);
          return;
        }
        showToast('error', payload?.error || msg.createError);
        return;
      }

      const createdRequestId = Number(payload.request?.id_request || 0) || null;
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
        selection_mode: 'auto_assign',
        scheduled_date: '',
        scheduled_time: '',
        scheduled_duration_minutes: 120,
        images: [],
      }));
      void fetchMyRequests(historyStatus);
      await onRequestCreated?.({
        id_request: createdRequestId,
        status: String(payload.request?.status || 'pending').toLowerCase(),
        selection_mode: selectionMode,
        assigned_worker_profile:
          payload.request?.assigned_worker_profile != null
            ? Number(payload.request.assigned_worker_profile)
            : null,
        service_name: selectedService.name,
        location: String(payload.request?.location || data.location.trim()),
        budget: Number(payload.request?.budget ?? budgetValue),
        radius_km: Number(payload.request?.radius_km ?? radiusKm),
        booking_type: String(payload.request?.booking_type || data.booking_type || 'express'),
        urgency_level: String(data.urgency_level || 'standard'),
        scheduled_date: payload.request?.scheduled_date || data.scheduled_date || null,
        scheduled_time: payload.request?.scheduled_time || data.scheduled_time || null,
        scheduled_start_time: payload.request?.scheduled_start_time || null,
        scheduled_end_time: payload.request?.scheduled_end_time || null,
        image_count: problemFiles.length,
      });
    } catch (error: any) {
      console.error('Network error creating service request:', error);
      showToast('error', error?.message ? `${msg.networkError} ${error.message}` : msg.networkError);
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
    services,
    setCurrentCoords,
    setData,
    setGeoError,
    setIsSubmittingRequest,
    setProblemFiles,
    onRequestCreated,
    showAlert,
    showToast,
    messages,
  ]);
