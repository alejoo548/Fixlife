import React from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Banknote, CreditCard, ShieldCheck, Wallet } from 'lucide-react';
import PasswordInput from '../common/PasswordInput';

type PaymentMethod = 'card' | 'paypal' | 'cash';

type PaymentFormState = {
    fullName: string;
    email: string;
    phone: string;
    city: string;
    country: string;
    cardNumber: string;
    expiry: string;
    cvv: string;
};

type PaymentRequest = {
    id_request: number;
    service_name: string;
    description: string;
    final_budget?: number | null;
    proposed_budget?: number | null;
    budget: number;
};

interface ServiceRequestPaymentModalProps {
    paymentModalRequest: PaymentRequest;
    paymentMethod: PaymentMethod;
    paymentForm: PaymentFormState;
    paymentBusyId: number | null;
    paymentError?: string | null;
    onClose: () => void;
    onSelectMethod: (method: PaymentMethod) => void;
    onPaymentFormChange: (patch: Partial<PaymentFormState>) => void;
    onConfirmPayment: () => void;
}

const METHODS: Array<{
    id: PaymentMethod;
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    subtitle: string;
    badge: { label: string; tone: string };
    accent: string;
}> = [
    {
        id: 'card',
        icon: CreditCard,
        title: 'Tarjeta de credito o debito',
        subtitle: 'Checkout seguro dentro de Fixlife.',
        badge: { label: 'Activo', tone: 'bg-emerald-100 text-emerald-700' },
        accent: 'cyan',
    },
    {
        id: 'cash',
        icon: Banknote,
        title: 'Efectivo',
        subtitle: 'Paga directo al profesional al finalizar.',
        badge: { label: 'Activo', tone: 'bg-emerald-100 text-emerald-700' },
        accent: 'emerald',
    },
    {
        id: 'paypal',
        icon: Wallet,
        title: 'PayPal',
        subtitle: 'Disponible proximamente.',
        badge: { label: 'Pronto', tone: 'bg-amber-100 text-amber-700' },
        accent: 'blue',
    },
];

const ACCENT_RING: Record<string, string> = {
    cyan: 'border-cyan-500 bg-cyan-50/70 ring-1 ring-cyan-500/20',
    emerald: 'border-emerald-500 bg-emerald-50/70 ring-1 ring-emerald-500/20',
    blue: 'border-blue-500 bg-blue-50/70 ring-1 ring-blue-500/20',
};

const ACCENT_ICON: Record<string, string> = {
    cyan: 'bg-cyan-600 text-white',
    emerald: 'bg-emerald-600 text-white',
    blue: 'bg-[#0070ba] text-white',
};

