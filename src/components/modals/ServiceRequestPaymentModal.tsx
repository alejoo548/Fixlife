import React from 'react';
import { motion } from 'framer-motion';

type PaymentMethod = 'card' | 'paypal';

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
    onClose: () => void;
    onSelectMethod: (method: PaymentMethod) => void;
    onPaymentFormChange: (patch: Partial<PaymentFormState>) => void;
    onConfirmPayment: () => void;
}

export function ServiceRequestPaymentModal({
    paymentModalRequest,
    paymentMethod,
    paymentForm,
    paymentBusyId,
    onClose,
    onSelectMethod,
    onPaymentFormChange,
    onConfirmPayment,
}: ServiceRequestPaymentModalProps) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[78] bg-slate-950/35 backdrop-blur-sm p-4 flex items-center justify-center"
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 16 }}
                transition={{ type: 'spring', damping: 24, stiffness: 220 }}
                className="w-full max-w-5xl overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-2xl"
            >
                <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
                    <div className="bg-gradient-to-br from-sky-600 via-blue-700 to-cyan-500 p-8 text-white">
                        <div className="flex items-center gap-4">
                            <div className="rounded-2xl bg-white/15 px-4 py-2 text-sm font-black tracking-wide">FIXLIFE PAY</div>
                            <div className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-bold">Checkout seguro</div>
                        </div>
                        <div className="mt-10">
                            <p className="text-lg font-medium text-blue-100">Reserva tu servicio de forma segura</p>
                            <h3 className="mt-3 text-5xl font-black leading-none">PAGOS CON TARJETA</h3>
                            <p className="mt-3 text-2xl font-semibold text-cyan-100">sin salir de Fixlife</p>
                        </div>
                        <div className="mt-10 rounded-3xl bg-white/10 p-5 backdrop-blur-sm">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-blue-100">Solicitud actual</p>
                            <p className="mt-2 text-2xl font-black">{paymentModalRequest.service_name}</p>
                            <p className="mt-2 text-sm text-blue-100 line-clamp-3">{paymentModalRequest.description}</p>
                            <div className="mt-5 grid grid-cols-2 gap-3">
                                <div className="rounded-2xl bg-white/10 px-4 py-3">
                                    <p className="text-[11px] uppercase tracking-wide text-blue-100">Monto</p>
                                    <p className="mt-1 text-2xl font-black">
                                        ${Number(paymentModalRequest.final_budget ?? paymentModalRequest.proposed_budget ?? paymentModalRequest.budget ?? 0).toFixed(2)}
                                    </p>
                                </div>
                                <div className="rounded-2xl bg-white/10 px-4 py-3">
                                    <p className="text-[11px] uppercase tracking-wide text-blue-100">Estado</p>
                                    <p className="mt-1 text-lg font-black">Pago pendiente</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-8">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-gray-400">Checkout</p>
                                <h3 className="mt-1 text-2xl font-black text-gray-900">Elige tu metodo de pago</h3>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-2xl border-none bg-gray-50/80 hover:bg-gray-100 transition-colors px-3 py-2 text-xs font-bold text-gray-500 hover:text-gray-700"
                            >
                                Cerrar
                            </button>
                        </div>

                        <div className="mt-6 grid gap-3 sm:grid-cols-2">
                            <button
                                type="button"
                                onClick={() => onSelectMethod('paypal')}
                                className={`rounded-2xl border px-4 py-4 text-left transition ${
                                    paymentMethod === 'paypal'
                                        ? 'border-blue-500 bg-blue-50 shadow-sm'
                                        : 'border-gray-200 bg-white hover:border-blue-300'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-lg font-black text-[#003087]">PayPal</p>
                                        <p className="mt-1 text-xs font-semibold text-gray-500">Visible en la UI, todavia no configurado.</p>
                                    </div>
                                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-700">
                                        Soon
                                    </span>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => onSelectMethod('card')}
                                className={`rounded-2xl border px-4 py-4 text-left transition ${
                                    paymentMethod === 'card'
                                        ? 'border-cyan-500 bg-cyan-50 shadow-sm'
                                        : 'border-gray-200 bg-white hover:border-cyan-300'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-lg font-black text-gray-900">Tarjeta de credito o debito</p>
                                        <p className="mt-1 text-xs font-semibold text-gray-500">Checkout demo listo dentro de Fixlife.</p>
                                    </div>
                                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                                        Activo
                                    </span>
                                </div>
                            </button>
                        </div>

                        {paymentMethod === 'paypal' ? (
                            <div className="mt-6 rounded-3xl border border-blue-200 bg-blue-50 p-6">
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
                        ) : (
                            <div className="mt-6 space-y-4">
                                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                    <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-gray-400">Resumen del cobro</p>
                                    <p className="mt-2 text-3xl font-black text-gray-900">
                                        ${Number(paymentModalRequest.final_budget ?? paymentModalRequest.proposed_budget ?? paymentModalRequest.budget ?? 0).toFixed(2)}
                                    </p>
                                    <p className="mt-1 text-sm text-gray-500">El cobro se asegura para este trabajo en modo demo.</p>
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <label className="text-xs font-bold text-gray-600">
                                        Nombre
                                        <input
                                            type="text"
                                            value={paymentForm.fullName}
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
                                            onChange={(e) => onPaymentFormChange({ phone: e.target.value })}
                                            className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:border-bird-blue focus:outline-none"
                                            placeholder="+503 7000 0000"
                                        />
                                    </label>
                                    <label className="text-xs font-bold text-gray-600">
                                        Ciudad
                                        <input
                                            type="text"
                                            value={paymentForm.city}
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
                                        value={paymentForm.cardNumber}
                                        onChange={(e) => onPaymentFormChange({ cardNumber: e.target.value })}
                                        className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:border-bird-blue focus:outline-none"
                                        placeholder="4242 4242 4242 4242"
                                    />
                                </label>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <label className="text-xs font-bold text-gray-600">
                                        MM / AA
                                        <input
                                            type="text"
                                            value={paymentForm.expiry}
                                            onChange={(e) => onPaymentFormChange({ expiry: e.target.value })}
                                            className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:border-bird-blue focus:outline-none"
                                            placeholder="MM / YY"
                                        />
                                    </label>
                                    <label className="text-xs font-bold text-gray-600">
                                        CVV
                                        <input
                                            type="password"
                                            value={paymentForm.cvv}
                                            onChange={(e) => onPaymentFormChange({ cvv: e.target.value })}
                                            className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:border-bird-blue focus:outline-none"
                                            placeholder="123"
                                        />
                                    </label>
                                </div>

                                <button
                                    type="button"
                                    onClick={onConfirmPayment}
                                    disabled={paymentBusyId === paymentModalRequest.id_request}
                                    className="w-full rounded-2xl bg-cyan-600 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-cyan-700 disabled:opacity-50"
                                >
                                    {paymentBusyId === paymentModalRequest.id_request ? 'Procesando pago...' : 'Pagar y asegurar reserva'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}
