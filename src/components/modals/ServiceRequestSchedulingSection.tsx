import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ServiceRequestData } from '../../types';
import i18n from '../../i18n';

const DEFAULT_VISIT_DURATION_MINUTES = 120;
const MIN_VISIT_DURATION_MINUTES = 60;
const MAX_VISIT_DURATION_MINUTES = 7 * 60;

const DURATION_OPTIONS = Array.from({ length: 7 }, (_, index) => {
    const hours = index + 1;
    return {
        minutes: hours * 60,
        label: `${hours}h`,
    };
});

const TIME_PERIODS = [
    { id: 'morning', label: 'Morning', start: 5, end: 12 },
    { id: 'afternoon', label: 'Afternoon', start: 12, end: 18 },
    { id: 'evening', label: 'Evening', start: 18, end: 24 },
    { id: 'overnight', label: 'Night', start: 0, end: 5 },
] as const;

type TimePeriodId = typeof TIME_PERIODS[number]['id'];

const getTimePeriod = (value: string): TimePeriodId => {
    const hour = Number(value.split(':')[0] || 0);
    return TIME_PERIODS.find((period) => hour >= period.start && hour < period.end)?.id || 'overnight';
};

const normalizeDurationMinutes = (value: number | undefined) => {
    const numeric = Number(value || DEFAULT_VISIT_DURATION_MINUTES);
    if (!Number.isFinite(numeric)) return DEFAULT_VISIT_DURATION_MINUTES;
    return Math.max(MIN_VISIT_DURATION_MINUTES, Math.min(MAX_VISIT_DURATION_MINUTES, Math.round(numeric / 60) * 60));
};

const formatDurationLabel = (minutes: number) => {
    const hours = Math.round(minutes / 60);
    return hours === 1
        ? i18n.t('serviceRequest.scheduling.durationHoursOne', { count: hours })
        : i18n.t('serviceRequest.scheduling.durationHoursOther', { count: hours });
};

const formatTimeLabel = (value: string) => {
    const [hourRaw, minuteRaw] = value.split(':');
    const hour = Number(hourRaw);
    const minute = Number(minuteRaw || 0);
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
};

const addMinutesToTime = (value: string, minutesToAdd: number) => {
    const [hourRaw, minuteRaw] = value.split(':');
    const totalMinutes = (Number(hourRaw) * 60 + Number(minuteRaw || 0) + minutesToAdd) % (24 * 60);
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const buildTimeWindows = (durationMinutes: number) => Array.from({ length: 48 }, (_, index) => {
    const hour = Math.floor(index / 2);
    const minute = index % 2 === 0 ? 0 : 30;
    const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const endValue = addMinutesToTime(value, durationMinutes);
    return {
        value,
        label: `${formatTimeLabel(value)} - ${formatTimeLabel(endValue)}`,
    };
});

const DEFAULT_TIME_WINDOWS = buildTimeWindows(DEFAULT_VISIT_DURATION_MINUTES);

const todayKey = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const toDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const fromDateKey = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
};

const addMonths = (date: Date, months: number) => {
    const next = new Date(date);
    next.setMonth(next.getMonth() + months);
    return next;
};

const sameMonth = (left: Date, right: Date) =>
    left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();

const monthLabel = (date: Date) =>
    date.toLocaleDateString(i18n.language === 'es' ? 'es-SV' : 'en-US', { month: 'long', year: 'numeric' });

const buildCalendarDays = (visibleMonth: Date, minDate: string, maxDate: string) => {
    const firstOfMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const firstGridDate = new Date(firstOfMonth);
    firstGridDate.setDate(firstGridDate.getDate() - firstGridDate.getDay());

    return Array.from({ length: 42 }, (_, index) => {
        const date = new Date(firstGridDate);
        date.setDate(firstGridDate.getDate() + index);
        const key = toDateKey(date);

        return {
            key,
            label: String(date.getDate()),
            inCurrentMonth: sameMonth(date, visibleMonth),
            disabled: key < minDate || key > maxDate,
            isToday: key === minDate,
        };
    });
};

