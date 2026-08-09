import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  DollarSign,
  MapPin,
  Route,
  UserRound,
  Wifi,
} from 'lucide-react';
import { useWorkerWorkspace, WorkerAgendaJob } from '../../hooks/useWorkerWorkspace';
import { getToken } from '../../utils/session';

type ViewMode = 'day' | 'week' | 'month';
type DisplayMode = 'overview' | 'calendar';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const FULL_CALENDAR_HOUR_HEIGHT = 48;

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
  if (value === 'done') return 'Completado';
  return value || 'Pending';
};

export const ScheduleView: React.FC = () => {
  const token = getToken('worker');
  const [mode, setMode] = useState<ViewMode>('week');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('overview');
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [selectedDayKey, setSelectedDayKey] = useState(() => dateKey(new Date()));
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
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

  const monthDays = useMemo(() => {
    const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(firstOfMonth.getDate() - ((firstOfMonth.getDay() + 6) % 7));

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return date;
    });
  }, [anchor]);

  const visibleDays = mode === 'day' ? [anchor] : mode === 'month' ? monthDays : weekDays;
  const selectedDay = useMemo(() => {
    const [year, month, day] = selectedDayKey.split('-').map(Number);
    return Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
      ? new Date(year, month - 1, day)
      : new Date();
  }, [selectedDayKey]);
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
  const selectedDayJobs = jobsByDay.get(selectedDayKey) || [];
  const selectedJob =
    selectedDayJobs.find((job) => job.id_request === selectedJobId) ||
    selectedDayJobs[0] ||
    null;
  const selectedDayTotal = selectedDayJobs.reduce((total, job) => total + Number(job.amount || 0), 0);

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
      if (mode === 'month') {
        next.setMonth(next.getMonth() + direction);
      } else {
        next.setDate(next.getDate() + direction * (mode === 'day' ? 1 : 7));
      }
      if (mode === 'day') setSelectedDayKey(dateKey(next));
      return next;
    });
  };

  const rangeLabel =
    mode === 'day'
      ? anchor.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        })
      : mode === 'month'
        ? anchor.toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
          })
      : `${weekDays[0].toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        })} - ${weekDays[6].toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        })}`;

  return (
    <div className="h-full overflow-hidden bg-white text-slate-950 dark:bg-slate-950 dark:text-white">
      <div className="flex h-full min-h-0 flex-col">
        <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-slate-950 md:px-6">
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
              <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">{rangeLabel}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                Each visit includes a {bufferMinutes}-minute protected travel window.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-white/10">
                {(['overview', 'calendar'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDisplayMode(value)}
                    className={`rounded-lg px-4 py-2 text-xs font-black capitalize transition ${
                      displayMode === value
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                    }`}
                  >
                    {value === 'overview' ? 'Resumen' : 'Full calendar'}
                  </button>
                ))}
              </div>
              <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-white/10">
                {(['day', 'week', 'month'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMode(value)}
                    className={`rounded-lg px-4 py-2 text-xs font-black capitalize transition ${
                      mode === value
                        ? 'bg-bird-blue text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => shift(-1)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 shadow-sm transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                title="Previous period"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const today = startOfDay(new Date());
                  setAnchor(today);
                  setSelectedDayKey(dateKey(today));
                  setSelectedJobId(null);
                }}
                className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-4 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-white/10"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => shift(1)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 shadow-sm transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
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

        <div className="custom-scrollbar min-h-0 flex-1 overflow-auto bg-slate-50 p-4 dark:bg-slate-900 md:p-6">
          <div className="mx-auto grid max-w-[1600px] gap-4">
            {loading && !data ? (
              <div className="h-[520px] animate-pulse rounded-2xl border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-white/5" />
            ) : displayMode === 'overview' ? (
              <SchedulePlanner
                days={visibleDays}
                jobsByDay={jobsByDay}
                conflicts={conflicts}
                bufferMinutes={bufferMinutes}
                mode={mode}
                selectedDayKey={selectedDayKey}
                selectedDay={selectedDay}
                selectedDayJobs={selectedDayJobs}
                selectedJob={selectedJob}
                selectedDayTotal={selectedDayTotal}
                onSelectDay={(day) => {
                  setSelectedDayKey(dateKey(day));
                  setAnchor(startOfDay(day));
                  setSelectedJobId(null);
                }}
                onSelectJob={(job) => {
                  const key = jobDateKey(job);
                  if (key) setSelectedDayKey(key);
                  setSelectedJobId(job.id_request);
                }}
              />
            ) : (
              <FullCalendarView
                days={visibleDays}
                jobsByDay={jobsByDay}
                conflicts={conflicts}
                bufferMinutes={bufferMinutes}
                mode={mode}
                selectedDayKey={selectedDayKey}
                selectedJob={selectedJob}
                selectedDay={selectedDay}
                selectedDayJobs={selectedDayJobs}
                selectedDayTotal={selectedDayTotal}
                onSelectDay={(day) => {
                  setSelectedDayKey(dateKey(day));
                  setAnchor(startOfDay(day));
                  setSelectedJobId(null);
                }}
                onSelectJob={(job) => {
                  const key = jobDateKey(job);
                  if (key) setSelectedDayKey(key);
                  setSelectedJobId(job.id_request);
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const SchedulePlanner = ({
  days,
  jobsByDay,
  conflicts,
  bufferMinutes,
  mode,
  selectedDayKey,
  selectedDay,
  selectedDayJobs,
  selectedJob,
  selectedDayTotal,
  onSelectDay,
  onSelectJob,
}: {
  days: Date[];
  jobsByDay: Map<string, WorkerAgendaJob[]>;
  conflicts: Set<number>;
  bufferMinutes: number;
  mode: ViewMode;
  selectedDayKey: string;
  selectedDay: Date;
  selectedDayJobs: WorkerAgendaJob[];
  selectedJob: WorkerAgendaJob | null;
  selectedDayTotal: number;
  onSelectDay: (day: Date) => void;
  onSelectJob: (job: WorkerAgendaJob) => void;
}) => {
  const totalJobs = days.reduce((total, day) => total + (jobsByDay.get(dateKey(day))?.length || 0), 0);
  const totalEstimate = days.reduce(
    (total, day) => total + (jobsByDay.get(dateKey(day)) || []).reduce((sum, job) => sum + Number(job.amount || 0), 0),
    0
  );

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-200/40 dark:border-white/10 dark:bg-slate-950 dark:shadow-slate-950/30">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-bird-blue">
                {mode === 'week' ? 'Week overview' : 'Day overview'}
              </p>
              <h3 className="mt-1 text-lg font-black text-slate-950 dark:text-white">Scheduled workload</h3>
            </div>
            <span className="w-fit rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-sky-200">
              {bufferMinutes} min travel buffer
            </span>
          </div>

          <div className={`grid gap-3 ${mode === 'day' ? 'grid-cols-1' : 'sm:grid-cols-2 xl:grid-cols-7'}`}>
            {days.map((day) => {
              const key = dateKey(day);
              const jobs = jobsByDay.get(key) || [];
              const selected = key === selectedDayKey;
              const dayTotal = jobs.reduce((sum, job) => sum + Number(job.amount || 0), 0);
              const firstJob = jobs[0] || null;
              const compactMonth = mode === 'month';

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelectDay(day)}
                  className={`${compactMonth ? 'min-h-[124px]' : 'min-h-[150px]'} overflow-hidden rounded-2xl border p-4 text-left transition ${
                    selected
                      ? 'border-bird-blue bg-sky-500/15 shadow-[0_18px_42px_rgba(0,144,255,0.14)]'
                      : 'border-slate-200 bg-slate-50 hover:border-sky-400/40 hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.07]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                        {day.toLocaleDateString('en-US', { weekday: mode === 'day' ? 'long' : 'short' })}
                      </p>
                      <p className={`${compactMonth ? 'text-2xl' : 'text-3xl'} mt-1 font-black text-slate-950 dark:text-white`}>
                        {day.getDate()}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                      jobs.length ? 'bg-sky-400/15 text-sky-700 dark:text-sky-200' : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400'
                    }`}>
                      {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}
                    </span>
                  </div>

                  {firstJob ? (
                    <div className="mt-4 overflow-hidden rounded-xl bg-slate-100 p-3 dark:bg-slate-950/70">
                      <p className="truncate text-xs font-black text-slate-950 dark:text-white">{firstJob.service_name}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        <Clock3 className="h-3.5 w-3.5" />
                        {new Date(firstJob.scheduled_start_time || 0).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                      {jobs.length > 1 && (
                        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-sky-700 dark:text-sky-300">
                          +{jobs.length - 1} more
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-slate-200 p-3 text-xs font-black text-slate-400 dark:border-white/10 dark:text-slate-500">
                      <CalendarDays className="h-4 w-4" />
                      Available
                    </div>
                  )}

                  <div className={`${compactMonth ? 'mt-3' : 'mt-4'} flex items-center justify-between text-xs font-black text-slate-500 dark:text-slate-400`}>
                    <span>Estimate</span>
                    <span className="text-slate-950 dark:text-white">${dayTotal.toFixed(0)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <MetricCard label="Jobs" value={String(totalJobs)} />
          <MetricCard label="Estimate" value={`$${totalEstimate.toFixed(0)}`} />
          <MetricCard label="Selected day" value={String(selectedDayJobs.length)} />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <SelectedDayAgenda
          day={selectedDay}
          jobs={selectedDayJobs}
          selectedJob={selectedJob}
          conflicts={conflicts}
          bufferMinutes={bufferMinutes}
          total={selectedDayTotal}
          onSelectJob={onSelectJob}
        />
        <VisitDetailsCard selectedJob={selectedJob} bufferMinutes={bufferMinutes} />
      </section>
    </div>
  );
};

const formatCalendarHour = (hour: number) =>
  new Date(2026, 0, 1, hour).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

const FullCalendarView = ({
  days,
  jobsByDay,
  conflicts,
  bufferMinutes,
  mode,
  selectedDayKey,
  selectedJob,
  selectedDay,
  selectedDayJobs,
  selectedDayTotal,
  onSelectDay,
  onSelectJob,
}: {
  days: Date[];
  jobsByDay: Map<string, WorkerAgendaJob[]>;
  conflicts: Set<number>;
  bufferMinutes: number;
  mode: ViewMode;
  selectedDayKey: string;
  selectedJob: WorkerAgendaJob | null;
  selectedDay: Date;
  selectedDayJobs: WorkerAgendaJob[];
  selectedDayTotal: number;
  onSelectDay: (day: Date) => void;
  onSelectJob: (job: WorkerAgendaJob) => void;
}) => {
  if (mode === 'month') {
    return (
      <MonthCalendarView
        days={days}
        anchorMonth={days[20] || selectedDay}
        jobsByDay={jobsByDay}
        conflicts={conflicts}
        bufferMinutes={bufferMinutes}
        selectedDayKey={selectedDayKey}
        selectedJob={selectedJob}
        selectedDay={selectedDay}
        selectedDayJobs={selectedDayJobs}
        selectedDayTotal={selectedDayTotal}
        onSelectDay={onSelectDay}
        onSelectJob={onSelectJob}
      />
    );
  }

  const todayKey = dateKey(new Date());
  const columnWidth = mode === 'day' ? 720 : 168;
  const timelineHeight = HOURS.length * FULL_CALENDAR_HOUR_HEIGHT;

  return (
    <div className="grid gap-4">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl shadow-slate-200/40 dark:border-white/10 dark:bg-slate-950 dark:shadow-slate-950/30">
        <div className="border-b border-slate-200 p-4 dark:border-white/10">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-bird-blue">Full calendar</p>
              <h3 className="mt-1 text-lg font-black text-slate-950 dark:text-white">24-hour schedule</h3>
            </div>
            <span className="w-fit rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-sky-200">
              Scroll to see the whole day
            </span>
          </div>
        </div>

        <div className="custom-scrollbar overflow-x-auto">
          <div
            className="min-w-full"
            style={{ width: `${80 + days.length * columnWidth}px` }}
          >
            <div
              className="sticky top-0 z-20 grid border-b border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950"
              style={{ gridTemplateColumns: `80px repeat(${days.length}, minmax(${columnWidth}px, 1fr))` }}
            >
              <div className="border-r border-slate-200 dark:border-white/10" />
              {days.map((day) => {
                const key = dateKey(day);
                const jobs = jobsByDay.get(key) || [];
                const selected = key === selectedDayKey;
                const today = key === todayKey;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onSelectDay(day)}
                    className={`border-r border-slate-200 px-3 py-3 text-left transition last:border-r-0 dark:border-white/10 ${
                      selected ? 'bg-sky-500/15' : 'hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                      {day.toLocaleDateString('en-US', { weekday: mode === 'day' ? 'long' : 'short' })}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-black ${
                          today ? 'bg-bird-blue text-white' : 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200'
                        }`}
                      >
                        {day.getDate()}
                      </span>
                      <span className="text-xs font-black text-slate-500 dark:text-slate-400">
                        {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div
              className="grid"
              style={{ gridTemplateColumns: `80px repeat(${days.length}, minmax(${columnWidth}px, 1fr))` }}
            >
              <div className="relative border-r border-slate-200 dark:border-white/10" style={{ height: timelineHeight }}>
                {HOURS.map((hour) => (
                  <span
                    key={hour}
                    className="absolute right-3 -translate-y-1/2 text-[10px] font-black text-slate-400 dark:text-slate-500"
                    style={{ top: hour * FULL_CALENDAR_HOUR_HEIGHT }}
                  >
                    {formatCalendarHour(hour)}
                  </span>
                ))}
              </div>

              {days.map((day) => {
                const key = dateKey(day);
                const jobs = jobsByDay.get(key) || [];
                return (
                  <div
                    key={key}
                    className={`relative border-r border-slate-200 last:border-r-0 dark:border-white/10 ${
                      key === selectedDayKey ? 'bg-sky-500/[0.05]' : 'bg-white dark:bg-slate-950'
                    }`}
                    style={{ height: timelineHeight }}
                  >
                    {HOURS.map((hour) => (
                      <div
                        key={hour}
                        className="absolute inset-x-0 border-t border-slate-200 dark:border-white/10"
                        style={{ top: hour * FULL_CALENDAR_HOUR_HEIGHT }}
                      />
                    ))}

                    {jobs.length === 0 && (
                      <button
                        type="button"
                        onClick={() => onSelectDay(day)}
                        className="absolute left-1/2 top-28 flex -translate-x-1/2 flex-col items-center rounded-2xl border border-dashed border-slate-200 px-5 py-4 text-slate-400 transition hover:border-sky-400/40 hover:text-sky-600 dark:border-white/10 dark:text-slate-600 dark:hover:text-sky-200"
                      >
                        <CalendarDays className="h-5 w-5" />
                        <span className="mt-1 text-[10px] font-black">Available</span>
                      </button>
                    )}

                    {jobs.map((job) => (
                      <FullCalendarJob
                        key={job.id_request}
                        job={job}
                        bufferMinutes={bufferMinutes}
                        conflict={conflicts.has(job.id_request)}
                        selected={selectedJob?.id_request === job.id_request}
                        onSelect={() => onSelectJob(job)}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <SelectedDayAgenda
          day={selectedDay}
          jobs={selectedDayJobs}
          selectedJob={selectedJob}
          conflicts={conflicts}
          bufferMinutes={bufferMinutes}
          total={selectedDayTotal}
          onSelectJob={onSelectJob}
        />
        <VisitDetailsCard selectedJob={selectedJob} bufferMinutes={bufferMinutes} />
      </section>
    </div>
  );
};

const MonthCalendarView = ({
  days,
  anchorMonth,
  jobsByDay,
  conflicts,
  bufferMinutes,
  selectedDayKey,
  selectedJob,
  selectedDay,
  selectedDayJobs,
  selectedDayTotal,
  onSelectDay,
  onSelectJob,
}: {
  days: Date[];
  anchorMonth: Date;
  jobsByDay: Map<string, WorkerAgendaJob[]>;
  conflicts: Set<number>;
  bufferMinutes: number;
  selectedDayKey: string;
  selectedJob: WorkerAgendaJob | null;
  selectedDay: Date;
  selectedDayJobs: WorkerAgendaJob[];
  selectedDayTotal: number;
  onSelectDay: (day: Date) => void;
  onSelectJob: (job: WorkerAgendaJob) => void;
}) => {
  const todayKey = dateKey(new Date());
  const activeMonth = anchorMonth.getMonth();

  return (
    <div className="grid gap-4">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl shadow-slate-200/40 dark:border-white/10 dark:bg-slate-950 dark:shadow-slate-950/30">
        <div className="border-b border-slate-200 p-4 dark:border-white/10">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-bird-blue">Full calendar</p>
              <h3 className="mt-1 text-lg font-black text-slate-950 dark:text-white">Month schedule</h3>
            </div>
            <span className="w-fit rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-sky-700 dark:text-sky-200">
              Select any future day
            </span>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
            <div key={label} className="border-r border-slate-200 px-3 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 last:border-r-0 dark:border-white/10 dark:text-slate-400">
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = dateKey(day);
            const jobs = jobsByDay.get(key) || [];
            const firstJob = jobs[0] || null;
            const selected = key === selectedDayKey;
            const today = key === todayKey;
            const muted = day.getMonth() !== activeMonth;
            const conflict = jobs.some((job) => conflicts.has(job.id_request));

            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectDay(day)}
                className={`min-h-[138px] overflow-hidden border-r border-b border-slate-200 p-3 text-left transition last:border-r-0 dark:border-white/10 ${
                  selected
                    ? 'bg-sky-500/15 ring-1 ring-inset ring-bird-blue'
                    : muted
                      ? 'bg-slate-50 opacity-55 hover:opacity-80 dark:bg-slate-950/50'
                      : 'bg-white hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black ${
                      today ? 'bg-bird-blue text-white' : 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200'
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-black ${
                    jobs.length ? 'bg-sky-400/15 text-sky-700 dark:text-sky-200' : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-500'
                  }`}>
                    {jobs.length}
                  </span>
                </div>

                {firstJob ? (
                  <div
                    role="presentation"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectJob(firstJob);
                    }}
                    className={`mt-3 overflow-hidden rounded-xl border px-3 py-2 ${
                      conflict ? 'border-amber-400/40 bg-amber-400/10' : 'border-sky-400/30 bg-sky-500/15'
                    }`}
                  >
                    <p className="truncate text-xs font-black text-slate-950 dark:text-white">{firstJob.service_name}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                      <Clock3 className="h-3.5 w-3.5 shrink-0" />
                      {formatJobTimeRange(firstJob)}
                    </p>
                    {jobs.length > 1 && (
                      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-sky-700 dark:text-sky-300">
                        +{jobs.length - 1} more
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-dashed border-slate-200 px-3 py-2 text-center text-[10px] font-black text-slate-400 dark:border-white/10 dark:text-slate-600">
                    Available
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <SelectedDayAgenda
          day={selectedDay}
          jobs={selectedDayJobs}
          selectedJob={selectedJob}
          conflicts={conflicts}
          bufferMinutes={bufferMinutes}
          total={selectedDayTotal}
          onSelectJob={onSelectJob}
        />
        <VisitDetailsCard selectedJob={selectedJob} bufferMinutes={bufferMinutes} />
      </section>
    </div>
  );
};

const FullCalendarJob = ({
  job,
  bufferMinutes,
  conflict,
  selected,
  onSelect,
}: {
  job: WorkerAgendaJob;
  bufferMinutes: number;
  conflict: boolean;
  selected: boolean;
  onSelect: () => void;
}) => {
  const start = new Date(job.scheduled_start_time || 0);
  const end = new Date(job.scheduled_end_time || start.getTime() + job.duration_minutes * 60_000);
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const durationMinutes = Math.max(30, (end.getTime() - start.getTime()) / 60_000);
  const top = (startMinutes / 60) * FULL_CALENDAR_HOUR_HEIGHT;
  const height = Math.max(48, (durationMinutes / 60) * FULL_CALENDAR_HOUR_HEIGHT - 4);
  const bufferHeight = Math.max(8, (bufferMinutes / 60) * FULL_CALENDAR_HOUR_HEIGHT);

  return (
    <>
      {bufferMinutes > 0 && (
        <div
          className="absolute inset-x-3 rounded-b-xl border-x border-b border-dashed border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800/60"
          style={{ top: top + height, height: bufferHeight }}
          title={`${bufferMinutes} minutes reserved for travel`}
        />
      )}
      <button
        type="button"
        onClick={onSelect}
        className={`absolute inset-x-2 z-10 overflow-hidden rounded-xl border px-3 py-2 text-left shadow-sm transition hover:-translate-y-0.5 ${
          conflict
            ? 'border-amber-400 bg-amber-400/15 text-amber-900 dark:text-amber-50'
            : selected
              ? 'border-bird-blue bg-bird-blue text-white shadow-[0_18px_42px_rgba(0,144,255,0.24)]'
              : 'border-sky-400/30 bg-sky-500/15 text-slate-800 hover:border-sky-300 dark:text-slate-100'
        }`}
        style={{ top, height }}
        title={`${job.service_name} - ${formatJobTimeRange(job)} - ${job.location_text}`}
      >
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-black">{job.service_name}</p>
            <p className={`mt-1 flex items-center gap-1.5 text-[10px] font-bold ${selected ? 'text-white/80' : 'text-slate-600 dark:text-slate-400'}`}>
              <Clock3 className="h-3.5 w-3.5 shrink-0" />
              {formatJobTimeRange(job)}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase ${
            selected ? 'bg-white/15 text-white' : 'bg-slate-900/10 text-slate-700 dark:bg-white/10 dark:text-slate-300'
          }`}>
            {statusLabel(job.status)}
          </span>
        </div>
        {height > 78 && (
          <p className={`mt-2 flex min-w-0 items-center gap-1.5 truncate text-[10px] font-semibold ${selected ? 'text-white/75' : 'text-slate-600 dark:text-slate-300'}`}>
            <MapPin className="h-3.5 w-3.5 shrink-0 text-sky-300" />
            <span className="truncate">{job.location_text}</span>
          </p>
        )}
        {height > 106 && (
          <div className={`mt-2 flex items-center justify-between gap-2 border-t pt-2 ${selected ? 'border-white/15' : 'border-slate-200 dark:border-white/10'}`}>
            <span className="min-w-0 truncate text-[10px] font-bold text-white/70">
              {job.client_name || `Request #${job.id_request}`}
            </span>
            <span className="shrink-0 text-xs font-black">${job.amount.toFixed(0)}</span>
          </div>
        )}
      </button>
    </>
  );
};

const MetricCard = ({ label, value }: { label: string; value: string }) => (
  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-200/40 dark:border-white/10 dark:bg-slate-950 dark:shadow-slate-950/20">
    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">{label}</p>
    <p className="mt-2 text-3xl font-black text-slate-950 dark:text-white">{value}</p>
  </div>
);

const formatJobTimeRange = (job: WorkerAgendaJob) => {
  const start = new Date(job.scheduled_start_time || 0);
  const end = new Date(job.scheduled_end_time || start.getTime() + job.duration_minutes * 60_000);
  if (Number.isNaN(start.getTime())) return 'Time pending';
  const startLabel = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const endLabel = Number.isNaN(end.getTime())
    ? null
    : end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return endLabel ? `${startLabel} - ${endLabel}` : startLabel;
};

const SelectedDayAgenda = ({
  day,
  jobs,
  selectedJob,
  conflicts,
  bufferMinutes,
  total,
  onSelectJob,
}: {
  day: Date;
  jobs: WorkerAgendaJob[];
  selectedJob: WorkerAgendaJob | null;
  conflicts: Set<number>;
  bufferMinutes: number;
  total: number;
  onSelectJob: (job: WorkerAgendaJob) => void;
}) => (
  <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-200/40 dark:border-white/10 dark:bg-slate-950 dark:shadow-slate-950/30">
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-bird-blue">Selected day</p>
        <h3 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
          {day.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        </h3>
      </div>
      <div className="flex gap-2">
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700 dark:bg-white/10 dark:text-slate-200">
          {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700 dark:bg-white/10 dark:text-slate-200">
          ${total.toFixed(0)}
        </span>
      </div>
    </div>

    {jobs.length === 0 ? (
      <div className="grid min-h-[260px] place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center dark:border-white/10 dark:bg-white/[0.03]">
        <div>
          <CalendarDays className="mx-auto h-10 w-10 text-slate-400 dark:text-slate-600" />
          <p className="mt-3 text-sm font-black text-slate-700 dark:text-slate-300">No visits this day</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Accepted scheduled services will appear here.</p>
        </div>
      </div>
    ) : (
      <div className="space-y-3">
        {jobs.map((job, index) => {
          const selected = selectedJob?.id_request === job.id_request;
          const conflict = conflicts.has(job.id_request);
          return (
            <button
              key={job.id_request}
              type="button"
              onClick={() => onSelectJob(job)}
              className={`grid w-full gap-3 overflow-hidden rounded-2xl border p-4 text-left transition md:grid-cols-[96px_minmax(0,1fr)_auto] md:items-center ${
                selected
                  ? 'border-bird-blue bg-sky-500/15'
                  : 'border-slate-200 bg-slate-50 hover:border-sky-400/40 hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.07]'
              }`}
            >
              <div className="rounded-xl bg-slate-100 px-3 py-2 text-center dark:bg-slate-950/70">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Stop {index + 1}</p>
                <p className="mt-1 text-sm font-black text-slate-950 dark:text-white">{formatJobTimeRange(job).split(' - ')[0]}</p>
              </div>

              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <p className="min-w-0 max-w-full truncate text-base font-black text-slate-950 dark:text-white">{job.service_name}</p>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-600 dark:bg-white/10 dark:text-slate-300">
                    {statusLabel(job.status)}
                  </span>
                  {conflict && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-1 text-[10px] font-black uppercase text-amber-700 dark:text-amber-200">
                      <AlertTriangle className="h-3 w-3" />
                      Travel conflict
                    </span>
                  )}
                </div>
                <p className="mt-2 flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
                  <MapPin className="h-4 w-4 shrink-0 text-sky-300" />
                  <span className="min-w-0 truncate">{job.location_text}</span>
                </p>
                <p className="mt-1 flex items-center gap-2 text-xs font-bold text-slate-500">
                  <Route className="h-3.5 w-3.5 text-violet-300" />
                  {bufferMinutes} min protected travel window
                </p>
              </div>

              <div className="text-left md:text-right">
                <p className="text-xl font-black text-slate-950 dark:text-white">${job.amount.toFixed(0)}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">{formatJobTimeRange(job)}</p>
              </div>
            </button>
          );
        })}
      </div>
    )}
  </div>
);

const VisitDetailsCard = ({
  selectedJob,
  bufferMinutes,
}: {
  selectedJob: WorkerAgendaJob | null;
  bufferMinutes: number;
}) => (
  <aside className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-200/40 dark:border-white/10 dark:bg-slate-950 dark:shadow-slate-950/30">
    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-bird-blue">Visit details</p>
    {!selectedJob ? (
      <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center dark:border-white/10 dark:bg-white/[0.03]">
        <p className="text-sm font-black text-slate-700 dark:text-slate-300">Select a visit</p>
        <p className="mt-1 text-xs font-semibold text-slate-500">The route, client and estimate will appear here.</p>
      </div>
    ) : (
      <div className="mt-4">
        <h4 className="break-words text-xl font-black text-slate-950 [overflow-wrap:anywhere] dark:text-white">
          {selectedJob.service_name}
        </h4>
        <div className="mt-4 space-y-4 text-sm font-semibold text-slate-600 dark:text-slate-300">
          <p className="flex gap-3">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
            {formatJobTimeRange(selectedJob)}
          </p>
          <p className="flex gap-3">
            <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
            {selectedJob.client_name || `Request #${selectedJob.id_request}`}
          </p>
          <p className="flex gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">{selectedJob.location_text}</span>
          </p>
          <p className="flex gap-3">
            <DollarSign className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
            ${selectedJob.amount.toFixed(2)}
          </p>
          <p className="flex gap-3">
            <Route className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
            {bufferMinutes} min protected travel window
          </p>
        </div>
        {selectedJob.description && (
          <p className="custom-scrollbar mt-5 max-h-36 overflow-y-auto rounded-2xl bg-slate-50 p-4 text-xs font-semibold leading-5 text-slate-600 break-words [overflow-wrap:anywhere] dark:bg-white/[0.04] dark:text-slate-400">
            {selectedJob.description}
          </p>
        )}
      </div>
    )}
  </aside>
);

