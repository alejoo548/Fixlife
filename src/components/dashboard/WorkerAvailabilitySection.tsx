import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, CheckCircle2, Clock3 } from 'lucide-react';
import { API_ENDPOINTS } from '../../config/api';
import { getToken as getSessionToken } from '../../utils/session';

type AvailabilitySlot = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
};

const DAY_KEYS: { value: number; key: string }[] = [
  { value: 1, key: 'mon' },
  { value: 2, key: 'tue' },
  { value: 3, key: 'wed' },
  { value: 4, key: 'thu' },
  { value: 5, key: 'fri' },
  { value: 6, key: 'sat' },
  { value: 0, key: 'sun' },
];

const defaultSlot = (day: number): AvailabilitySlot => ({
  day_of_week: day,
  start_time: '08:00',
  end_time: '17:00',
  is_active: true,
});

const trimTime = (value: string) => String(value || '').slice(0, 5);

interface WorkerAvailabilitySectionProps {
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

export const WorkerAvailabilitySection: React.FC<WorkerAvailabilitySectionProps> = ({
  onError,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const token = getSessionToken('worker');
    if (!token) throw new Error(t('workerDashboard.availability.noTokenFound'));
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...options, headers });
  };

  const loadAvailability = async () => {
    try {
      setLoading(true);
      const res = await authFetch(API_ENDPOINTS.worker.availability);
      const payload = await res.json();
      if (!res.ok || !payload?.success) throw new Error(payload?.error || t('workerDashboard.availability.couldNotLoadAvailability'));

      setSlots(
        Array.isArray(payload.slots)
          ? payload.slots.map((slot: AvailabilitySlot) => ({
              day_of_week: Number(slot.day_of_week),
              start_time: trimTime(slot.start_time),
              end_time: trimTime(slot.end_time),
              is_active: slot.is_active !== false,
            }))
          : []
      );
    } catch (error: any) {
      onError(error.message || t('workerDashboard.availability.couldNotLoadAvailability'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAvailability();
  }, []);

  const getSlot = (day: number) => slots.find((slot) => slot.day_of_week === day);

  const setDayActive = (day: number, active: boolean) => {
    setSlots((prev) => {
      const existing = prev.find((slot) => slot.day_of_week === day);
      if (active && !existing) return [...prev, defaultSlot(day)];
      if (!active) return prev.filter((slot) => slot.day_of_week !== day);
      return prev;
    });
  };

  const updateSlot = (day: number, patch: Partial<AvailabilitySlot>) => {
    setSlots((prev) =>
      prev.map((slot) => (slot.day_of_week === day ? { ...slot, ...patch } : slot))
    );
  };

  const saveAvailability = async () => {
    const invalid = slots.find((slot) => !slot.start_time || !slot.end_time || slot.start_time >= slot.end_time);
    if (invalid) {
      onError(t('workerDashboard.availability.eachDayNeedsValidTime'));
      return;
    }

    setSaving(true);
    try {
      const res = await authFetch(API_ENDPOINTS.worker.availability, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots }),
      });
      const payload = await res.json();
      if (!res.ok || !payload?.success) throw new Error(payload?.error || t('workerDashboard.availability.couldNotSaveAvailability'));
      onSuccess(t('workerDashboard.availability.availabilitySaved'));
      void loadAvailability();
    } catch (error: any) {
      onError(error.message || t('workerDashboard.availability.couldNotSaveAvailability'));
    } finally {
      setSaving(false);
    }
  };

  const activeCount = slots.length;

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm md:p-6 dark:bg-slate-900 dark:border-white/10">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-sky-50 text-sky-600">
            <CalendarDays className="h-6 w-6" />
          </span>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-sky-500">{t('workerDashboard.availability.scheduledJobs')}</p>
            <h3 className="mt-1 text-2xl font-black text-slate-950">{t('workerDashboard.availability.weeklyWorkingHours')}</h3>
            <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
              {t('workerDashboard.availability.hoursOnlyForScheduled')}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row xl:justify-end">
          <div className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:border-white/10">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            {t('workerDashboard.availability.activeDay', { count: activeCount })}
          </div>
          <button
            type="button"
            onClick={saveAvailability}
            disabled={saving || loading}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-600 px-5 py-3 text-sm font-black text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {saving ? t('workerDashboard.availability.saving') : t('workerDashboard.availability.saveHours')}
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-3">
        {DAY_KEYS.map((day) => {
          const slot = getSlot(day.value);
          const active = Boolean(slot);

          return (
            <div
              key={day.value}
              className={`grid gap-3 rounded-2xl border p-3 transition md:grid-cols-[160px_minmax(0,1fr)] md:items-center ${
                active
                  ? 'border-sky-100 bg-sky-50/60 shadow-[0_12px_28px_rgba(14,165,233,0.08)]'
                  : 'border-slate-200 bg-slate-50'
              }`}
            >
              <label className="flex min-w-0 items-center gap-3 text-sm font-black text-slate-900 dark:text-slate-100">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(event) => setDayActive(day.value, event.target.checked)}
                  className="h-5 w-5 shrink-0 accent-sky-600"
                />
                <span className="w-10">{t(`workerDashboard.availability.days.${day.key}`)}</span>
                <span
                  className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${
                    active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {active ? t('workerDashboard.availability.working') : t('workerDashboard.availability.off')}
                </span>
              </label>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="relative block">
                  <span className="absolute left-3 top-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                    {t('workerDashboard.availability.start')}
                  </span>
                  <Clock3 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="time"
                    value={slot?.start_time || '08:00'}
                    disabled={!active}
                    onChange={(event) => updateSlot(day.value, { start_time: event.target.value })}
                    className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-3 pb-2 pt-6 text-sm font-black text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100 disabled:bg-slate-100 disabled:text-slate-400 dark:bg-slate-900 dark:text-slate-100 dark:border-white/10"
                  />
                </label>
                <label className="relative block">
                  <span className="absolute left-3 top-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                    {t('workerDashboard.availability.end')}
                  </span>
                  <Clock3 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="time"
                    value={slot?.end_time || '17:00'}
                    disabled={!active}
                    onChange={(event) => updateSlot(day.value, { end_time: event.target.value })}
                    className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-3 pb-2 pt-6 text-sm font-black text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100 disabled:bg-slate-100 disabled:text-slate-400 dark:bg-slate-900 dark:text-slate-100 dark:border-white/10"
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