const getInitialSchedule = () => {
    const today = todayKey();
    const now = new Date();
    const nextWindow = DEFAULT_TIME_WINDOWS.find((item) => {
        const slot = new Date(`${today}T${item.value}:00`);
        return slot.getTime() > now.getTime() + 5 * 60_000;
    });

    if (nextWindow) {
        return { date: today, time: nextWindow.value };
    }

    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const day = String(tomorrow.getDate()).padStart(2, '0');
    return { date: `${year}-${month}-${day}`, time: DEFAULT_TIME_WINDOWS[0].value };
};

interface ServiceRequestSchedulingSectionProps {
    bookingType: ServiceRequestData['booking_type'];
    scheduledDate: string;
    scheduledTime: string;
    scheduledDurationMinutes: number;
    onChange: (patch: Partial<ServiceRequestData>) => void;
}

export const ServiceRequestSchedulingSection: React.FC<ServiceRequestSchedulingSectionProps> = ({
    bookingType,
    scheduledDate,
    scheduledTime,
    scheduledDurationMinutes,
    onChange,
}) => {
    const { t } = useTranslation();
    const isScheduled = bookingType === 'scheduled';
    const durationMinutes = normalizeDurationMinutes(scheduledDurationMinutes);
    const timeWindows = useMemo(() => buildTimeWindows(durationMinutes), [durationMinutes]);
    const minDate = todayKey();
    const maxDate = toDateKey(addMonths(fromDateKey(minDate), 3));
    const selectedDate = scheduledDate || minDate;
    const [visibleMonth, setVisibleMonth] = useState(() => fromDateKey(selectedDate));
    const [timePeriod, setTimePeriod] = useState<TimePeriodId>(() => getTimePeriod(scheduledTime || '09:00'));
    const calendarDays = useMemo(
        () => buildCalendarDays(visibleMonth, minDate, maxDate),
        [maxDate, minDate, visibleMonth]
    );
    const canGoPreviousMonth = !sameMonth(visibleMonth, fromDateKey(minDate));
    const canGoNextMonth = !sameMonth(visibleMonth, fromDateKey(maxDate));
    const availableWindows = timeWindows.map((item) => {
        const slot = new Date(`${selectedDate}T${item.value}:00`);
        const isPast = selectedDate === minDate && slot.getTime() <= Date.now() + 5 * 60_000;
        return { ...item, isPast };
    });
    const visibleWindows = availableWindows.filter((item) => !item.isPast);
    const periodWindows = visibleWindows.filter((item) => getTimePeriod(item.value) === timePeriod);

    useEffect(() => {
        if (scheduledDate) {
            setVisibleMonth(fromDateKey(scheduledDate));
        }
    }, [scheduledDate]);

    useEffect(() => {
        if (scheduledTime) setTimePeriod(getTimePeriod(scheduledTime));
    }, [scheduledTime]);

    const handleDateChange = (nextDate: string) => {
        if (nextDate < minDate || nextDate > maxDate) return;

        const firstAvailable = timeWindows.find((item) => {
            const slot = new Date(`${nextDate}T${item.value}:00`);
            return nextDate !== minDate || slot.getTime() > Date.now() + 5 * 60_000;
        });
        const currentSlot = new Date(`${nextDate}T${scheduledTime}:00`);
        const currentIsPast = nextDate === minDate && currentSlot.getTime() <= Date.now() + 5 * 60_000;

        onChange({
            scheduled_date: nextDate,
            scheduled_time: currentIsPast && firstAvailable ? firstAvailable.value : scheduledTime,
        });
    };

    const moveMonth = (direction: -1 | 1) => {
        setVisibleMonth((current) => {
            const next = new Date(current.getFullYear(), current.getMonth() + direction, 1);
            if (next < new Date(fromDateKey(minDate).getFullYear(), fromDateKey(minDate).getMonth(), 1)) {
                return current;
            }
            if (next > new Date(fromDateKey(maxDate).getFullYear(), fromDateKey(maxDate).getMonth(), 1)) {
                return current;
            }
            return next;
        });
    };

    const selectedWindow = availableWindows.find((item) => item.value === scheduledTime);

    return (
        <section className="rounded-[26px] border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t('serviceRequest.scheduling.modeLabel')}</p>
                    <h3 className="mt-1 text-lg font-black text-slate-900 dark:text-slate-100">{t('serviceRequest.scheduling.title')}</h3>
                    <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{t('serviceRequest.scheduling.subtitle')}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="rounded-full border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
                        {t('serviceRequest.scheduling.aroundTheClock')}
                    </span>
                    <span className="rounded-full border border-sky-100 dark:border-sky-900/40 bg-sky-50 dark:bg-sky-950/40 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-bird-blue">
                        {isScheduled ? t('serviceRequest.scheduling.scheduled') : t('serviceRequest.scheduling.express')}
                    </span>
                </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                    type="button"
                    onClick={() => onChange({ booking_type: 'express', scheduled_date: '', scheduled_time: '' })}
                    className={`rounded-2xl border p-4 text-left transition ${
                        !isScheduled
                            ? 'border-bird-blue bg-sky-50 dark:bg-slate-800 shadow-[0_14px_30px_rgba(0,144,255,0.12)]'
                            : 'border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-white/20'
                    }`}
                >
                    <p className="text-sm font-black text-slate-900 dark:text-slate-100">{t('serviceRequest.scheduling.expressTitle')}</p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{t('serviceRequest.scheduling.expressSubtitle')}</p>
                </button>

                <button
                    type="button"
                    onClick={() => {
                        const initial = getInitialSchedule();
                        onChange({
                            booking_type: 'scheduled',
                            scheduled_date: scheduledDate || initial.date,
                            scheduled_time: scheduledTime || initial.time,
                            scheduled_duration_minutes: durationMinutes,
                        });
                    }}
                    className={`rounded-2xl border p-4 text-left transition ${
                        isScheduled
                            ? 'border-bird-blue bg-sky-50 dark:bg-slate-800 shadow-[0_14px_30px_rgba(0,144,255,0.12)]'
                            : 'border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-white/20'
                    }`}
                >
                    <p className="text-sm font-black text-slate-900 dark:text-slate-100">{t('serviceRequest.scheduling.scheduledTitle')}</p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{t('serviceRequest.scheduling.scheduledSubtitle')}</p>
                </button>
            </div>

            {isScheduled && (
                <div className="mt-4 space-y-3">
                    <div className="overflow-hidden rounded-[22px] border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950/50">
                        <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-4 py-3">
                            <button
                                type="button"
                                onClick={() => moveMonth(-1)}
                                disabled={!canGoPreviousMonth}
                                className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 transition hover:border-bird-blue hover:text-bird-blue disabled:cursor-not-allowed disabled:opacity-35"
                                aria-label={t('serviceRequest.scheduling.previousMonth')}
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>

                            <div className="text-center">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t('serviceRequest.scheduling.date')}</p>
                                <p className="text-sm font-black capitalize text-slate-900 dark:text-slate-100">{monthLabel(visibleMonth)}</p>
                            </div>

                            <button
                                type="button"
                                onClick={() => moveMonth(1)}
                                disabled={!canGoNextMonth}
                                className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 transition hover:border-bird-blue hover:text-bird-blue disabled:cursor-not-allowed disabled:opacity-35"
                                aria-label={t('serviceRequest.scheduling.nextMonth')}
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                        </div>

                        <div className="grid grid-cols-7 gap-1 px-3 pt-3 text-center text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">
                            {(t('serviceRequest.scheduling.weekdayInitials', { returnObjects: true }) as string[]).map((day, index) => (
                                <span key={`${day}-${index}`} className="py-1">{day}</span>
                            ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1 p-3 pt-1">
                            {calendarDays.map((day) => {
                                const isSelected = day.key === selectedDate;
                                return (
                                    <button
                                        key={day.key}
                                        type="button"
                                        onClick={() => handleDateChange(day.key)}
                                        disabled={day.disabled}
                                        className={`relative aspect-square rounded-xl text-xs font-black transition ${
                                            isSelected
                                                ? 'bg-bird-blue text-white shadow-lg shadow-bird-blue/20'
                                                : day.disabled
                                                    ? 'cursor-not-allowed bg-transparent text-slate-300 dark:text-slate-600 line-through'
                                                    : day.inCurrentMonth
                                                        ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-slate-700 hover:text-bird-blue'
                                                        : 'bg-transparent text-slate-300 dark:text-slate-600 hover:bg-white/70'
                                        }`}
                                    >
                                        {day.label}
                                        {day.isToday && !isSelected && (
                                            <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-bird-blue" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="rounded-[22px] border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-3">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t('serviceRequest.scheduling.estimatedDuration')}</p>
                                <p className="mt-1 text-xs font-bold text-slate-600 dark:text-slate-400">{t('serviceRequest.scheduling.estimatedDurationSubtitle')}</p>
                            </div>
                            <span className="rounded-full bg-sky-50 dark:bg-slate-800 px-2.5 py-1 text-[10px] font-black text-bird-blue">
                                {formatDurationLabel(durationMinutes)}
                            </span>
                        </div>

                        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                            {DURATION_OPTIONS.map((option) => {
                                const isSelected = option.minutes === durationMinutes;
                                return (
                                    <button
                                        key={option.minutes}
                                        type="button"
                                        onClick={() => onChange({ scheduled_duration_minutes: option.minutes })}
                                        className={`rounded-xl border px-2 py-3 text-center transition ${
                                            isSelected
                                                ? 'border-bird-blue bg-sky-50 dark:bg-slate-800 text-bird-blue shadow-[0_10px_22px_rgba(0,144,255,0.12)]'
                                                : 'border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-bird-blue/40 hover:text-bird-blue'
                                        }`}
                                    >
                                        <span className="block text-sm font-black">{option.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="rounded-[22px] border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-3">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{t('serviceRequest.scheduling.startTime')}</p>
                                <p className="mt-1 text-xs font-bold text-slate-600 dark:text-slate-400">
                                    {selectedWindow ? selectedWindow.label : t('serviceRequest.scheduling.chooseTime')}
                                </p>
                            </div>
                            <div className="text-right">
                                <span className="block rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[10px] font-black text-slate-500 dark:text-slate-400">
                                    {formatDurationLabel(durationMinutes)}
                                </span>
                                {selectedDate === minDate && (
                                    <span className="mt-1.5 block text-[9px] font-black uppercase tracking-[0.12em] text-emerald-600 dark:text-emerald-400">
                                        {t('serviceRequest.scheduling.availableFromNow')}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="mb-3 grid grid-cols-4 gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
                            {TIME_PERIODS.map((period) => (
                                <button
                                    key={period.id}
                                    type="button"
                                    onClick={() => setTimePeriod(period.id)}
                                    className={`rounded-lg px-2 py-2 text-[10px] font-black transition ${
                                        timePeriod === period.id
                                            ? 'bg-white dark:bg-slate-700 text-slate-950 dark:text-slate-100 shadow-sm'
                                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                                    }`}
                                >
                                    {t(`serviceRequest.scheduling.periods.${period.id}`)}
                                </button>
                            ))}
                        </div>

                        <div className="grid max-h-52 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                            {periodWindows.map((item) => {
                                const isSelected = item.value === scheduledTime;
                                return (
                                    <button
                                        key={item.value}
                                        type="button"
                                        onClick={() => onChange({ scheduled_time: item.value })}
                                        className={`rounded-2xl border px-3 py-2.5 text-left text-xs font-black transition ${
                                            isSelected
                                                ? 'border-bird-blue bg-sky-50 dark:bg-slate-800 text-bird-blue shadow-[0_10px_22px_rgba(0,144,255,0.12)]'
                                                : 'border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-bird-blue/40 hover:text-bird-blue'
                                        }`}
                                    >
                                        {item.label}
                                    </button>
                                );
                            })}
                        </div>
                        {periodWindows.length === 0 && (
                            <div className="rounded-xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800/50 px-4 py-5 text-center text-xs font-bold text-slate-500 dark:text-slate-400">
                                {t('serviceRequest.scheduling.noTimes')}
                            </div>
                        )}
                    </div>

                    <div className="rounded-2xl border border-sky-100 dark:border-sky-900/40 bg-sky-50/70 dark:bg-slate-800/80 p-3">
                        <div className="flex gap-3">
                            <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-bird-blue shadow-[0_0_0_6px_rgba(0,144,255,0.12)]" />
                            <p className="text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">
                                {t('serviceRequest.scheduling.schedulingNote')}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
};
