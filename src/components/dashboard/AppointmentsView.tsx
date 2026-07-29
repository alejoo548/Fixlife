import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { API_ENDPOINTS } from '../../config/api';
import { useSSE } from '../../hooks/useSSE';
import { getAuthUser, getToken } from '../../utils/session';

interface Appointment {
  id_request: number;
  service_name: string;
  service_icon: string | null;
  description: string;
  location_text: string;
  budget: number;
  status: string;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
  counter_status?: string | null;
  client: {
    id_user: number;
    name: string;
    phone_number?: string | null;
  } | null;
}

const formatDateTime = (value: string | null) => {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not scheduled';
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const formatTime = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const statusLabel = (status: string) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'payment_pending') return 'Payment pending';
  if (normalized === 'awaiting_confirmation') return 'Client confirmation';
  if (normalized === 'in_progress') return 'In progress';
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Scheduled';
};

const statusClass = (status: string) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'paid') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (normalized === 'in_progress') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (normalized === 'payment_pending') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
};

export const AppointmentsView: React.FC = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const token = getToken('worker');

  const fetchAppointments = useCallback(async (silent = false) => {
    const authToken = getToken('worker');
    if (!authToken) {
      setLoading(false);
      return;
    }
    const user = getAuthUser('worker');
    const isVerified = user?.worker_profile?.is_verified;
    const verified = isVerified === true || isVerified === 1 || isVerified === '1' || isVerified === 'true';
    if (!verified) {
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    setError(null);

    try {
      const res = await fetch(API_ENDPOINTS.worker.appointments, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const payload = await res.json();
      if (res.status === 401) {
        setError('Worker session could not be validated. Please reopen the dashboard.');
        return;
      }
      if (!res.ok || !payload?.success) {
        setError(payload?.error || 'Could not load appointments.');
        return;
      }
      setAppointments(Array.isArray(payload.appointments) ? payload.appointments : []);
    } catch {
      setError('Network error loading appointments.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useSSE({
    token,
    enabled: Boolean(token),
    events: useMemo(
      () => ({
        request_updated: () => void fetchAppointments(true),
        notification: () => void fetchAppointments(true),
      }),
      [fetchAppointments]
    ),
  });

  useEffect(() => {
    void fetchAppointments();
  }, [fetchAppointments]);

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-bird-blue">Upcoming</p>
          <h2 className="mt-1 text-2xl font-black text-slate-900">Scheduled visits</h2>
        </div>
        <button
          type="button"
          onClick={() => void fetchAppointments()}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm transition hover:border-bird-blue hover:text-bird-blue"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-500 shadow-sm">
          Loading appointments...
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm font-bold text-red-700">
          {error}
        </div>
      ) : appointments.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-lg font-black text-slate-900">No scheduled visits yet</p>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            Future scheduled jobs will appear here after you accept them.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {appointments.map((appointment) => (
            <article
              key={appointment.id_request}
              className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-200 hover:shadow-md"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-lg font-black text-bird-blue">
                      {appointment.service_icon || appointment.service_name.charAt(0)}
                    </span>
                    <div>
                      <h3 className="text-lg font-black text-slate-900">{appointment.service_name}</h3>
                      <p className="text-xs font-bold text-slate-500">Request #{appointment.id_request}</p>
                    </div>
                  </div>

                  <p className="mt-4 text-sm font-semibold leading-6 text-slate-600 line-clamp-2">
                    {appointment.description}
                  </p>
                  <p className="mt-3 text-sm font-bold text-slate-800">{appointment.location_text}</p>
                </div>

                <div className="shrink-0 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:w-72">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Visit window</p>
                  <p className="mt-1 text-sm font-black text-slate-900">
                    {formatDateTime(appointment.scheduled_start_time)}
                  </p>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    {formatTime(appointment.scheduled_start_time)} - {formatTime(appointment.scheduled_end_time)}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${statusClass(appointment.status)}`}>
                      {statusLabel(appointment.status)}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black text-slate-600">
                      ${appointment.budget.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {appointment.client && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Client</p>
                  <p className="mt-1 text-sm font-bold text-slate-700">
                    {appointment.client.name || 'Client'}
                    {appointment.client.phone_number ? ` · ${appointment.client.phone_number}` : ''}
                  </p>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
