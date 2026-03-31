import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useWorkerRewardsDashboard, type WorkerRewardCalendarItem } from '../../hooks/useWorkerRewardsDashboard';

const formatMoney = (value: number) => `$${Number(value || 0).toFixed(2)}`;
const REWARDS_PROGRAM_START = new Date(2026, 0, 1);

const getBonusStatusBadge = (status: string) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'paid') return 'border border-emerald-200 bg-emerald-50 text-emerald-700';
  if (normalized === 'scheduled') return 'border border-amber-200 bg-amber-50 text-amber-700';
  if (normalized === 'cancelled') return 'border border-slate-200 bg-slate-100 text-slate-500';
  return 'border border-slate-200 bg-slate-50 text-slate-500';
};

const getBonusStatusLabel = (status: string) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'paid') return 'Paid';
  if (normalized === 'scheduled') return 'Scheduled';
  if (normalized === 'cancelled') return 'Cancelled';
  return 'Not eligible';
};

const buildMonthGrid = (anchor: Date) => {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const jsDay = start.getDay();
  const mondayOffset = (jsDay + 6) % 7;
  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - mondayOffset);

  return Array.from({ length: 42 }).map((_, index) => {
    const cellDate = new Date(gridStart);
    cellDate.setDate(gridStart.getDate() + index);
    return {
      date: cellDate,
      isCurrentMonth: cellDate.getMonth() === anchor.getMonth(),
      isToday: cellDate.toDateString() === new Date().toDateString(),
    };
  });
};

const ScheduleSkeleton: React.FC = () => (
  <div className="w-full h-full overflow-y-auto custom-scrollbar p-3 md:p-6 lg:p-8 pb-20 md:pb-8 flex flex-col gap-4 md:gap-6 animate-fade-in">
    <div className="h-64 rounded-3xl border border-gray-200 bg-white animate-pulse" />
    <div className="h-80 rounded-3xl border border-gray-200 bg-white animate-pulse" />
  </div>
);

