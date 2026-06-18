import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Route,
  Wifi,
} from 'lucide-react';
import { useWorkerWorkspace, WorkerAgendaJob } from '../../hooks/useWorkerWorkspace';
import { getToken } from '../../utils/session';

type ViewMode = 'day' | 'week';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const DAY_HOUR_HEIGHT = 72;
const WEEK_HOUR_HEIGHT = 56;

const startOfDay = (date: Date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

const jobDateKey = (job: WorkerAgendaJob) =>
  job.scheduled_start_time ? dateKey(new Date(job.scheduled_start_time)) : null;

const statusLabel = (status: string) => {
  const value = String(status || '').toLowerCase();
  if (value === 'assigned') return 'Client approval';
  if (value === 'payment_pending') return 'Payment pending';
  if (value === 'paid') return 'Ready';
  if (value === 'in_progress') return 'Working';
  if (value === 'awaiting_confirmation') return 'Confirmation';
  if (value === 'done') return 'Completed';
  return value || 'Pending';
};

const formatHour = (hour: number) =>
  new Date(2026, 0, 1, hour).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

export const ScheduleView: React.FC = () => {
  const token = getToken('worker');
  const [mode, setMode] = useState<ViewMode>('week');
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const { connected, data, error, loading } = useWorkerWorkspace({
    token,
    enabled: !!token,
  });

  const weekDays = useMemo(() => {
    const monday = new Date(anchor);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return date;
    });
  }, [anchor]);

  const visibleDays = mode === 'day' ? [anchor] : weekDays;
  const jobsByDay = useMemo(() => {
    const map = new Map<string, WorkerAgendaJob[]>();
    (data?.agenda.jobs || []).forEach((job) => {
      const key = jobDateKey(job);
      if (!key) return;
      const jobs = map.get(key) || [];
      jobs.push(job);
      jobs.sort(
        (left, right) =>
          new Date(left.scheduled_start_time || 0).getTime() -
          new Date(right.scheduled_start_time || 0).getTime()
      );
      map.set(key, jobs);
    });
    return map;
  }, [data?.agenda.jobs]);

  const bufferMinutes = data?.agenda.buffer_minutes || 0;
  const conflicts = useMemo(() => {
    const ids = new Set<number>();
    jobsByDay.forEach((jobs) => {
      for (let index = 1; index < jobs.length; index += 1) {
        const previousEnd = new Date(jobs[index - 1].scheduled_end_time || 0).getTime();
        const nextStart = new Date(jobs[index].scheduled_start_time || 0).getTime();
        if (previousEnd + bufferMinutes * 60_000 > nextStart) {
          ids.add(jobs[index - 1].id_request);
          ids.add(jobs[index].id_request);
        }
      }
    });
    return ids;
  }, [bufferMinutes, jobsByDay]);

  const shift = (direction: number) => {
    setAnchor((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + direction * (mode === 'day' ? 1 : 7));
      return next;
    });
  };

  const rangeLabel =
    mode === 'day'
      ? anchor.toLocaleDateString([], {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        })
      : `${weekDays[0].toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
        })} - ${weekDays[6].toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
        })}`;

  return (
    <div className="h-full overflow-hidden bg-slate-50">
      <div className="flex h-full min-h-0 flex-col">
        <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 md:px-6">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-bird-blue">
                  Work calendar
                </p>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-black ${
                    connected ? 'text-emerald-600' : 'text-amber-600'
                  }`}
                >
                  <Wifi className="h-3.5 w-3.5" />
                  {connected ? 'Live' : 'Reconnecting'}
                </span>
              </div>
              <h2 className="mt-1 text-2xl font-black text-slate-950">{rangeLabel}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Each visit includes a {bufferMinutes}-minute protected travel window.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-xl bg-slate-100 p-1">
                {(['day', 'week'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMode(value)}
                    className={`rounded-lg px-4 py-2 text-xs font-black capitalize transition ${
                      mode === value
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => shift(-1)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm"
                title="Previous period"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setAnchor(startOfDay(new Date()))}
                className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 shadow-sm"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => shift(1)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm"
                title="Next period"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {error && (
            <div className="mx-auto mt-3 max-w-[1600px] rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </div>
          )}
          {conflicts.size > 0 && (
            <div className="mx-auto mt-3 flex max-w-[1600px] items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div>
                <p className="text-sm font-black text-amber-950">
                  Two visits need more travel time
                </p>
                <p className="mt-0.5 text-xs font-semibold text-amber-800">
                  They are highlighted below. New requests that overlap this protected time are blocked automatically.
                </p>
              </div>
            </div>
          )}
        </header>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-auto p-4 md:p-6">
          <div className={`mx-auto min-w-[760px] max-w-[1600px] ${mode === 'week' ? 'xl:min-w-[1180px]' : ''}`}>
            {loading && !data ? (
              <div className="h-[520px] animate-pulse rounded-2xl border border-slate-200 bg-white" />
            ) : (
              <TimelineCalendar
                days={visibleDays}
                jobsByDay={jobsByDay}
                conflicts={conflicts}
                bufferMinutes={bufferMinutes}
                mode={mode}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const TimelineCalendar = ({
  days,
  jobsByDay,
  conflicts,
  bufferMinutes,
  mode,
}: {
  days: Date[];
  jobsByDay: Map<string, WorkerAgendaJob[]>;
  conflicts: Set<number>;
  bufferMinutes: number;
  mode: ViewMode;
}) => {
  const hourHeight = mode === 'day' ? DAY_HOUR_HEIGHT : WEEK_HOUR_HEIGHT;
  const timelineHeight = hourHeight * 24;
  const todayKey = dateKey(new Date());

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div
        className="sticky top-0 z-30 grid border-b border-slate-200 bg-white"
        style={{ gridTemplateColumns: `72px repeat(${days.length}, minmax(0, 1fr))` }}
      >
        <div className="border-r border-slate-200" />
        {days.map((day) => {
          const key = dateKey(day);
          const today = key === todayKey;
          const count = jobsByDay.get(key)?.length || 0;
          return (
            <div key={key} className="border-r border-slate-200 px-3 py-3 text-center last:border-r-0">
              <p className="text-[10px] font-black uppercase text-slate-400">
                {day.toLocaleDateString([], { weekday: mode === 'day' ? 'long' : 'short' })}
              </p>
              <div className="mt-1 flex items-center justify-center gap-2">
                <span
                  className={`flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-black ${
                    today ? 'bg-bird-blue text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {day.getDate()}
                </span>
                <span className="text-[10px] font-bold text-slate-400">
                  {count} {count === 1 ? 'job' : 'jobs'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="grid"
        style={{ gridTemplateColumns: `72px repeat(${days.length}, minmax(0, 1fr))` }}
      >
        <div className="relative border-r border-slate-200" style={{ height: timelineHeight }}>
          {HOURS.map((hour) => (
            <span
              key={hour}
              className="absolute right-3 -translate-y-1/2 text-[9px] font-black text-slate-400"
              style={{ top: hour * hourHeight }}
            >
              {formatHour(hour)}
            </span>
          ))}
        </div>

        {days.map((day) => {
          const key = dateKey(day);
          const jobs = jobsByDay.get(key) || [];
          return (
            <div
              key={key}
              className="relative border-r border-slate-200 bg-white last:border-r-0"
              style={{ height: timelineHeight }}
            >
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="absolute inset-x-0 border-t border-slate-100"
                  style={{ top: hour * hourHeight }}
                />
              ))}

              {jobs.length === 0 && (
                <div className="absolute left-1/2 top-24 flex -translate-x-1/2 flex-col items-center text-slate-300">
                  <CalendarDays className="h-5 w-5" />
                  <span className="mt-1 text-[10px] font-black">Available</span>
                </div>
              )}

              {jobs.map((job) => (
                <TimelineJob
                  key={job.id_request}
                  job={job}
                  hourHeight={hourHeight}
                  bufferMinutes={bufferMinutes}
                  conflict={conflicts.has(job.id_request)}
                  compact={mode === 'week'}
                />
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
};

const TimelineJob = ({
  job,
  hourHeight,
  bufferMinutes,
  conflict,
  compact,
}: {
  job: WorkerAgendaJob;
  hourHeight: number;
  bufferMinutes: number;
  conflict: boolean;
  compact: boolean;
}) => {
  const start = new Date(job.scheduled_start_time || 0);
  const end = new Date(job.scheduled_end_time || start.getTime() + job.duration_minutes * 60_000);
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const durationMinutes = Math.max(30, (end.getTime() - start.getTime()) / 60_000);
  const top = (startMinutes / 60) * hourHeight;
  const height = Math.max(42, (durationMinutes / 60) * hourHeight - 4);
  const bufferHeight = (bufferMinutes / 60) * hourHeight;

  return (
    <>
      {bufferMinutes > 0 && (
        <div
          className="absolute inset-x-2 rounded-b-lg border-x border-b border-dashed border-slate-300 bg-slate-50/80"
          style={{ top: top + height, height: Math.max(8, bufferHeight) }}
          title={`${bufferMinutes} minutes reserved for travel`}
        >
          {!compact && bufferHeight > 20 && (
            <span className="flex items-center gap-1 px-2 pt-1 text-[9px] font-black text-slate-400">
              <Route className="h-3 w-3" />
              Travel buffer
            </span>
          )}
        </div>
      )}
      <article
        className={`absolute inset-x-1 z-10 overflow-hidden rounded-lg border px-2 py-2 shadow-sm ${
          conflict
            ? 'border-amber-400 bg-amber-50'
            : 'border-sky-200 bg-sky-50 text-slate-900'
        }`}
        style={{ top, height }}
        title={`${job.service_name} - ${job.location_text}`}
      >
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-black">{job.service_name}</p>
            <p className="mt-0.5 flex items-center gap-1 text-[9px] font-bold text-slate-500">
              <Clock3 className="h-3 w-3 shrink-0" />
              {start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              {' - '}
              {end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </p>
          </div>
          {!compact && (
            <span className="shrink-0 rounded-md bg-white/80 px-1.5 py-1 text-[8px] font-black uppercase text-slate-600">
              {statusLabel(job.status)}
            </span>
          )}
        </div>
        {height > 62 && (
          <p className="mt-2 flex items-center gap-1 truncate text-[9px] font-bold text-slate-600">
            <MapPin className="h-3 w-3 shrink-0 text-bird-blue" />
            {job.location_text}
          </p>
        )}
        {height > 84 && (
          <div className="mt-2 flex items-center justify-between border-t border-slate-200/70 pt-1.5">
            <span className="truncate text-[9px] font-bold text-slate-500">
              {job.client_name || `Request #${job.id_request}`}
            </span>
            <span className="text-[11px] font-black">${job.amount.toFixed(0)}</span>
          </div>
        )}
        {conflict && (
          <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white">
            <AlertTriangle className="h-3 w-3" />
          </span>
        )}
      </article>
    </>
  );
};
