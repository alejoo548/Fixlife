import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { NavbarProps, AuthMode } from '../../types';
import { Logo } from '../common/Logo';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import { useAuth } from '../../context/AuthContext';
import { NotificationCenter } from '../common/NotificationCenter';
import { getToken } from '../../utils/session';
import { loadLeaflet } from '../../utils/leafletLoader';
import { useSSE } from '../../hooks/useSSE';
import { useServiceRequestChat } from '../modals/hooks/useServiceRequestChat';
import { canUseRequestChat, hasPendingCounter, hasPendingWorkerApproval } from '../modals/serviceRequestHelpers';
import { showSweetToast } from '../../utils/sweetAlert';
import { localizeServiceName } from '../../utils/serviceLocalization';


const ClientLiveRequestTracker = lazy(() => import('../modals/ClientLiveRequestTracker'));

type ClientRequestStatus =
  | 'pending'
  | 'payment_pending'
  | 'paid'
  | 'assigned'
  | 'route_in_progress'
  | 'arrived'
  | 'start_pending'
  | 'in_progress'
  | 'finish_pending'
  | 'completion_pending'
  | 'awaiting_confirmation'
  | 'done'
  | 'cancelled'
  | string;

interface ClientRequestSummary {
  id_request: number;
  service_name: string;
  service_icon?: string | null;
  description?: string | null;
  location_text: string;
  booking_type?: 'express' | 'scheduled' | string;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  scheduled_start_time?: string | null;
  scheduled_end_time?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  budget?: number | null;
  final_budget?: number | null;
  proposed_budget?: number | null;
  counter_message?: string | null;
  counter_status?: 'pending' | 'accepted' | 'declined' | null;
  status: ClientRequestStatus;
  created_at?: string;
  workflow_version?: number;
  client_approved_at?: string | null;
  worker_arrived_at?: string | null;
  work_started_at?: string | null;
  approvals?: {
    start_work: { client: boolean; worker: boolean };
    finish_work: { client: boolean; worker: boolean };
    complete_service: { client: boolean; worker: boolean };
  };
  assigned_worker: {
    id_worker_profile: number;
    name: string;
    phone_number?: string | null;
    bio?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    is_online?: boolean | null;
    profile_image_url?: string | null;
  } | null;
}

interface NavbarWorkerProfile {
  worker: {
    id_worker_profile: number;
    name: string;
    phone_number: string | null;
    bio: string;
    is_online: boolean | null;
    profile_image_url: string | null;
    experience_label: string;
    rating_average: number | null;
    rating_count: number;
    completed_jobs: number;
    services_offered: string[];
  };
  portfolio: Array<{
    id_photo: number;
    description: string;
    image_url: string | null;
  }>;
}

