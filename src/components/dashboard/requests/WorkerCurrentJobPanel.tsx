import {
  LocateFixed,
  MessageCircle,
  SlidersHorizontal,
} from 'lucide-react';
import type { WorkerRequest } from './workerRequestTypes';
import {
  formatEta,
  formatScheduledWindow,
  getServiceIconLabel,
  workerRequestStatusLabel,
} from './workerRequestUtils';
import { WorkerCurrentJobAction } from './WorkerCurrentJobAction';
import { WorkerRequestTimeline } from './WorkerRequestTimeline';

interface WorkerCurrentJobPanelProps {
  request: WorkerRequest;
  scheduled: boolean;
  routeActive: boolean;
  arrived: boolean;
  canChat: boolean;
  canTravel: boolean;
  routeLoading: boolean;
  routeReady: boolean;
  routeError: string | null;
  routeStatus: string;
  routeMetrics: { durationMin: number; distanceKm: number } | null;
  routePanelExpanded: boolean;
  routeCameraMode: 'balanced' | 'close';
  trafficEnabled: boolean;
  trafficDelayMinutes: number;
  busy: boolean;
  onToggleTools: () => void;
  onOpenChat: () => void;
  onCenterRoute: () => void;
  onCameraModeChange: (mode: 'balanced' | 'close') => void;
  onTrafficToggle: () => void;
  onTravel: () => void;
  onArrive: () => void;
  onStart: () => void;
  onComplete: () => void;
  onFinalize: () => void;
}

export const WorkerCurrentJobPanel = ({
  request,
  scheduled,
  routeActive,
  arrived,
  canChat,
  canTravel,
  routeLoading,
  routeReady,
  routeError,
  routeStatus,
  routeMetrics,
  routePanelExpanded,
  routeCameraMode,
  trafficEnabled,
  trafficDelayMinutes,
  busy,
  onToggleTools,
  onOpenChat,
  onCenterRoute,
  onCameraModeChange,
  onTrafficToggle,
  onTravel,
  onArrive,
  onStart,
  onComplete,
  onFinalize,
}: WorkerCurrentJobPanelProps) => (
  <section className="absolute inset-x-3 bottom-4 z-[500] lg:bottom-auto lg:left-auto lg:right-4 lg:top-4 lg:w-[380px]">
    <div className="custom-scrollbar max-h-[min(76vh,760px)] overflow-y-auto rounded-[28px] border border-white/80 bg-white/95 p-5 shadow-[0_28px_70px_rgba(15,23,42,0.16)] backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between">
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Current job
        </div>
        <span className="text-[11px] font-black text-slate-400">#{request.id_request}</span>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-bird-blue font-black text-white shadow-[0_10px_24px_rgba(0,144,255,0.22)]">
            {getServiceIconLabel(request.service_icon, request.service_name)}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-lg font-black text-slate-950">{request.service_name}</h3>
            <p className="truncate text-xs font-semibold text-slate-500">
              {request.location_text || 'Location pending'}
            </p>
          </div>
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[9px] font-black uppercase text-slate-600">
          {workerRequestStatusLabel(request.request_status)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-sky-50 px-3 py-1 text-[11px] font-bold text-sky-700">
          {scheduled ? formatScheduledWindow(request) : 'Express request'}
        </span>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-800">
          Budget ${request.budget.toFixed(2)}
        </span>
      </div>

      {request.images && request.images.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
              Problem photos
            </p>
            <span className="text-[10px] font-bold text-slate-400">
              {request.images.length} attached
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {request.images.slice(0, 3).map((image, index) => (
              <a
                key={`${image.file_name}-${index}`}
                href={image.url}
                target="_blank"
                rel="noreferrer"
                className="aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
              >
                <img
                  src={image.url}
                  alt={`Problem attachment ${index + 1}`}
                  className="h-full w-full object-cover"
                />
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Detail label="Client" value={request.client?.name || 'Client'} />
        <Detail
          label="Estimated time"
          value={
            request.scheduled_start_time && request.scheduled_end_time
              ? `${Math.max(
                  1,
                  Math.round(
                    (new Date(request.scheduled_end_time).getTime() -
                      new Date(request.scheduled_start_time).getTime()) /
                      3_600_000
                  )
                )}h`
              : 'Flexible'
          }
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Metric
          label="ETA"
          value={routeLoading ? '...' : routeMetrics ? formatEta(routeMetrics.durationMin) : '--'}
        />
        <Metric
          label="Distance"
          value={routeMetrics ? `${routeMetrics.distanceKm.toFixed(1)} km` : '--'}
        />
        <Metric label="Status" value={routeStatus} />
      </div>
      {routeError && <p className="mt-3 text-xs font-semibold text-amber-700">{routeError}</p>}

      <WorkerRequestTimeline
        status={request.request_status}
        routeActive={routeActive}
        arrived={arrived}
      />

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onToggleTools}
          className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 py-3 text-sm font-black text-slate-700"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {routePanelExpanded ? 'Hide tools' : 'Route tools'}
        </button>
        <button
          type="button"
          onClick={onOpenChat}
          disabled={!canChat}
          className="flex items-center justify-center gap-2 rounded-xl border border-bird-blue/20 py-3 text-sm font-black text-bird-blue disabled:opacity-40"
        >
          <MessageCircle className="h-4 w-4" />
          Chat
        </button>
      </div>

      {routePanelExpanded && (
        <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
          <div className="grid grid-cols-2 gap-2">
            {(['balanced', 'close'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onCameraModeChange(mode)}
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
            <button
              type="button"
              onClick={onCenterRoute}
              className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 py-2 text-xs font-black text-slate-700"
            >
              <LocateFixed className="h-4 w-4" />
              Center
            </button>
            <div className="flex items-center justify-center rounded-xl bg-slate-100 px-2 text-center text-[10px] font-black text-slate-600">
              GPS updates live
            </div>
          </div>
          <button
            type="button"
            onClick={onTrafficToggle}
            className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700"
          >
            <span>
              Traffic {trafficEnabled && trafficDelayMinutes > 0 ? `+${Math.ceil(trafficDelayMinutes)} min` : 'off'}
            </span>
            <span className={trafficEnabled ? 'text-emerald-600' : 'text-slate-400'}>
              {trafficEnabled ? 'On' : 'Off'}
            </span>
          </button>
        </div>
      )}

      <WorkerCurrentJobAction
        status={request.request_status}
        routeActive={routeActive}
        arrived={arrived}
        canTravel={canTravel}
        routeReady={routeReady}
        busy={busy}
        scheduledStartTime={request.scheduled_start_time}
        onTravel={onTravel}
        onArrive={onArrive}
        onStart={onStart}
        onComplete={onComplete}
        onFinalize={onFinalize}
        approvals={request.approvals}
        workStartedAt={request.work_started_at}
        clientApproved={Boolean(request.client_approved_at)}
      />
    </div>
  </section>
);

const Detail = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl bg-slate-50 px-3 py-2.5">
    <p className="text-[9px] font-black uppercase text-slate-400">{label}</p>
    <p className="mt-1 truncate text-xs font-black text-slate-800">{value}</p>
  </div>
);

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl border border-slate-100 bg-slate-50 px-2 py-3">
    <p className="text-[9px] font-black uppercase text-slate-400">{label}</p>
    <p className="mt-1 truncate text-sm font-black text-slate-900">{value}</p>
  </div>
);
