import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useWorkerRewardsDashboard, type WorkerRewardCalendarItem } from '../../hooks/useWorkerRewardsDashboard';
import {
  formatDate,
  formatMoney,
  getCalendarBatchSummary,
  getCalendarItemLabel,
  getCalendarItemTone,
  getNextPayoutLabel,
} from './workerRewardsUi';

const REWARDS_PROGRAM_START = new Date(2026, 0, 1);

const buildMonthGrid = (anchor: Date) => {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
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

const getDayLabel = (items: WorkerRewardCalendarItem[]) => {
  if (items.length === 0) return null;
  const distinctTypes = new Set(items.map((item) => item.type));
  if (distinctTypes.size > 1 || items.some((item) => item.type === 'combined')) return 'Mixed';
  const type = items[0].type;
  if (type === 'worker_payout') return 'Base';
  if (type === 'commission') return 'Commission';
  if (type === 'royalty') return 'Monthly';
  return 'Mixed';
};

const ScheduleSkeleton: React.FC = () => (
  <div className="flex h-full w-full flex-col gap-4 overflow-y-auto custom-scrollbar p-3 pb-20 animate-fade-in md:gap-6 md:p-6 md:pb-8 lg:p-8">
    <div className="h-64 animate-pulse rounded-3xl border border-gray-200 bg-white" />
    <div className="h-80 animate-pulse rounded-3xl border border-gray-200 bg-white" />
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

  const visibleMonth = useMemo(() => {
    const nextMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + monthOffset, 1);
    if (nextMonth < REWARDS_PROGRAM_START) return new Date(REWARDS_PROGRAM_START);
    return nextMonth;
  }, [anchorDate, monthOffset]);

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
  const selectedBreakdown = getCalendarBatchSummary(selectedItems);

  if (loading && !data) return <ScheduleSkeleton />;

  if (error && !data) {
    return (
      <div className="h-full w-full overflow-y-auto custom-scrollbar p-3 pb-20 md:p-6 md:pb-8 lg:p-8">
        <div className="rounded-[28px] border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      </div>
    );
  }

  const program = data!.program;
  const summary = data!.summary;
  const progress = data!.progress;

  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-y-auto custom-scrollbar p-3 pb-20 animate-fade-in md:gap-6 md:p-6 md:pb-8 lg:p-8">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr] md:gap-6">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl border border-gray-200 bg-white p-4 shadow-sm md:p-6"
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-r from-bird-blue/10 via-bird-yellow/10 to-transparent" />
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-bird-blue">Payment calendar</p>
              <h2 className="mt-2 text-2xl font-black text-slate-900 md:text-3xl">
                {visibleMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </h2>
              <p className="mt-2 text-sm font-semibold text-slate-500">
                Highlighted dates show money already scheduled to land in the worker payout cycle.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(['worker_payout', 'commission', 'royalty', 'combined'] as WorkerRewardCalendarItem['type'][]).map((type) => {
                const tone = getCalendarItemTone(type);
                const label = getCalendarItemLabel({ type, label: '' });
                return (
                  <span
                    key={type}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] ${tone.chip}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
                    {label}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="mb-5 flex gap-2">
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

          <div className="grid grid-cols-7 gap-1 text-center sm:gap-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <div key={day} className="pb-2 text-[9px] font-black uppercase tracking-[0.08em] text-slate-400 sm:text-[11px] sm:tracking-[0.18em]">
                {day}
              </div>
            ))}

            {monthGrid.map((cell) => {
              const key = cell.date.toISOString().slice(0, 10);
              const cellItems = calendarItemsByDate.get(key) || [];
              const totalAmount = cellItems.reduce((sum, item) => sum + item.amount, 0);
              const isSelected = selectedDateKey === key;
              const isBlocked = cell.date < REWARDS_PROGRAM_START;
              const dayLabel = getDayLabel(cellItems);
              const tone = cellItems.length ? getCalendarItemTone(cellItems[0].type) : null;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => !isBlocked && setSelectedDateKey(key)}
                  disabled={isBlocked}
                  className={`min-h-[64px] rounded-xl border p-1.5 text-left transition sm:min-h-[102px] sm:rounded-2xl sm:p-2 ${
                    isBlocked
                      ? 'cursor-not-allowed border-transparent bg-slate-50/40 text-slate-300 opacity-45'
                      : isSelected
                        ? 'border-bird-blue bg-bird-blue text-white shadow-lg shadow-bird-blue/15'
                        : cell.isCurrentMonth
                          ? 'border-gray-200 bg-gray-50 hover:border-bird-blue/25 hover:bg-white'
                          : 'border-transparent bg-transparent text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-black sm:text-sm ${
                        isSelected ? 'text-white' : cell.isCurrentMonth ? 'text-slate-900' : 'text-slate-300'
                      }`}
                    >
                      {cell.date.getDate()}
                    </span>
                    {cell.isToday && (
                      <span className={`h-2 w-2 rounded-full ${isSelected ? 'bg-white' : 'bg-bird-orange'}`} />
                    )}
                  </div>

                  {cellItems.length > 0 && tone && (
                    <div className="mt-1 space-y-1 sm:mt-3 sm:space-y-2">
                      <div
                        className={`inline-flex max-w-full truncate rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.06em] sm:px-2 sm:py-1 sm:text-[10px] sm:tracking-[0.14em] ${
                          isSelected ? 'bg-white/15 text-white' : tone.chip
                        }`}
                      >
                        {dayLabel}
                      </div>
                      <div className={`truncate text-[10px] font-black sm:text-xs ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                        {formatMoney(totalAmount)}
                      </div>
                      <div className={`hidden text-[11px] font-semibold sm:block ${isSelected ? 'text-white/80' : 'text-slate-500'}`}>
                        {cellItems.length} event{cellItems.length === 1 ? '' : 's'}
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
          className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm md:p-6"
        >
          <p className="text-xs font-black uppercase tracking-[0.18em] text-bird-blue">Selected payout day</p>
          <h3 className="mt-2 text-2xl font-black text-slate-900">
            {selectedDateKey ? formatDate(selectedDateKey, { month: 'numeric', day: 'numeric', year: 'numeric' }) : 'No payout selected'}
          </h3>

          <div className="mt-5 grid gap-3">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Next payout batch</p>
              <p className="mt-2 text-2xl font-black text-slate-900">{formatMoney(summary.next_payout_amount)}</p>
              <p className="mt-2 text-sm text-slate-500">
                {summary.next_payout_date
                  ? `${getNextPayoutLabel(summary.next_payout_label)} on ${formatDate(summary.next_payout_date)}.`
                  : 'Once work moves into a payout cycle, the next batch will show here.'}
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Selected day breakdown</p>
                <span className="text-xs font-black text-slate-500">
                  {selectedBreakdown.jobs} linked job{selectedBreakdown.jobs === 1 ? '' : 's'}
                </span>
              </div>

              <div className="mt-3 space-y-2 text-sm font-semibold text-slate-600">
                <div className="flex items-center justify-between gap-3">
                  <span>Base earnings</span>
                  <span className="font-black text-slate-900">{formatMoney(selectedBreakdown.base)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Commission bonus</span>
                  <span className="font-black text-amber-700">{formatMoney(selectedBreakdown.commission)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Monthly performance bonus</span>
                  <span className="font-black text-emerald-700">{formatMoney(selectedBreakdown.performance)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
                  <span>Total scheduled that day</span>
                  <span className="text-lg font-black text-bird-blue">{formatMoney(selectedBreakdown.total)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">What is still locked</p>
              <div className="mt-3 space-y-2 text-sm font-semibold text-slate-600">
                <div className="flex items-center justify-between gap-3">
                  <span>Commission bonus</span>
                  <span className="font-black text-slate-900">
                    {summary.trial_unlocked ? 'Unlocked' : `${progress.jobs_until_trial} job(s) left`}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Monthly performance bonus</span>
                  <span className="font-black text-slate-900">
                    {summary.royalty_unlocked ? 'Unlocked' : `${progress.jobs_until_royalty} job(s) left`}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Completion rate gap</span>
                  <span className="font-black text-slate-900">{progress.completion_rate_gap}%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-bird-blue">Payout policy</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
              Base earnings are paid in scheduled batches every {program.payout_day_label}. Commission bonuses start after {program.trial_min_completed_jobs} lifetime completed jobs, and the monthly performance bonus unlocks after {program.royalty_min_jobs} jobs with a {program.royalty_min_completion_rate}% completion rate in the same cycle.
            </p>
          </div>

          <div className="mt-6">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Selected day events</p>
            <div className="mt-3 space-y-3">
              {selectedItems.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm font-semibold text-slate-500">
                  No payout events are scheduled for this date yet.
                </div>
              ) : (
                selectedItems.map((item) => {
                  const tone = getCalendarItemTone(item.type);
                  return (
                    <div key={`${item.date}-${item.label}-${item.type}`} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${tone.chip}`}>
                            {getCalendarItemLabel(item)}
                          </span>
                          <p className="mt-3 text-sm font-semibold text-slate-600">
                            {item.jobs_count > 0 ? `${item.jobs_count} linked job(s)` : 'Performance payout event'}
                          </p>
                        </div>
                        <span className={`text-lg font-black ${tone.amount}`}>{formatMoney(item.amount)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </motion.div>
      </div>

    </div>
  );
};
