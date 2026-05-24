import React from 'react';
import type { ServiceRequestData } from '../../types';

const TIME_WINDOWS = [
    { value: '09:00', label: '9:00 AM - 11:00 AM' },
    { value: '11:00', label: '11:00 AM - 1:00 PM' },
    { value: '13:00', label: '1:00 PM - 3:00 PM' },
    { value: '15:00', label: '3:00 PM - 5:00 PM' },
    { value: '17:00', label: '5:00 PM - 7:00 PM' },
];

const todayKey = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getInitialSchedule = () => {
    const today = todayKey();
    const now = new Date();
    const nextWindow = TIME_WINDOWS.find((item) => {
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
    return { date: `${year}-${month}-${day}`, time: TIME_WINDOWS[0].value };
};

interface ServiceRequestSchedulingSectionProps {
    bookingType: ServiceRequestData['booking_type'];
    scheduledDate: string;
    scheduledTime: string;
    onChange: (patch: Partial<ServiceRequestData>) => void;
}

export const ServiceRequestSchedulingSection: React.FC<ServiceRequestSchedulingSectionProps> = ({
    bookingType,
    scheduledDate,
    scheduledTime,
    onChange,
}) => {
    const isScheduled = bookingType === 'scheduled';
    const minDate = todayKey();
    const availableWindows = TIME_WINDOWS.map((item) => {
        const slot = new Date(`${scheduledDate || minDate}T${item.value}:00`);
        const isPast = (scheduledDate || minDate) === minDate && slot.getTime() <= Date.now() + 5 * 60_000;
        return { ...item, isPast };
    });
    const handleDateChange = (nextDate: string) => {
        const firstAvailable = TIME_WINDOWS.find((item) => {
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

    return (
        <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Service mode</p>
                    <h3 className="mt-1 text-lg font-black text-slate-900">Choose when we visit</h3>
                </div>
                <span className="rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-bird-blue">
                    {isScheduled ? 'Scheduled' : 'Express'}
                </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                    type="button"
                    onClick={() => onChange({ booking_type: 'express', scheduled_date: '', scheduled_time: '' })}
                    className={`rounded-2xl border p-4 text-left transition ${
                        !isScheduled
                            ? 'border-bird-blue bg-sky-50 shadow-[0_14px_30px_rgba(0,144,255,0.12)]'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                >
                    <p className="text-sm font-black text-slate-900">Servicio Express</p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">Busca un pro disponible para atender lo antes posible.</p>
                </button>

                <button
                    type="button"
                    onClick={() => {
                        const initial = getInitialSchedule();
                        onChange({
                            booking_type: 'scheduled',
                            scheduled_date: scheduledDate || initial.date,
                            scheduled_time: scheduledTime || initial.time,
                        });
                    }}
                    className={`rounded-2xl border p-4 text-left transition ${
                        isScheduled
                            ? 'border-bird-blue bg-sky-50 shadow-[0_14px_30px_rgba(0,144,255,0.12)]'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                >
                    <p className="text-sm font-black text-slate-900">Programar Visita</p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">Reserva un dia y una ventana de hora para la visita.</p>
                </button>
            </div>

            {isScheduled && (
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                        <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Date</span>
                        <input
                            type="date"
                            min={minDate}
                            value={scheduledDate}
                            onChange={(event) => handleDateChange(event.target.value)}
                            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-bird-blue focus:ring-2 focus:ring-sky-100"
                        />
                    </label>

                    <label className="block">
                        <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Time window</span>
                        <select
                            value={scheduledTime}
                            onChange={(event) => onChange({ scheduled_time: event.target.value })}
                            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-bird-blue focus:ring-2 focus:ring-sky-100"
                        >
                            {availableWindows.map((item) => (
                                <option key={item.value} value={item.value} disabled={item.isPast}>
                                    {item.label}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            )}
        </section>
    );
};
