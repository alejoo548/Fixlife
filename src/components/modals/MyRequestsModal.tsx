import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, Calendar, User, CheckCircle2 } from 'lucide-react';

import { useServiceRequestHistory } from './hooks/useServiceRequestHistory';
import { useActiveTrackedRequest } from './hooks/useActiveTrackedRequest';
import ClientLiveRequestTracker from './ClientLiveRequestTracker';
import { statusBadgeClasses, statusLabel } from './serviceRequestHelpers';
import { getToken } from '../../utils/session';

interface MyRequestsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MyRequestsModal: React.FC<MyRequestsModalProps> = ({ isOpen, onClose }) => {
  const token = getToken();
  const {
    myRequests,
    historyStatus,
    setHistoryStatus,
    historyLoading,
    fetchMyRequests,
  } = useServiceRequestHistory<any>(isOpen);

  const activeTrackedRequest = useActiveTrackedRequest(myRequests);

  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 20 }}
        className="relative flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-bird-blue">Your services</p>
            <h2 className="text-2xl font-black text-slate-950">My Requests &amp; History</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 border-b px-6 py-3 bg-slate-50">
          {['all', 'in_progress', 'done', 'cancelled'].map((s) => {
            const label = s === 'all' ? 'All' : s === 'in_progress' ? 'Active' : s === 'done' ? 'Completed' : 'Cancelled';
            const active = historyStatus === s;
            return (
              <button
                key={s}
                onClick={() => handleFilter(s)}
                className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${active ? 'bg-bird-blue text-white' : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'}`}
              >
                {label}
              </button>
            );
          })}
          <div className="ml-auto text-xs text-slate-500">{visibleRequests.length} requests</div>
        </div>

        <div className="flex flex-1 min-h-0 flex-col lg:flex-row overflow-hidden">
          {/* Requests List */}
          <div className="w-full lg:w-80 border-r overflow-y-auto p-4 bg-white custom-scrollbar">
            {historyLoading && <div className="p-4 text-sm text-slate-500">Loading your requests...</div>}

            {visibleRequests.length === 0 && !historyLoading && (
              <div className="p-8 text-center text-sm text-slate-500">No requests in this filter.</div>
            )}

            <div className="space-y-2">
              {visibleRequests.map((req: any) => {
                const st = String(req.status || '').toLowerCase();
                const isCompleted = st === 'done';
                const isActive = activeTrackedRequest?.id_request === req.id_request || selectedRequestId === req.id_request;

                return (
                  <button
                    key={req.id_request}
                    onClick={() => handleSelectRequest(req.id_request)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${isActive ? 'border-bird-blue bg-sky-50/60 ring-1 ring-bird-blue/20' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-black text-slate-950 truncate">{req.service_name}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                          <MapPin size={12} /> <span className="truncate">{req.location_text || 'Location on file'}</span>
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${statusBadgeClasses(req.status)}`}>
                        {statusLabel(req.status, req)}
                      </span>
                    </div>

                    {req.assigned_worker?.name && (
                      <div className="mt-2 text-xs text-slate-600 flex items-center gap-1">
                        <User size={12} /> {req.assigned_worker.name}
                      </div>
                    )}

                    {isCompleted && (
                      <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        <CheckCircle2 size={12} /> Completed
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Details / Map area */}
          <div className="flex-1 flex flex-col min-h-0 bg-slate-50 p-4 lg:p-6 overflow-hidden">
            {!trackableRequest && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-white flex items-center justify-center shadow-sm text-3xl">📋</div>
                <p className="text-xl font-black text-slate-900">Select a request</p>
                <p className="mt-2 max-w-sm text-sm text-slate-600">
                  Choose an active request from the list to see live tracking on the map, or browse your completed history.
                </p>
                <p className="mt-4 text-xs text-emerald-600 font-medium">Completed services are clearly marked and removed from active tracking.</p>
              </div>
            )}

            {trackableRequest && (
              <div className="flex h-full flex-col">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-slate-500">Live tracking</div>
                    <div className="font-black text-xl text-slate-950">{trackableRequest.service_name}</div>
                  </div>
                  <div className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${statusBadgeClasses(trackableRequest.status)}`}>
                    {statusLabel(trackableRequest.status)}
                  </div>
                </div>

                <div className="flex-1 min-h-0 rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-inner">
                  <ClientLiveRequestTracker
                    leafletReady={true}
                    request={trackableRequest as any}
                    onClose={() => setSelectedRequestId(null)}
                  />
                </div>

                <div className="mt-3 text-[10px] text-slate-500 px-1">
                  Map updates live while the service is in progress. Completed services appear only in the list on the left.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t px-6 py-3 text-right text-xs text-slate-400">
          Your requests are updated in real time • Separate view from booking flow
        </div>
      </motion.div>
    </div>
  );
};

export default MyRequestsModal;