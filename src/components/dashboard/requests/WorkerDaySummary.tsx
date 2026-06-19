import type React from 'react';
import { CalendarClock, CircleDollarSign, MapPinned, Wifi } from 'lucide-react';
import type { WorkerWorkspacePayload } from '../../../hooks/useWorkerWorkspace';

export const WorkerDaySummary = ({
  workspace,
  connected,
}: {
  workspace: WorkerWorkspacePayload | null;
  connected: boolean;
}) => {
  const summary = workspace?.summary;
  const nextStart = summary?.next_job?.scheduled_start_time
    ? new Date(summary.next_job.scheduled_start_time).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'No visit';

  return (
    <div className="border-b border-slate-200/80 bg-white px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
          Today
        </p>
        <span className={`inline-flex items-center gap-1.5 text-[10px] font-black ${
          connected ? 'text-emerald-600' : 'text-amber-600'
        }`}>
          <Wifi className="h-3.5 w-3.5" />
          {connected ? 'Live' : 'Reconnecting'}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <SummaryItem
          icon={<CircleDollarSign className="h-4 w-4" />}
          label="Estimate"
          value={`$${Number(summary?.estimated_earnings || 0).toFixed(0)}`}
        />
        <SummaryItem
          icon={<CalendarClock className="h-4 w-4" />}
          label="Pending"
          value={String(summary?.pending_jobs || 0)}
        />
        <SummaryItem
          icon={<MapPinned className="h-4 w-4" />}
          label="Travel"
          value={`${Number(summary?.total_distance_km || 0).toFixed(1)} km`}
        />
        <SummaryItem
          icon={<CalendarClock className="h-4 w-4" />}
          label="Next"
          value={nextStart}
        />
      </div>
    </div>
  );
};

const SummaryItem = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) => (
  <div className="min-w-0 rounded-xl bg-slate-50 px-2 py-2.5">
    <div className="text-bird-blue">{icon}</div>
    <p className="mt-1 truncate text-xs font-black text-slate-900">{value}</p>
    <p className="truncate text-[9px] font-bold uppercase text-slate-400">{label}</p>
  </div>
);
