import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { BriefcaseBusiness, MapPinned, Navigation, RefreshCw, WifiOff, X } from 'lucide-react';
import { API_ENDPOINTS } from '../../config/api';
import { useChatSocket } from '../../hooks/useChatSocket';
import { useSSE } from '../../hooks/useSSE';
import { useWorkerWorkspace } from '../../hooks/useWorkerWorkspace';
import { getToken as getSessionToken } from '../../utils/session';
import { showSweetConfirm, showSweetToast } from '../../utils/sweetAlert';
import { CounterOfferModal } from './requests/CounterOfferModal';
import { WorkerRequestCard } from './requests/WorkerRequestCard';
import { WorkerRequestChatPanel } from './requests/WorkerRequestChatPanel';
import { WorkerCurrentJobPanel } from './requests/WorkerCurrentJobPanel';
import { WorkerDaySummary } from './requests/WorkerDaySummary';
import { ServiceReportModal } from '../shared/ServiceReportModal';
import { ServiceCompleteCelebration } from '../shared/ServiceCompleteCelebration';
import type {
  ChatMessage,
  RequestsViewProps,
  WorkerRequest,
  WorkerRequestsPayload,
} from './requests/workerRequestTypes';
import {
  haversineKm,
  formatScheduledWindow,
  isScheduledRequest,
  isValidCoord,
  mergeChatMessages,
  toFiniteNumber,
} from './requests/workerRequestUtils';
import { useWorkerPresence } from './requests/useWorkerPresence';
import { useWorkerRequestChat } from './requests/useWorkerRequestChat';
import { useWorkerRequestsMap } from './requests/useWorkerRequestsMap';

declare global {
  interface Window {
    L?: any;
  }
}

type RequestTab = 'new' | 'accepted' | 'rejected';

const notify = {
  success: (message: string) => void showSweetToast({ tone: 'success', message }),
  info: (message: string) => void showSweetToast({ tone: 'info', message }),
  error: (message: string) =>
    void showSweetToast({ tone: 'error', message, duration: 3200 }),
};

const TERMINAL_WORKER_REQUEST_STATUSES = new Set(['done', 'cancelled']);
const ACTIVE_WORKER_JOB_STATUSES = new Set([
  'assigned',
  'route_in_progress',
  'arrived',
  'start_pending',
  'in_progress',
  'finish_pending',
  'payment_pending',
  'paid',
  'completion_pending',
  'awaiting_confirmation',
]);

const getRequestStatus = (request: WorkerRequest) =>
  String(request.request_status || '').toLowerCase();

const isTerminalWorkerRequest = (request: WorkerRequest) =>
  TERMINAL_WORKER_REQUEST_STATUSES.has(getRequestStatus(request));

const getVisibleWorkerRequests = (
  source: WorkerRequest[],
  isWorkerActive: boolean,
  statusFilter: RequestTab
) => {
  if (!isWorkerActive) return [];
  if (statusFilter === 'accepted' || statusFilter === 'new') {
    return source.filter((request) => !isTerminalWorkerRequest(request));
  }
  return source;
};

