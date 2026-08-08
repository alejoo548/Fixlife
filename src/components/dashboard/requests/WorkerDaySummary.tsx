import type React from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarClock, CircleDollarSign, MapPinned, Wifi } from 'lucide-react';
import type { WorkerWorkspacePayload } from '../../../hooks/useWorkerWorkspace';

export const WorkerDaySummary = ({
  workspace,
  connected,
}: {
  workspace: WorkerWorkspacePayload | null;
  connected: boolean;
}) => {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'es' ? 'es-SV' : 'en-US';
  const summary = workspace?.summary;
  const nextStart = summary?.next_job?.scheduled_start_time
    ? new Date(summary.next_job.scheduled_start_time).toLocaleTimeString(dateLocale, {
        hour: 'numeric',
        minute: '2-digit',
      })
    : t('workerDashboard.daySummary.noVisit');

  return (
    <div className="border-b border-slate-200/80 bg-white px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
          {t('workerDashboard.daySummary.today')}
        </p>
        <span className={`inline-flex items-center gap-1.5 text-[10px] font-black ${
          connected ? 'text-emerald-600' : 'text-amber-600'
        }`}>
          <Wifi className="h-3.5 w-3.5" />
          {connected ? t('workerDashboard.daySummary.live') : t('workerDashboard.daySummary.reconnecting')}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <SummaryItem
          icon={<CircleDollarSign className="h-4 w-4" />}
          label={t('workerDashboard.daySummary.estimate')}
          value={`$${Number(summary?.estimated_earnings || 0).toFixed(0)}`}
        />
        <SummaryItem
          icon={<CalendarClock className="h-4 w-4" />}
          label={t('workerDashboard.daySummary.pending')}
          value={String(summary?.pending_jobs || 0)}
        />
        <SummaryItem
          icon={<MapPinned className="h-4 w-4" />}
          label={t('workerDashboard.daySummary.travel')}
          value={`${Number(summary?.total_distance_km || 0).toFixed(1)} km`}
        />
        <SummaryItem
          icon={<CalendarClock className="h-4 w-4" />}
          label={t('workerDashboard.daySummary.next')}
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