const requestStatusCopy = (statusRaw: ClientRequestStatus, t: (key: string, options?: Record<string, unknown>) => string) => {
  const status = String(statusRaw || '').toLowerCase();
  if (status === 'done') return { label: t('serviceRequest.requestPanel.status.done.label'), hint: t('serviceRequest.requestPanel.status.done.hint'), tone: 'bg-slate-100 text-slate-700 border-slate-200' };
  if (status === 'cancelled') return { label: t('serviceRequest.requestPanel.status.cancelled.label'), hint: t('serviceRequest.requestPanel.status.cancelled.hint'), tone: 'bg-red-50 text-red-600 border-red-100' };
  if (status === 'awaiting_confirmation') return { label: t('serviceRequest.requestPanel.status.awaitingConfirmation.label'), hint: t('serviceRequest.requestPanel.status.awaitingConfirmation.hint'), tone: 'bg-amber-50 text-amber-700 border-amber-100' };
  if (status === 'completion_pending') return { label: t('serviceRequest.requestPanel.status.completionPending.label'), hint: t('serviceRequest.requestPanel.status.completionPending.hint'), tone: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
  if (status === 'finish_pending') return { label: t('serviceRequest.requestPanel.status.finishPending.label'), hint: t('serviceRequest.requestPanel.status.finishPending.hint'), tone: 'bg-violet-50 text-violet-700 border-violet-100' };
  if (status === 'in_progress') return { label: t('serviceRequest.requestPanel.status.inProgress.label'), hint: t('serviceRequest.requestPanel.status.inProgress.hint'), tone: 'bg-blue-50 text-blue-700 border-blue-100' };
  if (status === 'start_pending') return { label: t('serviceRequest.requestPanel.status.startPending.label'), hint: t('serviceRequest.requestPanel.status.startPending.hint'), tone: 'bg-blue-50 text-blue-700 border-blue-100' };
  if (status === 'arrived') return { label: t('serviceRequest.requestPanel.status.arrived.label'), hint: t('serviceRequest.requestPanel.status.arrived.hint'), tone: 'bg-violet-50 text-violet-700 border-violet-100' };
  if (status === 'route_in_progress') return { label: t('serviceRequest.requestPanel.status.routeInProgress.label'), hint: t('serviceRequest.requestPanel.status.routeInProgress.hint'), tone: 'bg-sky-50 text-sky-700 border-sky-100' };
  if (status === 'paid') return { label: t('serviceRequest.requestPanel.status.paid.label'), hint: t('serviceRequest.requestPanel.status.paid.hint'), tone: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
  if (status === 'payment_pending') return { label: t('serviceRequest.requestPanel.status.paymentPending.label'), hint: t('serviceRequest.requestPanel.status.paymentPending.hint'), tone: 'bg-orange-50 text-orange-700 border-orange-100' };
  if (status === 'assigned') return { label: t('serviceRequest.requestPanel.status.assigned.label'), hint: t('serviceRequest.requestPanel.status.assigned.hint'), tone: 'bg-sky-50 text-sky-700 border-sky-100' };
  return { label: t('serviceRequest.requestPanel.status.pending.label'), hint: t('serviceRequest.requestPanel.status.pending.hint'), tone: 'bg-slate-100 text-slate-700 border-slate-200' };
};

const formatRequestSchedule = (request: ClientRequestSummary | null, t: (key: string, options?: Record<string, unknown>) => string, language: string) => {
  if (!request) return '';
  if (String(request.booking_type || 'express').toLowerCase() !== 'scheduled') return t('serviceRequest.requestPanel.schedule.expressVisit');

  const rawStart = request.scheduled_start_time || (
    request.scheduled_date && request.scheduled_time
      ? `${request.scheduled_date}T${request.scheduled_time}`
      : ''
  );
  if (!rawStart) return t('serviceRequest.requestPanel.schedule.scheduledVisit');

  const start = new Date(rawStart);
  if (Number.isNaN(start.getTime())) return t('serviceRequest.requestPanel.schedule.scheduledVisit');

  return start.toLocaleDateString(language.startsWith('es') ? 'es-ES' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const getScheduledStart = (request: ClientRequestSummary | null) => {
  if (!request || String(request.booking_type || 'express').toLowerCase() !== 'scheduled') return null;
  const rawStart = request.scheduled_start_time || (
    request.scheduled_date && request.scheduled_time
      ? `${request.scheduled_date}T${request.scheduled_time}`
      : ''
  );
  if (!rawStart) return null;
  const start = new Date(rawStart);
  return Number.isNaN(start.getTime()) ? null : start;
};

const pickPrimaryClientRequest = (requests: ClientRequestSummary[]) => {
  const activeStatuses = new Set(['pending', 'assigned', 'route_in_progress', 'arrived', 'start_pending', 'in_progress', 'finish_pending', 'payment_pending', 'paid', 'completion_pending', 'awaiting_confirmation']);
  const active = requests.find((request) => activeStatuses.has(String(request.status).toLowerCase()));
  if (active) return active;
  // Never pick a completed/cancelled request as the "in-process" primary
  const nonClosed = requests.find((request) => !['done', 'cancelled', 'canceled'].includes(String(request.status || '').toLowerCase()));
  return nonClosed || null;
};

const sortClientRequests = (requests: ClientRequestSummary[]) =>
  [...requests].sort((left, right) => {
    const leftClosed = ['done', 'cancelled'].includes(String(left.status).toLowerCase());
    const rightClosed = ['done', 'cancelled'].includes(String(right.status).toLowerCase());
    if (leftClosed !== rightClosed) return leftClosed ? 1 : -1;
    return new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime();
  });

const isCancelledRequest = (request: ClientRequestSummary) =>
  ['cancelled', 'canceled'].includes(String(request.status || '').toLowerCase());

const getRequestStepIndex = (statusRaw: ClientRequestStatus) => {
  const status = String(statusRaw || '').toLowerCase();
  if (status === 'done') return 6;
  if (['paid', 'completion_pending'].includes(status)) return 5;
  if (status === 'payment_pending') return 4;
  if (['in_progress', 'finish_pending', 'awaiting_confirmation'].includes(status)) return 3;
  if (['arrived', 'start_pending'].includes(status)) return 2;
  if (status === 'route_in_progress') return 1;
  return 0;
};

export const Navbar: React.FC<NavbarProps> = ({
  navItems,
  onOpenAuth,
  onStartBooking,
  onOpenProfile,
  onGoHome,
  onNavigateSection,
  onSelectCategory,
}) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const authToken = getToken();

  const fullName = [user?.name, user?.lastname].filter(Boolean).join(' ');

  const initials = fullName
    .split(' ')
    .filter(Boolean)
    .map((part: string) => part[0]?.toUpperCase())
    .join('')
    .slice(0, 2);

  const profileImageUrl = useMemo(() => {
    const raw = user?.profile_image;
    if (!raw) return '';

    const rawString = String(raw);

    if (rawString.startsWith('http://') || rawString.startsWith('https://')) {
      return rawString;
    }

    const apiPublicUrl = API_URL.replace(/\/api\/?$/, '');
    const cleanPath = rawString.replace(/^\/+/, '');

    if (cleanPath.startsWith('uploads/')) {
      return `${apiPublicUrl}/${cleanPath}`;
    }

    return `${apiPublicUrl}/uploads/${cleanPath}`;
  }, [user?.profile_image]);

  const [activeIndicator, setActiveIndicator] = useState<{ left: number; width: number } | null>(null);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [clientRequests, setClientRequests] = useState<ClientRequestSummary[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState('');
  const [requestRetryAttempt, setRequestRetryAttempt] = useState(0);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [workerProfile, setWorkerProfile] = useState<NavbarWorkerProfile | null>(null);
  const [workerProfileLoading, setWorkerProfileLoading] = useState(false);
  const [requestActionBusy, setRequestActionBusy] = useState(false);
  const [requestActionMessage, setRequestActionMessage] = useState('');
  const [pendingDecision, setPendingDecision] = useState<{
    kind: 'worker' | 'counter' | 'request';
    decision: 'accept' | 'decline';
  } | null>(null);
  const [liveRequestNotice, setLiveRequestNotice] = useState('');
  const [leafletReady, setLeafletReady] = useState(Boolean(typeof window !== 'undefined' && window.L));
  const previousRequestStateRef = useRef<Record<number, {
    status: string;
    counterStatus: string;
    proposedBudget: number | null;
  }>>({});
  const requestStateInitializedRef = useRef(false);
  const navTrackRef = useRef<HTMLDivElement | null>(null);

  const visibleClientRequests = useMemo(
    () => clientRequests.filter((request) => {
      const s = String(request.status || '').toLowerCase();
      return !isCancelledRequest(request) && s !== 'done';
    }),
    [clientRequests]
  );
  const orderedClientRequests = useMemo(() => sortClientRequests(visibleClientRequests), [visibleClientRequests]);
  const primaryRequest = useMemo(
    () =>
      orderedClientRequests.find((request) => request.id_request === selectedRequestId) ||
      pickPrimaryClientRequest(orderedClientRequests),
    [orderedClientRequests, selectedRequestId]
  );
  const selectedRequestPosition = primaryRequest
    ? orderedClientRequests.findIndex((request) => request.id_request === primaryRequest.id_request) + 1
    : 0;
  const currentLanguage = i18n.resolvedLanguage || i18n.language || 'en';
  const localizedPrimaryServiceName = primaryRequest ? localizeServiceName(primaryRequest.service_name, currentLanguage) : '';
  const primaryRequestStatus = requestStatusCopy(primaryRequest?.status || 'pending', t);
  const requestProgressLabels = useMemo(
    () => [
      t('serviceRequest.requestPanel.progress.proApproved'),
      t('serviceRequest.requestPanel.progress.onRoute'),
      t('serviceRequest.requestPanel.progress.arrived'),
      t('serviceRequest.requestPanel.progress.working'),
      t('serviceRequest.requestPanel.progress.workFinished'),
      t('serviceRequest.requestPanel.progress.paid'),
      t('serviceRequest.requestPanel.progress.completed'),
    ],
    [t]
  );
  const primaryRequestStep = getRequestStepIndex(primaryRequest?.status || 'pending');
  const pendingWorkerApproval = primaryRequest ? hasPendingWorkerApproval(primaryRequest) : false;
  const pendingCounter = primaryRequest ? hasPendingCounter(primaryRequest) : false;
  const primaryStatus = String(primaryRequest?.status || '').toLowerCase();
  const clientStartApproved = Boolean(primaryRequest?.approvals?.start_work.client);
  const clientFinishApproved = Boolean(primaryRequest?.approvals?.finish_work.client);
  const clientCompleteApproved = Boolean(primaryRequest?.approvals?.complete_service.client);
  const canApproveStart = ['arrived', 'start_pending'].includes(primaryStatus) && !clientStartApproved;
  const finishUnlockAt = primaryRequest?.work_started_at
    ? new Date(primaryRequest.work_started_at).getTime() + 1 * 60_000
    : Number.POSITIVE_INFINITY;
  const canApproveFinish = ['in_progress', 'finish_pending'].includes(primaryStatus) && !clientFinishApproved && Date.now() >= finishUnlockAt;
  const canApproveCompletion = ['paid', 'completion_pending'].includes(primaryStatus) && !clientCompleteApproved;
  const scheduledStart = getScheduledStart(primaryRequest);
  const isScheduledFuture =
    !!scheduledStart &&
    scheduledStart.getTime() > Date.now() + 2 * 60 * 60 * 1000 &&
    ['assigned', 'route_in_progress'].includes(String(primaryRequest?.status || '').toLowerCase());
  const canShowLiveMap = primaryRequest
    ? ['route_in_progress', 'arrived', 'start_pending', 'in_progress', 'finish_pending', 'payment_pending', 'paid', 'completion_pending', 'done'].includes(String(primaryRequest.status).toLowerCase()) &&
      !isScheduledFuture
    : false;
  const canCancelRequest = primaryRequest
    ? ['open', 'pending', 'assigned'].includes(
        String(primaryRequest.status || '').toLowerCase()
      )
    : false;
  const openRequestsCount = useMemo(
    () => visibleClientRequests.filter((request) => String(request.status).toLowerCase() !== 'done').length,
    [visibleClientRequests]
  );

  const showRequestMessage = useCallback((_type: 'success' | 'error' | 'info', message: string) => {
    setRequestActionMessage(message);
    void showSweetToast({ tone: _type, message });
  }, []);

  const {
    openChatRequestId,
    setOpenChatRequestId,
    chatByRequest,
    chatMessage,
    setChatMessage,
    chatImage,
    setChatImage,
    chatBusyId,
    fetchRequestChat,
    sendRequestChat,
  } = useServiceRequestChat<ClientRequestSummary>({
    isOpen: isRequestModalOpen,
    requests: orderedClientRequests,
    token: authToken,
    canUseRequestChat,
    showToast: showRequestMessage,
  });

  const handleMouseEnter = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.currentTarget;
    const track = navTrackRef.current;
    if (!track) return;

    const targetRect = target.getBoundingClientRect();
    const trackRect = track.getBoundingClientRect();

    setActiveIndicator({
      left: targetRect.left - trackRect.left,
      width: targetRect.width,
    });
  };

  const handleMouseLeave = () => {
    setActiveIndicator(null);
  };

  const handleAuthClick = (e: React.MouseEvent, mode: AuthMode) => {
    e.preventDefault();
    setIsAccountOpen(false);
    setIsMobileMenuOpen(false);
    onOpenAuth(mode);
  };

  const handleBookingClick = () => {
    setIsAccountOpen(false);
    setIsMobileMenuOpen(false);
    setIsRequestModalOpen(false);
    setOpenChatRequestId(null);
    onStartBooking();
  };

  const handleProfileClick = () => {
    setIsAccountOpen(false);
    setIsMobileMenuOpen(false);
    onOpenProfile();
  };

  const handleLogoutClick = () => {
    setIsAccountOpen(false);
    setIsMobileMenuOpen(false);
    setIsRequestModalOpen(false);
    setOpenChatRequestId(null);
    logout();
  };

  const handleMyRequestsHistoryClick = () => {
    setIsAccountOpen(false);
    setIsMobileMenuOpen(false);
    if (!user) { onOpenAuth('signin'); return; }
    // Note: The full "My Requests & History" experience has been redone as a separate clean component (see MyRequestsModal.tsx).
    // The old entry still works but is now protected against map crashes.
    navigate('/app?openHistory=true');
  };

  const fetchClientRequests = useCallback(async () => {
    if (!user || !authToken) return;

    setRequestsLoading(true);
    setRequestsError('');

    try {
      const response = await fetch(`${API_ENDPOINTS.services.myRequests}?status=all`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || t('serviceRequest.requestPanel.messages.loadError'));
      }

      const requests = Array.isArray(payload?.requests) ? payload.requests : [];
      setClientRequests(
        requests.filter((request: ClientRequestSummary) => {
          const s = String(request.status || '').toLowerCase();
          return !isCancelledRequest(request) && s !== 'done';
        })
      );
      void showSweetToast({ tone: 'success', message: t('serviceRequest.requestPanel.messages.updated') });
    } catch (error: any) {
      const rawMessage = String(error?.message || '');
      setRequestsError(
        rawMessage.toLowerCase().includes('failed to fetch')
          ? t('serviceRequest.requestPanel.messages.networkRetry')
          : rawMessage || t('serviceRequest.requestPanel.messages.refreshError')
      );
    } finally {
      setRequestsLoading(false);
    }
  }, [authToken, t, user]);

  const handleMyRequestClick = () => {
    setIsAccountOpen(false);
    setIsMobileMenuOpen(false);

    if (!user) {
      onOpenAuth('signin');
      return;
    }

    setIsRequestModalOpen(true);
    setRequestRetryAttempt(0);
  };

  const openWorkerProfile = async () => {
    if (!primaryRequest?.assigned_worker || !authToken) return;
    setWorkerProfileLoading(true);
    setWorkerProfile(null);
    setRequestActionMessage('');
    try {
      const response = await fetch(API_ENDPOINTS.services.requestWorkerProfile(primaryRequest.id_request), {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success || !payload?.worker) {
        throw new Error(payload?.error || 'Could not load this professional.');
      }
      setWorkerProfile({
        worker: payload.worker,
        portfolio: Array.isArray(payload.portfolio) ? payload.portfolio : [],
      });
    } catch (error: any) {
      setRequestActionMessage(String(error?.message || (currentLanguage.startsWith('es') ? 'No se pudo cargar este profesional.' : 'Could not load this professional.')));
    } finally {
      setWorkerProfileLoading(false);
    }
  };

  const submitRequestDecision = async (
    kind: 'worker' | 'counter' | 'request',
    decision: 'accept' | 'decline'
  ) => {
    if (!primaryRequest || !authToken) return;
    const endpoint =
      kind === 'request'
        ? API_ENDPOINTS.services.cancelRequest(primaryRequest.id_request)
        : kind === 'worker'
        ? decision === 'accept'
          ? API_ENDPOINTS.services.acceptAssignedWorker(primaryRequest.id_request)
          : API_ENDPOINTS.services.declineAssignedWorker(primaryRequest.id_request)
        : decision === 'accept'
          ? API_ENDPOINTS.services.acceptCounter(primaryRequest.id_request)
          : API_ENDPOINTS.services.declineCounter(primaryRequest.id_request);

    setRequestActionBusy(true);
    setRequestActionMessage('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || (currentLanguage.startsWith('es') ? 'No se pudo guardar tu decisión.' : 'Could not save your decision.'));
      }
      setWorkerProfile(null);
      if (kind === 'request') {
        setClientRequests((current) =>
          current.filter((request) => request.id_request !== primaryRequest.id_request)
        );
        setSelectedRequestId(null);
      }
      setRequestActionMessage(
        currentLanguage.startsWith('es')
          ? kind === 'request'
            ? `La solicitud #${primaryRequest.id_request} fue cancelada.`
            : decision === 'accept'
              ? kind === 'counter'
                ? 'La contraoferta fue aceptada. El trabajador puede iniciar la ruta.'
                : 'El profesional fue aprobado. El trabajador puede iniciar la ruta.'
              : 'Rechazado. Fixlife seguirá buscando otro profesional.'
          : kind === 'request'
            ? `Request #${primaryRequest.id_request} was cancelled.`
            : decision === 'accept'
              ? kind === 'counter'
                ? 'Counter offer accepted. Worker can start route.'
                : 'Professional approved. Worker can start route.'
              : 'Declined. Fixlife will continue looking for another professional.'
      );
      await fetchClientRequests();
    } catch (error: any) {
      setRequestActionMessage(String(error?.message || (currentLanguage.startsWith('es') ? 'No se pudo guardar tu decisión.' : 'Could not save your decision.')));
    } finally {
      setRequestActionBusy(false);
    }
  };

  const approveWorkflowAction = async (action: 'start_work' | 'finish_work' | 'complete_service') => {
    if (!primaryRequest || !authToken) return;
    setRequestActionBusy(true);
    setRequestActionMessage('');
    try {
      const response = await fetch(API_ENDPOINTS.services.workflowApproval(primaryRequest.id_request), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) throw new Error(payload?.error || (currentLanguage.startsWith('es') ? 'No se pudo guardar la aprobacion.' : 'Could not save approval.'));
      setRequestActionMessage(payload?.message || (currentLanguage.startsWith('es') ? 'Aprobacion guardada.' : 'Approval saved.'));

      if (action === 'complete_service') {
        // Immediately remove from the "in process / active services" views.
        // Completed requests should only appear in History as "Completed".
        setClientRequests((current) =>
          current.filter((request) => request.id_request !== primaryRequest.id_request)
        );
        setSelectedRequestId(null);
      }

      await fetchClientRequests();
    } catch (error: any) {
      setRequestActionMessage(String(error?.message || (currentLanguage.startsWith('es') ? 'No se pudo guardar la aprobacion.' : 'Could not save approval.')));
    } finally {
      setRequestActionBusy(false);
    }
  };

  const handleNavItemClick = (itemId: string) => {
    setIsAccountOpen(false);
    setIsMobileMenuOpen(false);

    switch (itemId) {
      case 'services':
      case 'categories':
        onNavigateSection?.('services');
        break;
      case 'professionals':
        onNavigateSection?.('professionals');
        break;
      case 'help':
        onNavigateSection?.('faq');
        break;
      default:
        break;
    }
  };

  const handleSubItemClick = (parentId: string, subItemId: string, subItemName: string) => {
    setIsAccountOpen(false);
    setIsMobileMenuOpen(false);

    if (parentId === 'categories') {
      onSelectCategory?.(subItemName);
      return;
    }

    switch (subItemId) {
      case 'support':
        onNavigateSection?.('faq');
        break;
      case 'how-it-works':
        onNavigateSection?.('steps');
        break;
      default:
        break;
    }
  };

  const handleGoHomeClick = () => {
    setIsAccountOpen(false);
    setIsMobileMenuOpen(false);
    setIsRequestModalOpen(false);
    setOpenChatRequestId(null);
    if (typeof onGoHome === 'function') {
      onGoHome();
      return;
    }
    navigate('/');
  };

  useEffect(() => {
    if (!isRequestModalOpen || !user) return;
    fetchClientRequests();
  }, [fetchClientRequests, isRequestModalOpen, user]);

  useSSE({
    token: authToken,
    events: {
      request_updated: () => {
        if (user) void fetchClientRequests();
      },
      notification: () => {
        if (user) void fetchClientRequests();
      },
    },
    enabled: isRequestModalOpen && !!user && !!authToken,
  });

  useEffect(() => {
    if (orderedClientRequests.length === 0) {
      setSelectedRequestId(null);
      return;
    }
    if (selectedRequestId && orderedClientRequests.some((request) => request.id_request === selectedRequestId)) {
      return;
    }
    setSelectedRequestId(pickPrimaryClientRequest(orderedClientRequests)?.id_request || orderedClientRequests[0].id_request);
  }, [orderedClientRequests, selectedRequestId]);

  useEffect(() => {
    setWorkerProfile(null);
    setRequestActionMessage('');
    setOpenChatRequestId(null);
    setPendingDecision(null);
  }, [primaryRequest?.id_request]);

  useEffect(() => {
    if (isRequestModalOpen) return;
    setWorkerProfile(null);
    setOpenChatRequestId(null);
    setPendingDecision(null);
  }, [isRequestModalOpen, setOpenChatRequestId]);

  useEffect(() => {
    const nextState: Record<number, {
      status: string;
      counterStatus: string;
      proposedBudget: number | null;
    }> = {};
    for (const request of orderedClientRequests) {
      const status = String(request.status || '').toLowerCase();
      const counterStatus = String(request.counter_status || '');
      const proposedBudget = request.proposed_budget != null ? Number(request.proposed_budget) : null;
      nextState[request.id_request] = { status, counterStatus, proposedBudget };

      if (!requestStateInitializedRef.current) continue;
      const previous = previousRequestStateRef.current[request.id_request];
      if (!previous) {
        const message = t('serviceRequest.requestPanel.messages.newRequest', { id: request.id_request });
        setLiveRequestNotice(message);
        void showSweetToast({ tone: 'info', message });
        continue;
      }
      if (
        request.proposed_budget != null &&
        (request.counter_status == null || request.counter_status === 'pending') &&
        (previous.counterStatus !== counterStatus || previous.proposedBudget !== proposedBudget)
      ) {
        const message = t('serviceRequest.requestPanel.messages.counterOffer', {
          name: request.assigned_worker?.name || t('serviceRequest.requestPanel.messages.professionalFallback'),
          id: request.id_request,
        });
        setLiveRequestNotice(message);
        void showSweetToast({
          tone: 'warning',
          message,
        });
        continue;
      }
      if (previous.status !== status) {
        const statusLabel = requestStatusCopy(status, t).label;
        const message = t('serviceRequest.requestPanel.messages.statusChanged', { id: request.id_request, status: statusLabel });
        setLiveRequestNotice(message);
        void showSweetToast({
          tone: 'info',
          message,
        });
      }
    }
    previousRequestStateRef.current = nextState;
    requestStateInitializedRef.current = true;
  }, [orderedClientRequests, t]);

  useEffect(() => {
    if (!isRequestModalOpen || !requestsError || requestRetryAttempt >= 2) return undefined;

    const retryTimer = window.setTimeout(() => {
      setRequestRetryAttempt((current) => current + 1);
      void fetchClientRequests();
    }, 1600);

    return () => window.clearTimeout(retryTimer);
  }, [fetchClientRequests, isRequestModalOpen, requestRetryAttempt, requestsError]);

  useEffect(() => {
    if (!isRequestModalOpen) return;

    let cancelled = false;
    loadLeaflet('navbar-request-modal').then((ready) => {
      if (!cancelled) setLeafletReady(ready);
    });

    return () => {
      cancelled = true;
    };
  }, [isRequestModalOpen]);

  useEffect(() => {
    if (typeof document === 'undefined' || !isRequestModalOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isRequestModalOpen]);

  const BOOKING_INDEX = navItems.length;
  const LANGUAGE_INDEX = navItems.length + 1;
  const ACCOUNT_INDEX = navItems.length + 2;

  return (
    <>
      <header className="fixed top-4 lg:top-6 left-4 right-4 lg:left-0 lg:right-0 h-16 lg:h-20 flex items-center gap-3 px-4 lg:px-6 bg-white/90 backdrop-blur-xl border border-gray-200/50 lg:mx-auto max-w-7xl rounded-2xl z-50 shadow-xl shadow-bird-blue/10 animate-slide-down group/header hover:shadow-2xl hover:shadow-bird-blue/15 transition-shadow duration-300">
        <div className="w-auto lg:w-32 flex-shrink-0 transform hover:scale-105 transition-transform duration-300">
          <Logo onClick={handleGoHomeClick} />
        </div>

        <div className="hidden lg:flex min-w-0 flex-1 items-center justify-end gap-2">
          <nav
            className="relative flex min-w-0 items-center h-full"
            onMouseLeave={handleMouseLeave}
          >
          <div ref={navTrackRef} className="flex relative z-10 min-w-0 items-center">
            {navItems.map((item) => (
              <div
                key={item.name}
                className="group relative flex h-16 w-[110px] xl:w-[118px] 2xl:w-[128px] items-center justify-center cursor-pointer text-gray-700 hover:text-bird-blue transition-all duration-300"
                onMouseEnter={handleMouseEnter}
                onClick={() => handleNavItemClick(item.id)}
              >
                <span className="truncate px-2 text-center font-bold text-sm tracking-wide z-20 transform group-hover:scale-105 transition-transform duration-200">{item.name}</span>

                {item.items && (
                  <div className="absolute top-14 left-0 w-full pt-4 opacity-0 translate-y-[-10px] pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto transition-all duration-300 ease-out z-30">
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-xl p-1 flex flex-col gap-1">
                      {item.items.map((subItem) => (
                        <button
                          key={subItem.id}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleSubItemClick(item.id, subItem.id, subItem.name);
                          }}
                          className="block w-full px-4 py-2 text-left text-sm text-gray-600 hover:bg-bird-blue/5 hover:text-bird-blue rounded-lg transition-colors font-medium"
                        >
                          {subItem.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}

            <div
              className="group relative flex h-16 w-[122px] xl:w-[128px] 2xl:w-[136px] items-center justify-center cursor-pointer text-gray-700 hover:text-bird-blue transition-all duration-300"
              onMouseEnter={handleMouseEnter}
              onClick={handleBookingClick}
            >
              <span className="truncate px-2 text-center font-bold text-sm tracking-wide z-20 transform group-hover:scale-105 transition-transform duration-200">{t('navbar.bookService')}</span>
            </div>

            <div
              className="group relative flex h-16 w-[122px] xl:w-[128px] items-center justify-center text-gray-700 transition-all duration-300"
              onMouseEnter={handleMouseEnter}
            >
              <LanguageSwitcher />
            </div>

            <div
              className="group relative flex h-16 max-w-[150px] xl:max-w-[170px] items-center justify-center cursor-pointer px-2 text-gray-700 hover:text-bird-blue transition-all duration-300"
              onMouseEnter={handleMouseEnter}
              onClick={() => setIsAccountOpen(!isAccountOpen)}
            >
              <div className="flex items-center gap-2 z-20 transform group-hover:scale-105 transition-transform duration-200">

                {user && (
                  profileImageUrl ? (
                    <img
                      src={profileImageUrl}
                      alt={t('navbar.myProfile')}
                      className="w-8 h-8 rounded-full object-cover border border-gray-200"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-bird-blue text-white flex items-center justify-center text-xs font-bold">
                      {initials || 'U'}
                    </div>
                  )
                )}

                <span className="font-bold text-sm tracking-wide">
                  <span className="inline-block max-w-[78px] xl:max-w-[96px] truncate align-bottom">
                    {user ? user.name : t('navbar.account')}
                  </span>
                </span>
                <svg
                  className={`w-4 h-4 transition-transform duration-300 ${isAccountOpen ? 'rotate-180 text-bird-blue' : 'group-hover:text-bird-blue'}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              <div
                className={`absolute top-14 right-0 w-48 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden transition-all duration-300 origin-top-right z-50 cursor-default
                    ${isAccountOpen ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'}`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-1">
                  {!user ? (
                    <>
                      <button
                        onClick={(e) => handleAuthClick(e, 'signin')}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-600 hover:bg-bird-blue/5 hover:text-bird-blue rounded-lg transition-colors text-left font-medium"
                      >
                        <svg
                          className="w-4 h-4 text-bird-yellow"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
                          />
                        </svg>
                        {t('navbar.signIn')}
                      </button>

                      <button
                        onClick={(e) => handleAuthClick(e, 'signup')}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-600 hover:bg-bird-blue/5 hover:text-bird-blue rounded-lg transition-colors text-left font-medium"
                      >
                        <svg
                          className="w-4 h-4 text-bird-blue"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                          />
                        </svg>
                        {t('navbar.signUp')}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleProfileClick}
                        className="w-full px-4 py-3 text-sm text-gray-600 hover:bg-bird-blue/5 rounded-lg text-left font-medium"
                      >
                        {t('navbar.myProfile')}
                      </button>

                      <button
                        onClick={handleMyRequestsHistoryClick}
                        className="w-full px-4 py-3 text-sm text-gray-600 hover:bg-bird-blue/5 rounded-lg text-left font-medium"
                      >
                        {t('navbar.myRequests')}
                      </button>

                      <button
                        onClick={handleLogoutClick}
                        className="w-full px-4 py-3 text-sm text-red-500 hover:bg-red-50 rounded-lg text-left font-medium"
                      >
                        {t('navbar.logOut')}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div
            className="absolute bottom-0 h-[4px] rounded-t-full bg-bird-blue transition-all duration-300 ease-out shadow-[0_0_15px_rgba(0,144,255,0.6)]"
            style={{
              width: `${activeIndicator?.width || 0}px`,
              left: `${activeIndicator?.left || 0}px`,
              opacity: activeIndicator ? 1 : 0,
            }}
          />
          </nav>

          {user && (
          <div className="ml-1 flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleMyRequestClick}
              className="relative inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 xl:px-4 text-sm font-black text-slate-800 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-bird-blue/40 hover:text-bird-blue hover:shadow-lg hover:shadow-bird-blue/10"
              aria-label={t('navbar.openMyServiceRequest')}
            >
              <svg className="h-4 w-4 text-bird-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 012-2z" />
              </svg>
              <span className="hidden xl:inline">{t('navbar.myRequest')}</span>
              <span className="xl:hidden">{t('navbar.myRequest').split(' ')[0]}</span>
              {openRequestsCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-bird-yellow px-1.5 text-[10px] font-black text-slate-900 shadow">
                  {openRequestsCount}
                </span>
              )}
            </button>
            <NotificationCenter token={authToken} className="shrink-0" />
          </div>
          )}
        </div>

        <div className="lg:hidden flex items-center">
          {user && <NotificationCenter token={authToken} className="mr-2" />}
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 text-gray-700 hover:text-bird-blue focus:outline-none"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
            </svg>
          </button>
        </div>
      </header >

      <div
        className={`fixed inset-0 z-[60] bg-white/95 backdrop-blur-xl lg:hidden transition-all duration-300 ease-in-out ${isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
      >
        <div className="flex flex-col h-full p-6">
          <div className="flex justify-between items-center mb-8">
            <Logo onClick={handleGoHomeClick} />
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="p-2 text-gray-500 hover:text-gray-900"
            >
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex flex-col gap-6 overflow-y-auto">
            {navItems.map((item) => (
              <div key={item.name} className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => handleNavItemClick(item.id)}
                  className="text-xl font-bold text-left text-gray-900 hover:text-bird-blue transition-colors"
                >
                  {item.name}
                </button>
                {item.items && (
                  <div className="flex flex-col gap-2 pl-4 border-l-2 border-bird-blue/30">
                    {item.items.map((subItem) => (
                      <button
                        key={subItem.id}
                        type="button"
                        onClick={() => handleSubItemClick(item.id, subItem.id, subItem.name)}
                        className="text-left text-gray-600 hover:text-bird-blue text-sm py-1 font-medium"
                      >
                        {subItem.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-auto pt-8 border-t border-gray-200 flex flex-col gap-4">
  <LanguageSwitcher mobile />
  {!user ? (
    <>
      <button
        onClick={(e) => handleAuthClick(e, 'signin')}
        className="w-full py-4 rounded-xl bg-gray-100 border border-gray-200 text-gray-900 font-bold active:scale-95 transition-transform shadow-sm"
      >
        {t('navbar.signIn')}
      </button>
      <button
        onClick={(e) => handleAuthClick(e, 'signup')}
        className="w-full py-4 rounded-xl bg-bird-blue text-white font-bold shadow-lg shadow-bird-blue/20 active:scale-95 transition-transform"
      >
        {t('navbar.createAccount')}
      </button>
    </>
  ) : (
    <>
      <button
        onClick={handleMyRequestClick}
        className="w-full py-4 rounded-xl bg-bird-blue text-white font-bold active:scale-95 transition-transform shadow-lg shadow-bird-blue/20"
      >
        {t('navbar.myRequest')}
      </button>
      <button
        onClick={handleProfileClick}
        className="w-full py-4 rounded-xl bg-gray-100 border border-gray-200 text-gray-900 font-bold active:scale-95 transition-transform shadow-sm"
      >
        {t('navbar.myProfile')}
      </button>
      <button
        onClick={handleMyRequestsHistoryClick}
        className="w-full py-4 rounded-xl bg-gray-100 border border-gray-200 text-gray-900 font-bold active:scale-95 transition-transform shadow-sm"
      >
        {t('navbar.myRequests')}
      </button>
      <button
        onClick={handleLogoutClick}
        className="w-full py-4 rounded-xl bg-red-50 text-red-600 border border-red-200 font-bold active:scale-95 transition-transform"
      >
        {t('navbar.logOut')}
      </button>
    </>
  )}
</div>
        </div>
      </div>

      {isRequestModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-md">
          <div className="absolute inset-0" onClick={() => setIsRequestModalOpen(false)} />
          <section className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-2xl">
            <div className="border-b border-slate-100 bg-white px-5 py-4 sm:px-7">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-full bg-bird-blue/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-bird-blue">
                      {t('serviceRequest.requestPanel.title')}
                    </span>
                    {primaryRequest && (
                      <span className="text-xs font-black text-slate-400">
                        {t('serviceRequest.requestPanel.position', { current: selectedRequestPosition, total: orderedClientRequests.length })}
                      </span>
                    )}
                  </div>
                  <h2 className="truncate text-2xl font-black leading-tight text-slate-950 sm:text-3xl">
                    {primaryRequest ? localizedPrimaryServiceName : t('serviceRequest.requestPanel.activeFallback')}
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                {orderedClientRequests.length > 1 && (
                  <div className="hidden items-center gap-1 sm:flex">
                    <button
                      type="button"
                      onClick={() => {
                        const nextIndex = Math.max(0, selectedRequestPosition - 2);
                        setSelectedRequestId(orderedClientRequests[nextIndex]?.id_request || null);
                      }}
                      disabled={selectedRequestPosition <= 1}
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-bird-blue hover:text-bird-blue disabled:cursor-not-allowed disabled:opacity-35"
                      aria-label={t('serviceRequest.requestPanel.previousRequest')}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const nextIndex = Math.min(orderedClientRequests.length - 1, selectedRequestPosition);
                        setSelectedRequestId(orderedClientRequests[nextIndex]?.id_request || null);
                      }}
                      disabled={selectedRequestPosition >= orderedClientRequests.length}
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-bird-blue hover:text-bird-blue disabled:cursor-not-allowed disabled:opacity-35"
                      aria-label={t('serviceRequest.requestPanel.nextRequest')}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                )}
                {primaryRequest && (
                  <span className={`hidden rounded-full border px-4 py-2 text-xs font-black sm:inline-flex ${primaryRequestStatus.tone}`}>
                    {primaryRequestStatus.label}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setIsRequestModalOpen(false)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:text-slate-950"
                  aria-label={t('serviceRequest.requestPanel.closeModal')}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                </div>
              </div>
            </div>

            {orderedClientRequests.length > 0 && (
              <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 sm:px-7">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                    {t('serviceRequest.requestPanel.allRequests')}
                  </p>
                  <p className="text-xs font-bold text-slate-500">
                    {t('serviceRequest.requestPanel.requestTotals', { active: openRequestsCount, total: orderedClientRequests.length })}
                  </p>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                  {orderedClientRequests.map((request) => {
                    const selected = request.id_request === primaryRequest?.id_request;
                    const requestStatus = requestStatusCopy(request.status, t);
                    return (
                      <button
                        key={request.id_request}
                        type="button"
                        onClick={() => setSelectedRequestId(request.id_request)}
                        aria-pressed={selected}
                        className={`min-w-[210px] max-w-[260px] flex-1 rounded-xl border px-3 py-2.5 text-left transition ${
                          selected
                            ? 'border-bird-blue bg-white shadow-md ring-2 ring-bird-blue/10'
                            : 'border-slate-200 bg-white/70 hover:border-slate-300 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${
                            ['done'].includes(String(request.status).toLowerCase())
                              ? 'bg-emerald-500'
                              : ['cancelled'].includes(String(request.status).toLowerCase())
                                ? 'bg-red-400'
                                : 'bg-bird-blue'
                          }`} />
                          <span className="truncate text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                            #{request.id_request}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-sm font-black text-slate-900">{localizeServiceName(request.service_name, currentLanguage)}</p>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <span className="truncate text-[11px] font-bold text-slate-500">{requestStatus.label}</span>
                          <span className="shrink-0 text-[10px] font-semibold text-slate-400">
                            {request.created_at ? new Date(request.created_at).toLocaleDateString(currentLanguage.startsWith('es') ? 'es-ES' : 'en-US', { month: 'short', day: 'numeric' }) : ''}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {liveRequestNotice && (
              <div className="flex items-center justify-between gap-3 border-b border-blue-200 bg-blue-50 px-5 py-3 sm:px-7">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-bird-blue shadow-[0_0_0_5px_rgba(0,144,255,0.12)]" />
                  <p className="truncate text-sm font-bold text-blue-900">{liveRequestNotice}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setLiveRequestNotice('')}
                  className="shrink-0 text-xs font-black text-blue-700 hover:text-blue-950"
                >
                  {t('serviceRequest.requestPanel.dismiss')}
                </button>
              </div>
            )}

            <div className="overflow-y-auto bg-slate-50/80 p-4 sm:p-6">
              {requestsLoading && clientRequests.length === 0 ? (
                <div className="grid min-h-[520px] place-items-center rounded-[1.5rem] bg-white">
                  <div className="text-center">
                    <div className="mx-auto mb-4 h-12 w-12 rounded-full border-4 border-bird-blue/20 border-t-bird-blue animate-spin" />
                    <p className="text-sm font-bold text-slate-500">{t('serviceRequest.requestPanel.loading')}</p>
                  </div>
                </div>
              ) : requestsError ? (
                <div className="grid min-h-[420px] place-items-center rounded-[1.5rem] border border-sky-100 bg-white p-8 text-center">
                  <div className="max-w-md">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-sky-50 text-bird-blue">
                      <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 4v5h5M20 20v-5h-5M5.7 15a7 7 0 0011.6 2M18.3 9A7 7 0 006.7 7" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-black text-slate-950">{t('serviceRequest.requestPanel.reconnecting')}</h3>
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{requestsError}</p>
                    {requestRetryAttempt < 2 && (
                      <p className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-bird-blue">
                        {t('serviceRequest.requestPanel.retrying')}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setRequestRetryAttempt(0);
                        void fetchClientRequests();
                      }}
                      className="mt-5 rounded-xl bg-bird-blue px-5 py-3 text-sm font-black text-white shadow-lg shadow-bird-blue/20 transition-transform active:scale-95"
                    >
                      {t('serviceRequest.requestPanel.retryNow')}
                    </button>
                  </div>
                </div>
              ) : !primaryRequest ? (
                <div className="grid min-h-[460px] place-items-center rounded-[1.5rem] bg-white p-8 text-center">
                  <div className="max-w-md">
                    <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-bird-blue/10 text-bird-blue">
                      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M8 7V3m8 4V3M5 11h14M7 21h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <h3 className="text-2xl font-black text-slate-950">{t('serviceRequest.requestPanel.noActiveTitle')}</h3>
                    <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
                      {t('serviceRequest.requestPanel.noActiveHelp')}
                    </p>
                    <button
                      type="button"
                      onClick={handleBookingClick}
                      className="mt-6 rounded-xl bg-bird-blue px-6 py-3 text-sm font-black text-white shadow-lg shadow-bird-blue/20 transition-transform active:scale-95"
                    >
                      {t('serviceRequest.requestPanel.bookService')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
                  <aside className="space-y-4">
                    <div className="overflow-hidden rounded-[1.5rem] border border-slate-100 bg-white shadow-sm">
                      <div className="bg-gradient-to-br from-slate-950 to-slate-800 p-5 text-white">
                        <div className={`mb-4 inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-black text-white`}>
                          {primaryRequestStatus.label}
                        </div>
                        <h3 className="text-2xl font-black leading-tight">{localizedPrimaryServiceName}</h3>
                        <p className="mt-2 text-sm font-semibold leading-6 text-white/70">{primaryRequestStatus.hint}</p>
                      </div>

                      <div className="space-y-5 p-5">
                        <div>
                          <div className="mb-3 grid grid-cols-7 items-start gap-1 text-center text-[8px] font-black uppercase leading-tight tracking-tight text-slate-400">
                            {requestProgressLabels.map((label, index) => (
                              <span key={label} className={index <= primaryRequestStep ? 'text-bird-blue' : ''}>
                                {label}
                              </span>
                            ))}
                          </div>
                          <div className="relative h-2 rounded-full bg-slate-100">
                            <div
                              className="absolute inset-y-0 left-0 rounded-full bg-bird-blue transition-all duration-500"
                              style={{ width: `${Math.max(12, (primaryRequestStep / (requestProgressLabels.length - 1)) * 100)}%` }}
                            />
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                          <div className="mb-2 flex items-center gap-2">
                            <svg className="h-4 w-4 text-bird-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 11.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M19.5 9c0 7-7.5 12-7.5 12S4.5 16 4.5 9a7.5 7.5 0 1115 0z" />
                            </svg>
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{t('serviceRequest.requestPanel.labels.location')}</p>
                          </div>
                          <p className="line-clamp-2 text-sm font-bold leading-6 text-slate-900">{primaryRequest.location_text}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{t('serviceRequest.requestPanel.labels.visit')}</p>
                            <p className="mt-2 text-sm font-black leading-5 text-slate-900">{formatRequestSchedule(primaryRequest, t, currentLanguage)}</p>
                          </div>
                          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{t('serviceRequest.requestPanel.labels.budget')}</p>
                            <p className="mt-2 text-lg font-black text-slate-900">
                              ${Number(primaryRequest.final_budget ?? primaryRequest.budget ?? 0).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-sm">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{t('serviceRequest.requestPanel.labels.professional')}</p>
                        {!primaryRequest.assigned_worker && (
                          <span className="rounded-full bg-bird-yellow/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-yellow-700">
                            {t('serviceRequest.requestPanel.labels.matching')}
                          </span>
                        )}
                      </div>
                      {primaryRequest.assigned_worker ? (
                        <div>
                          <div className="flex items-center gap-3">
                            {primaryRequest.assigned_worker.profile_image_url ? (
                              <img
                                src={primaryRequest.assigned_worker.profile_image_url}
                                alt={primaryRequest.assigned_worker.name}
                                className="h-12 w-12 rounded-full object-cover ring-4 ring-bird-blue/10"
                              />
                            ) : (
                              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bird-blue text-lg font-black text-white ring-4 ring-bird-blue/10">
                                {primaryRequest.assigned_worker.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-base font-black text-slate-950">{primaryRequest.assigned_worker.name}</p>
                              <p className="text-xs font-bold text-slate-500">
                                {currentLanguage.startsWith('es')
                                  ? (primaryRequest.assigned_worker.is_online ? 'En línea ahora' : 'Asignado a tu solicitud')
                                  : (primaryRequest.assigned_worker.is_online ? 'Online now' : 'Assigned to your request')}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void openWorkerProfile()}
                            disabled={workerProfileLoading}
                            className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-900 transition hover:border-bird-blue hover:text-bird-blue disabled:opacity-50"
                          >
                            {currentLanguage.startsWith('es')
                              ? (workerProfileLoading ? 'Cargando perfil...' : 'Ver perfil y portafolio')
                              : (workerProfileLoading ? 'Loading profile...' : 'View profile and portfolio')}
                          </button>
                          {canUseRequestChat(primaryRequest) && (
                            <button
                              type="button"
                              onClick={() => {
                                setOpenChatRequestId(primaryRequest.id_request);
                                void fetchRequestChat(primaryRequest.id_request);
                              }}
                              className="mt-2 w-full rounded-xl bg-bird-blue px-4 py-3 text-sm font-black text-white shadow-lg shadow-bird-blue/15 transition hover:bg-blue-600"
                            >
                              {currentLanguage.startsWith('es') ? `Chatear con ${primaryRequest.assigned_worker.name}` : `Chat with ${primaryRequest.assigned_worker.name}`}
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="flex gap-3">
                          <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-bird-blue shadow-[0_0_0_6px_rgba(0,144,255,0.12)]" />
                          <p className="text-sm font-semibold leading-6 text-slate-600">
                            {currentLanguage.startsWith('es')
                              ? 'Estamos revisando profesionales verificados cercanos. Esto se actualiza automáticamente cuando alguien acepta.'
                              : 'We are checking nearby verified pros. This updates automatically when someone accepts.'}
                          </p>
                        </div>
                      )}
                    </div>

                    {pendingCounter && (
                      <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-5 shadow-sm">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">{currentLanguage.startsWith('es') ? 'Contraoferta' : 'Counter offer'}</p>
                        <div className="mt-2 flex items-end justify-between gap-3">
                          <div>
                            <p className="text-3xl font-black text-slate-950">
                              ${Number(primaryRequest.proposed_budget || 0).toFixed(2)}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              {currentLanguage.startsWith('es')
                                ? `Tu estimado original era $${Number(primaryRequest.budget || 0).toFixed(2)}`
                                : `Your original estimate was $${Number(primaryRequest.budget || 0).toFixed(2)}`}
                            </p>
                          </div>
                        </div>
                        {primaryRequest.counter_message && (
                          <p className="mt-3 rounded-xl border border-amber-100 bg-white/70 p-3 text-sm font-semibold leading-6 text-slate-700">
                            {primaryRequest.counter_message}
                          </p>
                        )}
                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={requestActionBusy}
                            onClick={() => setPendingDecision({ kind: 'counter', decision: 'decline' })}
                            className="rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-black text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            {currentLanguage.startsWith('es') ? 'Rechazar' : 'Decline'}
                          </button>
                          <button
                            type="button"
                            disabled={requestActionBusy}
                            onClick={() => setPendingDecision({ kind: 'counter', decision: 'accept' })}
                            className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-black disabled:opacity-50"
                          >
                            {currentLanguage.startsWith('es') ? 'Aceptar oferta' : 'Accept offer'}
                          </button>
                        </div>
                      </div>
                    )}

                    {pendingWorkerApproval && (
                      <div className="rounded-[1.5rem] border border-sky-200 bg-sky-50 p-5 shadow-sm">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-700">{currentLanguage.startsWith('es') ? 'Se necesita tu aprobación' : 'Your approval is needed'}</p>
                        <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
                          {currentLanguage.startsWith('es')
                            ? 'Revisa al profesional y su portafolio. Después de aprobar, el trabajador podrá iniciar la ruta. El pago ocurre solo cuando el trabajo termina.'
                            : 'Review professional and portfolio. After approval, worker can start route. Payment happens only after work finishes.'}
                        </p>
                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={requestActionBusy}
                            onClick={() => setPendingDecision({ kind: 'worker', decision: 'decline' })}
                            className="rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-black text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            {currentLanguage.startsWith('es') ? 'Buscar otro' : 'Find another'}
                          </button>
                          <button
                            type="button"
                            disabled={requestActionBusy}
                            onClick={() => setPendingDecision({ kind: 'worker', decision: 'accept' })}
                            className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-black disabled:opacity-50"
                          >
                            {currentLanguage.startsWith('es') ? 'Aprobar profesional' : 'Approve pro'}
                          </button>
                        </div>
                      </div>
                    )}

                    {primaryRequest.workflow_version === 2 && ['arrived', 'start_pending'].includes(primaryStatus) && (
                      <div className="rounded-[1.5rem] border border-blue-200 bg-blue-50 p-5 shadow-sm">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">{currentLanguage.startsWith('es') ? 'Aprobación de inicio' : 'Start work approval'}</p>
                        <h4 className="mt-2 text-xl font-black text-slate-950">{currentLanguage.startsWith('es') ? 'El trabajador llegó' : 'Worker arrived'}</h4>
                        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                          {currentLanguage.startsWith('es')
                            ? (clientStartApproved ? 'Tu aprobación ya fue guardada. Esperando la aprobación del trabajador.' : 'Aprueba solo cuando el trabajador esté presente y ambos estén listos para comenzar.')
                            : (clientStartApproved ? 'Your approval is saved. Waiting for worker approval.' : 'Approve only when worker is present and both are ready to begin.')}
                        </p>
                        {canApproveStart && (
                          <button type="button" disabled={requestActionBusy} onClick={() => void approveWorkflowAction('start_work')} className="mt-4 w-full rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-black text-white disabled:opacity-50">
                            {currentLanguage.startsWith('es') ? 'Aprobar inicio del trabajo' : 'Approve work start'}
                          </button>
                        )}
                      </div>
                    )}

                    {primaryRequest.workflow_version === 2 && ['in_progress', 'finish_pending'].includes(primaryStatus) && (
                      <div className="rounded-[1.5rem] border border-violet-200 bg-violet-50 p-5 shadow-sm">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">{currentLanguage.startsWith('es') ? 'Aprobación de finalización' : 'Finish work approval'}</p>
                        <h4 className="mt-2 text-xl font-black text-slate-950">{currentLanguage.startsWith('es') ? 'Trabajo en progreso' : 'Work in progress'}</h4>
                        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                          {currentLanguage.startsWith('es')
                            ? (clientFinishApproved ? 'Tu aprobación de finalización ya fue guardada. Esperando al trabajador.' : canApproveFinish ? 'Confirma que el trabajo técnico terminó. El pago se desbloquea cuando ambos aprueben.' : 'La aprobación de finalización se habilita 1 minuto después de iniciar el trabajo.')
                            : (clientFinishApproved ? 'Your finish approval is saved. Waiting for worker.' : canApproveFinish ? 'Confirm technical work is finished. Payment unlocks after both approve.' : 'Finish approval unlocks 1 minute after work starts.')}
                        </p>
                        {canApproveFinish && (
                          <button type="button" disabled={requestActionBusy} onClick={() => void approveWorkflowAction('finish_work')} className="mt-4 w-full rounded-xl bg-violet-600 px-5 py-3.5 text-sm font-black text-white disabled:opacity-50">
                            {currentLanguage.startsWith('es') ? 'Aprobar finalización del trabajo' : 'Approve work finish'}
                          </button>
                        )}
                      </div>
                    )}

                    {requestActionMessage && (
                      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
                        {requestActionMessage}
                      </div>
                    )}

                    {String(primaryRequest.status || '').toLowerCase() === 'payment_pending' && (
                      <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">{currentLanguage.startsWith('es') ? 'Siguiente paso' : 'Next step'}</p>
                        <h4 className="mt-2 text-xl font-black text-slate-950">{currentLanguage.startsWith('es') ? 'Paga el trabajo terminado' : 'Pay for finished work'}</h4>
                        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                          {currentLanguage.startsWith('es')
                            ? `Ambos aprobaron la finalización del trabajo. Paga $${Number(primaryRequest.final_budget ?? primaryRequest.budget ?? 0).toFixed(2)} para continuar al cierre final.`
                            : `Both approved work finish. Pay $${Number(primaryRequest.final_budget ?? primaryRequest.budget ?? 0).toFixed(2)} to continue to final closure.`}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setIsRequestModalOpen(false);
                            navigate(`/checkout/${primaryRequest.id_request}`);
                            window.scrollTo(0, 0);
                          }}
                          className="mt-4 w-full rounded-xl bg-emerald-600 px-5 py-3.5 text-sm font-black text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700"
                        >
                          {t('serviceRequest.requestPanel.continueToPayment')}
                        </button>
                      </div>
                    )}

                    {primaryRequest.workflow_version === 2 && ['paid', 'completion_pending'].includes(primaryStatus) && (
                      <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">{currentLanguage.startsWith('es') ? 'Aprobación final del servicio' : 'Final service approval'}</p>
                        <h4 className="mt-2 text-xl font-black text-slate-950">{currentLanguage.startsWith('es') ? 'Pago completado' : 'Payment completed'}</h4>
                        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                          {currentLanguage.startsWith('es')
                            ? (clientCompleteApproved ? 'Tu aprobación final ya fue guardada. Esperando al trabajador.' : 'Aprueba el cierre final. El servicio se completa solo cuando ambos aprueban.')
                            : (clientCompleteApproved ? 'Your final approval is saved. Waiting for worker.' : 'Approve final closure. Service completes only after both approve.')}
                        </p>
                        {canApproveCompletion && (
                          <button type="button" disabled={requestActionBusy} onClick={() => void approveWorkflowAction('complete_service')} className="mt-4 w-full rounded-xl bg-emerald-600 px-5 py-3.5 text-sm font-black text-white disabled:opacity-50">
                            {currentLanguage.startsWith('es') ? 'Aprobar finalización del servicio' : 'Approve service completion'}
                          </button>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={fetchClientRequests}
                      disabled={requestsLoading}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-900 shadow-sm transition-all hover:-translate-y-0.5 hover:border-bird-blue/30 hover:shadow-lg hover:shadow-bird-blue/10 active:scale-[0.97] disabled:opacity-60 disabled:hover:translate-y-0"
                    >
                      <RefreshCw className={`h-4 w-4 ${requestsLoading ? 'animate-spin' : ''}`} />
                      {requestsLoading ? t('serviceRequest.history.refreshing') : t('serviceRequest.requestPanel.retryNow')}
                    </button>
                    {canCancelRequest && (
                      <button
                        type="button"
                        disabled={requestActionBusy}
                        onClick={() => setPendingDecision({ kind: 'request', decision: 'decline' })}
                        className="w-full rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-black text-red-700 transition hover:border-red-300 hover:bg-red-100 disabled:opacity-50"
                      >
                        {t('serviceRequest.actions.cancelRequest')}
                      </button>
                    )}
                  </aside>

                  <div className="min-h-[520px] overflow-hidden rounded-[1.5rem] border border-slate-100 bg-white shadow-sm">
                    {primaryRequest.assigned_worker && canShowLiveMap ? (
                      <Suspense
                        fallback={
                          <div className="grid h-full min-h-[520px] place-items-center bg-slate-100">
                            <p className="text-sm font-bold text-slate-500">{currentLanguage.startsWith('es') ? 'Preparando vista en vivo...' : 'Preparing live view...'}</p>
                          </div>
                        }
                      >
                        <ClientLiveRequestTracker
                          key={`navbar-request-${primaryRequest.id_request}`}
                          leafletReady={leafletReady}
                          request={primaryRequest}
                        />
                      </Suspense>
                    ) : primaryRequest.assigned_worker ? (
                      <div className="grid h-full min-h-[520px] place-items-center bg-white p-8">
                        <div className="max-w-lg text-center">
                          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-sky-50 text-bird-blue">
                            <svg className="h-9 w-9" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                          </div>
                          <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-bird-blue">
                            {currentLanguage.startsWith('es')
                              ? (isScheduledFuture ? 'Visita confirmada' : 'Profesional seleccionado')
                              : (isScheduledFuture ? 'Visit confirmed' : 'Professional selected')}
                          </p>
                          <h3 className="mt-2 text-3xl font-black text-slate-950">
                              {currentLanguage.startsWith('es')
                                ? (isScheduledFuture ? 'Tu mapa se abrirá cerca de la hora de la visita' : pendingWorkerApproval ? 'Revisa al profesional' : 'Esperando el inicio de la ruta')
                                : (isScheduledFuture ? 'Your map will open near visit time' : pendingWorkerApproval ? 'Review professional' : 'Waiting for route start')}
                          </h3>
                          <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-7 text-slate-500">
                            {isScheduledFuture
                              ? t('serviceRequest.requestPanel.map.futureVisitHelp', { schedule: formatRequestSchedule(primaryRequest, t, currentLanguage) })
                              : currentLanguage.startsWith('es')
                                ? (pendingWorkerApproval
                                  ? 'Revisa al profesional y aprueba la selección. Luego el trabajador podrá iniciar la ruta.'
                                  : 'El profesional ya está aprobado. La ruta en vivo aparecerá en cuanto comience a trasladarse.')
                                : (pendingWorkerApproval
                                  ? 'Review professional and approve selection. Worker can then start route.'
                                  : 'Professional is approved. Live route appears as soon as worker starts traveling.')}
                          </p>
                          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
                            <button
                              type="button"
                              onClick={() => void openWorkerProfile()}
                              className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-900 hover:border-bird-blue hover:text-bird-blue"
                            >
                              {currentLanguage.startsWith('es') ? 'Revisar profesional' : 'Review professional'}
                            </button>
                            {canUseRequestChat(primaryRequest) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenChatRequestId(primaryRequest.id_request);
                                  void fetchRequestChat(primaryRequest.id_request);
                                }}
                                className="rounded-xl bg-bird-blue px-6 py-3 text-sm font-black text-white shadow-lg shadow-bird-blue/20"
                              >
                                {currentLanguage.startsWith('es') ? 'Abrir chat' : 'Open chat'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="relative grid h-full min-h-[520px] place-items-center overflow-hidden bg-slate-950 p-8 text-center text-white">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(0,144,255,0.42),transparent_30%),radial-gradient(circle_at_80%_70%,rgba(255,199,0,0.22),transparent_28%)]" />
                        <div className="absolute inset-x-12 top-16 h-px bg-white/10" />
                        <div className="relative max-w-lg">
                          <div className="mx-auto mb-8 grid h-28 w-28 place-items-center rounded-full bg-white/10 ring-1 ring-white/15">
                            <div className="grid h-20 w-20 place-items-center rounded-full bg-bird-blue shadow-[0_0_40px_rgba(0,144,255,0.55)]">
                              <svg className="h-9 w-9" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 21l-4.35-4.35m1.6-5.4a7 7 0 11-14 0 7 7 0 0114 0z" />
                              </svg>
                            </div>
                          </div>
                          <p className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-bird-yellow">{currentLanguage.startsWith('es') ? 'Búsqueda en progreso' : 'Matching in progress'}</p>
                          <h3 className="text-4xl font-black leading-tight">{currentLanguage.startsWith('es') ? 'Buscando al profesional ideal' : 'Finding the right pro'}</h3>
                          <p className="mx-auto mt-4 max-w-md text-sm font-semibold leading-7 text-white/75">
                            {currentLanguage.startsWith('es')
                              ? 'Estamos buscando un profesional verificado cerca de tu dirección. En cuanto uno acepte, esto se convertirá en tu vista de ruta en vivo.'
                              : 'We are looking for a verified professional near your address. As soon as one accepts, this turns into your live route view.'}
                          </p>

                          <div className="mt-8 grid grid-cols-3 gap-3 text-left">
                            {[
                              currentLanguage.startsWith('es') ? 'Solicitud enviada' : 'Request sent',
                              currentLanguage.startsWith('es') ? 'Profesionales cerca' : 'Pros nearby',
                              currentLanguage.startsWith('es') ? 'Ruta en vivo después' : 'Live route next',
                            ].map((label, index) => (
                              <div key={label} className="rounded-2xl border border-white/10 bg-white/10 p-3">
                                <div className={`mb-3 h-2 w-2 rounded-full ${index <= 1 ? 'bg-bird-yellow' : 'bg-white/35'}`} />
                                <p className="text-xs font-black leading-5 text-white">{label}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {workerProfile && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
                <div className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-[1.5rem] bg-white shadow-2xl">
                  <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-bird-blue">{currentLanguage.startsWith('es') ? 'Profesional verificado' : 'Verified professional'}</p>
                      <h3 className="mt-1 text-xl font-black text-slate-950">{currentLanguage.startsWith('es') ? 'Perfil y trabajos completados' : 'Profile and completed work'}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWorkerProfile(null)}
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-950"
                      aria-label={currentLanguage.startsWith('es') ? 'Cerrar perfil del profesional' : 'Close worker profile'}
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="p-5 sm:p-6">
                    <div className="grid gap-5 md:grid-cols-[280px_minmax(0,1fr)]">
                      <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                        <div className="flex items-center gap-4">
                          {workerProfile.worker.profile_image_url ? (
                            <img
                              src={workerProfile.worker.profile_image_url}
                              alt={workerProfile.worker.name}
                              className="h-16 w-16 rounded-2xl object-cover"
                            />
                          ) : (
                            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-bird-blue text-2xl font-black text-white">
                              {workerProfile.worker.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <h4 className="truncate text-lg font-black text-slate-950">{workerProfile.worker.name}</h4>
                            <p className="mt-1 text-xs font-bold text-emerald-700">{currentLanguage.startsWith('es') ? 'Identidad verificada' : 'Identity verified'}</p>
                          </div>
                        </div>
                        <p className="mt-4 text-sm font-semibold leading-6 text-slate-600">
                          {workerProfile.worker.bio || (currentLanguage.startsWith('es') ? 'Este profesional todavía no ha agregado una biografía.' : 'This professional has not added a biography yet.')}
                        </p>
                        <div className="mt-5 grid grid-cols-2 gap-2">
                          <div className="rounded-xl bg-white p-3">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{currentLanguage.startsWith('es') ? 'Calificación' : 'Rating'}</p>
                            <p className="mt-1 text-base font-black text-slate-950">
                              {workerProfile.worker.rating_average != null
                                ? `${Number(workerProfile.worker.rating_average).toFixed(1)} / 5`
                                : currentLanguage.startsWith('es') ? 'Nuevo' : 'New'}
                            </p>
                            <p className="text-[10px] font-bold text-slate-400">{workerProfile.worker.rating_count} {currentLanguage.startsWith('es') ? 'reseñas' : 'reviews'}</p>
                          </div>
                          <div className="rounded-xl bg-white p-3">
                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{currentLanguage.startsWith('es') ? 'Trabajos' : 'Jobs'}</p>
                            <p className="mt-1 text-base font-black text-slate-950">{workerProfile.worker.completed_jobs}</p>
                            <p className="text-[10px] font-bold text-slate-400">{currentLanguage.startsWith('es') ? 'completados' : 'completed'}</p>
                          </div>
                        </div>
                        <p className="mt-4 text-xs font-bold text-slate-500">{workerProfile.worker.experience_label}</p>
                      </aside>

                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{currentLanguage.startsWith('es') ? 'Portafolio' : 'Portfolio'}</p>
                            <h4 className="mt-1 text-lg font-black text-slate-950">{currentLanguage.startsWith('es') ? 'Trabajos anteriores' : 'Previous work'}</h4>
                          </div>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                            {workerProfile.portfolio.length} {currentLanguage.startsWith('es') ? 'fotos' : 'photos'}
                          </span>
                        </div>

                        {workerProfile.portfolio.length > 0 ? (
                          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {workerProfile.portfolio.map((photo) => (
                              <figure key={photo.id_photo} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                                {photo.image_url ? (
                                  <img
                                    src={photo.image_url}
                                     alt={photo.description || (currentLanguage.startsWith('es') ? 'Trabajo completado' : 'Completed work')}
                                    className="aspect-square w-full object-cover"
                                  />
                                ) : (
                                    <div className="grid aspect-square place-items-center text-xs font-bold text-slate-400">{currentLanguage.startsWith('es') ? 'Sin imagen' : 'No image'}</div>
                                )}
                                {photo.description && (
                                  <figcaption className="line-clamp-2 p-2.5 text-xs font-semibold text-slate-600">
                                    {photo.description}
                                  </figcaption>
                                )}
                              </figure>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                            <p className="text-sm font-black text-slate-700">{currentLanguage.startsWith('es') ? 'Aún no hay fotos en el portafolio' : 'No portfolio photos yet'}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">{currentLanguage.startsWith('es') ? 'Usa las calificaciones, trabajos completados y experiencia para tomar tu decisión.' : 'Use ratings, completed jobs and experience to make your decision.'}</p>
                          </div>
                        )}

                        {(pendingWorkerApproval || pendingCounter) && (
                          <div className="mt-5 flex flex-col gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
                            <button
                              type="button"
                              disabled={requestActionBusy}
                              onClick={() => setPendingDecision({ kind: pendingCounter ? 'counter' : 'worker', decision: 'decline' })}
                              className="rounded-xl border border-red-200 bg-white px-5 py-3 text-sm font-black text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              {currentLanguage.startsWith('es') ? 'Rechazar' : 'Decline'}
                            </button>
                            <button
                              type="button"
                              disabled={requestActionBusy}
                              onClick={() => setPendingDecision({ kind: pendingCounter ? 'counter' : 'worker', decision: 'accept' })}
                              className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-black disabled:opacity-50"
                            >
                              {currentLanguage.startsWith('es') ? (pendingCounter ? 'Aceptar contraoferta' : 'Aprobar profesional') : (pendingCounter ? 'Accept counter offer' : 'Approve professional')}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {openChatRequestId && primaryRequest?.id_request === openChatRequestId && (
              <div className="absolute inset-0 z-40 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
                <div className="flex h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[1.5rem] bg-white shadow-2xl sm:h-[680px] sm:rounded-[1.5rem]">
                  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-bird-blue">
                        {currentLanguage.startsWith('es') ? 'Solicitud' : 'Request'} #{primaryRequest.id_request}
                      </p>
                      <h3 className="truncate text-lg font-black text-slate-950">
                        {currentLanguage.startsWith('es') ? `Chatear con ${primaryRequest.assigned_worker?.name || 'tu profesional'}` : `Chat with ${primaryRequest.assigned_worker?.name || 'your professional'}`}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpenChatRequestId(null)}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-950"
                      aria-label={currentLanguage.startsWith('es') ? 'Cerrar chat' : 'Close chat'}
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4 sm:p-5">
                    {(chatByRequest[openChatRequestId] || []).length === 0 ? (
                      <div className="grid h-full place-items-center text-center">
                        <div>
                          <p className="text-base font-black text-slate-700">{currentLanguage.startsWith('es') ? 'Inicia la conversacion' : 'Start the conversation'}</p>
                          <p className="mt-1 text-sm font-semibold text-slate-500">
                            {currentLanguage.startsWith('es') ? 'Pregunta sobre la llegada, materiales o detalles de esta solicitud.' : 'Ask about arrival, materials or details for this request.'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      (chatByRequest[openChatRequestId] || []).map((message) => {
                        const mine = message.sender_role === 'client';
                        return (
                          <div key={message.id_message} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[82%] rounded-2xl px-4 py-3 ${
                              mine ? 'bg-bird-blue text-white' : 'border border-slate-200 bg-white text-slate-800'
                            }`}>
                              {message.image_url && (
                                <img
                                  src={message.image_url}
                                  alt={currentLanguage.startsWith('es') ? 'Adjunto del chat' : 'Chat attachment'}
                                  className="mb-2 max-h-52 w-full rounded-xl object-cover"
                                />
                              )}
                              {message.message && <p className="whitespace-pre-wrap text-sm font-semibold leading-6">{message.message}</p>}
                              <p className={`mt-1 text-[10px] font-bold ${mine ? 'text-white/70' : 'text-slate-400'}`}>
                                {new Date(message.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="border-t border-slate-200 bg-white p-4">
                    {chatImage[openChatRequestId] && (
                      <div className="mb-2 flex items-center justify-between rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">
                        <span className="truncate">{chatImage[openChatRequestId]?.name}</span>
                        <button type="button" onClick={() => setChatImage((prev) => ({ ...prev, [openChatRequestId]: null }))}>
                          {currentLanguage.startsWith('es') ? 'Quitar' : 'Remove'}
                        </button>
                      </div>
                    )}
                    <div className="flex items-end gap-2">
                      <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:border-bird-blue hover:text-bird-blue">
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0] || null;
                            setChatImage((prev) => ({ ...prev, [openChatRequestId]: file }));
                            event.target.value = '';
                          }}
                        />
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828L18 9.828a4 4 0 00-5.657-5.657L5.757 10.757a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                      </label>
                      <textarea
                        value={chatMessage[openChatRequestId] || ''}
                        onChange={(event) => setChatMessage((prev) => ({ ...prev, [openChatRequestId]: event.target.value }))}
                        placeholder={currentLanguage.startsWith('es') ? 'Escribe un mensaje...' : 'Write a message...'}
                        rows={1}
                        className="min-h-11 flex-1 resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-bird-blue"
                      />
                      <button
                        type="button"
                        disabled={chatBusyId === openChatRequestId}
                        onClick={() => void sendRequestChat(openChatRequestId)}
                        className="h-11 shrink-0 rounded-xl bg-bird-blue px-5 text-sm font-black text-white disabled:opacity-50"
                      >
                        {chatBusyId === openChatRequestId ? (currentLanguage.startsWith('es') ? 'Enviando' : 'Sending') : (currentLanguage.startsWith('es') ? 'Enviar' : 'Send')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {pendingDecision && primaryRequest && (
              <div className="absolute inset-0 z-50 grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm">
                <div className="w-full max-w-md rounded-[1.5rem] bg-white p-6 shadow-2xl">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-full ${
                    pendingDecision.decision === 'decline' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-bird-blue'
                  }`}>
                    <span className="text-xl font-black">{pendingDecision.decision === 'decline' ? '!' : 'OK'}</span>
                  </div>
                  <h3 className="mt-4 text-xl font-black text-slate-950">
                    {pendingDecision.kind === 'request'
                      ? (currentLanguage.startsWith('es') ? `¿Cancelar la solicitud #${primaryRequest.id_request}?` : `Cancel request #${primaryRequest.id_request}?`)
                      : pendingDecision.decision === 'decline'
                      ? pendingDecision.kind === 'worker'
                        ? (currentLanguage.startsWith('es') ? '¿Buscar otro profesional?' : 'Find another professional?')
                        : (currentLanguage.startsWith('es') ? '¿Rechazar esta contraoferta?' : 'Decline this counter offer?')
                      : pendingDecision.kind === 'worker'
                        ? (currentLanguage.startsWith('es') ? '¿Aprobar a este profesional?' : 'Approve this professional?')
                        : (currentLanguage.startsWith('es') ? '¿Aceptar esta contraoferta?' : 'Accept this counter offer?')}
                  </h3>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                    {pendingDecision.kind === 'request'
                      ? (currentLanguage.startsWith('es')
                        ? 'Fixlife dejará de buscar coincidencias para esta solicitud. Si hay un profesional asignado, será liberado y esta acción no se puede deshacer.'
                        : 'Fixlife will stop matching this request. An assigned professional will be released and this action cannot be undone.')
                      : pendingDecision.decision === 'decline'
                      ? (currentLanguage.startsWith('es')
                        ? 'Este profesional será removido de esta solicitud y Fixlife continuará buscando coincidencias.'
                        : 'This professional will be removed from this request and Fixlife will continue matching.')
                      : pendingDecision.kind === 'counter'
                        ? (currentLanguage.startsWith('es')
                          ? `El estimado del servicio cambiará a $${Number(primaryRequest.proposed_budget || 0).toFixed(2)} y el pago será el siguiente paso.`
                          : `The service estimate will change to $${Number(primaryRequest.proposed_budget || 0).toFixed(2)} and payment will be the next step.`)
                        : (currentLanguage.startsWith('es')
                          ? 'El profesional será aprobado y el pago será el siguiente paso.'
                          : 'The professional will be approved and payment will be the next step.')}
                  </p>
                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={requestActionBusy}
                      onClick={() => setPendingDecision(null)}
                      className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
                    >
                      {currentLanguage.startsWith('es') ? 'Volver' : 'Go back'}
                    </button>
                    <button
                      type="button"
                      disabled={requestActionBusy}
                      onClick={async () => {
                        const decision = pendingDecision;
                        await submitRequestDecision(decision.kind, decision.decision);
                        setPendingDecision(null);
                      }}
                      className={`rounded-xl px-4 py-3 text-sm font-black text-white disabled:opacity-50 ${
                        pendingDecision.decision === 'decline' || pendingDecision.kind === 'request'
                          ? 'bg-red-600 hover:bg-red-700'
                          : 'bg-slate-950 hover:bg-black'
                      }`}
                    >
                      {requestActionBusy
                        ? (currentLanguage.startsWith('es') ? 'Guardando...' : 'Saving...')
                        : pendingDecision.kind === 'request'
                          ? (currentLanguage.startsWith('es') ? 'Cancelar solicitud' : 'Cancel request')
                          : (currentLanguage.startsWith('es') ? 'Confirmar' : 'Confirm')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
};