export const ScheduleView: React.FC = () => {
  const { data, loading, error } = useWorkerRewardsDashboard();
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  const anchorDate = useMemo(
    () => (data?.calendar.anchor_date ? new Date(data.calendar.anchor_date) : new Date()),
    [data?.calendar.anchor_date]
  );

  const visibleMonth = useMemo(
    () => {
      const nextMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + monthOffset, 1);
      if (nextMonth < REWARDS_PROGRAM_START) return new Date(REWARDS_PROGRAM_START);
      return nextMonth;
    },
    [anchorDate, monthOffset]
  );
  const canGoPreviousMonth =
    visibleMonth.getFullYear() > REWARDS_PROGRAM_START.getFullYear() ||
    (visibleMonth.getFullYear() === REWARDS_PROGRAM_START.getFullYear() &&
      visibleMonth.getMonth() > REWARDS_PROGRAM_START.getMonth());

  const monthGrid = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);

  const calendarItemsByDate = useMemo(() => {
    const map = new Map<string, WorkerRewardCalendarItem[]>();
    (data?.calendar.items || []).forEach((item) => {
      const bucket = map.get(item.date) || [];
      bucket.push(item);
      map.set(item.date, bucket);
    });
    return map;
  }, [data?.calendar.items]);

  useEffect(() => {
    if (!data?.calendar.items?.length) {
      setSelectedDateKey((prev) => (prev === null ? prev : null));
      return;
    }

    const visibleItem = data.calendar.items.find((item) => {
      const date = new Date(item.date);
      return (
        date.getFullYear() === visibleMonth.getFullYear() &&
        date.getMonth() === visibleMonth.getMonth()
      );
    });

    const nextSelected = visibleItem?.date || data.calendar.items[0].date;
    setSelectedDateKey((prev) => (prev === nextSelected ? prev : nextSelected));
  }, [data?.calendar.items, visibleMonth]);

  const selectedItems = selectedDateKey ? calendarItemsByDate.get(selectedDateKey) || [] : [];

  if (loading && !data) return <ScheduleSkeleton />;

  if (error && !data) {
    return (
      <div className="w-full h-full overflow-y-auto custom-scrollbar p-3 md:p-6 lg:p-8 pb-20 md:pb-8">
        <div className="rounded-[28px] border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      </div>
    );
  }

  const program = data!.program;
  const summary = data!.summary;
  const progress = data!.progress;
  const history = data!.history;

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar p-3 md:p-6 lg:p-8 pb-20 md:pb-8 flex flex-col gap-4 md:gap-6 animate-fade-in">
      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-4 md:gap-6">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl border border-gray-200 p-4 md:p-6 shadow-sm overflow-hidden"
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-r from-bird-blue/10 via-bird-yellow/10 to-transparent" />
          <div className="flex items-center justify-between gap-3 mb-5">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-bird-blue">Commission calendar</p>
              <h2 className="mt-2 text-2xl md:text-3xl font-black text-slate-900">
                {visibleMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </h2>
              <p className="mt-2 text-sm font-semibold text-slate-500">
                Rewards start counting from January 2026.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => canGoPreviousMonth && setMonthOffset((prev) => prev - 1)}
                disabled={!canGoPreviousMonth}
                className="rounded-2xl border border-gray-200 bg-gray-50 p-3 text-slate-600 transition hover:border-bird-blue/30 hover:bg-bird-blue/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setMonthOffset((prev) => prev + 1)}
                className="rounded-2xl border border-gray-200 bg-gray-50 p-3 text-slate-600 transition hover:border-bird-blue/30 hover:bg-bird-blue/5"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 text-center">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <div key={day} className="pb-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                {day}
              </div>
            ))}
              {monthGrid.map((cell) => {
                const key = cell.date.toISOString().slice(0, 10);
                const cellItems = calendarItemsByDate.get(key) || [];
                const totalAmount = cellItems.reduce((sum, item) => sum + item.amount, 0);
                const isSelected = selectedDateKey === key;
                const isBlocked = cell.date < REWARDS_PROGRAM_START;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => !isBlocked && setSelectedDateKey(key)}
                    disabled={isBlocked}
                    className={`min-h-[88px] rounded-2xl border p-2 text-left transition ${
                      isBlocked
                        ? 'cursor-not-allowed border-transparent bg-slate-50/40 text-slate-300 opacity-45'
                        :
                      isSelected
                        ? 'border-bird-blue bg-bird-blue text-white shadow-lg shadow-bird-blue/15'
                        : cell.isCurrentMonth
                          ? 'border-gray-200 bg-gray-50 hover:border-bird-blue/25 hover:bg-white'
                          : 'border-transparent bg-transparent text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-black ${isSelected ? 'text-white' : cell.isCurrentMonth ? 'text-slate-900' : 'text-slate-300'}`}>
                      {cell.date.getDate()}
                    </span>
                    {cell.isToday && (
                      <span className={`h-2 w-2 rounded-full ${isSelected ? 'bg-white' : 'bg-bird-orange'}`} />
                    )}
                  </div>
                  {cellItems.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <div className={`inline-flex rounded-full px-2 py-1 text-[10px] font-black ${
                        isSelected ? 'bg-white/15 text-white' : 'bg-bird-blue/10 text-bird-blue'
                      }`}>
                        {cellItems.length} payout
                      </div>
                      <div className={`text-xs font-black ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                        {formatMoney(totalAmount)}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
          className="bg-white rounded-3xl border border-gray-200 p-4 md:p-6 shadow-sm"
        >
          <p className="text-xs font-black uppercase tracking-[0.18em] text-bird-blue">Payout snapshot</p>
          <h3 className="mt-2 text-2xl font-black text-slate-900">
            {selectedDateKey ? new Date(selectedDateKey).toLocaleDateString() : 'No payout selected'}
          </h3>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Next bonus payout</p>
              <p className="mt-2 text-2xl font-black text-slate-900">{formatMoney(summary.next_payout_amount)}</p>
              <p className="mt-2 text-sm text-slate-500">
                {summary.next_payout_date
                  ? `${summary.next_payout_label || 'Scheduled payout'} on ${new Date(summary.next_payout_date).toLocaleDateString()}`
                  : `Payouts will appear here once the worker unlocks the program.`}
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">How much is left</p>
              <div className="mt-3 space-y-2 text-sm font-semibold text-slate-600">
                <div className="flex items-center justify-between gap-3">
                  <span>To unlock commissions</span>
                  <span className="font-black text-slate-900">{progress.jobs_until_trial} job(s)</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>To unlock royalty jobs</span>
                  <span className="font-black text-slate-900">{progress.jobs_until_royalty} job(s)</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Completion rate gap</span>
                  <span className="font-black text-slate-900">{progress.completion_rate_gap}%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-bird-blue/15 bg-gradient-to-r from-bird-blue/10 via-sky-50 to-amber-50 p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-bird-blue">Demo policy</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
              We recommend paying commission bonuses every {program.payout_day_label}, after {program.trial_min_completed_jobs} completed jobs. Then add a monthly royalty when the worker closes at least {program.royalty_min_jobs} jobs with a {program.royalty_min_completion_rate}% completion rate.
            </p>
          </div>

          <div className="mt-6">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Selected day</p>
            <div className="mt-3 space-y-3">
              {selectedItems.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm font-semibold text-slate-500">
                  No payout events scheduled for this date yet.
                </div>
              ) : (
                selectedItems.map((item) => (
                  <div key={`${item.date}-${item.label}-${item.type}`} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-slate-900">{item.label}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {item.jobs_count > 0 ? `${item.jobs_count} completed job(s)` : 'Cycle performance bonus'}
                        </p>
                      </div>
                      <span className="text-lg font-black text-bird-blue">{formatMoney(item.amount)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-3xl border border-gray-200 p-4 md:p-6 shadow-sm"
      >
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Completed work history</p>
            <h3 className="mt-2 text-2xl font-black text-slate-900">Jobs already finished by this worker</h3>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-600">
            {summary.lifetime_completed_jobs} finished jobs total
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {history.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
              Completed jobs will show up here after the client confirms them.
            </div>
          ) : (
            history.map((item) => (
              <div key={item.id_request} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-lg font-black text-slate-900">{item.service_name}</p>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">
                        Completed
                      </span>
                      <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${getBonusStatusBadge(item.bonus_status)}`}>
                        {getBonusStatusLabel(item.bonus_status)}
                      </span>
                    </div>
                    <p className="mt-2 truncate text-sm text-slate-500">{item.location_text}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                      <span>{new Date(item.completed_at).toLocaleDateString()}</span>
                      {item.client_name && <span>{' / Client: ' + item.client_name}</span>}
                      <span>{' / Payout target: ' + new Date(item.scheduled_payout_date).toLocaleDateString()}</span>
                      {item.paid_at && <span>{' / Paid on: ' + new Date(item.paid_at).toLocaleDateString()}</span>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 lg:min-w-[280px]">
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Job payout</p>
                      <p className="mt-2 text-xl font-black text-slate-900">{formatMoney(item.worker_payout)}</p>
                    </div>
                    <div className="rounded-2xl border border-bird-blue/15 bg-bird-blue/10 p-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-bird-blue">Commission bonus</p>
                      <p className="mt-2 text-xl font-black text-bird-blue">{formatMoney(item.commission_bonus)}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
};
