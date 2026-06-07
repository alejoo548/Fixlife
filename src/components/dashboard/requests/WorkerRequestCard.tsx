import React from 'react';
import type { WorkerRequest } from './workerRequestTypes';
import {
  formatScheduledWindow,
  getServiceIconLabel,
  isScheduledRequest,
  workerRequestStatusLabel,
} from './workerRequestUtils';

interface WorkerRequestCardProps {
  request: WorkerRequest;
  selected: boolean;
  statusFilter: 'new' | 'accepted' | 'rejected';
  busy: boolean;
  actionLockedByActiveJob: boolean;
  onSelect: (idRequest: number) => void;
  onAction: (idRequest: number, action: 'accept' | 'reject') => void;
  onCounter: (idRequest: number, currentBudget: number) => void;
  onOpenRoute: (idRequest: number) => void;
  onProgress: (idRequest: number, action: 'start' | 'complete') => void;
}

export const WorkerRequestCard: React.FC<WorkerRequestCardProps> = ({
  request,
  selected,
  statusFilter,
  busy,
  actionLockedByActiveJob,
  onSelect,
  onAction,
  onCounter,
  onOpenRoute,
  onProgress,
}) => {
  const scheduled = isScheduledRequest(request);
  const scheduledWindow = formatScheduledWindow(request);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(request.id_request)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(request.id_request);
        }
      }}
      className={`w-full text-left rounded-2xl p-4 border transition shadow-sm ${
        selected ? 'border-bird-blue bg-bird-blue/5' : 'border-gray-200 bg-white hover:border-bird-orange/50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bird-blue/10 text-sm font-black text-bird-blue">
            {getServiceIconLabel(request.service_icon, request.service_name)}
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 text-base truncate">{request.service_name}</h3>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <p className="text-xs text-gray-500">
                {request.distance_km != null ? `${request.distance_km.toFixed(1)} km` : 'No distance'}
              </p>
              {statusFilter !== 'new' && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                  {workerRequestStatusLabel(request.request_status)}
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${
                  scheduled
                    ? 'border border-violet-200 bg-violet-50 text-violet-700'
                    : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}
              >
                {scheduled ? 'Scheduled' : 'Express'}
              </span>
              {scheduled && (
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600">
                  {scheduledWindow}
                </span>
              )}
            </div>
          </div>
        </div>
        <span className="font-black text-bird-orange text-lg">${request.budget.toFixed(0)}</span>
      </div>

      <p className="text-sm text-gray-700 mt-2 line-clamp-2">{request.description}</p>
      <p className="text-xs text-gray-500 mt-2 truncate">{request.location_text}</p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {statusFilter === 'new' ? (
          <>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onAction(request.id_request, 'reject');
              }}
              disabled={busy || actionLockedByActiveJob}
              className="py-2 rounded-lg bg-gray-100 text-gray-700 font-bold text-xs hover:bg-gray-200 disabled:opacity-50"
            >
              Reject
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onCounter(request.id_request, request.budget);
              }}
              disabled={busy || actionLockedByActiveJob}
              className="py-2 rounded-lg bg-amber-500 text-white font-bold text-xs hover:bg-amber-600 disabled:opacity-50 transition-colors"
            >
              Counter
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onAction(request.id_request, 'accept');
              }}
              disabled={busy || actionLockedByActiveJob}
              className="py-2 rounded-lg bg-bird-blue text-white font-bold text-xs hover:bg-bird-darkBlue disabled:opacity-50"
            >
              Accept
            </button>
          </>
        ) : request.request_status === 'assigned' ? (
          <button
            type="button"
            disabled
            className="col-span-3 py-2 rounded-lg bg-sky-100 text-sky-700 font-bold text-xs cursor-not-allowed"
          >
            Waiting for client approval
          </button>
        ) : request.request_status === 'payment_pending' ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenRoute(request.id_request);
            }}
            className="col-span-3 py-2 rounded-lg bg-emerald-500 text-white font-bold text-xs hover:bg-emerald-600 disabled:opacity-50"
            disabled={busy}
          >
            Open In-App Route
          </button>
        ) : request.request_status === 'paid' ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onProgress(request.id_request, 'start');
            }}
            disabled={busy}
            className="col-span-3 py-2 rounded-lg bg-emerald-500 text-white font-bold text-xs hover:bg-emerald-600 disabled:opacity-50"
          >
            {busy ? 'Starting...' : 'Start Trip'}
          </button>
        ) : request.request_status === 'in_progress' ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onProgress(request.id_request, 'complete');
            }}
            disabled={busy}
            className="col-span-3 py-2 rounded-lg bg-violet-600 text-white font-bold text-xs hover:bg-violet-700 disabled:opacity-50"
          >
            {busy ? 'Saving...' : 'Mark Work Done'}
          </button>
        ) : request.request_status === 'awaiting_confirmation' ? (
          <button
            type="button"
            disabled
            className="col-span-3 py-2 rounded-lg bg-violet-100 text-violet-700 font-bold text-xs cursor-not-allowed"
          >
            Waiting for client confirmation
          </button>
        ) : (
          <button
            onClick={(event) => {
              event.stopPropagation();
              onOpenRoute(request.id_request);
            }}
            className="col-span-3 py-2 rounded-lg bg-emerald-500 text-white font-bold text-xs hover:bg-emerald-600 disabled:opacity-50"
            disabled={busy}
          >
            Open In-App Route
          </button>
        )}
      </div>

      {statusFilter === 'new' && actionLockedByActiveJob && (
        <p className="mt-2 text-[11px] font-semibold text-amber-700">
          Finish your current active job before taking another request.
        </p>
      )}
      {request.proposed_budget != null && (
        <p className="text-xs text-amber-700 font-semibold mt-2">
          Counter offer: ${request.proposed_budget.toFixed(2)}
          {request.counter_message ? ` - ${request.counter_message}` : ''}
        </p>
      )}
    </div>
  );
};