export const RequestsView: React.FC<RequestsViewProps> = ({
  isOnline,
  mobileView,
  token,
  isVerified = true,
  focusRequestId = null,
  openChatRequestId = null,
  isDark = false,
  onOpenHistory,
}) => {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<RequestTab>('new');
  const [requests, setRequests] = useState<WorkerRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [activeWorkerRequest, setActiveWorkerRequest] = useState<{
    id_request: number;
    status: string;
  } | null>(null);
  const [activeRouteRequestId, setActiveRouteRequestId] = useState<number | null>(null);
  const [arrivedRequestIds, setArrivedRequestIds] = useState<Set<number>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      return new Set(JSON.parse(window.sessionStorage.getItem('fixlife:worker-arrived') || '[]'));
    } catch {
      return new Set();
    }
  });
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showCompletionCelebration, setShowCompletionCelebration] = useState(false);
  const [chatPanelOpen, setChatPanelOpen] = useState(false);
  const [requestsPanelOpen, setRequestsPanelOpen] = useState(false);
  const [routePanelExpanded, setRoutePanelExpanded] = useState(false);
  const [counterModalOpen, setCounterModalOpen] = useState(false);
  const [counterTargetId, setCounterTargetId] = useState<number | null>(null);
  const [reportRequest, setReportRequest] = useState<WorkerRequest | null>(null);
  const [counterAmount, setCounterAmount] = useState('');
  const [counterNote, setCounterNote] = useState('');
  const firstLoadRef = useRef(true);
  const knownNewIdsRef = useRef<Set<number>>(new Set());
  const lastDeepLinkRef = useRef<string>('');

  const isWorkerActive = isOnline === true && isVerified;
  const visibleRequests = useMemo(
    () => getVisibleWorkerRequests(requests, isWorkerActive, statusFilter),
    [isWorkerActive, requests, statusFilter]
  );
  const selectedRequest = useMemo(
    () =>
      visibleRequests.find((request) => request.id_request === selectedRequestId) ||
      visibleRequests[0] ||
      null,
    [selectedRequestId, visibleRequests]
  );
  const currentAssignedRequest = useMemo(
    () =>
      visibleRequests.find((request) =>
        ACTIVE_WORKER_JOB_STATUSES.has(getRequestStatus(request))
      ) || null,
    [visibleRequests]
  );
  const routeActive =
    !!selectedRequest && (
      activeRouteRequestId === selectedRequest.id_request ||
      String(selectedRequest.request_status || '').toLowerCase() === 'route_in_progress'
    );

  const { presenceBusy, pushPresence, setWorkerCoords, workerCoords } =
    useWorkerPresence({
      token,
      isOnline,
      routeActive,
      isVerified,
      onFirstCoordsReady: () => void fetchRequests(true),
    });
  const {
    connected: workspaceSocketConnected,
    data: workerWorkspace,
    refresh: refreshWorkspace,
  } = useWorkerWorkspace({
    token,
    enabled: isWorkerActive,
    onRealtimeUpdate: (payload) => {
      const tone = payload.tone === 'warning' ? 'warning' : payload.tone === 'success' ? 'success' : 'info';
      void showSweetToast({
        tone,
        message: payload.title
          ? `${payload.title}${payload.message ? `: ${payload.message}` : ''}`
          : payload.message || t('workerDashboard.requests.workspaceUpdated'),
        duration: 3600,
      });
      void fetchRequests(true);
    },
  });

  const {
    centerRoute,
    displayedRouteMetrics,
    leafletReady,
    leafletLoadFailed,
    retryLeafletLoad,
    mapContainerRef,
    routeAlert,
    routeCameraMode,
    routeError,
    routeLoading,
    routePreview,
    routeStatusLabel,
    setRouteCameraMode,
    setTrafficEnabled,
    showRouteAlert,
    simulatedTraffic,
    trafficEnabled,
  } = useWorkerRequestsMap({
    active: isWorkerActive,
    isDarkMode: isDark,
    activeRouteRequestId,
    mobileView,
    requests: visibleRequests,
    selectedRequest,
    selectedRequestId,
    statusFilter,
    workerCoords: isWorkerActive ? workerCoords : null,
    onActiveRouteChange: setActiveRouteRequestId,
    onSelectRequest: setSelectedRequestId,
  });

  const SCHEDULED_EARLY_MS = 2 * 60 * 60 * 1000;
  const isScheduledTooEarly =
    isScheduledRequest(selectedRequest) &&
    !!selectedRequest?.scheduled_start_time &&
    new Date(selectedRequest.scheduled_start_time).getTime() - Date.now() > SCHEDULED_EARLY_MS;
  const canTravel =
    !isScheduledTooEarly &&
    !!selectedRequest &&
    ACTIVE_WORKER_JOB_STATUSES.has(getRequestStatus(selectedRequest));
  const canChat =
    !!selectedRequest &&
    ACTIVE_WORKER_JOB_STATUSES.has(getRequestStatus(selectedRequest)) &&
    String(selectedRequest.worker_status || '').toLowerCase() === 'accepted';

  const {
    chatBusyId,
    chatByRequest,
    chatImageByRequest,
    chatTextByRequest,
    endRef: chatEndRef,
    fetchRequestChat,
    sendChat,
    setChatByRequest,
    setChatImageByRequest,
    setChatTextByRequest,
  } = useWorkerRequestChat({
    token,
    requestId: selectedRequest?.id_request || null,
    enabled: canChat,
    panelOpen: chatPanelOpen,
    setPanelOpen: setChatPanelOpen,
  });

  const fetchRequests = async (silent = false) => {
    const authToken = getSessionToken('worker') || token;
    if (!authToken || !isWorkerActive) {
      setRequests([]);
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const response = await fetch(
        `${API_ENDPOINTS.worker.requests}?status=${statusFilter}`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      const payload: WorkerRequestsPayload = await response.json();
      if (response.status === 401) {
        if (!silent) notify.error(t('workerDashboard.requests.sessionInvalid'));
        return;
      }
      if (!response.ok || !payload?.success) {
        if (!silent) notify.error((payload as any)?.error || t('workerDashboard.requests.couldNotLoadRequests'));
        return;
      }
      const next = Array.isArray(payload.requests)
        ? payload.requests.map((request) => ({
            ...request,
            id_request: Number(request.id_request),
            id_service: Number(request.id_service),
            budget: Number(request.budget || 0),
            distance_km: toFiniteNumber(request.distance_km),
            latitude: toFiniteNumber(request.latitude),
            longitude: toFiniteNumber(request.longitude),
          }))
        : [];
      setRequests(next);
      const selectableNext = getVisibleWorkerRequests(next, isWorkerActive, statusFilter);
      setSelectedRequestId((current) =>
        current && selectableNext.some((request) => request.id_request === current)
          ? current
          : selectableNext[0]?.id_request || null
      );

      const workerLat = toFiniteNumber(payload.worker_profile?.latitude);
      const workerLng = toFiniteNumber(payload.worker_profile?.longitude);
      if (workerLat != null && workerLng != null) {
        const nextCoords = { lat: workerLat, lng: workerLng };
        setWorkerCoords((current) =>
          current && haversineKm(current, nextCoords) < 0.003 ? current : nextCoords
        );
      }
      const activeProfileRequest = payload.worker_profile?.active_request_id
        ? {
            id_request: Number(payload.worker_profile.active_request_id),
            status: String(payload.worker_profile.active_request_status || '').toLowerCase(),
          }
        : null;
      setActiveWorkerRequest(activeProfileRequest);

      if (statusFilter === 'new' && activeProfileRequest && next.length === 0) {
        setStatusFilter('accepted');
        if (!silent) notify.info(t('workerDashboard.requests.alreadyAssignedNotice'));
        return;
      }

      let freshCount = 0;
      if (statusFilter === 'new') {
        const ids = new Set(next.map((request) => request.id_request));
        if (!firstLoadRef.current) {
          freshCount = [...ids].filter((id) => !knownNewIdsRef.current.has(id)).length;
          if (freshCount > 0) notify.success(t('workerDashboard.requests.newRequestsNearby', { count: freshCount }));
        }
        knownNewIdsRef.current = ids;
        firstLoadRef.current = false;
      }
      if (!silent && freshCount === 0) notify.success(t('workerDashboard.requests.requestsUpdated'));
    } catch {
      if (!silent) notify.error(t('workerDashboard.requests.networkErrorLoading'));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    firstLoadRef.current = true;
    knownNewIdsRef.current = new Set();
    void fetchRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWorkerActive, statusFilter, token]);

  useEffect(() => {
    const targetId = Number(openChatRequestId || focusRequestId || 0);
    if (!Number.isFinite(targetId) || targetId <= 0) return;
    const key = `${targetId}:${openChatRequestId ? 'chat' : 'focus'}`;
    if (lastDeepLinkRef.current === key) return;

    lastDeepLinkRef.current = key;
    setStatusFilter('accepted');
    setSelectedRequestId(targetId);
    if (openChatRequestId) setChatPanelOpen(true);
  }, [focusRequestId, openChatRequestId]);

  // Polling fallback: SSE/socket events are fire-and-forget; if the connection
  // drops or the event arrives before GPS coords are pushed to the backend,
  // the worker would never see new requests until a manual reload. This covers
  // the gap for the 'new' tab (the most time-sensitive case).
  useEffect(() => {
    if (!isWorkerActive || statusFilter !== 'new') return;
    const id = window.setInterval(() => void fetchRequests(true), 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWorkerActive, statusFilter, token]);

  useEffect(() => {
    if (isWorkerActive) return;
    setSelectedRequestId(null);
    setActiveRouteRequestId(null);
    setChatPanelOpen(false);
    setRequestsPanelOpen(false);
    setRoutePanelExpanded(false);
    setRequests([]);
  }, [isWorkerActive]);

  useEffect(() => {
    if (mobileView === 'list') {
      setRequestsPanelOpen(true);
      return;
    }
    if (mobileView === 'map') {
      setRequestsPanelOpen(false);
    }
  }, [mobileView]);

  useEffect(() => setRoutePanelExpanded(false), [selectedRequest?.id_request]);
  useEffect(() => {
    if (!selectedRequest) return;
    if (String(selectedRequest.request_status || '').toLowerCase() !== 'route_in_progress') {
      setActiveRouteRequestId((current) => current === selectedRequest.id_request ? null : current);
    }
  }, [selectedRequest?.id_request, selectedRequest?.request_status]);

  useSSE({
    token,
    enabled: !!token && isWorkerActive,
    events: {
      request_updated: () => void fetchRequests(true),
      chat_message: (data: unknown) => {
        const event = data as { id_request?: number } | null;
        if (!selectedRequest || !canChat) return;
        if (event?.id_request == null || event.id_request === selectedRequest.id_request) {
          void fetchRequestChat(selectedRequest.id_request, {
            silent: true,
            incremental: true,
          });
          if (!chatPanelOpen) {
            void showSweetToast({
              tone: 'info',
              message: t('workerDashboard.requests.newClientMessage'),
              duration: 2600,
            });
          }
        }
      },
    },
  });

  const { connected: chatSocketConnected } = useChatSocket<ChatMessage>({
    token,
    requestId: selectedRequest?.id_request || null,
    enabled: !!token && !!selectedRequest && canChat,
    onMessage: (payload) => {
      if (!selectedRequest || payload.id_request !== selectedRequest.id_request) return;
      const incoming = Array.isArray(payload.messages) ? payload.messages : [];
      if (!incoming.length) {
        void fetchRequestChat(selectedRequest.id_request, {
          silent: true,
          incremental: true,
        });
        return;
      }
      setChatByRequest((previous) => ({
        ...previous,
        [selectedRequest.id_request]: mergeChatMessages(
          previous[selectedRequest.id_request] || [],
          incoming
        ),
      }));
      if (!chatPanelOpen && incoming.some((message) => message.sender_role === 'client')) {
        void showSweetToast({
          tone: 'info',
          message: t('workerDashboard.requests.newClientMessage'),
          duration: 2600,
        });
      }
    },
  });

  const postWorkerAction = async (
    idRequest: number,
    endpoint: string,
    successMessage: string
  ) => {
    if (!token) return false;
    setBusyId(idRequest);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        if (payload?.active_request_id) {
          setActiveWorkerRequest({
            id_request: Number(payload.active_request_id),
            status: String(payload.active_request_status || '').toLowerCase(),
          });
        }
        notify.error(payload?.error || t('workerDashboard.requests.couldNotUpdateRequest'));
        return false;
      }
      notify.success(successMessage);
      await Promise.all([fetchRequests(true), refreshWorkspace(true)]);
      return true;
    } catch {
      notify.error(t('workerDashboard.requests.networkErrorUpdating'));
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const handleAction = async (idRequest: number, action: 'accept' | 'reject') => {
    const confirmed = await showSweetConfirm({
      title: action === 'accept' ? t('workerDashboard.requests.acceptTitle') : t('workerDashboard.requests.passTitle'),
      message:
        action === 'accept'
          ? t('workerDashboard.requests.acceptMessage')
          : t('workerDashboard.requests.passMessage'),
      tone: action === 'accept' ? 'info' : 'warning',
      confirmText: action === 'accept' ? t('workerDashboard.requests.acceptRequestBtn') : t('workerDashboard.requests.passRequestBtn'),
      destructive: action === 'reject',
    });
    if (!confirmed) return;
    const success = await postWorkerAction(
      idRequest,
      action === 'accept'
        ? API_ENDPOINTS.worker.acceptRequest(idRequest)
        : API_ENDPOINTS.worker.rejectRequest(idRequest),
      action === 'accept' ? t('workerDashboard.requests.requestAccepted') : t('workerDashboard.requests.requestRejected')
    );
    if (success && action === 'accept') {
      setSelectedRequestId(idRequest);
      setStatusFilter('accepted');
    }
  };

  const handleWorkflowApproval = async (
    idRequest: number,
    action: 'start_work' | 'finish_work' | 'complete_service'
  ) => {
    const labels = {
      start_work: [t('workerDashboard.requests.approveStartTitle'), t('workerDashboard.requests.approveStartBtn')],
      finish_work: [t('workerDashboard.requests.approveFinishTitle'), t('workerDashboard.requests.approveFinishBtn')],
      complete_service: [t('workerDashboard.requests.approveClosureTitle'), t('workerDashboard.requests.approveClosureBtn')],
    } as const;
    const confirmed = await showSweetConfirm({
      title: labels[action][0],
      message: t('workerDashboard.requests.approvalSavedMessage'),
      tone: action === 'start_work' ? 'info' : 'warning',
      confirmText: labels[action][1],
    });
    if (!confirmed) return;
    if (!token) return;
    setBusyId(idRequest);
    let success = false;
    let nextRequestStatus = '';
    try {
      const response = await fetch(API_ENDPOINTS.services.workflowApproval(idRequest), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        notify.error(payload?.error || t('workerDashboard.requests.couldNotSaveApproval'));
        return;
      }
      nextRequestStatus = String(payload.request_status || '').toLowerCase();
      // The 'done' case gets the full-screen celebration below instead of a
      // toast — showing both would just be the same "you're done" news twice.
      if (!(action === 'complete_service' && nextRequestStatus === 'done')) {
        notify.success(payload.message || t('workerDashboard.requests.approvalSaved'));
      }
      success = true;
      await Promise.all([fetchRequests(true), refreshWorkspace(true)]);
    } catch {
      notify.error(t('workerDashboard.requests.networkErrorApproval'));
    } finally {
      setBusyId(null);
    }
    if (!success) return;
    if (action === 'start_work') {
      setSelectedRequestId(idRequest);
      setActiveRouteRequestId(null);
    } else if (action === 'complete_service') {
      setActiveRouteRequestId((current) => (current === idRequest ? null : current));
      setArrivedRequestIds((current) => {
        const next = new Set(current);
        next.delete(idRequest);
        window.sessionStorage.setItem('fixlife:worker-arrived', JSON.stringify([...next]));
        return next;
      });
      if (nextRequestStatus === 'done') {
        setRequests((current) => current.filter((request) => request.id_request !== idRequest));
        setSelectedRequestId(null);
        setChatPanelOpen(false);
        setRoutePanelExpanded(false);
        setShowCompletionCelebration(true);
      }
    }
  };

  const handleConfirmCash = async (idRequest: number) => {
    const confirmed = await showSweetConfirm({
      title: t('workerDashboard.requests.confirmCashTitle'),
      message: t('workerDashboard.requests.confirmCashMessage'),
      tone: 'warning',
      confirmText: t('workerDashboard.requests.iCollectedCash'),
    });
    if (!confirmed) return;
    if (!token) return;
    setBusyId(idRequest);
    try {
      const response = await fetch(API_ENDPOINTS.services.cashConfirm(idRequest), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        notify.error(payload?.error || t('workerDashboard.requests.couldNotConfirmCash'));
        return;
      }
      notify.success(payload.message || t('workerDashboard.requests.cashConfirmed'));
      await Promise.all([fetchRequests(true), refreshWorkspace(true)]);
    } catch {
      notify.error(t('workerDashboard.requests.networkErrorCash'));
    } finally {
      setBusyId(null);
    }
  };

  const markArrived = async (idRequest: number) => {
    const confirmed = await showSweetConfirm({
      title: t('workerDashboard.requests.confirmArrivalTitle'),
      message: t('workerDashboard.requests.confirmArrivalMessage'),
      tone: 'info',
      confirmText: t('workerDashboard.requests.iHaveArrived'),
    });
    if (!confirmed) return;
    if (!token) return;
    setBusyId(idRequest);
    let success = false;
    try {
      const position = navigator.geolocation
        ? await new Promise<GeolocationPosition | null>((resolve) =>
            navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
              enableHighAccuracy: true, timeout: 12000, maximumAge: 5000,
            })
          )
        : null;
      const response = await fetch(API_ENDPOINTS.worker.arriveRequest(idRequest), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          latitude: position?.coords.latitude,
          longitude: position?.coords.longitude,
          accuracy_m: position?.coords.accuracy,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        notify.error(payload?.error || t('workerDashboard.requests.couldNotVerifyArrival'));
        return;
      }
      notify.success(payload.warning || t('workerDashboard.requests.arrivalConfirmed'));
      success = true;
      await Promise.all([fetchRequests(true), refreshWorkspace(true)]);
    } catch {
      notify.error(t('workerDashboard.requests.couldNotConfirmArrivalRetry'));
    } finally {
      setBusyId(null);
    }
    if (!success) return;
    setArrivedRequestIds((current) => {
      const next = new Set(current).add(idRequest);
      window.sessionStorage.setItem('fixlife:worker-arrived', JSON.stringify([...next]));
      return next;
    });
  };

  const openCounter = (idRequest: number, budget: number) => {
    setCounterTargetId(idRequest);
    setCounterAmount(String(Math.max(1, Math.min(1000, Math.round(budget)))));
    setCounterNote('');
    setCounterModalOpen(true);
  };

  const confirmCounter = async () => {
    const amount = Number(counterAmount);
    if (!token || !counterTargetId) return;
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000) {
      notify.error(t('workerDashboard.requests.amountRange'));
      return;
    }
    setCounterModalOpen(false);
    setBusyId(counterTargetId);
    try {
      const response = await fetch(API_ENDPOINTS.worker.counterOffer(counterTargetId), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          proposed_budget: amount,
          counter_message: counterNote,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        notify.error(payload?.error || t('workerDashboard.requests.couldNotSendCounter'));
        return;
      }
      notify.success(t('workerDashboard.requests.counterOfferSent'));
      await Promise.all([fetchRequests(true), refreshWorkspace(true)]);
    } catch {
      notify.error(t('workerDashboard.requests.networkErrorCounter'));
    } finally {
      setBusyId(null);
      setCounterTargetId(null);
    }
  };

  const toggleRoute = async () => {
    if (!selectedRequest || !routePreview || routeLoading || !canTravel) return;
    const starting = activeRouteRequestId !== selectedRequest.id_request;
    if (starting && Number(selectedRequest.workflow_version || 1) >= 2 && selectedRequest.request_status === 'assigned') {
      const success = await postWorkerAction(
        selectedRequest.id_request,
        API_ENDPOINTS.worker.startRoute(selectedRequest.id_request),
        t('workerDashboard.requests.routeStarted')
      );
      if (!success) return;
    }
    setActiveRouteRequestId(starting ? selectedRequest.id_request : null);
    showRouteAlert({
      tone: 'info',
      title: starting ? t('workerDashboard.requests.navigationStarted') : t('workerDashboard.requests.navigationPaused'),
      message: starting
        ? t('workerDashboard.requests.navigationStartedDetail')
        : t('workerDashboard.requests.navigationPausedDetail'),
    });
  };

  const listHint = !isWorkerActive
    ? t('workerDashboard.requests.goOnlineToReceive')
    : statusFilter === 'new'
      ? `${t('workerDashboard.requests.liveUpdates')}${presenceBusy ? t('workerDashboard.requests.syncingLocation') : ''}`
      : statusFilter === 'accepted'
        ? t('workerDashboard.requests.manageActiveJobs')
        : t('workerDashboard.requests.rejectedAvailable');
  const routeStatus =
    routeStatusLabel === 'Idle'
      ? t('workerDashboard.requests.routeIdle')
      : routeStatusLabel === 'Live Route'
        ? t('workerDashboard.requests.routeOnRoute')
        : routeStatusLabel === 'Nearby'
          ? t('workerDashboard.requests.routeNearby')
          : routeStatusLabel === 'Rerouting'
            ? t('workerDashboard.requests.routeRerouting')
            : routeStatusLabel === 'Arrived'
              ? t('workerDashboard.requests.routeArrived')
              : routeStatusLabel;
  const selectedScheduled = isScheduledRequest(selectedRequest);
  const selectedArrived = selectedRequest
    ? Boolean(selectedRequest.worker_arrived_at) ||
      arrivedRequestIds.has(selectedRequest.id_request)
    : false;
  const showInlineCurrentJob =
    !!selectedRequest && statusFilter === 'accepted' && !isTerminalWorkerRequest(selectedRequest);
  const requestCountLabel = t('workerDashboard.requests.requestCount', { count: visibleRequests.length });
  const tabLabel =
    statusFilter === 'new' ? t('workerDashboard.requests.tabAvailable') : statusFilter === 'accepted' ? t('workerDashboard.requests.tabMyJobs') : t('workerDashboard.requests.tabPassed');
  const emptyTitle = !isWorkerActive
    ? t('workerDashboard.requests.youAreOffline')
    : statusFilter === 'accepted'
      ? t('workerDashboard.requests.noActiveJobs')
      : t('workerDashboard.requests.nothingHereRightNow');
  const emptyMessage = !isWorkerActive
    ? t('workerDashboard.requests.goOnlineViewNearby')
    : statusFilter === 'accepted'
      ? t('workerDashboard.requests.completedMoveHistory')
      : t('workerDashboard.requests.newNearbyWillAppear');

  return (
    <>
      <motion.aside
        initial={mobileView === 'list' ? { y: 0 } : { y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className={`relative z-10 flex h-full min-h-0 w-full flex-col overflow-hidden bg-white/96 shadow-2xl backdrop-blur-xl lg:absolute lg:inset-y-4 lg:left-4 lg:h-auto lg:w-[420px] lg:rounded-[28px] lg:border lg:border-white/80 xl:w-[440px] ${
          mobileView === 'map' ? 'hidden' : 'flex lg:hidden'
        }`}
      >
        <div className="border-b border-slate-200/80 bg-white/95 px-4 pb-4 pt-5 dark:border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-bird-blue">
                {t('workerDashboard.requests.workspace')}
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">{t('workerDashboard.requests.serviceRequests')}</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">{listHint}</p>
            </div>
            <button
              type="button"
              onClick={() => void fetchRequests()}
              disabled={loading || !isWorkerActive}
              title={t('workerDashboard.requests.refreshTitle')}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-sky-200 hover:text-bird-blue active:scale-90 active:bg-sky-50 disabled:opacity-40 dark:bg-slate-900 dark:border-white/10"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {([
              ['new', t('workerDashboard.requests.tabAvailable')],
              ['accepted', t('workerDashboard.requests.tabMyJobs')],
              ['rejected', t('workerDashboard.requests.tabPassed')],
            ] as const).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`rounded-lg px-2 py-2.5 text-[11px] font-black transition ${
                  statusFilter === tab
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {statusFilter === 'new' && activeWorkerRequest && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
              <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <p className="text-xs font-semibold leading-5 text-amber-900">
                {t('workerDashboard.requests.activeRequestNotice', { id: activeWorkerRequest.id_request })}
              </p>
            </div>
          )}
        </div>
        <WorkerDaySummary
          workspace={workerWorkspace}
          connected={workspaceSocketConnected}
        />
        <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/70 p-3 pb-24 lg:pb-4 dark:bg-slate-800">
          {statusFilter === 'accepted' && currentAssignedRequest && (
            <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-4 shadow-[0_14px_36px_rgba(14,165,233,0.14)]">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-bird-blue text-white shadow-sm">
                  <BriefcaseBusiness className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-bird-blue">
                    {t('workerDashboard.requests.currentAssignedJob')}
                  </p>
                  <h3 className="mt-1 truncate text-base font-black text-slate-950">
                    {currentAssignedRequest.service_name} #{currentAssignedRequest.id_request}
                  </h3>
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
                    {isScheduledRequest(currentAssignedRequest)
                      ? t('workerDashboard.requests.scheduledPrefix', { window: formatScheduledWindow(currentAssignedRequest) })
                      : t('workerDashboard.requests.expressAssigned')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedRequestId(currentAssignedRequest.id_request);
                  setActiveRouteRequestId(currentAssignedRequest.id_request);
                }}
                className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-xs font-black text-white transition hover:bg-slate-800"
              >
                {t('workerDashboard.requests.openCurrentJob')}
                <Navigation className="h-4 w-4" />
              </button>
            </div>
          )}
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center shadow-sm dark:bg-slate-900 dark:border-white/10">
              <RefreshCw className="mx-auto h-5 w-5 animate-spin text-bird-blue" />
              <p className="mt-3 text-sm font-black text-slate-800 dark:text-slate-200">{t('workerDashboard.requests.findingNearbyWork')}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">{t('workerDashboard.requests.syncingRequests')}</p>
            </div>
          ) : !visibleRequests.length ? (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center px-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm dark:bg-slate-900">
                {isWorkerActive ? (
                  <MapPinned className="h-6 w-6 text-bird-blue" />
                ) : (
                  <WifiOff className="h-6 w-6 text-slate-400" />
                )}
              </div>
              <h3 className="mt-4 text-base font-black text-slate-900 dark:text-slate-100">
                {emptyTitle}
              </h3>
              <p className="mt-2 max-w-[260px] text-sm font-medium leading-6 text-slate-500">
                {emptyMessage}
              </p>
              {isWorkerActive && statusFilter === 'accepted' && onOpenHistory && (
                <button
                  type="button"
                  onClick={onOpenHistory}
                  className="mt-5 rounded-2xl bg-bird-blue px-5 py-3 text-sm font-black text-white shadow-[0_14px_30px_rgba(14,165,233,0.22)] transition hover:bg-blue-600"
                >
                  {t('workerDashboard.requests.viewHistory')}
                </button>
              )}
            </div>
          ) : (
            visibleRequests.map((request) => (
              <WorkerRequestCard
                key={request.id_request}
                request={request}
                selected={request.id_request === selectedRequest?.id_request}
                statusFilter={statusFilter}
                busy={busyId === request.id_request}
                actionLockedByActiveJob={
                  statusFilter === 'new' &&
                  !!activeWorkerRequest &&
                  activeWorkerRequest.id_request !== request.id_request
                }
                onSelect={setSelectedRequestId}
                onAction={handleAction}
                onCounter={openCounter}
                onOpenRoute={(id) => {
                  setSelectedRequestId(id);
                  setActiveRouteRequestId(id);
                }}
              />
            ))
          )}
        </div>
      </motion.aside>

      <main
        className={`relative h-full min-w-0 flex-1 overflow-hidden lg:w-full ${
          mobileView === 'map' ? 'block' : 'hidden lg:block'
        }`}
      >
        <div ref={mapContainerRef} className="absolute inset-0 z-0 bg-gray-100 dark:bg-slate-800" />
        {!leafletReady && !leafletLoadFailed && (
          <div className="absolute right-4 top-4 z-20 h-3 w-3 animate-pulse rounded-full bg-bird-blue" />
        )}
        {leafletLoadFailed && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-100 p-8 text-center dark:bg-slate-800">
            <div>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white text-2xl dark:bg-slate-900">🗺️</div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('workerDashboard.requests.mapFailedToLoad')}</p>
              <p className="mt-1 text-[11px] text-slate-500">{t('workerDashboard.requests.checkConnectionRetry')}</p>
              <button
                type="button"
                onClick={retryLeafletLoad}
                className="mt-4 rounded-full bg-slate-900 px-5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-slate-700"
              >
                {t('workerDashboard.requests.retry')}
              </button>
            </div>
          </div>
        )}
        <div className="absolute left-4 top-4 z-30 flex max-w-[calc(100%-7rem)] items-start gap-3">
          <div className="rounded-2xl border border-white/80 bg-white/92 p-3 text-slate-900 shadow-[0_18px_40px_rgba(15,23,42,0.24)] backdrop-blur-xl dark:text-slate-100">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-bird-blue/80">
              {t('workerDashboard.requests.workspace')}
            </p>
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setRequestsPanelOpen(true)}
                className="rounded-xl border border-white/70 bg-white px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-slate-100 dark:bg-slate-900"
              >
                {t('workerDashboard.requests.openRequests')}
              </button>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-900 dark:text-slate-100">{tabLabel}</p>
                <p className="truncate text-xs font-semibold text-slate-500">{requestCountLabel}</p>
              </div>
            </div>
          </div>
        </div>
        {!isWorkerActive && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-100/70 backdrop-blur-sm dark:bg-slate-800">
            <div className="mx-4 max-w-sm rounded-[28px] border border-white/80 bg-white/95 p-6 text-center shadow-[0_28px_70px_rgba(15,23,42,0.16)]">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                <WifiOff className="h-6 w-6 text-slate-500" />
              </div>
              <h3 className="text-xl font-black text-slate-900 dark:text-slate-100">{t('workerDashboard.requests.locationHiddenOffline')}</h3>
              <p className="mt-2 text-sm font-semibold text-slate-600">
                {t('workerDashboard.requests.goOnlineGpsHint')}
              </p>
            </div>
          </div>
        )}

        {selectedRequest && statusFilter === 'accepted' && !requestsPanelOpen && (
          <WorkerCurrentJobPanel
            request={selectedRequest}
            scheduled={selectedScheduled}
            routeActive={routeActive}
            arrived={selectedArrived}
            canChat={canChat}
            canTravel={canTravel}
            routeLoading={routeLoading}
            routeReady={!!routePreview && !routeLoading}
            routeError={routeError}
            routeStatus={routeStatus}
            routeMetrics={displayedRouteMetrics}
            routePanelExpanded={routePanelExpanded}
            routeCameraMode={routeCameraMode}
            trafficEnabled={trafficEnabled}
            trafficDelayMinutes={simulatedTraffic?.delayMin || 0}
            busy={busyId === selectedRequest.id_request}
            onToggleTools={() => setRoutePanelExpanded((open) => !open)}
            onOpenChat={() => setChatPanelOpen(true)}
            onReport={() => setReportRequest(selectedRequest)}
            onCenterRoute={centerRoute}
            onCameraModeChange={setRouteCameraMode}
            onTrafficToggle={() => setTrafficEnabled((enabled) => !enabled)}
            onTravel={() => void toggleRoute()}
            onArrive={() => void markArrived(selectedRequest.id_request)}
            onStart={() => void handleWorkflowApproval(selectedRequest.id_request, 'start_work')}
            onComplete={() => void handleWorkflowApproval(selectedRequest.id_request, 'finish_work')}
            onFinalize={() => void handleWorkflowApproval(selectedRequest.id_request, 'complete_service')}
            onConfirmCash={() => void handleConfirmCash(selectedRequest.id_request)}
          />
        )}

        <AnimatePresence>
          {requestsPanelOpen && (
            <>
              <motion.button
                type="button"
                aria-label={t('workerDashboard.requests.closeRequestsPanel')}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setRequestsPanelOpen(false)}
                className="absolute inset-0 z-40 bg-slate-950/58 backdrop-blur-[4px] lg:hidden"
              />
              <motion.aside
                initial={mobileView === 'list' ? { x: 0, opacity: 1 } : { x: -32, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -32, opacity: 0 }}
                transition={{ type: 'spring', damping: 26, stiffness: 220 }}
                className="absolute inset-y-3 left-3 z-50 flex w-[calc(100%-1.5rem)] max-w-[460px] flex-col overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_34px_100px_rgba(15,23,42,0.38)] lg:w-[420px] xl:w-[440px] dark:bg-slate-900 dark:border-white/10"
              >
                <div className="border-b border-slate-200/80 bg-white px-5 pb-4 pt-5 dark:bg-slate-900 dark:border-white/10">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-bird-blue">
                        {t('workerDashboard.requests.workspace')}
                      </p>
                      <h2 className="mt-1 text-xl font-black text-slate-950">{t('workerDashboard.requests.serviceRequests')}</h2>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{listHint}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void fetchRequests()}
                        disabled={loading || !isWorkerActive}
                        title={t('workerDashboard.requests.refreshTitle')}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-sky-200 hover:text-bird-blue active:scale-90 active:bg-sky-50 disabled:opacity-40 dark:bg-slate-900 dark:border-white/10"
                      >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRequestsPanelOpen(false)}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-800"
                        aria-label={t('workerDashboard.requests.closeRequests')}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                    {([
                      ['new', t('workerDashboard.requests.tabAvailable')],
                      ['accepted', t('workerDashboard.requests.tabMyJobs')],
                      ['rejected', t('workerDashboard.requests.tabPassed')],
                    ] as const).map(([tab, label]) => (
                      <button
                        key={tab}
                        onClick={() => setStatusFilter(tab)}
                        className={`rounded-lg px-2 py-2.5 text-[11px] font-black transition ${
                          statusFilter === tab
                            ? 'bg-white text-slate-950 shadow-sm'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {statusFilter === 'new' && activeWorkerRequest && (
                    <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                      <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                      <p className="text-xs font-semibold leading-5 text-amber-900">
                        {t('workerDashboard.requests.activeRequestNotice', { id: activeWorkerRequest.id_request })}
                      </p>
                    </div>
                  )}
                </div>
                <WorkerDaySummary
                  workspace={workerWorkspace}
                  connected={workspaceSocketConnected}
                />
                <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-100 p-3 pb-5 dark:bg-slate-800">
                  {loading ? (
                    <div className="rounded-2xl bg-white px-4 py-10 text-center shadow-sm dark:bg-slate-900">
                      <RefreshCw className="mx-auto h-5 w-5 animate-spin text-bird-blue" />
                      <p className="mt-3 text-sm font-black text-slate-800 dark:text-slate-200">{t('workerDashboard.requests.findingNearbyWork')}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{t('workerDashboard.requests.syncingRequests')}</p>
                    </div>
                  ) : !visibleRequests.length ? (
                    <div className="flex h-full min-h-[280px] flex-col items-center justify-center px-8 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm dark:bg-slate-900">
                        {isWorkerActive ? (
                          <MapPinned className="h-6 w-6 text-bird-blue" />
                        ) : (
                          <WifiOff className="h-6 w-6 text-slate-400" />
                        )}
                      </div>
                      <h3 className="mt-4 text-base font-black text-slate-900 dark:text-slate-100">
                        {emptyTitle}
                      </h3>
                      <p className="mt-2 max-w-[260px] text-sm font-medium leading-6 text-slate-500">
                        {emptyMessage}
                      </p>
                      {isWorkerActive && statusFilter === 'accepted' && onOpenHistory && (
                        <button
                          type="button"
                          onClick={() => {
                            setRequestsPanelOpen(false);
                            onOpenHistory();
                          }}
                          className="mt-5 rounded-2xl bg-bird-blue px-5 py-3 text-sm font-black text-white shadow-[0_14px_30px_rgba(14,165,233,0.22)] transition hover:bg-blue-600"
                        >
                          {t('workerDashboard.requests.viewHistory')}
                        </button>
                      )}
                    </div>
                  ) : (
                    visibleRequests.map((request) => (
                      <WorkerRequestCard
                        key={request.id_request}
                        request={request}
                        selected={request.id_request === selectedRequest?.id_request}
                        statusFilter={statusFilter}
                        busy={busyId === request.id_request}
                        actionLockedByActiveJob={
                          statusFilter === 'new' &&
                          !!activeWorkerRequest &&
                          activeWorkerRequest.id_request !== request.id_request
                        }
                        onSelect={setSelectedRequestId}
                        onAction={handleAction}
                        onCounter={openCounter}
                        onOpenRoute={(id) => {
                          setSelectedRequestId(id);
                          setActiveRouteRequestId(id);
                          setRequestsPanelOpen(false);
                        }}
                      />
                    ))
                  )}
                </div>
              </motion.aside>
            </>
          )}
          {routeAlert && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="absolute right-4 top-4 z-30 hidden w-[300px] rounded-2xl border bg-white/95 p-4 shadow-xl xl:block"
            >
              <h4 className="text-sm font-black text-slate-900 dark:text-slate-100">{routeAlert.title}</h4>
              <p className="mt-1 text-xs font-semibold text-slate-600">{routeAlert.message}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <WorkerRequestChatPanel
          open={!!selectedRequest && chatPanelOpen && canChat}
          connected={chatSocketConnected}
          request={selectedRequest}
          messages={selectedRequest ? chatByRequest[selectedRequest.id_request] || [] : []}
          text={selectedRequest ? chatTextByRequest[selectedRequest.id_request] || '' : ''}
          image={selectedRequest ? chatImageByRequest[selectedRequest.id_request] || null : null}
          busy={!!selectedRequest && chatBusyId === selectedRequest.id_request}
          endRef={chatEndRef}
          onClose={() => setChatPanelOpen(false)}
          onTextChange={(value) => {
            if (!selectedRequest) return;
            setChatTextByRequest((previous) => ({
              ...previous,
              [selectedRequest.id_request]: value,
            }));
          }}
          onImageChange={(file) => {
            if (!selectedRequest) return;
            setChatImageByRequest((previous) => ({
              ...previous,
              [selectedRequest.id_request]: file,
            }));
          }}
          onSend={() => selectedRequest && void sendChat(selectedRequest.id_request)}
          dockBesideRequestsPanel={requestsPanelOpen}
        />
      </main>

      <CounterOfferModal
        open={counterModalOpen}
        amount={counterAmount}
        note={counterNote}
        onAmountChange={setCounterAmount}
        onNoteChange={setCounterNote}
        onClose={() => setCounterModalOpen(false)}
        onConfirm={confirmCounter}
      />
      <ServiceReportModal
        open={!!reportRequest}
        idRequest={reportRequest?.id_request || null}
        reporterRole="worker"
        counterpartName={reportRequest?.client?.name || 'the client'}
        onClose={() => setReportRequest(null)}
      />
      <ServiceCompleteCelebration
        open={showCompletionCelebration}
        onDone={() => {
          setShowCompletionCelebration(false);
          onOpenHistory?.();
        }}
      />
    </>
  );
};
