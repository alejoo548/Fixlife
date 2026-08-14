import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, Calendar, User, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { localizeClientServiceName } from '../../utils/clientTranslations';

import { useServiceRequestHistory } from './hooks/useServiceRequestHistory';
import { useActiveTrackedRequest } from './hooks/useActiveTrackedRequest';
import ClientLiveRequestTracker from './ClientLiveRequestTracker';
import { statusBadgeClasses, statusLabel } from './serviceRequestHelpers';
import { getToken } from '../../utils/session';
import { loadLeaflet } from '../../utils/leafletLoader';
import { ServiceReportModal } from '../shared/ServiceReportModal';
import { useSSE } from '../../hooks/useSSE';

interface MyRequestsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MyRequestsModal: React.FC<MyRequestsModalProps> = ({ isOpen, onClose }) => {
  const { t, i18n } = useTranslation();
  const token = getToken();
  const {
    myRequests,
    historyStatus,
    setHistoryStatus,
    historyLoading,
    fetchMyRequests,
    setMyRequests,
  } = useServiceRequestHistory<any>(isOpen);

  const activeTrackedRequest = useActiveTrackedRequest(myRequests);

  useSSE({
    token,
    events: {
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

        setMyRequests((current: any[]) =>
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
    enabled: isOpen && !!token,
  });

  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [reportRequest, setReportRequest] = useState<any | null>(null);
  const [leafletReady, setLeafletReady] = useState(
    Boolean(typeof window !== 'undefined' && window.L)
  );

  useEffect(() => {
    if (!isOpen || leafletReady) return;
    let cancelled = false;
    loadLeaflet('my-requests-modal').then((ready) => {
      if (!cancelled) setLeafletReady(Boolean(ready));
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, leafletReady]);

  // Only show the live tracker for requests that have valid location and are not completed
  const trackableRequest = useMemo(() => {
    const base = activeTrackedRequest || (selectedRequestId
      ? myRequests.find((r: any) => r.id_request === selectedRequestId)
      : null);

    if (!base) return null;

    const status = String(base.status || '').toLowerCase();
    const hasCoords = base.latitude != null && base.longitude != null;

    if (!hasCoords || status === 'done' || status === 'cancelled') {
      return null;
    }

    return {
      id_request: base.id_request,
      service_name: base.service_name,
      location_text: base.location_text,
      latitude: base.latitude,
      longitude: base.longitude,
      status: base.status,
      assigned_worker: base.assigned_worker,
      booking_type: base.booking_type,
      scheduled_start_time: base.scheduled_start_time,
      scheduled_end_time: base.scheduled_end_time,
    };
  }, [activeTrackedRequest, selectedRequestId, myRequests]);

  const visibleRequests = useMemo(() => {
    if (historyStatus === 'all') return myRequests;
    return myRequests.filter((r: any) => String(r.status || '').toLowerCase() === historyStatus);
  }, [myRequests, historyStatus]);

  const handleSelectRequest = (id: number) => {
    setSelectedRequestId(id);
  };

  const handleFilter = (status: string) => {
    setHistoryStatus(status as any);
    setSelectedRequestId(null);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.93, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="relative flex h-[92vh] max-h-[920px] w-[95vw] max-w-[1380px] flex-col overflow-hidden rounded-[2.2rem] border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 px-6 py-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-bird-blue">{t('serviceRequest.history.yourServices')}</p>
                <h2 className="text-2xl font-black text-slate-950 dark:text-slate-100">{t('serviceRequest.history.requestsAndHistory')}</h2>
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                aria-label={t('serviceRequest.history.close')}
              >
                <X size={20} />
              </button>
            </div>

        {/* Filters */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-white/10 px-6 py-3 bg-slate-50 dark:bg-slate-950/50">
          {['all', 'in_progress', 'done', 'cancelled'].map((s) => {
            const label = s === 'all' ? t('serviceRequest.history.filters.all') : s === 'in_progress' ? t('serviceRequest.history.active') : s === 'done' ? t('serviceRequest.history.completed') : t('serviceRequest.history.filters.cancelled');
            const active = historyStatus === s;
            return (
              <button
                key={s}
                onClick={() => handleFilter(s)}
                className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${active ? 'bg-bird-blue text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-white/10'}`}
              >
                {label}
              </button>
            );
          })}
          <div className="ml-auto text-xs text-slate-500 dark:text-slate-400">{t('serviceRequest.history.requestsCount', { count: visibleRequests.length })}</div>
        </div>

        <div className="flex flex-1 min-h-0 flex-col lg:flex-row overflow-hidden">
          {/* Requests List */}
          <div className="w-full lg:w-96 border-r border-slate-200 dark:border-white/10 overflow-y-auto p-5 bg-white dark:bg-slate-900 custom-scrollbar">
            {historyLoading && <div className="p-4 text-sm text-slate-500 dark:text-slate-400">{t('serviceRequest.history.loading')}</div>}

            {visibleRequests.length === 0 && !historyLoading && (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">{t('serviceRequest.history.empty')}</div>
            )}

            <div className="space-y-2">
              {visibleRequests.map((req: any) => {
                const st = String(req.status || '').toLowerCase();
                const isCompleted = st === 'done';
                const isActive = activeTrackedRequest?.id_request === req.id_request || selectedRequestId === req.id_request;

                return (
                  <div
                    key={req.id_request}
                    className={`w-full rounded-2xl border p-4 text-left transition ${isActive ? 'border-bird-blue bg-sky-50/60 dark:bg-slate-800/80 ring-1 ring-bird-blue/20' : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 bg-white dark:bg-slate-900/60'}`}
                  >
                    <button onClick={() => handleSelectRequest(req.id_request)} className="w-full text-left">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-black text-slate-950 dark:text-slate-100 truncate">{localizeClientServiceName(req.service_name, i18n.language)}</div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                            <MapPin size={12} /> <span className="truncate">{req.location_text || t('serviceRequest.history.locationOnFile')}</span>
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${statusBadgeClasses(req.status)}`}>
                          {statusLabel(req.status, req)}
                        </span>
                      </div>

                      {req.assigned_worker?.name && (
                        <div className="mt-2 text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1">
                          <User size={12} /> {req.assigned_worker.name}
                        </div>
                      )}

                      {isCompleted && (
                        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 size={12} /> {t('serviceRequest.history.completed')}
                        </div>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setReportRequest(req);
                      }}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 dark:hover:border-amber-900/50 dark:hover:bg-amber-900/30 dark:hover:text-amber-300"
                    >
                      <ShieldAlert size={12} /> {t('serviceRequest.history.report')}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Details / Map area */}
          <div className="flex-1 flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950/40 p-4 lg:p-6 overflow-hidden">
            {!trackableRequest && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-white dark:bg-slate-800 flex items-center justify-center shadow-sm text-3xl">📋</div>
                <p className="text-xl font-black text-slate-900 dark:text-slate-100">{t('serviceRequest.history.selectRequest')}</p>
                <p className="mt-2 max-w-sm text-sm text-slate-600 dark:text-slate-400">
                  {t('serviceRequest.history.selectRequestSubtitle')}
                </p>
                <p className="mt-4 text-xs text-emerald-600 dark:text-emerald-400 font-medium">{t('serviceRequest.history.completedNote')}</p>
              </div>
            )}

            {trackableRequest && (
              <div className="flex h-full flex-col">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-slate-500 dark:text-slate-400">{t('serviceRequest.history.liveTracking')}</div>
                    <div className="font-black text-xl text-slate-950 dark:text-slate-100">{localizeClientServiceName(trackableRequest.service_name, i18n.language)}</div>
                  </div>
                  <div className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${statusBadgeClasses(trackableRequest.status)}`}>
                    {statusLabel(trackableRequest.status)}
                  </div>
                </div>

                <div className="flex-1 min-h-0 rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-inner">
                  <ClientLiveRequestTracker
                    leafletReady={leafletReady}
                    request={trackableRequest as any}
                    onClose={() => setSelectedRequestId(null)}
                  />
                </div>

                <div className="mt-3 text-[10px] text-slate-500 dark:text-slate-400 px-1">
                  {t('serviceRequest.history.mapUpdates')}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-slate-200 dark:border-white/10 px-6 py-3 text-right text-xs text-slate-400 dark:text-slate-500">
          {t('serviceRequest.history.footer')}
        </div>
      </motion.div>
    </div>
    )}

    <ServiceReportModal
      open={!!reportRequest}
      idRequest={reportRequest?.id_request || null}
      reporterRole="client"
      counterpartName={reportRequest?.assigned_worker?.name || null}
      onClose={() => setReportRequest(null)}
      onSubmitted={() => {
        setReportRequest(null);
        void fetchMyRequests(historyStatus, true);
      }}
    />
    </AnimatePresence>
  );
};

export default MyRequestsModal;