import React from 'react';
import {
  ArrowRight,
  CalendarClock,
  Check,
  Clock3,
  MapPin,
  Navigation,
  X,
} from 'lucide-react';
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
}) => {
  const scheduled = isScheduledRequest(request);
  const scheduledWindow = formatScheduledWindow(request);
  const isFastMatch = String(request.selection_mode || '').toLowerCase() === 'auto_assign';

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
      className={`group w-full rounded-2xl border p-4 text-left transition-all ${
        selected
          ? 'border-bird-blue bg-sky-50/80 dark:bg-slate-800/90 shadow-[0_14px_35px_rgba(0,144,255,0.12)]'
          : 'border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/90 shadow-[0_8px_24px_rgba(15,23,42,0.04)] hover:-translate-y-0.5 hover:border-sky-200 dark:hover:border-white/20 hover:shadow-[0_14px_32px_rgba(15,23,42,0.08)]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-black ${
            selected ? 'bg-bird-blue text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
          }`}>
            {getServiceIconLabel(request.service_icon, request.service_name)}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-black text-slate-950 dark:text-slate-100">{request.service_name}</h3>
            <p className="mt-0.5 text-[11px] font-bold text-slate-400 dark:text-slate-400">Request #{request.id_request}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-400">Offer</p>
          <p className="text-lg font-black text-slate-950 dark:text-slate-100">${request.budget.toFixed(0)}</p>
        </div>
      </div>

      <p className="mt-3 line-clamp-2 text-sm font-medium leading-5 text-slate-600 dark:text-slate-300">{request.description}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
          scheduled
            ? 'border-violet-200 dark:border-violet-800/40 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300'
            : 'border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
        }`}>
          {scheduled ? 'Scheduled visit' : 'Express visit'}
        </span>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
          isFastMatch
            ? 'border-sky-200 dark:border-sky-800/40 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300'
            : 'border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
        }`}>
          {isFastMatch ? 'Fast Match' : 'Review & Choose'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="flex min-w-0 items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 px-3 py-2">
          <MapPin className="h-4 w-4 shrink-0 text-bird-blue" />
          <span className="truncate text-[11px] font-bold text-slate-600 dark:text-slate-300">
            {request.distance_km != null ? `${request.distance_km.toFixed(1)} km away` : 'Distance pending'}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 px-3 py-2">
          {scheduled ? (
            <CalendarClock className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
          ) : (
            <Clock3 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          )}
          <span className="truncate text-[11px] font-bold text-slate-600 dark:text-slate-300">
            {scheduled ? scheduledWindow : 'Express visit'}
          </span>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{request.location_text}</p>
        {statusFilter !== 'new' && (
          <span className="shrink-0 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 px-2.5 py-1 text-[9px] font-black uppercase text-slate-600 dark:text-slate-300">
            {workerRequestStatusLabel(request.request_status)}
          </span>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        {statusFilter === 'new' ? (
          <>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onAction(request.id_request, 'reject');
              }}
              disabled={busy || actionLockedByActiveJob}
              title="Reject request"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onCounter(request.id_request, request.budget);
              }}
              disabled={busy || actionLockedByActiveJob}
              className="h-10 flex-1 rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/40 px-3 text-xs font-black text-amber-800 dark:text-amber-300 transition hover:bg-amber-100 dark:hover:bg-amber-900/60 disabled:opacity-40"
            >
              Counter
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onAction(request.id_request, 'accept');
              }}
              disabled={busy || actionLockedByActiveJob}
              className="flex h-10 flex-[1.25] items-center justify-center gap-2 rounded-xl bg-bird-blue px-3 text-xs font-black text-white shadow-[0_10px_24px_rgba(0,144,255,0.22)] transition hover:bg-bird-darkBlue disabled:opacity-40"
            >
              <Check className="h-4 w-4" />
              Accept
            </button>
          </>
        ) : request.request_status === 'assigned' && !request.client_approved_at ? (
          <button
            type="button"
            disabled
            className="h-10 w-full rounded-xl bg-sky-50 dark:bg-sky-950/40 text-xs font-black text-sky-700 dark:text-sky-300"
          >
            Waiting for client approval
          </button>
        ) : request.request_status === 'assigned' ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenRoute(request.id_request);
            }}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 dark:bg-bird-blue hover:bg-slate-800 dark:hover:bg-bird-blue/90 text-xs font-black text-white transition disabled:opacity-50"
            disabled={busy}
          >
            <Navigation className="h-4 w-4" />
            Open route
          </button>
        ) : ['route_in_progress', 'arrived', 'start_pending', 'in_progress', 'finish_pending', 'payment_pending', 'paid', 'completion_pending'].includes(request.request_status) ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenRoute(request.id_request);
            }}
            disabled={busy}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 dark:bg-bird-blue hover:bg-slate-800 dark:hover:bg-bird-blue/90 text-xs font-black text-white disabled:opacity-50"
          >
            <ArrowRight className="h-4 w-4" />
            Open current job
          </button>
        ) : request.request_status === 'awaiting_confirmation' ? (
          <button
            type="button"
            disabled
            className="h-10 w-full rounded-xl bg-violet-50 dark:bg-violet-950/40 text-xs font-black text-violet-700 dark:text-violet-300"
          >
            Waiting for client confirmation
          </button>
        ) : (
          <button
            onClick={(event) => {
              event.stopPropagation();
              onOpenRoute(request.id_request);
            }}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 dark:bg-bird-blue hover:bg-slate-800 dark:hover:bg-bird-blue/90 text-xs font-black text-white disabled:opacity-50"
            disabled={busy}
          >
            Open route
            <ArrowRight className="h-4 w-4" />
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
