import { useState } from 'react';
import {
  AlertTriangle,
  Info,
  LocateFixed,
  MapPin,
  MessageCircle,
  Route,
  X,
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

type PanelTab = 'info' | 'route';

interface WorkerCurrentJobPanelProps {
  request: WorkerRequest;
  layout?: 'overlay' | 'inline';
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
  onReport: () => void;
  onCancelJob: () => void;
  onClientNoShow: () => void;
  onClose?: () => void;
  onCenterRoute: () => void;
  onCameraModeChange: (mode: 'balanced' | 'close') => void;
  onTrafficToggle: () => void;
  onTravel: () => void;
  onArrive: () => void;
  onStart: () => void;
  onComplete: () => void;
  onFinalize: () => void;
  onConfirmCash: () => void;
}

export const WorkerCurrentJobPanel = ({
  request,
  layout = 'overlay',
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
  routeCameraMode,
  trafficEnabled,
  trafficDelayMinutes,
  busy,
  onOpenChat,
  onReport,
  onCancelJob,
  onClientNoShow,
  onClose,
  onCenterRoute,
  onCameraModeChange,
  onTrafficToggle,
  onTravel,
  onArrive,
  onStart,
  onComplete,
  onFinalize,
  onConfirmCash,
}: WorkerCurrentJobPanelProps) => {
  const overlay = layout === 'overlay';
  const [tab, setTab] = useState<PanelTab>('info');

  return (
    <section
      className={
        overlay
          ? 'absolute inset-x-3 bottom-4 z-20 flex flex-col lg:bottom-auto lg:left-auto lg:right-4 lg:top-4 lg:w-[400px]'
          : 'flex flex-col px-3 pt-3'
      }
    >
      <div
        className={`flex flex-col overflow-hidden rounded-[28px] border border-white/80 backdrop-blur-xl ${
          overlay
            ? 'max-h-[min(80vh,780px)] bg-white/95 shadow-[0_28px_70px_rgba(15,23,42,0.16)]'
            : 'bg-white shadow-[0_14px_36px_rgba(15,23,42,0.08)]'
        }`}
      >
        {/* Sticky header */}
        <header className="shrink-0 border-b border-slate-100 bg-white/95 px-5 pt-4 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-bird-blue font-black text-white shadow-[0_10px_24px_rgba(0,144,255,0.22)]">
                {getServiceIconLabel(request.service_icon, request.service_name)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-base font-black text-slate-950">{request.service_name}</h3>
                  <span className="shrink-0 text-[10px] font-black text-slate-400">#{request.id_request}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {workerRequestStatusLabel(request.request_status)}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <IconButton
                title="Chat with client"
                onClick={onOpenChat}
                disabled={!canChat}
                variant="primary"
              >
                <MessageCircle className="h-4 w-4" />
              </IconButton>
              <IconButton title="Report issue" onClick={onReport} variant="danger">
                <AlertTriangle className="h-4 w-4" />
              </IconButton>
              {onClose && (
                <IconButton title="Close" onClick={onClose} variant="ghost">
                  <X className="h-4 w-4" />
                </IconButton>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
            <TabButton active={tab === 'info'} onClick={() => setTab('info')} icon={<Info className="h-3.5 w-3.5" />}>
              Info
            </TabButton>
            <TabButton active={tab === 'route'} onClick={() => setTab('route')} icon={<Route className="h-3.5 w-3.5" />}>
              Route
            </TabButton>
          </div>
        </header>

        {/* Scrollable body */}
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {tab === 'info' ? (
            <InfoTab
              request={request}
              scheduled={scheduled}
              routeActive={routeActive}
              arrived={arrived}
            />
          ) : (
            <RouteTab
              routeLoading={routeLoading}
              routeMetrics={routeMetrics}
              routeStatus={routeStatus}
              routeError={routeError}
              routeCameraMode={routeCameraMode}
              trafficEnabled={trafficEnabled}
              trafficDelayMinutes={trafficDelayMinutes}
              routeReady={routeReady}
              onCenterRoute={onCenterRoute}
              onCameraModeChange={onCameraModeChange}
              onTrafficToggle={onTrafficToggle}
            />
          )}
        </div>

        {/* Sticky footer with primary action */}
        <footer className="shrink-0 border-t border-slate-100 bg-white/95 px-5 pb-4 pt-3">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onCancelJob}
              disabled={busy || !['assigned', 'route_in_progress', 'arrived', 'start_pending', 'payment_pending'].includes(request.request_status)}
              className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] font-black text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Cancel job
            </button>
            <button
              type="button"
              onClick={onClientNoShow}
              disabled={busy || !['arrived', 'start_pending'].includes(request.request_status) || Boolean(request.work_started_at)}
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[11px] font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Client no-show
            </button>
          </div>
          <WorkerCurrentJobAction
            status={request.request_status}
            routeActive={routeActive}
            arrived={arrived}
            canTravel={canTravel}
            routeReady={routeReady}
            busy={busy}
            scheduledStartTime={request.scheduled_start_time}
            paymentMethod={request.payment_method}
            onTravel={onTravel}
            onArrive={onArrive}
            onStart={onStart}
            onComplete={onComplete}
            onFinalize={onFinalize}
            onConfirmCash={onConfirmCash}
            approvals={request.approvals}
            workStartedAt={request.work_started_at}
            clientApproved={Boolean(request.client_approved_at)}
          />
        </footer>
      </div>
    </section>
  );
};

const InfoTab = ({
  request,
  scheduled,
  routeActive,
  arrived,
}: {
  request: WorkerRequest;
  scheduled: boolean;
  routeActive: boolean;
  arrived: boolean;
}) => (
  <div className="space-y-4">
    <div className="flex items-start gap-2 rounded-2xl bg-slate-50 px-3 py-2.5">
      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
      <p className="text-xs font-semibold leading-5 text-slate-700">
        {request.location_text || 'Location pending'}
      </p>
    </div>

    <div className="flex flex-wrap gap-2">
      <Chip tone="sky">{scheduled ? formatScheduledWindow(request) : 'Express request'}</Chip>
      <Chip tone="amber">Budget ${request.budget.toFixed(2)}</Chip>
      {request.payment_method && <Chip tone="slate">{String(request.payment_method).toUpperCase()}</Chip>}
    </div>

    <div className="grid grid-cols-2 gap-2">
      <Detail label="Client" value={request.client?.name || 'Client'} />
      <Detail
        label="Duration"
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

    {request.images && request.images.length > 0 && (
      <div>
        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
          Problem photos ({request.images.length})
        </p>
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

    <div>
      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
        Progress
      </p>
      <WorkerRequestTimeline
        status={request.request_status}
        routeActive={routeActive}
        arrived={arrived}
      />
    </div>
  </div>
);

const RouteTab = ({
  routeLoading,
  routeMetrics,
  routeStatus,
  routeError,
  routeCameraMode,
  trafficEnabled,
  trafficDelayMinutes,
  routeReady,
  onCenterRoute,
  onCameraModeChange,
  onTrafficToggle,
}: {
  routeLoading: boolean;
  routeMetrics: { durationMin: number; distanceKm: number } | null;
  routeStatus: string;
  routeError: string | null;
  routeCameraMode: 'balanced' | 'close';
  trafficEnabled: boolean;
  trafficDelayMinutes: number;
  routeReady: boolean;
  onCenterRoute: () => void;
  onCameraModeChange: (mode: 'balanced' | 'close') => void;
  onTrafficToggle: () => void;
}) => (
  <div className="space-y-4">
    <div className="grid grid-cols-3 gap-2">
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

    {routeError && (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
        {routeError}
      </div>
    )}

    <div>
      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
        Camera
      </p>
      <div className="grid grid-cols-2 gap-2">
        {(['balanced', 'close'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onCameraModeChange(mode)}
            className={`rounded-xl px-3 py-2.5 text-xs font-black transition ${
              routeCameraMode === mode
                ? 'bg-bird-blue text-white shadow-[0_8px_20px_rgba(0,144,255,0.22)]'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {mode === 'close' ? 'Close follow' : 'Balanced'}
          </button>
        ))}
      </div>
    </div>

    <button
      type="button"
      onClick={onCenterRoute}
      disabled={!routeReady}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <LocateFixed className="h-4 w-4" />
      Center map on route
    </button>

    <button
      type="button"
      onClick={onTrafficToggle}
      className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
    >
      <span>
        Traffic {trafficEnabled && trafficDelayMinutes > 0 ? `+${Math.ceil(trafficDelayMinutes)} min delay` : ''}
      </span>
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
          trafficEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
        }`}
      >
        {trafficEnabled ? 'On' : 'Off'}
      </span>
    </button>
  </div>
);

const TabButton = ({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-black transition ${
      active ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
    }`}
  >
    {icon}
    {children}
  </button>
);

const IconButton = ({
  title,
  onClick,
  disabled,
  variant,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  variant: 'primary' | 'danger' | 'ghost';
  children: React.ReactNode;
}) => {
  const tone =
    variant === 'primary'
      ? 'border-bird-blue/20 bg-bird-blue/8 text-bird-blue hover:bg-bird-blue/16'
      : variant === 'danger'
        ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
        : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50';
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-9 w-9 items-center justify-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-40 ${tone}`}
    >
      {children}
    </button>
  );
};

const Chip = ({ tone, children }: { tone: 'sky' | 'amber' | 'slate'; children: React.ReactNode }) => {
  const tones = {
    sky: 'bg-sky-50 text-sky-700',
    amber: 'bg-amber-50 text-amber-800',
    slate: 'bg-slate-100 text-slate-700',
  } as const;
  return (
    <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${tones[tone]}`}>{children}</span>
  );
};

const Detail = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl bg-slate-50 px-3 py-2.5">
    <p className="text-[9px] font-black uppercase text-slate-400">{label}</p>
    <p className="mt-1 truncate text-xs font-black text-slate-800">{value}</p>
  </div>
);

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl border border-slate-100 bg-slate-50 px-2 py-3 text-center">
    <p className="text-[9px] font-black uppercase text-slate-400">{label}</p>
    <p className="mt-1 truncate text-sm font-black text-slate-900">{value}</p>
  </div>
);