export function ServiceRequestPaymentModal({
    paymentModalRequest,
    paymentMethod,
    paymentForm,
    paymentBusyId,
    paymentError,
    onClose,
    onSelectMethod,
    onPaymentFormChange,
    onConfirmPayment,
}: ServiceRequestPaymentModalProps) {
    const amount = Number(
        paymentModalRequest.final_budget ?? paymentModalRequest.proposed_budget ?? paymentModalRequest.budget ?? 0
    ).toFixed(2);
    const isBusy = paymentBusyId === paymentModalRequest.id_request;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[78] flex items-center justify-center overflow-y-auto bg-slate-950/40 p-3 backdrop-blur-sm sm:p-4"
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 16 }}
                transition={{ type: 'spring', damping: 24, stiffness: 220 }}
                className="my-auto w-full max-w-5xl overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-2xl"
            >
                <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
                    <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-700 p-6 text-white sm:p-8">
                        <div
                            aria-hidden
                            className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl"
                        />
                        <div className="relative flex items-center gap-3">
                            <div className="rounded-2xl bg-white/15 px-4 py-2 text-sm font-black tracking-wide">FIXLIFE PAY</div>
                            <div className="flex items-center gap-1.5 rounded-2xl bg-white/10 px-3 py-2 text-xs font-bold text-cyan-100">
                                <ShieldCheck className="h-3.5 w-3.5" />
                                Checkout seguro
                            </div>
                        </div>

                        <div className="relative mt-10">
                            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-200/80">
                                Reserva tu servicio de forma segura
                            </p>
                            <h3 className="mt-3 text-4xl font-black leading-tight sm:text-[2.6rem]">
                                Elige como pagar
                            </h3>
                            <p className="mt-2 text-lg font-medium text-slate-300">sin salir de Fixlife</p>
                        </div>

                        <div className="relative mt-10 rounded-3xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-sm">
                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-300">Solicitud actual</p>
                            <p className="mt-2 text-2xl font-black">{paymentModalRequest.service_name}</p>
                            <p className="mt-2 line-clamp-3 text-sm text-slate-300">{paymentModalRequest.description}</p>
                            <div className="mt-5 grid grid-cols-2 gap-3">
                                <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3">
                                    <p className="text-[11px] uppercase tracking-wide text-slate-300">Monto</p>
                                    <p className="mt-1 text-2xl font-black text-cyan-300">${amount}</p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3">
                                    <p className="text-[11px] uppercase tracking-wide text-slate-300">Estado</p>
                                    <p className="mt-1 text-lg font-black">Pago pendiente</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="max-h-[85vh] overflow-y-auto p-6 sm:p-8">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">Checkout</p>
                                <h3 className="mt-1 text-2xl font-black text-gray-900">Elige tu metodo de pago</h3>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-2xl border-none bg-gray-50/80 px-3 py-2 text-xs font-bold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                            >
                                Cerrar
                            </button>
                        </div>

                        <div className="mt-6 space-y-2.5">
                            {METHODS.map(({ id, icon: Icon, title, subtitle, badge, accent }) => {
                                const selected = paymentMethod === id;
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => onSelectMethod(id)}
                                        aria-pressed={selected}
                                        className={`flex w-full items-center gap-4 rounded-2xl border px-4 py-3.5 text-left transition ${
                                            selected ? ACCENT_RING[accent] : 'border-gray-200 bg-white hover:border-gray-300'
                                        }`}
                                    >
                                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${selected ? ACCENT_ICON[accent] : 'bg-gray-100 text-gray-500'}`}>
                                            <Icon className="h-5 w-5" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-black text-gray-900">{title}</span>
                                            <span className="mt-0.5 block truncate text-xs font-semibold text-gray-500">{subtitle}</span>
                                        </span>
                                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${badge.tone}`}>
                                            {badge.label}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {paymentError ? (
                            <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                                <p className="text-sm font-semibold text-red-700">{paymentError}</p>
                            </div>
                        ) : null}

                        {paymentMethod === 'paypal' ? (
                            <div className="mt-5 rounded-3xl border border-blue-200 bg-blue-50 p-6">
                                <p className="text-sm font-black text-[#003087]">PayPal proximamente</p>
                                <p className="mt-2 text-sm text-slate-600">
                                    Ya dejamos visible la opcion de PayPal en la UI, pero la integracion real todavia no esta configurada.
                                </p>
                                <button
                                    type="button"
                                    disabled
                                    className="mt-5 w-full rounded-2xl bg-[#0070ba] px-4 py-3 text-sm font-black text-white opacity-60"
                                >
                                    Paga con PayPal
                                </button>
                            </div>
                        ) : paymentMethod === 'cash' ? (
                            <div className="mt-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-6">
                                <p className="text-sm font-black text-emerald-800">Pago en efectivo</p>
                                <p className="mt-2 text-sm text-slate-600">
                                    Pagaras en efectivo directamente al profesional cuando finalice el trabajo. Fixlife reserva tu cupo pero no procesa ningun cobro; el profesional confirmara el cobro desde su panel.
                                </p>
                                <div className="mt-5 rounded-2xl border border-emerald-100 bg-white p-4">
                                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">Monto a pagar en efectivo</p>
                                    <p className="mt-2 text-3xl font-black text-gray-900">${amount}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={onConfirmPayment}
                                    disabled={isBusy}
                                    className="mt-5 w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isBusy ? 'Confirmando...' : 'Confirmar efectivo'}
                                </button>
                            </div>
                        ) : (
                            <div className="mt-5 space-y-4">
                                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">Resumen del cobro</p>
                                    <p className="mt-2 text-3xl font-black text-gray-900">${amount}</p>
                                    <p className="mt-1 text-sm text-gray-500">El cobro se asegura para este trabajo en modo demo.</p>
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <label className="text-xs font-bold text-gray-600">
                                        Nombre
                                        <input
                                            type="text"
                                            value={paymentForm.fullName}
                                            maxLength={100}
                                            onChange={(e) => onPaymentFormChange({ fullName: e.target.value })}
                                            className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:border-bird-blue focus:outline-none"
                                            placeholder="Juan Perez"
                                        />
                                    </label>
                                    <label className="text-xs font-bold text-gray-600">
                                        Correo electronico
                                        <input
                                            type="email"
                                            value={paymentForm.email}
                                            maxLength={100}
                                            onChange={(e) => onPaymentFormChange({ email: e.target.value })}
                                            className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:border-bird-blue focus:outline-none"
                                            placeholder="john@doe.com"
                                        />
                                    </label>
                                    <label className="text-xs font-bold text-gray-600">
                                        Telefono
                                        <input
                                            type="text"
                                            value={paymentForm.phone}
                                            maxLength={20}
                                            onChange={(e) => onPaymentFormChange({ phone: e.target.value.replace(/[^\d+\s]/g, '') })}
                                            className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:border-bird-blue focus:outline-none"
                                            placeholder="+503 7000 0000"
                                        />
                                    </label>
                                    <label className="text-xs font-bold text-gray-600">
                                        Ciudad
                                        <input
                                            type="text"
                                            value={paymentForm.city}
                                            maxLength={60}
                                            onChange={(e) => onPaymentFormChange({ city: e.target.value })}
                                            className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:border-bird-blue focus:outline-none"
                                            placeholder="Santa Tecla"
                                        />
                                    </label>
                                </div>

                                <label className="text-xs font-bold text-gray-600">
                                    Pais
                                    <select
                                        value={paymentForm.country}
                                        onChange={(e) => onPaymentFormChange({ country: e.target.value })}
                                        className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:border-bird-blue focus:outline-none"
                                    >
                                        <option value="Guatemala">Guatemala</option>
                                        <option value="El Salvador">El Salvador</option>
                                        <option value="Honduras">Honduras</option>
                                        <option value="Mexico">Mexico</option>
                                    </select>
                                </label>

                                <label className="text-xs font-bold text-gray-600">
                                    Tarjeta de credito o debito
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={paymentForm.cardNumber}
                                        maxLength={19}
                                        onChange={(e) => onPaymentFormChange({ cardNumber: e.target.value.replace(/[^\d\s]/g, '') })}
                                        className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:border-bird-blue focus:outline-none"
                                        placeholder="4242 4242 4242 4242"
                                    />
                                </label>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <label className="text-xs font-bold text-gray-600">
                                        MM / AA
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            value={paymentForm.expiry}
                                            maxLength={7}
                                            onChange={(e) => onPaymentFormChange({ expiry: e.target.value.replace(/[^\d/\s]/g, '') })}
                                            className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:border-bird-blue focus:outline-none"
                                            placeholder="MM / YY"
                                        />
                                    </label>
                                    <label className="text-xs font-bold text-gray-600">
                                        CVV
                                        <PasswordInput
                                            value={paymentForm.cvv}
                                            maxLength={4}
                                            onChange={(e) => onPaymentFormChange({ cvv: e.target.value.replace(/\D/g, '') })}
                                            className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:border-bird-blue focus:outline-none"
                                            placeholder="123"
                                        />
                                    </label>
                                </div>

                                <button
                                    type="button"
                                    onClick={onConfirmPayment}
                                    disabled={isBusy}
                                    className="w-full rounded-2xl bg-cyan-600 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isBusy ? 'Procesando pago...' : 'Pagar y asegurar reserva'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}
