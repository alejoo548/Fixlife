import React, { useEffect, useState } from 'react';
import { API_ENDPOINTS } from '../../config/api';
import { getToken as getSessionToken } from '../../utils/session';

type AvailabilitySlot = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
};

const DAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
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
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const token = getSessionToken('worker');
    if (!token) throw new Error('No token found. Please sign in again.');
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...options, headers });
  };

  const loadAvailability = async () => {
    try {
      setLoading(true);
      const res = await authFetch(API_ENDPOINTS.worker.availability);
      const payload = await res.json();
      if (!res.ok || !payload?.success) throw new Error(payload?.error || 'Could not load availability.');

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
      onError(error.message || 'Could not load availability.');
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
      onError('Each active day needs a valid start and end time.');
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
      if (!res.ok || !payload?.success) throw new Error(payload?.error || 'Could not save availability.');
      onSuccess('Availability saved.');
      void loadAvailability();
    } catch (error: any) {
      onError(error.message || 'Could not save availability.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-gray-200 p-5 md:p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-2xl font-bold text-gray-900">Weekly Availability</h3>
          <p className="mt-1 text-sm text-gray-600">Used to match scheduled visits with your working hours.</p>
        </div>
        <button
          type="button"
          onClick={saveAvailability}
          disabled={saving || loading}
          className="rounded-xl bg-blue-500 px-5 py-3 text-sm font-bold text-white hover:bg-blue-600 disabled:bg-gray-300"
        >
          {saving ? 'Saving...' : 'Save Availability'}
        </button>
      </div>

      <div className="mt-5 space-y-3">
        {DAYS.map((day) => {
          const slot = getSlot(day.value);
          const active = Boolean(slot);

          return (
            <div key={day.value} className="grid grid-cols-[72px_1fr] gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-3 sm:grid-cols-[84px_120px_1fr] sm:items-center">
              <label className="flex items-center gap-2 text-sm font-black text-gray-800">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(event) => setDayActive(day.value, event.target.checked)}
                  className="h-4 w-4 accent-blue-500"
                />
                {day.label}
              </label>

              <span className={`hidden rounded-full px-3 py-1 text-center text-[11px] font-black uppercase tracking-[0.12em] sm:block ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-white text-gray-400'}`}>
                {active ? 'Active' : 'Off'}
              </span>

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="time"
                  value={slot?.start_time || '08:00'}
                  disabled={!active}
                  onChange={(event) => updateSlot(day.value, { start_time: event.target.value })}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-800 disabled:bg-gray-100 disabled:text-gray-400"
                />
                <input
                  type="time"
                  value={slot?.end_time || '17:00'}
                  disabled={!active}
                  onChange={(event) => updateSlot(day.value, { end_time: event.target.value })}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-800 disabled:bg-gray-100 disabled:text-gray-400"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
