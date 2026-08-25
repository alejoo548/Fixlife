import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Moon, Sun, HelpCircle, User } from 'lucide-react';
import { API_ENDPOINTS } from '../../config/api';
import { NavbarProps, AuthMode } from '../../types';
import { Logo } from '../common/Logo';
import { useAuth } from '../../context/AuthContext';
import { NotificationCenter } from '../common/NotificationCenter';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import UserThemeToggle from '../common/UserThemeToggle';
import { getToken } from '../../utils/session';
import { useUserTheme } from '../../hooks/useUserTheme';
import { loadLeaflet } from '../../utils/leafletLoader';
import { useSSE } from '../../hooks/useSSE';
import { useServiceRequestChat } from '../modals/hooks/useServiceRequestChat';
import { canUseRequestChat, hasPendingCounter, hasPendingWorkerApproval } from '../modals/serviceRequestHelpers';
import { showSweetToast } from '../../utils/sweetAlert';
import { useOnboardingTour } from '../../hooks/useOnboardingTour';
import { normalizeImageUrl } from '../../utils/imageUrls';
import { localizeClientServiceName } from '../../utils/clientTranslations';


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

const requestStatusCopy = (statusRaw: ClientRequestStatus, t: (key: string, opts?: any) => string) => {
  const status = String(statusRaw || '').toLowerCase();
  const tone = (key: string, cls: string) => ({
    label: t(`navbar.myRequestTracker.status.${key}.label`),
    hint: t(`navbar.myRequestTracker.status.${key}.hint`),
    tone: cls,
  });
  if (status === 'done') return tone('done', 'bg-slate-100 text-slate-700 border-slate-200');
  if (status === 'cancelled') return tone('cancelled', 'bg-red-50 text-red-600 border-red-100');
  if (status === 'awaiting_confirmation') return tone('awaitingConfirmation', 'bg-amber-50 text-amber-700 border-amber-100');
  if (status === 'completion_pending') return tone('completionPending', 'bg-emerald-50 text-emerald-700 border-emerald-100');
  if (status === 'finish_pending') return tone('finishPending', 'bg-violet-50 text-violet-700 border-violet-100');
  if (status === 'in_progress') return tone('inProgress', 'bg-blue-50 text-blue-700 border-blue-100');
  if (status === 'start_pending') return tone('startPending', 'bg-blue-50 text-blue-700 border-blue-100');
  if (status === 'arrived') return tone('arrived', 'bg-violet-50 text-violet-700 border-violet-100');
  if (status === 'route_in_progress') return tone('routeInProgress', 'bg-sky-50 text-sky-700 border-sky-100');
  if (status === 'paid') return tone('paid', 'bg-emerald-50 text-emerald-700 border-emerald-100');
  if (status === 'payment_pending') return tone('paymentPending', 'bg-orange-50 text-orange-700 border-orange-100');
  if (status === 'assigned') return tone('assigned', 'bg-sky-50 text-sky-700 border-sky-100');
  return tone('default', 'bg-slate-100 text-slate-700 border-slate-200');
};

