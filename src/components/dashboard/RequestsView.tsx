import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { API_ENDPOINTS } from '../../config/api';
import { useChatSocket } from '../../hooks/useChatSocket';
import { useSSE } from '../../hooks/useSSE';
import { showSweetToast } from '../../utils/sweetAlert';
import { CounterOfferModal } from './requests/CounterOfferModal';
import { WorkerRequestCard } from './requests/WorkerRequestCard';
import { WorkerRequestChatPanel } from './requests/WorkerRequestChatPanel';
import type {
  ChatMessage,
  RequestsViewProps,
  WorkerRequest,
  WorkerRequestsPayload,
} from './requests/workerRequestTypes';
import {
  formatEta,
  formatScheduledWindow,
  getServiceIconLabel,
  haversineKm,
  isScheduledRequest,
  isValidCoord,
  mergeChatMessages,
  toFiniteNumber,
  workerRequestStatusLabel,
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
  error: (message: string) =>
    void showSweetToast({ tone: 'error', message, duration: 3200 }),
};

export const RequestsView: React.FC<RequestsViewProps> = ({
  isOnline,
  mobileView,
  token,
}) => {
  const [statusFilter, setStatusFilter] = useState<RequestTab>('new');
  const [requests, setRequests] = useState<WorkerRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [activeWorkerRequest, setActiveWorkerRequest] = useState<{
    id_request: number;
    status: string;
  } | null>(null);
  const [activeRouteRequestId, setActiveRouteRequestId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [chatPanelOpen, setChatPanelOpen] = useState(false);
  const [routePanelExpanded, setRoutePanelExpanded] = useState(false);
  const [counterModalOpen, setCounterModalOpen] = useState(false);
  const [counterTargetId, setCounterTargetId] = useState<number | null>(null);
  const [counterAmount, setCounterAmount] = useState('');
  const [counterNote, setCounterNote] = useState('');
  const firstLoadRef = useRef(true);
  const knownNewIdsRef = useRef<Set<number>>(new Set());

  const isWorkerActive = isOnline === true;
  const visibleRequests = isWorkerActive ? requests : [];
  const selectedRequest = useMemo(
    () =>
      visibleRequests.find((request) => request.id_request === selectedRequestId) ||
      visibleRequests[0] ||
      null,
    [selectedRequestId, visibleRequests]
  );
  const routeActive =
    !!selectedRequest && activeRouteRequestId === selectedRequest.id_request;

  const { presenceBusy, pushPresence, setWorkerCoords, workerCoords } =
    useWorkerPresence({ token, isOnline, routeActive });

  const {
    centerRoute,
    displayedRouteMetrics,
    leafletReady,
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

  const canTravel =
    !!selectedRequest &&
    ['payment_pending', 'paid', 'in_progress', 'awaiting_confirmation', 'done'].includes(
      String(selectedRequest.request_status || '').toLowerCase()
    );
  const canChat =
    !!selectedRequest &&
    ['assigned', 'payment_pending', 'paid', 'in_progress', 'awaiting_confirmation', 'done'].includes(
      String(selectedRequest.request_status || '').toLowerCase()
    ) &&
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
    if (!token || !isWorkerActive) {
      setRequests([]);
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const response = await fetch(
        `${API_ENDPOINTS.worker.requests}?status=${statusFilter}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const payload: WorkerRequestsPayload = await response.json();
      if (!response.ok || !payload?.success) {
        if (!silent) notify.error((payload as any)?.error || 'Could not load requests.');
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
      setSelectedRequestId((current) =>
        current && next.some((request) => request.id_request === current)
          ? current
          : next[0]?.id_request || null
      );

      const workerLat = toFiniteNumber(payload.worker_profile?.latitude);
      const workerLng = toFiniteNumber(payload.worker_profile?.longitude);
      if (workerLat != null && workerLng != null) {
        const nextCoords = { lat: workerLat, lng: workerLng };
        setWorkerCoords((current) =>
          current && haversineKm(current, nextCoords) < 0.003 ? current : nextCoords
        );
      }
      setActiveWorkerRequest(
        payload.worker_profile?.active_request_id
          ? {
              id_request: Number(payload.worker_profile.active_request_id),
              status: String(payload.worker_profile.active_request_status || '').toLowerCase(),
            }
          : null
      );

      if (statusFilter === 'new') {
        const ids = new Set(next.map((request) => request.id_request));
        if (!firstLoadRef.current) {
          const fresh = [...ids].filter((id) => !knownNewIdsRef.current.has(id)).length;
          if (fresh > 0) notify.success(`${fresh} new request(s) nearby.`);
        }
        knownNewIdsRef.current = ids;
        firstLoadRef.current = false;
      }
    } catch {
      if (!silent) notify.error('Network error loading requests.');
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
    if (isWorkerActive) return;
    setSelectedRequestId(null);
    setActiveRouteRequestId(null);
    setChatPanelOpen(false);
    setRoutePanelExpanded(false);
    setRequests([]);
  }, [isWorkerActive]);

  useEffect(() => setRoutePanelExpanded(false), [selectedRequest?.id_request]);

  useSSE({
    token,
    enabled: !!token && isWorkerActive,
    events: {
      request_updated: () => void fetchRequests(true),
      chat_message: (data: unknown) => {
        const event = data as { id_request?: number } | null;
        if (!selectedRequest || !canChat || !chatPanelOpen) return;
        if (event?.id_request == null || event.id_request === selectedRequest.id_request) {
          void fetchRequestChat(selectedRequest.id_request, {
            silent: true,
            incremental: true,
          });
        }
      },
    },
  });

  useChatSocket<ChatMessage>({
    token,
    requestId: selectedRequest?.id_request || null,
    enabled: !!token && !!selectedRequest && canChat && chatPanelOpen,
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
        notify.error(payload?.error || 'Could not update this request.');
        return false;
      }
      notify.success(successMessage);
      await fetchRequests(true);
      return true;
    } catch {
      notify.error('Network error updating this request.');
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const handleAction = (idRequest: number, action: 'accept' | 'reject') =>
    postWorkerAction(
      idRequest,
      action === 'accept'
        ? API_ENDPOINTS.worker.acceptRequest(idRequest)
        : API_ENDPOINTS.worker.rejectRequest(idRequest),
      action === 'accept' ? 'Request accepted.' : 'Request rejected.'
    );

  const handleProgress = async (idRequest: number, action: 'start' | 'complete') => {
    const success = await postWorkerAction(
      idRequest,
      action === 'start'
        ? API_ENDPOINTS.worker.startRequest(idRequest)
        : API_ENDPOINTS.worker.completeRequest(idRequest),
      action === 'start'
        ? 'Trip started. Live location is now shared with the client.'
        : 'Job marked as completed.'
    );
    if (!success) return;
    if (action === 'start') {
      setSelectedRequestId(idRequest);
      setActiveRouteRequestId(idRequest);
      if (isValidCoord(workerCoords)) {
        void pushPresence(true, workerCoords.lat, workerCoords.lng, true);
      }
    } else {
      setActiveRouteRequestId((current) => (current === idRequest ? null : current));
    }
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
      notify.error('Amount must be between $0.01 and $1,000.00.');
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
        notify.error(payload?.error || 'Could not send counter offer.');
        return;
      }
      notify.success('Counter offer sent successfully.');
      await fetchRequests(true);
    } catch {
      notify.error('Network error sending counter offer.');
    } finally {
      setBusyId(null);
      setCounterTargetId(null);
    }
  };

  const toggleRoute = () => {
    if (!selectedRequest || !routePreview || routeLoading || !canTravel) return;
    const starting = activeRouteRequestId !== selectedRequest.id_request;
    setActiveRouteRequestId(starting ? selectedRequest.id_request : null);
    showRouteAlert({
      tone: 'info',
      title: starting ? 'Navigation started' : 'Navigation paused',
      message: starting
        ? 'Fixlife will update the route using your real GPS position.'
        : 'Live route tracking was paused for this request.',
    });
  };

  const listHint = !isWorkerActive
    ? 'Go online to receive and manage requests.'
    : statusFilter === 'new'
      ? `Live updates${presenceBusy ? ' - syncing location' : ''}`
      : statusFilter === 'accepted'
        ? 'Manage your active jobs and client communication.'
        : 'Rejected requests remain available for reference.';
  const routeStatus =
    routeStatusLabel === 'Idle'
      ? 'Ready'
      : routeStatusLabel === 'Live Route'
        ? 'On route'
        : routeStatusLabel;
  const selectedScheduled = isScheduledRequest(selectedRequest);

  return (
    <>
      <motion.aside
        initial={mobileView === 'list' ? { y: 0 } : { y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className={`relative z-20 flex h-full min-h-0 w-full flex-col overflow-hidden border-gray-200 bg-white/95 shadow-2xl backdrop-blur-lg lg:w-[430px] lg:border-r xl:w-[450px] ${
          mobileView === 'map' ? 'hidden lg:flex' : 'flex'
        }`}
      >
        <div className="border-b border-gray-200 bg-white/95 p-3 sm:p-4">
          <div className="grid grid-cols-3 gap-2">
            {(['new', 'accepted', 'rejected'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`rounded-lg px-2 py-2 text-xs font-bold uppercase transition ${
                  statusFilter === tab
                    ? 'bg-bird-blue text-white'
                    : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs font-semibold text-gray-500">{listHint}</p>
          {statusFilter === 'new' && activeWorkerRequest && (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              Finish request #{activeWorkerRequest.id_request} before accepting another job.
            </p>
          )}
        </div>
        <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-3 pb-24 lg:pb-4">
          {loading ? (
            <div className="rounded-2xl border bg-white px-4 py-8 text-center text-sm font-bold text-slate-500">
              Refreshing requests...
            </div>
          ) : !visibleRequests.length ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm font-semibold text-gray-500">
              {isWorkerActive
                ? 'No requests in this tab.'
                : 'Go online to view nearby and active requests.'}
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
                onProgress={handleProgress}
              />
            ))
          )}
        </div>
      </motion.aside>

      <main
        className={`relative flex-1 overflow-hidden ${
          mobileView === 'map' ? 'block' : 'hidden lg:block'
        }`}
      >
        <div ref={mapContainerRef} className="absolute inset-0 z-0 bg-gray-100" />
        {!leafletReady && (
          <div className="absolute right-4 top-4 z-[500] h-3 w-3 animate-pulse rounded-full bg-bird-blue" />
        )}
        {!isWorkerActive && (
          <div className="absolute inset-0 z-[400] flex items-center justify-center bg-white/70 backdrop-blur-sm">
            <div className="mx-4 max-w-sm rounded-3xl border bg-white p-6 text-center shadow-xl">
              <h3 className="text-xl font-black text-slate-900">Location hidden while offline</h3>
              <p className="mt-2 text-sm font-semibold text-slate-600">
                Go online to share your GPS position and receive request updates.
              </p>
            </div>
          </div>
        )}

        {selectedRequest && (
          <section className="absolute inset-x-3 bottom-4 z-[500] lg:bottom-auto lg:left-4 lg:right-auto lg:top-4 lg:w-[350px]">
            <div className="rounded-3xl border border-white/80 bg-white/95 p-5 shadow-2xl backdrop-blur-xl">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-bird-blue font-black text-white">
                    {getServiceIconLabel(
                      selectedRequest.service_icon,
                      selectedRequest.service_name
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-black text-slate-950">
                      {selectedRequest.service_name}
                    </h3>
                    <p className="truncate text-xs font-semibold text-slate-500">
                      {selectedRequest.location_text || 'Location pending'}
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase text-slate-700">
                  {workerRequestStatusLabel(selectedRequest.request_status)}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-sky-50 px-3 py-1 text-[11px] font-bold text-sky-700">
                  {selectedScheduled
                    ? formatScheduledWindow(selectedRequest)
                    : 'Express request'}
                </span>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-800">
                  ${selectedRequest.budget.toFixed(2)}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <RouteMetric label="ETA" value={routeLoading ? '...' : displayedRouteMetrics ? formatEta(displayedRouteMetrics.durationMin) : '--'} />
                <RouteMetric label="Distance" value={displayedRouteMetrics ? `${displayedRouteMetrics.distanceKm.toFixed(1)} km` : '--'} />
                <RouteMetric label="Status" value={routeStatus} />
              </div>
              {routeError && <p className="mt-3 text-xs font-semibold text-amber-700">{routeError}</p>}

              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  onClick={toggleRoute}
                  disabled={!routePreview || routeLoading || !canTravel}
                  className="rounded-2xl bg-bird-blue py-3 text-sm font-black text-white disabled:opacity-50"
                >
                  {!canTravel ? 'Waiting approval' : routeActive ? 'Pause route' : 'Start route'}
                </button>
                <button
                  onClick={() => setRoutePanelExpanded((open) => !open)}
                  className="rounded-2xl bg-slate-100 py-3 text-sm font-black text-slate-700"
                >
                  {routePanelExpanded ? 'Hide tools' : 'Route tools'}
                </button>
              </div>

              {routePanelExpanded && (
                <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                  <div className="grid grid-cols-2 gap-2">
                    {(['balanced', 'close'] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setRouteCameraMode(mode)}
                        className={`rounded-xl px-3 py-2 text-xs font-black ${
                          routeCameraMode === mode
                            ? 'bg-bird-blue text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {mode === 'close' ? 'Close follow' : 'Balanced'}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={centerRoute} className="rounded-xl bg-slate-100 py-2 text-xs font-black text-slate-700">
                      Center route
                    </button>
                    <button
                      onClick={() => setChatPanelOpen(true)}
                      disabled={!canChat}
                      className="rounded-xl border border-bird-blue/20 py-2 text-xs font-black text-bird-blue disabled:opacity-40"
                    >
                      Open chat
                    </button>
                  </div>
                  <button
                    onClick={() => setTrafficEnabled((enabled) => !enabled)}
                    className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700"
                  >
                    <span>
                      Traffic {trafficEnabled && simulatedTraffic ? `+${Math.ceil(simulatedTraffic.delayMin)} min` : 'off'}
                    </span>
                    <span className={trafficEnabled ? 'text-emerald-600' : 'text-slate-400'}>
                      {trafficEnabled ? 'On' : 'Off'}
                    </span>
                  </button>
                </div>
              )}

              {selectedRequest.request_status === 'paid' && (
                <JobButton
                  busy={busyId === selectedRequest.id_request}
                  label="Start job"
                  busyLabel="Starting..."
                  onClick={() => void handleProgress(selectedRequest.id_request, 'start')}
                />
              )}
              {selectedRequest.request_status === 'in_progress' && (
                <JobButton
                  busy={busyId === selectedRequest.id_request}
                  label="Finish job"
                  busyLabel="Saving..."
                  onClick={() => void handleProgress(selectedRequest.id_request, 'complete')}
                />
              )}
            </div>
          </section>
        )}

        <AnimatePresence>
          {routeAlert && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="absolute right-4 top-4 z-[520] hidden w-[300px] rounded-2xl border bg-white/95 p-4 shadow-xl xl:block"
            >
              <h4 className="text-sm font-black text-slate-900">{routeAlert.title}</h4>
              <p className="mt-1 text-xs font-semibold text-slate-600">{routeAlert.message}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <WorkerRequestChatPanel
          open={!!selectedRequest && chatPanelOpen && canChat}
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
    </>
  );
};

const RouteMetric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl border border-slate-100 bg-slate-50 px-2 py-3">
    <p className="text-[9px] font-black uppercase text-slate-400">{label}</p>
    <p className="mt-1 truncate text-sm font-black text-slate-900">{value}</p>
  </div>
);

const JobButton = ({
  busy,
  busyLabel,
  label,
  onClick,
}: {
  busy: boolean;
  busyLabel: string;
  label: string;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    disabled={busy}
    className="mt-3 w-full rounded-2xl bg-bird-blue py-3 text-sm font-black text-white disabled:opacity-50"
  >
    {busy ? busyLabel : label}
  </button>
);