const formatRequestSchedule = (request: ClientRequestSummary | null, t: (key: string, opts?: any) => string) => {
  if (!request) return '';
  if (String(request.booking_type || 'express').toLowerCase() !== 'scheduled') return t('navbar.myRequestTracker.schedule.expressVisit');

  const rawStart = request.scheduled_start_time || (
    request.scheduled_date && request.scheduled_time
      ? `${request.scheduled_date}T${request.scheduled_time}`
      : ''
  );
  if (!rawStart) return t('navbar.myRequestTracker.schedule.scheduledVisit');

  const start = new Date(rawStart);
  if (Number.isNaN(start.getTime())) return t('navbar.myRequestTracker.schedule.scheduledVisit');

  return start.toLocaleDateString('en-US', {
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

const getRequestProgressLabels = (t: (key: string, opts?: any) => any): string[] =>
  t('navbar.myRequestTracker.progressLabels', { returnObjects: true }) as string[];

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
  onCloseAuth,
  onOpenWorkerAuth,
  onCloseWorkerAuth,
  onStartBooking,
  onOpenProfile,
  onGoHome,
  onNavigateSection,
  onSelectCategory,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const authToken = getToken();
  const { startTour } = useOnboardingTour({
    userId: user?.id,
    isLoggedIn: Boolean(user),
    onOpenAuth: () => onOpenAuth('signin'),
    onCloseAuth: () => onCloseAuth?.(),
    onOpenWorkerAuth: (mode) => onOpenWorkerAuth?.(mode),
    onCloseWorkerAuth: () => onCloseWorkerAuth?.(),
  });
  const { isDark, toggleTheme } = useUserTheme();

  const fullName = [user?.name, user?.lastname].filter(Boolean).join(' ');

  const initials = fullName
    .split(' ')
    .filter(Boolean)
    .map((part: string) => part[0]?.toUpperCase())
    .join('')
    .slice(0, 2);

  const profileImageUrl = useMemo(() => normalizeImageUrl(user?.profile_image), [user?.profile_image]);

  const translateNavLabel = (value: string) => {
    const labels: Record<string, string> = {
      Services: t('navigation.items.0.name'),
      Professionals: t('navigation.items.1.name'),
      Categories: t('navigation.items.2.name'),
      Plumbing: t('navigation.items.2.items.0.name'),
      Electrical: t('navigation.items.2.items.1.name'),
      Cleaning: t('navigation.items.2.items.2.name'),
      Landscaping: t('navigation.items.2.items.3.name'),
      Mechanics: t('navigation.items.2.items.4.name'),
      Help: t('navigation.items.3.name'),
      Support: t('navigation.items.3.items.0.name'),
      'How it works': t('navigation.items.3.items.1.name'),
      Reviews: t('navigation.items.4.name'),
    };
    return labels[value] || value;
  };

  const [activeItem, setActiveItem] = useState<number | null>(null);
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
  const primaryRequestStatus = requestStatusCopy(primaryRequest?.status || 'pending', t);
  const requestProgressLabels = useMemo(() => getRequestProgressLabels(t), [t]);
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

  const handleMouseEnter = (index: number) => {
    setActiveItem(index);
  };

  const handleMouseLeave = () => {
    setActiveItem(null);
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
    navigate('/mis-servicios');
  };

  useEffect(() => {
    if (!user || typeof window === 'undefined') return;
    const searchParams = new URLSearchParams(location.search);
    const requestedId = searchParams.get('request');
    const openRequestsParam = searchParams.get('openRequests');

    if (requestedId || openRequestsParam === 'true') {
      setIsRequestModalOpen(true);
      if (requestedId) {
        const idNum = Number(requestedId);
        if (!Number.isNaN(idNum) && idNum > 0) {
          setSelectedRequestId(idNum);
        }
      }
    }
  }, [location.search, user]);

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
        throw new Error(payload?.error || t('navbar.myRequestTracker.loadRequestError'));
      }

      const requests = Array.isArray(payload?.requests) ? payload.requests : [];
      setClientRequests(
        requests.filter((request: ClientRequestSummary) => {
          const s = String(request.status || '').toLowerCase();
          return !isCancelledRequest(request) && s !== 'done';
        })
      );
      void showSweetToast({ tone: 'success', message: t('navbar.myRequestTracker.requestUpdated') });
    } catch (error: any) {
      const rawMessage = String(error?.message || '');
      setRequestsError(
        rawMessage.toLowerCase().includes('failed to fetch')
          ? t('navbar.myRequestTracker.connectionError')
          : rawMessage || t('navbar.myRequestTracker.refreshError')
      );
    } finally {
      setRequestsLoading(false);
    }
  }, [authToken, user]);

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
      setRequestActionMessage(String(error?.message || 'Could not load this professional.'));
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
        throw new Error(payload?.error || 'Could not save your decision.');
      }
      setWorkerProfile(null);
      if (kind === 'request') {
        setClientRequests((current) =>
          current.filter((request) => request.id_request !== primaryRequest.id_request)
        );
        setSelectedRequestId(null);
      }
      setRequestActionMessage(
        kind === 'request'
          ? `Request #${primaryRequest.id_request} was cancelled.`
          : decision === 'accept'
          ? kind === 'counter'
            ? 'Counter offer accepted. Worker can start route.'
            : 'Professional approved. Worker can start route.'
          : 'Declined. Fixlife will continue looking for another professional.'
      );
      await fetchClientRequests();
    } catch (error: any) {
      setRequestActionMessage(String(error?.message || 'Could not save your decision.'));
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
      if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Could not save approval.');
      setRequestActionMessage(payload?.message || 'Approval saved.');

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
      setRequestActionMessage(String(error?.message || 'Could not save approval.'));
    } finally {
      setRequestActionBusy(false);
    }
  };

  const handleNavItemClick = (itemName: string) => {
    setIsAccountOpen(false);
    setIsMobileMenuOpen(false);

    switch (itemName) {
      case 'Services':
      case 'Categories':
        onNavigateSection?.('services');
        break;
      case 'Professionals':
        onNavigateSection?.('professionals');
        break;
      case 'Help':
        onNavigateSection?.('faq');
        break;
      case 'Reviews':
        navigate('/leave-review');
        break;
      default:
        break;
    }
  };

  const handleSubItemClick = (parentName: string, subItem: string) => {
    setIsAccountOpen(false);
    setIsMobileMenuOpen(false);

    if (parentName === 'Categories') {
      onSelectCategory?.(subItem);
      return;
    }

    switch (subItem) {
      case 'Support':
        onNavigateSection?.('faq');
        break;
      case 'How it works':
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
      worker_location: (data: unknown) => {
        const payload = data as {
          id_request?: number;
          latitude?: number;
          longitude?: number;
          is_online?: boolean;
          request_status?: string;
        } | null;
        const idRequest = Number(payload?.id_request || 0);
        const lat = Number(payload?.latitude);
        const lng = Number(payload?.longitude);
        if (!idRequest || !Number.isFinite(lat) || !Number.isFinite(lng)) return;

        setClientRequests((current) =>
          current.map((request) => {
            if (request.id_request !== idRequest || !request.assigned_worker) return request;
            return {
              ...request,
              status: payload?.request_status || request.status,
              assigned_worker: {
                ...request.assigned_worker,
                latitude: lat,
                longitude: lng,
                is_online: payload?.is_online ?? request.assigned_worker.is_online ?? true,
              },
            };
          })
        );
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
        const newRequestMessage = t('navbar.myRequestTracker.newRequestAdded', { id: request.id_request });
        setLiveRequestNotice(newRequestMessage);
        void showSweetToast({ tone: 'info', message: newRequestMessage });
        continue;
      }
      if (
        request.proposed_budget != null &&
        (request.counter_status == null || request.counter_status === 'pending') &&
        (previous.counterStatus !== counterStatus || previous.proposedBudget !== proposedBudget)
      ) {
        const counterOfferMessage = t('navbar.myRequestTracker.counterOfferReceived', {
          name: request.assigned_worker?.name || t('navbar.myRequestTracker.yourProfessionalFallback'),
          id: request.id_request,
        });
        setLiveRequestNotice(counterOfferMessage);
        void showSweetToast({
          tone: 'warning',
          message: counterOfferMessage,
        });
        continue;
      }
      if (previous.status !== status) {
        const statusChangedMessage = t('navbar.myRequestTracker.statusChanged', {
          id: request.id_request,
          status: requestStatusCopy(status, t).label,
        });
        setLiveRequestNotice(statusChangedMessage);
        void showSweetToast({
          tone: 'info',
          message: statusChangedMessage,
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

  const navTourId = (name: string): string | undefined => {
    switch (name) {
      case 'Services':
      case 'Categories':
        return 'nav-services';
      case 'Professionals':
        return 'nav-professionals';
      case 'Help':
        return 'nav-help';
      case 'Reviews':
        return 'nav-reviews';
      default:
        return undefined;
    }
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-16 lg:h-20 flex items-center justify-between px-6 lg:px-16 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-gray-100 dark:border-white/5 z-50 transition-all duration-300">
        
        {/* Left side: Logo + Navigation Links */}
        <div className="flex items-center gap-12 h-full">
          <div className="flex items-center transform hover:scale-105 transition-transform duration-300">
            <Logo onClick={handleGoHomeClick} />
          </div>

          <nav
            className="hidden xl:flex items-center h-full gap-8"
            onMouseLeave={handleMouseLeave}
          >
            {navItems.map((item, index) => (
              <div
                key={item.name}
                data-tour={navTourId(item.name)}
                className="group relative flex items-center justify-center h-16 cursor-pointer text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white transition-colors duration-200"
                onClick={() => handleNavItemClick(item.name)}
              >
                <span className="font-semibold text-sm tracking-wide transform group-hover:scale-102 transition-transform duration-200">{translateNavLabel(item.name)}</span>

                {item.items && (
                  <div className="absolute top-14 left-0 w-44 pt-4 opacity-0 translate-y-[-10px] pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto transition-all duration-300 ease-out z-30">
                    <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden shadow-xl p-1 flex flex-col gap-1">
                      {item.items.map((subItem) => (
                        <button
                          key={subItem}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleSubItemClick(item.name, subItem);
                          }}
                          className="block w-full px-4 py-2 text-left text-sm text-gray-600 dark:text-slate-300 hover:bg-bird-blue/5 dark:hover:bg-bird-blue/15 hover:text-bird-blue dark:hover:text-bird-blue rounded-lg transition-colors font-medium"
                        >
                          {translateNavLabel(subItem)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </nav>
        </div>

        {/* Right side: Actions */}
        <div className="hidden xl:flex items-center gap-4">
          {!user ? (
            <>
              <button
                type="button"
                onClick={handleBookingClick}
                data-tour="nav-book-service"
                className="px-5 py-2.5 rounded-full bg-slate-950 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-950 font-bold text-sm tracking-wide shadow-md transition-all duration-300 shrink-0"
              >
                {t('navbar.bookService')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleBookingClick}
                data-tour="nav-book-service"
                className="px-5 py-2.5 rounded-full bg-slate-950 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-950 font-bold text-sm tracking-wide shadow-md transition-all duration-300 shrink-0"
              >
                {t('navbar.bookService')}
              </button>

              {/* Utility Dock (Solo Request + Notificaciones) */}
              <div className="flex items-center gap-1 bg-gray-50/80 dark:bg-slate-800/40 border border-gray-200/50 dark:border-white/10 rounded-2xl px-1.5 py-1 shadow-inner h-11">
                <button
                  type="button"
                  onClick={handleMyRequestClick}
                  title={t('navbar.myRequests')}
                  className="group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:text-bird-blue dark:text-slate-400 dark:hover:text-bird-blue transition-colors duration-200"
                  aria-label={t('navbar.openMyServiceRequest')}
                >
                  <svg className="h-5 w-5 transform group-hover:scale-105 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 012-2z" />
                  </svg>
                  {openRequestsCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-bird-yellow px-1 text-[8px] font-black text-slate-900 shadow">
                      {openRequestsCount}
                    </span>
                  )}
                </button>
                <NotificationCenter token={authToken} className="shrink-0 flex items-center justify-center" variant="plain" />
              </div>
            </>
          )}

          <LanguageSwitcher />

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={t('navbar.toggleTheme')}
            title={isDark ? t('navbar.switchToLightMode') : t('navbar.switchToDarkMode')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors duration-200 border border-gray-200/50 dark:border-white/10 bg-white/50 dark:bg-slate-900/50 shadow-sm"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* Replay Tour */}
          <button
            type="button"
            data-tour="help-tour-button"
            onClick={startTour}
            aria-label={t('navbar.replayTour')}
            title={t('navbar.replayTourTitle')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors duration-200 border border-gray-200/50 dark:border-white/10 bg-white/50 dark:bg-slate-900/50 shadow-sm"
          >
            <HelpCircle className="h-4 w-4" />
          </button>

          {/* User Account Menu */}
          <div className="group relative" data-tour="nav-account" onMouseLeave={() => setIsAccountOpen(false)}>
            <button
              type="button"
              data-tour="nav-account-trigger"
              onClick={() => setIsAccountOpen(!isAccountOpen)}
              className="group flex h-16 items-center gap-2 px-2 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white transition-all duration-300"
            >
              {user && (
                profileImageUrl ? (
                  <img
                    src={profileImageUrl}
                    alt={t('navbar.profileImageAlt')}
                    className="w-8 h-8 rounded-full object-cover border border-gray-200 dark:border-white/10"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-bird-blue text-white flex items-center justify-center text-xs font-bold">
                    {initials || 'U'}
                  </div>
                )
              )}

              <span className="max-w-40 truncate font-bold text-sm tracking-wide">
                {user ? user.name : t('navbar.account')}
              </span>
              <svg
                className={`w-4 h-4 transition-transform duration-300 ${isAccountOpen ? 'rotate-180 text-bird-blue' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <div
              className={`absolute top-14 right-0 w-52 bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/10 rounded-xl shadow-xl overflow-hidden transition-all duration-300 origin-top-right z-50 cursor-default
                  ${isAccountOpen ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-1">
                {!user ? (
                  <>
                    <button
                      onClick={(e) => handleAuthClick(e, 'signin')}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-600 dark:text-slate-300 hover:bg-bird-blue/5 dark:hover:bg-bird-blue/15 hover:text-bird-blue rounded-lg transition-colors text-left font-medium"
                    >
                      <svg className="w-4 h-4 text-bird-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l-4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                      </svg>
                      {t('navbar.signIn')}
                    </button>

                    <button
                      onClick={(e) => handleAuthClick(e, 'signup')}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-600 dark:text-slate-300 hover:bg-bird-blue/5 dark:hover:bg-bird-blue/15 hover:text-bird-blue rounded-lg transition-colors text-left font-medium"
                    >
                      <svg className="w-4 h-4 text-bird-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                      </svg>
                      {t('navbar.signUp')}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleProfileClick}
                      data-tour="nav-profile-item"
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-600 dark:text-slate-300 hover:bg-bird-blue/5 dark:hover:bg-bird-blue/15 hover:text-bird-blue rounded-lg transition-colors text-left font-medium"
                    >
                      <User className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                      {t('navbar.myProfile')}
                    </button>

                    <button
                      onClick={handleMyRequestClick}
                      data-tour="nav-my-requests-item"
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-sm text-gray-600 dark:text-slate-300 hover:bg-bird-blue/5 dark:hover:bg-bird-blue/15 hover:text-bird-blue rounded-lg transition-colors text-left font-medium"
                    >
                      <div className="flex items-center gap-3">
                        <svg className="w-4 h-4 text-bird-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <span>{t('navbar.myRequest')}</span>
                      </div>
                      {openRequestsCount > 0 && (
                        <span className="rounded-full bg-bird-yellow px-2 py-0.5 text-[10px] font-black text-slate-900">
                          {openRequestsCount}
                        </span>
                      )}
                    </button>

                    <button
                      onClick={handleMyRequestsHistoryClick}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-600 dark:text-slate-300 hover:bg-bird-blue/5 dark:hover:bg-bird-blue/15 hover:text-bird-blue rounded-lg transition-colors text-left font-medium"
                    >
                      <svg className="w-4 h-4 text-gray-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v14l-3-2-3 2-3-2-3 2V6a2 2 0 012-2z" />
                      </svg>
                      {t('navbar.myRequests')}
                    </button>

                    <div className="my-1 border-t border-gray-100 dark:border-white/5" />

                    <button
                      onClick={handleLogoutClick}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-500 dark:text-rose-400 hover:bg-red-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors text-left font-medium"
                    >
                      <svg className="w-4 h-4 text-red-400 dark:text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      {t('navbar.logOut')}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="xl:hidden flex items-center gap-1">
          {user && <NotificationCenter token={authToken} className="mr-1" />}
          <LanguageSwitcher />
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={t('navbar.toggleTheme')}
            title={isDark ? t('navbar.switchToLightMode') : t('navbar.switchToDarkMode')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-gray-700 dark:text-slate-300 hover:text-bird-blue transition-colors"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 text-gray-700 dark:text-slate-300 hover:text-bird-blue focus:outline-none"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
            </svg>
          </button>
        </div>
      </header>

      <div
        className={`fixed inset-0 z-[220] bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl xl:hidden transition-all duration-300 ease-in-out ${isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
      >
        <div className="flex flex-col h-full p-6">
          <div className="flex shrink-0 justify-between items-center mb-8">
            <Logo onClick={handleGoHomeClick} />
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="p-2 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100"
            >
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col">
          <div className="mb-6">
            <LanguageSwitcher mobile />
          </div>

          <div className="flex flex-col gap-6">
            {navItems.map((item) => (
              <div key={item.name} className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => handleNavItemClick(item.name)}
                  className="text-xl font-bold text-left text-gray-900 dark:text-slate-100 hover:text-bird-blue transition-colors"
                >
                  {translateNavLabel(item.name)}
                </button>
                {item.items && (
                  <div className="flex flex-col gap-2 pl-4 border-l-2 border-bird-blue/30">
                    {item.items.map((subItem) => (
                      <button
                        key={subItem}
                        type="button"
                        onClick={() => handleSubItemClick(item.name, subItem)}
                        className="text-left text-gray-600 dark:text-slate-400 hover:text-bird-blue text-sm py-1 font-medium"
                      >
                        {translateNavLabel(subItem)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-auto pt-8 pb-2 border-t border-gray-200 dark:border-white/10 flex flex-col gap-4">
  {!user ? (
    <>
      <button
        onClick={(e) => handleAuthClick(e, 'signin')}
        className="w-full py-4 rounded-xl bg-gray-100 dark:bg-slate-900 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-slate-100 font-bold active:scale-95 transition-transform shadow-sm"
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
        className="w-full py-4 rounded-xl bg-gray-100 dark:bg-slate-900 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-slate-100 font-bold active:scale-95 transition-transform shadow-sm"
      >
        {t('navbar.myProfile')}
      </button>
      <button
        onClick={handleMyRequestsHistoryClick}
        className="w-full py-4 rounded-xl bg-gray-100 dark:bg-slate-900 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-slate-100 font-bold active:scale-95 transition-transform shadow-sm"
      >
        {t('navbar.myRequests')}
      </button>
      <button
        onClick={handleLogoutClick}
        className="w-full py-4 rounded-xl bg-red-50 dark:bg-rose-900/30 text-red-600 dark:text-rose-400 border border-red-200 dark:border-rose-900/50 font-bold active:scale-95 transition-transform"
      >
        {t('navbar.logOut')}
      </button>
    </>
  )}
</div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isRequestModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 px-3 py-4 sm:p-6 backdrop-blur-md"
          >
            <div className="absolute inset-0" onClick={() => setIsRequestModalOpen(false)} />
            <motion.section
              initial={{ opacity: 0, scale: 0.93, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              transition={{ type: 'spring', damping: 26, stiffness: 340 }}
              className="relative flex max-h-[92vh] h-[92vh] max-h-[920px] w-[95vw] max-w-[1380px] flex-col overflow-hidden rounded-[2.2rem] border border-white/80 dark:border-white/10 bg-white dark:bg-slate-900 shadow-[0_25px_70px_rgba(0,0,0,0.35)] dark:shadow-[0_25px_70px_rgba(0,0,0,0.7)]"
            >
              <div className="border-b border-slate-100 dark:border-white/10 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-6 py-4.5 sm:px-8">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full bg-bird-blue/10 dark:bg-bird-blue/20 border border-bird-blue/20 px-3.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-bird-blue">
                        {t('navbar.myRequestTracker.badge')}
                      </span>
                      {primaryRequest && (
                        <span className="text-xs font-extrabold text-slate-400 dark:text-slate-500">
                          {t('navbar.myRequestTracker.positionOf', { position: selectedRequestPosition, total: orderedClientRequests.length })}
                        </span>
                      )}
                    </div>
                    <h2 className="truncate text-2xl sm:text-3xl font-black leading-tight text-slate-950 dark:text-slate-100 tracking-tight">
                      {primaryRequest ? localizeClientServiceName(primaryRequest.service_name, i18n.language) : t('navbar.openMyServiceRequest')}
                    </h2>
                  </div>

                  <div className="flex items-center gap-2.5">
                    {orderedClientRequests.length > 1 && (
                      <div className="hidden items-center gap-1.5 sm:flex">
                        <button
                          type="button"
                          onClick={() => {
                            const nextIndex = Math.max(0, selectedRequestPosition - 2);
                            setSelectedRequestId(orderedClientRequests[nextIndex]?.id_request || null);
                          }}
                          disabled={selectedRequestPosition <= 1}
                          className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all hover:border-bird-blue hover:text-bird-blue hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                          aria-label={t('navbar.myRequestTracker.prevRequestAria')}
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
                          className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all hover:border-bird-blue hover:text-bird-blue hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                          aria-label={t('navbar.myRequestTracker.nextRequestAria')}
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    )}
                    {primaryRequest && (
                      <span className={`hidden rounded-full border px-4 py-2 text-xs font-black sm:inline-flex shadow-sm ${primaryRequestStatus.tone}`}>
                        {primaryRequestStatus.label}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsRequestModalOpen(false)}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200/80 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 shadow-sm transition-all hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-950 dark:hover:text-white hover:scale-105 active:scale-95"
                      aria-label={t('navbar.myRequestTracker.closeModalAria')}
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {orderedClientRequests.length > 0 && (
                <div className="border-b border-slate-200/80 dark:border-white/10 bg-slate-50/80 dark:bg-slate-950/70 backdrop-blur-sm px-6 py-3.5 sm:px-8">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                      {t('navbar.myRequestTracker.allRequests')}
                    </p>
                    <p className="text-xs font-extrabold text-slate-500 dark:text-slate-400">
                      {t('navbar.myRequestTracker.activeOfTotal', { active: openRequestsCount, total: orderedClientRequests.length })}
                    </p>
                  </div>
                  <div className="flex gap-2.5 overflow-x-auto pb-1.5 custom-scrollbar">
                    {orderedClientRequests.map((request) => {
                      const selected = request.id_request === primaryRequest?.id_request;
                      const requestStatus = requestStatusCopy(request.status, t);
                      return (
                        <button
                          key={request.id_request}
                          type="button"
                          onClick={() => setSelectedRequestId(request.id_request)}
                          aria-pressed={selected}
                          className={`min-w-[210px] max-w-[260px] flex-1 rounded-2xl border px-3.5 py-3 text-left transition-all duration-200 ${
                            selected
                              ? 'border-bird-blue bg-white dark:bg-slate-800 shadow-md ring-2 ring-bird-blue/20 scale-[1.01]'
                              : 'border-slate-200/80 dark:border-white/10 bg-white/70 dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-white/20 hover:bg-white dark:hover:bg-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                              ['done'].includes(String(request.status).toLowerCase())
                                ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                                : ['cancelled'].includes(String(request.status).toLowerCase())
                                  ? 'bg-red-400'
                                  : 'bg-bird-blue shadow-[0_0_8px_rgba(0,144,255,0.4)]'
                            }`} />
                            <span className="truncate text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
                              #{request.id_request}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-sm font-black text-slate-900 dark:text-slate-100">{localizeClientServiceName(request.service_name, i18n.language)}</p>
                          <div className="mt-1.5 flex items-center justify-between gap-2">
                            <span className="truncate text-[11px] font-bold text-slate-500 dark:text-slate-400">{requestStatus.label}</span>
                            <span className="shrink-0 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                              {request.created_at ? new Date(request.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {liveRequestNotice && (
                <div className="flex items-center justify-between gap-3 border-b border-blue-200 dark:border-blue-900/50 bg-blue-50/80 dark:bg-slate-800/80 px-6 py-3 sm:px-8">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-bird-blue shadow-[0_0_0_5px_rgba(0,144,255,0.12)] animate-pulse" />
                    <p className="truncate text-sm font-bold text-blue-900 dark:text-blue-300">{liveRequestNotice}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLiveRequestNotice('')}
                    className="shrink-0 text-xs font-black text-blue-700 dark:text-blue-400 hover:text-blue-950 dark:hover:text-blue-200"
                  >
                    {t('navbar.myRequestTracker.dismiss')}
                  </button>
                </div>
              )}

              <div className="overflow-y-auto bg-slate-50/80 dark:bg-slate-950/60 p-4 sm:p-6">
                {requestsLoading && clientRequests.length === 0 ? (
                  <div className="grid min-h-[520px] place-items-center rounded-[1.8rem] bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 shadow-sm">
                    <div className="text-center">
                      <div className="mx-auto mb-4 h-12 w-12 rounded-full border-4 border-bird-blue/20 border-t-bird-blue animate-spin" />
                      <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('navbar.myRequestTracker.loadingRequest')}</p>
                    </div>
                  </div>
                ) : requestsError ? (
                  <div className="grid min-h-[420px] place-items-center rounded-[1.8rem] border border-sky-100 dark:border-white/10 bg-white dark:bg-slate-900 p-8 text-center shadow-sm">
                    <div className="max-w-md">
                      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-sky-50 dark:bg-sky-900/30 text-bird-blue">
                        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 4v5h5M20 20v-5h-5M5.7 15a7 7 0 0011.6 2M18.3 9A7 7 0 006.7 7" />
                        </svg>
                      </div>
                      <h3 className="text-xl font-black text-slate-950 dark:text-slate-100">{t('navbar.myRequestTracker.reconnecting')}</h3>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">{requestsError}</p>
                      {requestRetryAttempt < 2 && (
                        <p className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-bird-blue">
                          {t('navbar.myRequestTracker.retryingAutomatically')}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setRequestRetryAttempt(0);
                          void fetchClientRequests();
                        }}
                        className="mt-5 rounded-xl bg-bird-blue px-5 py-3 text-sm font-black text-white shadow-lg shadow-bird-blue/20 transition-transform active:scale-95 hover:bg-bird-darkBlue"
                      >
                        {t('navbar.myRequestTracker.retryNow')}
                      </button>
                    </div>
                  </div>
                ) : !primaryRequest ? (
                  <div className="grid min-h-[460px] place-items-center rounded-[1.8rem] bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 p-8 text-center shadow-sm">
                    <div className="max-w-md">
                      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-bird-blue/10 text-bird-blue">
                        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M8 7V3m8 4V3M5 11h14M7 21h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <h3 className="text-2xl font-black text-slate-950 dark:text-slate-100">{t('navbar.myRequestTracker.noActiveRequestTitle')}</h3>
                      <p className="mt-3 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                        {t('navbar.myRequestTracker.noActiveRequestDesc')}
                      </p>
                      <button
                        type="button"
                        onClick={handleBookingClick}
                        className="mt-6 rounded-xl bg-bird-blue px-6 py-3 text-sm font-black text-white shadow-lg shadow-bird-blue/20 transition-transform active:scale-95 hover:bg-bird-darkBlue"
                      >
                        {t('navbar.myRequestTracker.bookService')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={`grid gap-6 ${primaryRequest.assigned_worker && canShowLiveMap ? 'lg:grid-cols-[380px_minmax(0,1fr)] xl:grid-cols-[410px_minmax(0,1fr)]' : 'lg:grid-cols-[420px_minmax(0,1fr)]'}`}>
                    <aside className="space-y-4">
                      <div className="overflow-hidden rounded-[1.6rem] border border-slate-200/80 dark:border-white/10 bg-white dark:bg-slate-900 shadow-sm">
                        <div className="relative bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 p-6 text-white overflow-hidden shadow-md">
                          <div className="absolute top-0 right-0 w-36 h-36 bg-bird-blue/15 rounded-full blur-2xl pointer-events-none" />
                          <div className={`mb-4 inline-flex rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-black text-white shadow-sm`}>
                            {primaryRequestStatus.label}
                          </div>
                          <h3 className="text-2xl font-black leading-tight tracking-tight relative z-10">{localizeClientServiceName(primaryRequest.service_name, i18n.language)}</h3>
                          <p className="mt-2 text-sm font-semibold leading-6 text-white/75 relative z-10">{primaryRequestStatus.hint}</p>
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
                            <div className="relative h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div
                                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-bird-blue to-indigo-500 shadow-[0_0_12px_rgba(0,144,255,0.6)] transition-all duration-500"
                                style={{ width: `${Math.max(12, (primaryRequestStep / (requestProgressLabels.length - 1)) * 100)}%` }}
                              />
                            </div>
                          </div>

                          <div className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-slate-50/80 dark:bg-slate-900/60 p-4">
                            <div className="mb-2 flex items-center gap-2">
                              <svg className="h-4 w-4 text-bird-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 11.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M19.5 9c0 7-7.5 12-7.5 12S4.5 16 4.5 9a7.5 7.5 0 1115 0z" />
                              </svg>
                              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t('navbar.myRequestTracker.location')}</p>
                            </div>
                            <p className="line-clamp-2 text-sm font-extrabold leading-6 text-slate-900 dark:text-slate-100">{primaryRequest.location_text}</p>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-sm">
                              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t('navbar.myRequestTracker.visit')}</p>
                              <p className="mt-2 text-sm font-black leading-5 text-slate-900 dark:text-slate-100">{formatRequestSchedule(primaryRequest, t)}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-sm">
                              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t('navbar.myRequestTracker.budget')}</p>
                              <p className="mt-2 text-lg font-black text-slate-900 dark:text-slate-100">
                                ${Number(primaryRequest.final_budget ?? primaryRequest.budget ?? 0).toFixed(2)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[1.6rem] border border-slate-200/80 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm">
                        <div className="mb-3.5 flex items-center justify-between gap-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t('navbar.myRequestTracker.professional')}</p>
                          {!primaryRequest.assigned_worker && (
                            <span className="rounded-full bg-bird-yellow/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-yellow-700 dark:text-yellow-400">
                              {t('navbar.myRequestTracker.matching')}
                            </span>
                          )}
                        </div>
                        {primaryRequest.assigned_worker ? (
                          <div>
                            <div className="flex items-center gap-3.5">
                              {primaryRequest.assigned_worker.profile_image_url ? (
                                <img
                                  src={normalizeImageUrl(primaryRequest.assigned_worker.profile_image_url)}
                                  alt={primaryRequest.assigned_worker.name}
                                  className="h-12 w-12 rounded-full object-cover ring-4 ring-bird-blue/20 shadow-md"
                                />
                              ) : (
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bird-blue text-lg font-black text-white ring-4 ring-bird-blue/20 shadow-md">
                                  {primaryRequest.assigned_worker.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-base font-black text-slate-950 dark:text-white">{primaryRequest.assigned_worker.name}</p>
                                <p className="text-xs font-extrabold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                  {primaryRequest.assigned_worker.is_online ? t('navbar.myRequestTracker.onlineNow') : t('navbar.myRequestTracker.assignedToRequest')}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => void openWorkerProfile()}
                              disabled={workerProfileLoading}
                              className="mt-4 w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-4 py-3 text-sm font-black text-slate-900 dark:text-slate-100 hover:border-bird-blue hover:text-bird-blue dark:hover:text-bird-blue transition-all duration-200 active:scale-[0.98] disabled:opacity-50 shadow-sm"
                            >
                              {workerProfileLoading ? t('navbar.myRequestTracker.loadingProfile') : t('navbar.myRequestTracker.viewProfilePortfolio')}
                            </button>
                            {canUseRequestChat(primaryRequest) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenChatRequestId(primaryRequest.id_request);
                                  void fetchRequestChat(primaryRequest.id_request);
                                }}
                                className="mt-2.5 w-full rounded-xl bg-gradient-to-r from-bird-blue to-indigo-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-bird-blue/20 hover:shadow-bird-blue/35 transition-all duration-200 active:scale-[0.98]"
                              >
                                {t('navbar.myRequestTracker.chatWith', { name: primaryRequest.assigned_worker.name })}
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="flex gap-3 items-start">
                            <div className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-bird-blue shadow-[0_0_0_6px_rgba(0,144,255,0.12)]" />
                            <p className="text-sm font-semibold leading-6 text-slate-600 dark:text-slate-400">
                              {t('navbar.myRequestTracker.checkingNearbyPros')}
                            </p>
                          </div>
                        )}
                      </div>

                      {pendingCounter && (
                        <div className="rounded-[1.6rem] border border-amber-200 dark:border-amber-900/40 bg-amber-50/80 dark:bg-amber-950/30 p-5 shadow-sm backdrop-blur-sm">
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400">{t('navbar.myRequestTracker.counterOffer')}</p>
                          <div className="mt-2 flex items-end justify-between gap-3">
                            <div>
                              <p className="text-3xl font-black text-slate-950 dark:text-slate-100">
                                ${Number(primaryRequest.proposed_budget || 0).toFixed(2)}
                              </p>
                              <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                                {t('navbar.myRequestTracker.originalEstimate', { amount: Number(primaryRequest.budget || 0).toFixed(2) })}
                              </p>
                            </div>
                          </div>
                          {primaryRequest.counter_message && (
                            <p className="mt-3 rounded-xl border border-amber-100 dark:border-amber-900/30 bg-white/70 dark:bg-slate-900/70 p-3 text-sm font-semibold leading-6 text-slate-700 dark:text-slate-300">
                              {primaryRequest.counter_message}
                            </p>
                          )}
                          <div className="mt-4 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              disabled={requestActionBusy}
                              onClick={() => setPendingDecision({ kind: 'counter', decision: 'decline' })}
                              className="rounded-xl border border-red-200 dark:border-red-900/40 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-black text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-all active:scale-[0.98]"
                            >
                              {t('navbar.myRequestTracker.decline')}
                            </button>
                            <button
                              type="button"
                              disabled={requestActionBusy}
                              onClick={() => setPendingDecision({ kind: 'counter', decision: 'accept' })}
                              className="rounded-xl bg-slate-950 dark:bg-white dark:text-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-black disabled:opacity-50 transition-all active:scale-[0.98]"
                            >
                              {t('navbar.myRequestTracker.acceptOffer')}
                            </button>
                          </div>
                        </div>
                      )}

                      {pendingWorkerApproval && (
                        <div className="rounded-[1.6rem] border border-sky-200 dark:border-sky-900/40 bg-sky-50/80 dark:bg-sky-950/30 p-5 shadow-sm backdrop-blur-sm">
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-700 dark:text-sky-400">{t('navbar.myRequestTracker.approvalNeeded')}</p>
                          <p className="mt-2 text-sm font-semibold leading-6 text-slate-700 dark:text-slate-300">
                            {t('navbar.myRequestTracker.approvalNeededDesc')}
                          </p>
                          <div className="mt-4 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              disabled={requestActionBusy}
                              onClick={() => setPendingDecision({ kind: 'worker', decision: 'decline' })}
                              className="rounded-xl border border-red-200 dark:border-red-900/40 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-black text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-all active:scale-[0.98]"
                            >
                              {t('navbar.myRequestTracker.findAnother')}
                            </button>
                            <button
                              type="button"
                              disabled={requestActionBusy}
                              onClick={() => setPendingDecision({ kind: 'worker', decision: 'accept' })}
                              className="rounded-xl bg-slate-950 dark:bg-white dark:text-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-black disabled:opacity-50 transition-all active:scale-[0.98]"
                            >
                              {t('navbar.myRequestTracker.approvePro')}
                            </button>
                          </div>
                        </div>
                      )}

                      {primaryRequest.workflow_version === 2 && ['arrived', 'start_pending'].includes(primaryStatus) && (
                        <div className="rounded-[1.6rem] border border-blue-200 dark:border-blue-900/40 bg-blue-50/80 dark:bg-blue-950/30 p-5 shadow-sm backdrop-blur-sm">
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-700 dark:text-blue-400">{t('navbar.myRequestTracker.startWorkApproval')}</p>
                          <h4 className="mt-2 text-xl font-black text-slate-950 dark:text-slate-100">{t('navbar.myRequestTracker.workerArrived')}</h4>
                          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-400">
                            {clientStartApproved ? t('navbar.myRequestTracker.startApprovalSaved') : t('navbar.myRequestTracker.startApprovalPrompt')}
                          </p>
                          {canApproveStart && (
                            <button type="button" disabled={requestActionBusy} onClick={() => void approveWorkflowAction('start_work')} className="mt-4 w-full rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-black text-white disabled:opacity-50 hover:bg-blue-700 transition-all active:scale-[0.98]">
                              {t('navbar.myRequestTracker.approveWorkStart')}
                            </button>
                          )}
                        </div>
                      )}

                      {primaryRequest.workflow_version === 2 && ['in_progress', 'finish_pending'].includes(primaryStatus) && (
                        <div className="rounded-[1.6rem] border border-violet-200 dark:border-violet-900/40 bg-violet-50/80 dark:bg-violet-950/30 p-5 shadow-sm backdrop-blur-sm">
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-700 dark:text-violet-400">{t('navbar.myRequestTracker.finishWorkApproval')}</p>
                          <h4 className="mt-2 text-xl font-black text-slate-950 dark:text-slate-100">{t('navbar.myRequestTracker.workInProgress')}</h4>
                          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-400">
                            {clientFinishApproved ? t('navbar.myRequestTracker.finishApprovalSaved') : canApproveFinish ? t('navbar.myRequestTracker.finishApprovalPrompt') : t('navbar.myRequestTracker.finishApprovalLocked')}
                          </p>
                          {canApproveFinish && (
                            <button type="button" disabled={requestActionBusy} onClick={() => void approveWorkflowAction('finish_work')} className="mt-4 w-full rounded-xl bg-violet-600 px-5 py-3.5 text-sm font-black text-white disabled:opacity-50 hover:bg-violet-700 transition-all active:scale-[0.98]">
                              {t('navbar.myRequestTracker.approveWorkFinish')}
                            </button>
                          )}
                        </div>
                      )}

                      {requestActionMessage && (
                        <div className="rounded-xl border border-blue-200 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 text-sm font-bold text-blue-800 dark:text-blue-300">
                          {requestActionMessage}
                        </div>
                      )}

                      {String(primaryRequest.status || '').toLowerCase() === 'payment_pending' && (
                        <div className="rounded-[1.6rem] border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/80 dark:bg-emerald-950/30 p-5 shadow-sm backdrop-blur-sm">
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">{t('navbar.myRequestTracker.nextStep')}</p>
                          <h4 className="mt-2 text-xl font-black text-slate-950 dark:text-slate-100">{t('navbar.myRequestTracker.payForFinishedWork')}</h4>
                          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-400">
                            {t('navbar.myRequestTracker.payToContinue', { amount: Number(primaryRequest.final_budget ?? primaryRequest.budget ?? 0).toFixed(2) })}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setIsRequestModalOpen(false);
                              navigate(`/checkout/${primaryRequest.id_request}`);
                              window.scrollTo(0, 0);
                            }}
                            className="mt-4 w-full rounded-xl bg-emerald-600 px-5 py-3.5 text-sm font-black text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all active:scale-[0.98]"
                          >
                            {t('navbar.myRequestTracker.continueToPayment')}
                          </button>
                        </div>
                      )}

                      {primaryRequest.workflow_version === 2 && ['paid', 'completion_pending'].includes(primaryStatus) && (
                        <div className="rounded-[1.6rem] border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/80 dark:bg-emerald-950/30 p-5 shadow-sm backdrop-blur-sm">
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">{t('navbar.myRequestTracker.finalServiceApproval')}</p>
                          <h4 className="mt-2 text-xl font-black text-slate-950 dark:text-slate-100">{t('navbar.myRequestTracker.paymentCompleted')}</h4>
                          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-400">
                            {clientCompleteApproved ? t('navbar.myRequestTracker.finalApprovalSaved') : t('navbar.myRequestTracker.finalApprovalPrompt')}
                          </p>
                          {canApproveCompletion && (
                            <button type="button" disabled={requestActionBusy} onClick={() => void approveWorkflowAction('complete_service')} className="mt-4 w-full rounded-xl bg-emerald-600 px-5 py-3.5 text-sm font-black text-white disabled:opacity-50 hover:bg-emerald-700 transition-all active:scale-[0.98]">
                              {t('navbar.myRequestTracker.approveServiceCompletion')}
                            </button>
                          )}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={fetchClientRequests}
                        disabled={requestsLoading}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-900 dark:text-slate-100 shadow-sm transition-all hover:border-bird-blue/30 hover:shadow-md active:scale-[0.97] disabled:opacity-60"
                      >
                        <RefreshCw className={`h-4 w-4 ${requestsLoading ? 'animate-spin' : ''}`} />
                        {requestsLoading ? t('navbar.myRequestTracker.refreshing') : t('navbar.myRequestTracker.refreshRequest')}
                      </button>
                      {canCancelRequest && (
                        <button
                          type="button"
                          disabled={requestActionBusy}
                          onClick={() => setPendingDecision({ kind: 'request', decision: 'decline' })}
                          className="w-full rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/30 px-5 py-3 text-sm font-black text-red-700 dark:text-red-400 transition hover:border-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50 active:scale-[0.98]"
                        >
                          {t('navbar.myRequestTracker.cancelThisRequest')}
                        </button>
                      )}
                    </aside>

                    <div className="min-h-[600px] overflow-hidden rounded-[1.6rem] border border-slate-200/80 dark:border-white/10 bg-white dark:bg-slate-900 shadow-sm lg:min-h-[640px]">
                      {primaryRequest.assigned_worker && canShowLiveMap ? (
                        <Suspense
                          fallback={
                            <div className="grid h-full min-h-[600px] place-items-center bg-slate-100 dark:bg-slate-950 lg:min-h-[640px]">
                              <p className="text-sm font-bold text-slate-500">{t('navbar.myRequestTracker.preparingLiveView')}</p>
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
                        <div className="grid h-full min-h-[520px] place-items-center bg-white dark:bg-slate-900 p-8">
                          <div className="max-w-lg text-center">
                            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-sky-50 dark:bg-sky-950/50 text-bird-blue">
                              <svg className="h-9 w-9" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                              </svg>
                            </div>
                            <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-bird-blue">
                              {isScheduledFuture ? t('navbar.myRequestTracker.visitConfirmed') : t('navbar.myRequestTracker.professionalSelected')}
                            </p>
                            <h3 className="mt-2 text-3xl font-black text-slate-950 dark:text-slate-100">
                              {isScheduledFuture ? t('navbar.myRequestTracker.mapOpensNearVisit') : pendingWorkerApproval ? t('navbar.myRequestTracker.reviewProfessional') : t('navbar.myRequestTracker.waitingForRouteStart')}
                            </h3>
                            <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-7 text-slate-500 dark:text-slate-400">
                              {isScheduledFuture
                                ? t('navbar.myRequestTracker.visitReservedHint', { schedule: formatRequestSchedule(primaryRequest, t) })
                                : pendingWorkerApproval
                                  ? t('navbar.myRequestTracker.reviewApproveHint')
                                  : t('navbar.myRequestTracker.routeAppearsHint')}
                            </p>
                            <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
                              <button
                                type="button"
                                onClick={() => void openWorkerProfile()}
                                className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-6 py-3 text-sm font-black text-slate-900 dark:text-slate-100 hover:border-bird-blue hover:text-bird-blue"
                              >
                                {t('navbar.myRequestTracker.reviewProfessional')}
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
                                  {t('navbar.myRequestTracker.openChat')}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="relative min-h-[520px] overflow-hidden bg-slate-50 dark:bg-slate-950/60 px-5 py-6 sm:px-7 sm:py-8">
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(0,144,255,0.12),transparent_28%),radial-gradient(circle_at_88%_12%,rgba(255,199,0,0.14),transparent_22%)]" />
                          <div className="relative mx-auto flex min-h-[460px] max-w-5xl flex-col gap-5">
                            <div className="rounded-[28px] border border-slate-200/80 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-[0_20px_55px_rgba(15,23,42,0.08)] sm:p-7">
                              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                                <div className="flex min-w-0 items-start gap-3 sm:gap-5">
                                  <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-sky-50 dark:bg-sky-950/50 text-bird-blue ring-1 ring-sky-100 sm:h-24 sm:w-24 sm:rounded-[24px]">
                                    <span className="absolute inset-2 animate-pulse rounded-[16px] bg-bird-blue/10 sm:rounded-[20px]" />
                                    <svg className="relative h-7 w-7 sm:h-12 sm:w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 21l-4.35-4.35m1.6-5.4a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                      <span className="inline-flex items-center gap-1.5 sm:gap-2 rounded-full bg-sky-50 dark:bg-sky-950/50 px-2.5 py-1 sm:px-3 sm:py-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.1em] sm:tracking-[0.16em] text-bird-blue">
                                        <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-bird-blue" />
                                        {t('navbar.myRequestTracker.matchingInProgress')}
                                      </span>
                                      <span className="rounded-full bg-amber-50 dark:bg-amber-950/50 px-2.5 py-1 sm:px-3 sm:py-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.1em] sm:tracking-[0.14em] text-amber-700 dark:text-amber-400">
                                        {t('navbar.myRequestTracker.requestHash', { id: primaryRequest.id_request })}
                                      </span>
                                    </div>
                                    <h3 className="mt-2.5 sm:mt-4 text-xl sm:text-4xl font-black leading-tight sm:leading-[1.05] text-slate-950 dark:text-slate-100">
                                      {t('navbar.myRequestTracker.findingRightPro')}
                                    </h3>
                                    <p className="mt-2 sm:mt-3 max-w-2xl text-xs sm:text-sm font-semibold leading-5 sm:leading-6 text-slate-600 dark:text-slate-400">
                                      {t('navbar.myRequestTracker.checkingVerifiedPros')}
                                    </p>
                                  </div>
                                </div>
                                <div className="rounded-2xl border border-sky-100 dark:border-sky-900/40 bg-sky-50/80 dark:bg-sky-950/40 px-4 py-3 text-left lg:w-[260px]">
                                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-bird-blue">{t('navbar.myRequestTracker.nextStep')}</p>
                                  <p className="mt-1 text-sm font-black text-slate-950 dark:text-slate-100">{t('navbar.myRequestTracker.liveRouteOpensAfterMatching')}</p>
                                </div>
                              </div>
                            </div>

                            <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
                              <section className="rounded-[28px] border border-slate-200/80 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-[0_16px_45px_rgba(15,23,42,0.07)] sm:p-6">
                                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t('navbar.myRequestTracker.progress')}</p>
                                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                                  {[
                                    [t('navbar.myRequestTracker.progressSteps.requestSent.label'), t('navbar.myRequestTracker.progressSteps.requestSent.helper'), true],
                                    [t('navbar.myRequestTracker.progressSteps.prosNearby.label'), t('navbar.myRequestTracker.progressSteps.prosNearby.helper'), true],
                                    [t('navbar.myRequestTracker.progressSteps.routeNext.label'), t('navbar.myRequestTracker.progressSteps.routeNext.helper'), false],
                                  ].map(([label, helper, active]) => (
                                    <div
                                      key={String(label)}
                                      className={`rounded-2xl border p-4 ${
                                        active
                                          ? 'border-sky-100 dark:border-sky-900/40 bg-sky-50 dark:bg-sky-950/40'
                                          : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50'
                                      }`}
                                    >
                                      <div className={`mb-3 h-2.5 w-2.5 rounded-full ${active ? 'bg-bird-blue shadow-[0_0_8px_rgba(0,144,255,0.4)]' : 'bg-slate-300 dark:bg-slate-700'}`} />
                                      <p className="text-sm font-black text-slate-950 dark:text-slate-100">{label}</p>
                                      <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{helper}</p>
                                    </div>
                                  ))}
                                </div>
                                <div className="mt-5 rounded-2xl border border-amber-100 dark:border-amber-900/40 bg-amber-50/80 dark:bg-amber-950/30 p-4">
                                  <p className="text-sm font-black text-amber-800 dark:text-amber-300">{t('navbar.myRequestTracker.stillSearching')}</p>
                                  <p className="mt-1 text-xs font-semibold leading-5 text-amber-900/70 dark:text-amber-400/80">
                                    {t('navbar.myRequestTracker.stillSearchingDesc')}
                                  </p>
                                </div>
                              </section>

                              <aside className="rounded-[28px] border border-slate-200/80 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-[0_16px_45px_rgba(15,23,42,0.07)] sm:p-6">
                                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t('navbar.myRequestTracker.requestSummary')}</p>
                                <div className="mt-5 space-y-3">
                                  <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950/50 p-4">
                                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">{t('navbar.myRequestTracker.service')}</p>
                                    <p className="mt-1 text-base font-black leading-6 text-slate-950 dark:text-slate-100">{localizeClientServiceName(primaryRequest.service_name, i18n.language)}</p>
                                  </div>
                                  <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950/50 p-4">
                                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">{t('navbar.myRequestTracker.location')}</p>
                                    <p className="mt-1 text-sm font-bold leading-6 text-slate-700 dark:text-slate-300">{primaryRequest.location_text || t('navbar.myRequestTracker.locationConfirmed')}</p>
                                  </div>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950/50 p-4">
                                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">{t('navbar.myRequestTracker.visit')}</p>
                                      <p className="mt-1 text-sm font-black text-slate-950 dark:text-slate-100">{formatRequestSchedule(primaryRequest, t)}</p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950/50 p-4">
                                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">{t('navbar.myRequestTracker.budget')}</p>
                                      <p className="mt-1 text-sm font-black text-slate-950 dark:text-slate-100">${Number(primaryRequest.budget || 0).toFixed(2)}</p>
                                    </div>
                                  </div>
                                </div>
                              </aside>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <AnimatePresence>
                {workerProfile && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md"
                  >
                    <motion.div
                      initial={{ opacity: 0, scale: 0.94, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 15 }}
                      className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-white/10"
                    >
                      {/* Sticky Header */}
                      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-100 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-3 w-3 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20 animate-pulse" />
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-bird-blue">{t('navbar.myRequestTracker.verifiedFixlifePro')}</p>
                            <h3 className="text-xl font-black text-slate-950 dark:text-slate-100">{t('navbar.myRequestTracker.professionalProfilePortfolio')}</h3>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setWorkerProfile(null)}
                          className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-950 dark:hover:text-white transition-all"
                          aria-label={t('navbar.myRequestTracker.closeWorkerProfileAria')}
                        >
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      <div className="p-6 sm:p-8 space-y-6">
                        {/* Top Hero Card */}
                        <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 dark:border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 p-6 text-white shadow-xl">
                          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-bird-blue/20 blur-3xl" />
                          <div className="relative flex flex-col sm:flex-row items-center sm:items-start gap-5">
                            <div className="relative shrink-0">
                              {workerProfile.worker.profile_image_url ? (
                                <img
                                  src={normalizeImageUrl(workerProfile.worker.profile_image_url)}
                                  alt={workerProfile.worker.name}
                                  className="h-24 w-24 rounded-2xl object-cover ring-4 ring-bird-blue/30 shadow-lg"
                                />
                              ) : (
                                <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-bird-blue text-3xl font-black text-white ring-4 ring-bird-blue/30 shadow-lg">
                                  {workerProfile.worker.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white text-xs font-bold ring-2 ring-slate-950" title={t('navbar.myRequestTracker.verifiedProfessionalTitle')}>
                                ✓
                              </span>
                            </div>

                            <div className="min-w-0 text-center sm:text-left flex-1">
                              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                                <h2 className="text-2xl font-black tracking-tight text-white">{workerProfile.worker.name}</h2>
                                <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-3 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-300">
                                  {t('navbar.myRequestTracker.verifiedIdentity')}
                                </span>
                              </div>
                              <p className="mt-1 text-xs font-semibold text-slate-300">
                                {t('navbar.myRequestTracker.fixlifePartnerPro')} • {workerProfile.worker.experience_label || t('navbar.myRequestTracker.expertServiceProvider')}
                              </p>

                              {/* Phone contact if available */}
                              {workerProfile.worker.phone_number && (
                                <a
                                  href={`tel:${workerProfile.worker.phone_number}`}
                                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 px-3.5 py-1.5 text-xs font-bold text-slate-200 transition"
                                >
                                  <svg className="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                  </svg>
                                  {workerProfile.worker.phone_number}
                                </a>
                              )}
                            </div>
                          </div>

                          {/* Quick Stats Grid */}
                          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-white/10 pt-5">
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center sm:text-left">
                              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('navbar.myRequestTracker.rating')}</p>
                              <p className="mt-1 text-xl font-black text-amber-300 flex items-center justify-center sm:justify-start gap-1">
                                <span>★</span>
                                <span>{workerProfile.worker.rating_average != null ? Number(workerProfile.worker.rating_average).toFixed(1) : '5.0'}</span>
                              </p>
                              <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{t('navbar.myRequestTracker.clientReviews', { count: workerProfile.worker.rating_count || 0 })}</p>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center sm:text-left">
                              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('navbar.myRequestTracker.completedJobs')}</p>
                              <p className="mt-1 text-xl font-black text-emerald-400">{workerProfile.worker.completed_jobs || 0}</p>
                              <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{t('navbar.myRequestTracker.onFixlifePlatform')}</p>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center sm:text-left">
                              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('navbar.myRequestTracker.experience')}</p>
                              <p className="mt-1 text-base font-black text-sky-300 truncate">{workerProfile.worker.experience_label || t('navbar.myRequestTracker.verifiedLevel')}</p>
                              <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{t('navbar.myRequestTracker.backgroundChecked')}</p>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center sm:text-left">
                              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('navbar.myRequestTracker.portfolio')}</p>
                              <p className="mt-1 text-xl font-black text-indigo-300">{Array.isArray(workerProfile.portfolio) ? workerProfile.portfolio.length : 0}</p>
                              <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{t('navbar.myRequestTracker.projectSamples')}</p>
                            </div>
                          </div>
                        </div>

                        {/* Services Offered Badges */}
                        {Array.isArray(workerProfile.worker.services_offered) && workerProfile.worker.services_offered.length > 0 && (
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">{t('navbar.myRequestTracker.specializedServices')}</p>
                            <div className="flex flex-wrap gap-2">
                              {workerProfile.worker.services_offered.map((svc: string, i: number) => (
                                <span key={i} className="rounded-xl border border-bird-blue/20 bg-bird-blue/10 dark:bg-bird-blue/20 px-3 py-1.5 text-xs font-bold text-bird-blue dark:text-sky-300">
                                  🛠️ {svc}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Biography */}
                        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-slate-800/50 p-5">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">{t('navbar.myRequestTracker.aboutWorker', { name: workerProfile.worker.name })}</p>
                          <p className="text-sm font-medium leading-relaxed text-slate-700 dark:text-slate-300 italic">
                            "{workerProfile.worker.bio || t('navbar.myRequestTracker.defaultBio')}"
                          </p>
                        </div>

                        {/* Portfolio & Work Samples Gallery */}
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h4 className="text-base font-black text-slate-950 dark:text-slate-100 flex items-center gap-2">
                              <span>📸</span>
                              {t('navbar.myRequestTracker.workPortfolioPhotos')}
                            </h4>
                            <span className="text-xs font-bold text-slate-400">
                              {t('navbar.myRequestTracker.photosCount', { count: Array.isArray(workerProfile.portfolio) ? workerProfile.portfolio.length : 0 })}
                            </span>
                          </div>

                          {Array.isArray(workerProfile.portfolio) && workerProfile.portfolio.length > 0 ? (
                            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                              {workerProfile.portfolio.map((photo: any, index: number) => (
                                <figure
                                  key={photo.id_portfolio || photo.id_photo || index}
                                  className="group overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 shadow-sm transition hover:shadow-lg hover:border-bird-blue/40"
                                >
                                  {photo.image_url ? (
                                    <div className="relative h-44 w-full overflow-hidden bg-slate-100 dark:bg-slate-900">
                                      <img
                                        src={normalizeImageUrl(photo.image_url)}
                                        alt={photo.description || t('navbar.myRequestTracker.portfolioSampleAlt')}
                                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                      />
                                    </div>
                                  ) : (
                                    <div className="grid h-44 place-items-center bg-slate-100 dark:bg-slate-900 text-xs font-bold text-slate-400">{t('navbar.myRequestTracker.noImage')}</div>
                                  )}
                                  {photo.description && (
                                    <figcaption className="line-clamp-2 p-3 text-xs font-semibold text-slate-700 dark:text-slate-300 border-t border-slate-100 dark:border-white/5">
                                      {photo.description}
                                    </figcaption>
                                  )}
                                </figure>
                              ))}
                            </div>
                          ) : (
                            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/50 p-8 text-center">
                              <p className="text-sm font-black text-slate-700 dark:text-slate-300">{t('navbar.myRequestTracker.noPortfolioPhotos')}</p>
                              <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                {t('navbar.myRequestTracker.ratingVerifiesQuality')}
                              </p>
                            </div>
                          )}

                          {/* Decision Action Buttons */}
                          {(pendingWorkerApproval || pendingCounter) && (
                            <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 dark:border-white/10 pt-6 sm:flex-row sm:justify-end">
                              <button
                                type="button"
                                disabled={requestActionBusy}
                                onClick={() => setPendingDecision({ kind: pendingCounter ? 'counter' : 'worker', decision: 'decline' })}
                                className="w-full sm:w-auto rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/40 px-6 py-3.5 text-sm font-black text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition active:scale-95 disabled:opacity-50"
                              >
                                {t('navbar.myRequestTracker.declinePro')}
                              </button>
                              <button
                                type="button"
                                disabled={requestActionBusy}
                                onClick={() => setPendingDecision({ kind: pendingCounter ? 'counter' : 'worker', decision: 'accept' })}
                                className="w-full sm:w-auto rounded-xl bg-bird-blue hover:bg-bird-darkBlue text-white px-8 py-3.5 text-sm font-black shadow-lg shadow-bird-blue/25 transition active:scale-95 disabled:opacity-50"
                              >
                                {pendingCounter ? t('navbar.myRequestTracker.acceptCounterOffer') : t('navbar.myRequestTracker.approveHireProfessional')}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {openChatRequestId && primaryRequest?.id_request === openChatRequestId && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-40 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
                  >
                    <motion.div
                      initial={{ opacity: 0, scale: 0.94, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 15 }}
                      className="flex h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[1.8rem] bg-white dark:bg-slate-900 shadow-2xl sm:h-[680px] sm:rounded-[1.8rem] border border-white/20 dark:border-white/10"
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 px-5 py-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md">
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-bird-blue">
                            {t('navbar.myRequestTracker.requestHash', { id: primaryRequest.id_request })}
                          </p>
                          <h3 className="truncate text-lg font-black text-slate-950 dark:text-slate-100">
                            {t('navbar.myRequestTracker.chatWith', { name: primaryRequest.assigned_worker?.name || t('navbar.myRequestTracker.chatWithFallback') })}
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => setOpenChatRequestId(null)}
                          className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white"
                          aria-label={t('navbar.myRequestTracker.closeChatAria')}
                        >
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      <div className="flex flex-1 flex-col justify-between overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                          {Array.isArray(chatByRequest[openChatRequestId]) && chatByRequest[openChatRequestId].length > 0 ? (
                            chatByRequest[openChatRequestId].map((msg: any) => {
                              const isClient = msg.sender_role === 'client';
                              return (
                                <div key={msg.id_message || msg.created_at} className={`flex flex-col ${isClient ? 'items-end' : 'items-start'}`}>
                                  <div
                                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm font-semibold shadow-sm ${
                                      isClient
                                        ? 'bg-bird-blue text-white rounded-br-none'
                                        : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200/80 dark:border-white/10 rounded-bl-none'
                                    }`}
                                  >
                                    <p className="whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                                  </div>
                                  <span className="mt-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 px-1">
                                    {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                  </span>
                                </div>
                              );
                            })
                          ) : (
                            <div className="grid h-full place-items-center text-center p-8 text-slate-400">
                              <div>
                                <p className="text-sm font-black text-slate-600 dark:text-slate-300">{t('navbar.myRequestTracker.noMessagesYet')}</p>
                                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{t('navbar.myRequestTracker.startConversation')}</p>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="border-t border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-4">
                          <div className="flex items-center gap-2">
                            <textarea
                              value={chatMessage[openChatRequestId] || ''}
                              onChange={(event) => setChatMessage((prev) => ({ ...prev, [openChatRequestId]: event.target.value.slice(0, 500) }))}
                              placeholder={t('navbar.myRequestTracker.writeMessage')}
                              rows={1}
                              maxLength={500}
                              className="min-h-11 flex-1 resize-none rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-4 py-3 text-sm font-semibold outline-none focus:border-bird-blue dark:text-slate-100"
                            />
                            <button
                              type="button"
                              disabled={chatBusyId === openChatRequestId}
                              onClick={() => void sendRequestChat(openChatRequestId)}
                              className="h-11 shrink-0 rounded-xl bg-bird-blue px-5 text-sm font-black text-white disabled:opacity-50 shadow-md hover:bg-bird-darkBlue"
                            >
                              {chatBusyId === openChatRequestId ? t('navbar.myRequestTracker.sending') : t('navbar.myRequestTracker.send')}
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {pendingDecision && primaryRequest && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-50 grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm"
                  >
                    <motion.div
                      initial={{ opacity: 0, scale: 0.93, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.94, y: 15 }}
                      className="w-full max-w-md rounded-[1.8rem] bg-white dark:bg-slate-900 p-6 shadow-2xl border border-white/20 dark:border-white/10"
                    >
                      <div className={`flex h-12 w-12 items-center justify-center rounded-full ${
                        pendingDecision.decision === 'decline' ? 'bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400' : 'bg-blue-50 dark:bg-blue-950/50 text-bird-blue'
                      }`}>
                        <span className="text-xl font-black">{pendingDecision.decision === 'decline' ? '!' : 'OK'}</span>
                      </div>
                      <h4 className="mt-4 text-xl font-black text-slate-950 dark:text-slate-100">
                        {pendingDecision.kind === 'counter'
                          ? pendingDecision.decision === 'accept'
                            ? t('navbar.myRequestTracker.acceptCounterOfferQ')
                            : t('navbar.myRequestTracker.declineCounterOfferQ')
                          : pendingDecision.kind === 'worker'
                            ? pendingDecision.decision === 'accept'
                              ? t('navbar.myRequestTracker.approveProfessionalQ')
                              : t('navbar.myRequestTracker.declineProfessionalQ')
                            : t('navbar.myRequestTracker.cancelServiceRequestQ')}
                      </h4>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                        {pendingDecision.kind === 'counter'
                          ? pendingDecision.decision === 'accept'
                            ? t('navbar.myRequestTracker.confirmBudgetUpdate', { amount: Number(primaryRequest.proposed_budget || 0).toFixed(2) })
                            : t('navbar.myRequestTracker.rejectCounterOfferDesc')
                          : pendingDecision.kind === 'worker'
                            ? pendingDecision.decision === 'accept'
                              ? t('navbar.myRequestTracker.approveProDesc', { name: primaryRequest.assigned_worker?.name || t('navbar.myRequestTracker.approveProFallbackName') })
                              : t('navbar.myRequestTracker.rejectProDesc')
                            : t('navbar.myRequestTracker.cancelActiveRequestDesc')}
                      </p>
                      <div className="mt-6 flex justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setPendingDecision(null)}
                          className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-4 py-3 text-sm font-black text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                        >
                          {t('navbar.myRequestTracker.goBack')}
                        </button>
                        <button
                          type="button"
                          disabled={requestActionBusy}
                          onClick={async () => {
                            const decision = pendingDecision;
                            await submitRequestDecision(decision.kind, decision.decision);
                            setPendingDecision(null);
                          }}
                          className={`rounded-xl px-5 py-3 text-sm font-black text-white disabled:opacity-50 ${
                            pendingDecision.decision === 'decline' || pendingDecision.kind === 'request'
                              ? 'bg-red-600 hover:bg-red-700'
                              : 'bg-slate-950 dark:bg-white dark:text-slate-950 hover:bg-black'
                          }`}
                        >
                          {requestActionBusy ? t('navbar.myRequestTracker.saving') : pendingDecision.kind === 'request' ? t('navbar.myRequestTracker.cancelRequest') : t('navbar.myRequestTracker.confirm')}
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
