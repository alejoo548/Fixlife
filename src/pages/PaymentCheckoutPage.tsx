import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Notyf } from 'notyf';
import 'notyf/notyf.min.css';
import { API_ENDPOINTS } from '../config/api';
import { getAuthUser, getToken } from '../utils/session';

interface PaymentCheckoutPageProps {
    requestId: number | null;
    onBack: () => void;
}

interface MyServiceRequest {
    id_request: number;
    id_service: number;
    service_name: string;
    description: string;
    location_text: string;
    initial_budget?: number | null;
    budget: number;
    final_budget?: number | null;
    status: string;
    proposed_budget?: number | null;
    payment?: {
        provider: string;
        checkout_reference: string | null;
        amount: number;
        status: string;
        paid_at: string | null;
    } | null;
}

type CheckoutStage = 'form' | 'success' | 'error';
type CheckoutPaymentMethod = 'paypal' | 'wompi';

const notyf = new Notyf({ position: { x: 'left', y: 'bottom' }, ripple: true });

const getChargeAmount = (request: MyServiceRequest | null) =>
    Number(request?.final_budget ?? request?.proposed_budget ?? request?.budget ?? 0);

const getStatusCopy = (status: string) => {
    if (status === 'payment_pending') return 'Payment pending';
    if (status === 'paid') return 'Payment secured';
    if (status === 'assigned') return 'Assigned';
    if (status === 'in_progress') return 'In progress';
    if (status === 'awaiting_confirmation') return 'Waiting confirmation';
    if (status === 'done') return 'Completed';
    return 'Pending';
};

const getLocationMeta = (label: string) => {
    const parts = String(label || '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .filter((part) => part.toLowerCase() !== 'el salvador');

    return {
        primary: parts[0] || 'Service address',
        secondary: parts.slice(1, 3).join(' - ') || 'El Salvador',
        city: parts[1] || 'San Salvador',
        country: 'El Salvador',
    };
};

const readString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const renderStageIcon = (stage: CheckoutStage) => {
    if (stage === 'success') {
        return (
            <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
                <motion.div
                    initial={{ scale: 0.75, opacity: 0 }}
                    animate={{ scale: 1.18, opacity: 0.18 }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className="absolute inset-0 rounded-full bg-emerald-400"
                />
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                    className="relative flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-[0_18px_42px_rgba(16,185,129,0.2)]"
                >
                    <motion.svg
                        initial={{ scale: 0.65, rotate: -18, opacity: 0 }}
                        animate={{ scale: 1, rotate: 0, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 280, damping: 18, delay: 0.08 }}
                        className="h-10 w-10"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.4}
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </motion.svg>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
            <motion.div
                initial={{ scale: 0.75, opacity: 0 }}
                animate={{ scale: 1.15, opacity: 0.16 }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
                className="absolute inset-0 rounded-full bg-amber-300"
            />
            <motion.div
                initial={{ scale: 0.84, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 240, damping: 18 }}
                className="relative flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 text-amber-600 shadow-[0_18px_42px_rgba(245,158,11,0.2)]"
            >
                <motion.svg
                    initial={{ y: -4, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.06 }}
                    className="h-10 w-10"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.2}
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86l-7.4 12.81A1 1 0 003.75 18h16.5a1 1 0 00.86-1.33l-7.4-12.81a1 1 0 00-1.72 0z" />
                </motion.svg>
            </motion.div>
        </div>
    );
};

const PaymentCheckoutPage: React.FC<PaymentCheckoutPageProps> = ({ requestId, onBack }) => {
    const [loading, setLoading] = useState(true);
    const [request, setRequest] = useState<MyServiceRequest | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethod>('paypal');
    const [isPaying, setIsPaying] = useState(false);
    const [checkoutStage, setCheckoutStage] = useState<CheckoutStage>('form');
    const [checkoutMessage, setCheckoutMessage] = useState('');
    const [successCountdown, setSuccessCountdown] = useState(4);
    const [paymentForm, setPaymentForm] = useState({
        fullName: '',
        email: '',
        phone: '',
        city: '',
        country: 'El Salvador',
    });

    const amount = useMemo(() => getChargeAmount(request), [request]);
    const locationMeta = useMemo(() => getLocationMeta(request?.location_text || ''), [request?.location_text]);
    const serviceFee = useMemo(() => Number((amount * 0.08).toFixed(2)), [amount]);
    const subtotal = useMemo(() => Number(Math.max(amount - serviceFee, 0).toFixed(2)), [amount, serviceFee]);
    const isAlreadyPaid = useMemo(
        () =>
            Boolean(
                request &&
                    ['paid', 'assigned', 'in_progress', 'awaiting_confirmation', 'done'].includes(request.status)
            ),
        [request]
    );

    useEffect(() => {
        if (checkoutStage !== 'success') {
            setSuccessCountdown(4);
            return;
        }

        const redirectTimeout = window.setTimeout(() => {
            onBack();
        }, 3600);

        const countdownInterval = window.setInterval(() => {
            setSuccessCountdown((prev) => (prev > 1 ? prev - 1 : 1));
        }, 1000);

        return () => {
            window.clearTimeout(redirectTimeout);
            window.clearInterval(countdownInterval);
        };
    }, [checkoutStage, onBack]);

    useEffect(() => {
        const token = getToken();
        if (!token || !requestId) {
            setLoading(false);
            return;
        }

        const authUser = getAuthUser();
        const authName = readString(authUser?.name);
        const authEmail = readString(authUser?.email);

        setPaymentForm((prev) => ({
            ...prev,
            fullName: authName || prev.fullName,
            email: authEmail || prev.email,
        }));

        const fetchCheckoutRequest = async () => {
            try {
                const res = await fetch(API_ENDPOINTS.services.myRequests, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const payload = await res.json();

                if (!res.ok || !payload?.success || !Array.isArray(payload?.requests)) {
                    notyf.error(payload?.error || 'Could not load checkout request.');
                    setRequest(null);
                    return;
                }

                const matchedRequest = payload.requests.find(
                    (item: MyServiceRequest) => Number(item.id_request) === Number(requestId)
                ) as MyServiceRequest | undefined;

                if (!matchedRequest) {
                    notyf.error('That request is no longer available for checkout.');
                    setRequest(null);
                    return;
                }

                setRequest(matchedRequest);
                setPaymentForm((prev) => ({
                    ...prev,
                    city: prev.city || getLocationMeta(matchedRequest.location_text).city,
                    country: 'El Salvador',
                }));
            } catch {
                notyf.error('Network error loading checkout.');
                setRequest(null);
            } finally {
                setLoading(false);
            }
        };

        void fetchCheckoutRequest();
    }, [requestId]);

    const moveToErrorStage = (message: string) => {
        setCheckoutStage('error');
        setCheckoutMessage(message);
    };

    const handleSecurePayment = async () => {
        const token = getToken();
        if (!token || !request) {
            notyf.error('Login required.');
            moveToErrorStage('Your session expired before checkout could start.');
            return;
        }
        if (paymentMethod === 'wompi') {
            notyf.open({
                type: 'info',
                message: 'Wompi will be available soon. Please use PayPal for now.',
                background: '#1d4ed8',
            });
            return;
        }
        if (isAlreadyPaid) {
            notyf.open({
                type: 'info',
                message: 'This request already has a secured payment.',
                background: '#1d4ed8',
            });
            setCheckoutStage('success');
            setCheckoutMessage('This request already has a secured payment. Your worker can continue with the job.');
            return;
        }

        if (
            !paymentForm.fullName.trim() ||
            !paymentForm.email.trim() ||
            !paymentForm.phone.trim() ||
            !paymentForm.city.trim() ||
            !paymentForm.country.trim()
        ) {
            notyf.error('Complete your billing details first.');
            moveToErrorStage('We still need a few payment fields before we can secure this booking.');
            return;
        }

        setIsPaying(true);
        try {
            const checkoutRes = await fetch(API_ENDPOINTS.services.paymentCheckout(request.id_request), {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    payment_method: paymentMethod,
                    payer: {
                        full_name: paymentForm.fullName.trim(),
                        email: paymentForm.email.trim(),
                        phone: paymentForm.phone.trim(),
                        city: paymentForm.city.trim(),
                        country: paymentForm.country.trim(),
                    },
                }),
            });
            const checkoutPayload = await checkoutRes.json();
            if (!checkoutRes.ok || !checkoutPayload?.success) {
                const message = checkoutPayload?.error || 'Could not initialize payment.';
                notyf.error(message);
                moveToErrorStage(message);
                return;
            }

            const payRes = await fetch(API_ENDPOINTS.services.confirmPayment(request.id_request), {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    payment_method: paymentMethod,
                    paypal_order_id: `PAYPAL-SANDBOX-${Date.now()}`,
                    payer: {
                        full_name: paymentForm.fullName.trim(),
                        email: paymentForm.email.trim(),
                        phone: paymentForm.phone.trim(),
                        city: paymentForm.city.trim(),
                        country: paymentForm.country.trim(),
                    },
                }),
            });
            const payPayload = await payRes.json();
            if (!payRes.ok || !payPayload?.success) {
                const message = payPayload?.error || 'Could not confirm payment.';
                notyf.error(message);
                moveToErrorStage(message);
                return;
            }

            setRequest((prev) =>
                prev
                    ? {
                          ...prev,
                          status: 'paid',
                          payment: {
                              provider: checkoutPayload?.checkout?.provider || 'paypal',
                              checkout_reference:
                                  payPayload?.payment?.checkout_reference ||
                                  checkoutPayload?.checkout?.checkout_reference ||
                                  null,
                              amount,
                              status: 'paid',
                              paid_at: new Date().toISOString(),
                          },
                      }
                    : prev
            );

            setCheckoutStage('success');
            setCheckoutMessage('PayPal payment secured successfully. Your electronic invoice was sent to your email.');
            notyf.success('PayPal payment secured. Your pro can now start the job.');
        } catch {
            notyf.error('Network error processing payment.');
            moveToErrorStage('The connection dropped while we were processing the payment. You can retry safely.');
        } finally {
            setIsPaying(false);
        }
    };

    const stageAccentClass =
        checkoutStage === 'success'
            ? 'from-emerald-500/18 via-cyan-400/10 to-transparent'
            : 'from-amber-400/18 via-orange-400/10 to-transparent';

    const renderFinalStage = () => (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-[36px] border border-white/70 bg-white/92 p-8 text-center shadow-[0_24px_60px_rgba(15,23,42,0.12)] backdrop-blur sm:p-10"
        >
            <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${stageAccentClass}`} />
            <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-white/45 blur-3xl" />
            <div className="relative">
            {renderStageIcon(checkoutStage)}
            <p className={`mt-6 text-[11px] font-black uppercase tracking-[0.24em] ${checkoutStage === 'success' ? 'text-emerald-500' : 'text-amber-500'}`}>
                {checkoutStage === 'success' ? 'Payment complete' : 'Checkout issue'}
            </p>
            <h2 className="mt-3 text-3xl font-black text-slate-950">
                {checkoutStage === 'success' ? 'Booking secured' : 'Payment needs one more try'}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">
                {checkoutMessage}
            </p>

            <div className="mt-7 rounded-[28px] border border-slate-200 bg-slate-50 p-5 text-left">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Request recap</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                        <p className="text-sm font-black text-slate-900">{request?.service_name}</p>
                        <p className="mt-1 text-sm text-slate-500">{locationMeta.primary}</p>
                        <p className="mt-1 text-xs text-slate-400">{locationMeta.secondary}</p>
                    </div>
                    <div className="text-left sm:text-right">
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Charge</p>
                        <p className="mt-2 text-3xl font-black text-slate-950">${amount.toFixed(2)}</p>
                    </div>
                </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[24px] border border-slate-200 bg-white/85 p-4 text-left shadow-sm">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Reference</p>
                    <p className="mt-2 text-base font-black text-slate-950">
                        {request?.payment?.checkout_reference || 'Sandbox booking'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Keep this reference if you need support later.</p>
                </div>
                <div className="rounded-[24px] border border-slate-200 bg-white/85 p-4 text-left shadow-sm">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Status</p>
                    <p className="mt-2 text-base font-black text-slate-950">
                        {checkoutStage === 'success' ? 'Funds secured' : 'Retry available'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                        {checkoutStage === 'success'
                            ? 'The request can now continue into the active job flow.'
                            : 'Your booking is still safe. You can retry the payment from here.'}
                    </p>
                </div>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                {checkoutStage === 'error' && (
                    <button
                        type="button"
                        onClick={() => setCheckoutStage('form')}
                        className="rounded-2xl bg-bird-blue px-6 py-3 text-sm font-black text-slate-900 shadow-[0_16px_34px_rgba(29,78,216,0.24)] hover:bg-bird-darkBlue"
                    >
                        Try again
                    </button>
                )}
                <button
                    type="button"
                    onClick={onBack}
                    className="rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-700 hover:border-slate-300"
                >
                    Back to requests
                </button>
            </div>

            {checkoutStage === 'success' && (
                <div className="mx-auto mt-6 max-w-md">
                    <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600">
                        <span>Returning automatically</span>
                        <span>{successCountdown}s</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-100">
                        <motion.div
                            initial={{ width: '100%' }}
                            animate={{ width: '0%' }}
                            transition={{ duration: 3.6, ease: 'linear' }}
                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500"
                        />
                    </div>
                </div>
            )}
            </div>
        </motion.div>
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-sky-50 via-amber-50 to-orange-50 px-4 py-6 sm:px-6 lg:px-10">
            <div className="mx-auto max-w-[1380px]">
                <div className="mb-6 flex items-center justify-between gap-4">
                    <button
                        type="button"
                        onClick={onBack}
                        className="inline-flex items-center gap-2 rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm font-bold text-slate-700 shadow-[0_12px_32px_rgba(15,23,42,0.08)] backdrop-blur"
                    >
                        <span className="text-lg leading-none">&larr;</span>
                        Back to requests
                    </button>
                    <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-right shadow-[0_12px_32px_rgba(15,23,42,0.08)] backdrop-blur">
                        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">Checkout</p>
                        <p className="mt-1 text-sm font-bold text-slate-700">Secure payment inside Fixlife</p>
                    </div>
                </div>
                {loading ? (
                    <div className="grid gap-6 lg:grid-cols-[1.05fr_1.25fr]">
                        <div className="relative min-h-[560px] overflow-hidden rounded-[36px] bg-gradient-to-br from-[#1d4ed8] via-[#2563eb] to-[#0ea5e9] p-8 text-slate-900 shadow-[0_30px_80px_rgba(37,99,235,0.3)]">
                            <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white blur-2xl" />
                            <div className="absolute -bottom-20 -left-8 h-52 w-52 rounded-full bg-cyan-300/15 blur-3xl" />
                            <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-slate-900/95 backdrop-blur">
                                <div className="h-3.5 w-3.5 rounded-full border-2 border-white/25 border-t-white animate-spin" />
                                <span className="text-[11px] font-black uppercase tracking-[0.18em]">Preparing checkout</span>
                            </div>
                            <div className="mt-10 max-w-md">
                                <p className="text-[52px] font-black uppercase leading-[0.9] tracking-tight sm:text-[66px]">
                                    Secure
                                    <br />
                                    payment
                                </p>
                                <p className="mt-4 text-xl font-semibold text-slate-500">
                                    We are loading your booking details and payment options.
                                </p>
                            </div>
                        </div>
                        <div className="min-h-[560px] rounded-[36px] border border-gray-100 bg-white p-8 shadow-[0_24px_60px_rgba(15,23,42,0.12)] backdrop-blur">
                            <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-6">
                                <div className="inline-flex items-center gap-2 rounded-full border border-bird-blue/10 bg-bird-blue/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-900">
                                    <span className="h-2 w-2 rounded-full bg-bird-blue animate-pulse" />
                                    Loading booking summary
                                </div>
                                <div className="mt-6 grid gap-3">
                                    <div className="h-14 rounded-3xl bg-white shadow-sm" />
                                    <div className="h-14 rounded-3xl bg-white shadow-sm" />
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="h-16 rounded-3xl bg-white shadow-sm" />
                                        <div className="h-16 rounded-3xl bg-white shadow-sm" />
                                    </div>
                                    <div className="h-12 rounded-2xl bg-white shadow-sm" />
                                    <div className="h-12 rounded-2xl bg-white shadow-sm" />
                                </div>
                            </div>
                        </div>
                    </div>
                ) : !request ? (
                    <div className="rounded-[32px] border border-white/70 bg-white/85 p-10 text-center shadow-[0_24px_60px_rgba(15,23,42,0.12)] backdrop-blur">
                        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">Checkout unavailable</p>
                        <h1 className="mt-3 text-3xl font-black text-slate-900">We could not find that request</h1>
                        <p className="mt-3 text-sm text-slate-500">Go back to your request history and open checkout again from a pending payment request.</p>
                        <button
                            type="button"
                            onClick={onBack}
                            className="mt-6 inline-flex items-center justify-center rounded-2xl bg-bird-blue px-6 py-3 text-sm font-black text-slate-900 shadow-[0_16px_34px_rgba(29,78,216,0.24)] hover:bg-bird-darkBlue"
                        >
                            Return to Fixlife
                        </button>
                    </div>
                ) : (
                    <div className="grid gap-6 lg:grid-cols-[1.05fr_1.25fr]">
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="relative overflow-hidden rounded-[36px] bg-gradient-to-br from-[#1d4ed8] via-[#2563eb] to-[#0ea5e9] p-8 text-slate-900 shadow-[0_30px_80px_rgba(37,99,235,0.34)]"
                        >
                            <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white blur-2xl" />
                            <div className="absolute -bottom-20 -left-8 h-52 w-52 rounded-full bg-cyan-300/15 blur-3xl" />

                            <p className="text-[54px] font-black uppercase leading-[0.9] tracking-tight sm:text-[70px]">
                                Pay with
                                <br />
                                {paymentMethod === 'paypal' ? 'PayPal' : 'Wompi'}
                            </p>
                            <p className="mt-4 text-2xl font-semibold text-slate-500">
                                {paymentMethod === 'paypal' ? 'secure checkout inside Fixlife' : 'coming soon in Fixlife'}
                            </p>

                            <div className="mt-10 rounded-[30px] border border-white/15 bg-white p-6 backdrop-blur-md">
                                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-blue-100">Current request</p>
                                <h2 className="mt-3 text-4xl font-black">{request.service_name}</h2>
                                <p className="mt-3 line-clamp-3 text-sm text-blue-100">{request.description}</p>
                                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-[22px] bg-white/12 px-4 py-4">
                                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-100">Amount</p>
                                        <p className="mt-2 text-4xl font-black">${amount.toFixed(2)}</p>
                                    </div>
                                    <div className="rounded-[22px] bg-white/12 px-4 py-4">
                                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-100">Status</p>
                                        <p className="mt-2 text-3xl font-black leading-tight">{getStatusCopy(request.status)}</p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>

                        {checkoutStage === 'form' ? (
                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="rounded-[36px] border border-gray-100 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.12)] backdrop-blur sm:p-8"
                            >
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">Payment form</p>
                                        <h1 className="mt-2 text-3xl font-black text-slate-900">Reserve your worker</h1>
                                        <p className="mt-2 text-sm text-slate-500">{locationMeta.primary} - {locationMeta.secondary}</p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Charge summary</p>
                                        <p className="mt-2 text-4xl font-black text-slate-950">${amount.toFixed(2)}</p>
                                    </div>
                                </div>

                                <div className="mt-6 grid gap-3 md:grid-cols-2">
                                    <button
                                        type="button"
                                        onClick={() => setPaymentMethod('paypal')}
                                        className={`rounded-[26px] border px-5 py-5 text-left transition ${
                                            paymentMethod === 'paypal'
                                                ? 'border-[#0070ba] bg-[#eef7ff] shadow-[0_16px_34px_rgba(0,112,186,0.14)]'
                                                : 'border-slate-200 bg-white hover:border-[#0070ba]/40'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-2xl font-black text-[#003087]">PayPal</p>
                                                <p className="mt-1 text-xs font-semibold text-slate-500">Live payment method in Fixlife right now.</p>
                                            </div>
                                            <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
                                                Active
                                            </span>
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setPaymentMethod('wompi')}
                                        className={`rounded-[26px] border px-5 py-5 text-left transition ${
                                            paymentMethod === 'wompi'
                                                ? 'border-[#5d3fd3] bg-[#f4f1ff] shadow-[0_16px_34px_rgba(93,63,211,0.16)]'
                                                : 'border-slate-200 bg-white hover:border-[#5d3fd3]/40'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-xl font-black text-slate-900">Wompi</p>
                                                <p className="mt-1 text-xs font-semibold text-slate-500">Planned next. UI ready, activation pending.</p>
                                            </div>
                                            <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">
                                                Soon
                                            </span>
                                        </div>
                                    </button>
                                </div>

                                <div className="mt-6 grid gap-3 md:grid-cols-3">
                                    <div className="rounded-2xl border border-sky-100 bg-sky-50/90 px-4 py-4">
                                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-700">Protected</p>
                                        <p className="mt-2 text-sm font-black text-sky-950">Funds stay secured until the job is confirmed.</p>
                                    </div>
                                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/90 px-4 py-4">
                                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Tracked</p>
                                        <p className="mt-2 text-sm font-black text-emerald-950">Your worker unlocks route tracking after payment.</p>
                                    </div>
                                    <div className="rounded-2xl border border-amber-100 bg-amber-50/90 px-4 py-4">
                                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Support</p>
                                        <p className="mt-2 text-sm font-black text-amber-950">Fixlife keeps the request linked to this checkout.</p>
                                    </div>
                                </div>

                                <div className="mt-6 space-y-5">
                                    <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
                                        <div className="flex flex-wrap items-center justify-between gap-4">
                                            <div>
                                                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Payment summary</p>
                                                <p className="mt-2 text-4xl font-black text-slate-950">${amount.toFixed(2)}</p>
                                            </div>
                                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">
                                                {isAlreadyPaid ? 'Already secured' : 'Secure hold'}
                                            </div>
                                        </div>
                                        <p className="mt-3 text-sm text-slate-500">
                                            {paymentMethod === 'paypal'
                                                ? 'PayPal secures this payment now and sends your electronic invoice automatically.'
                                                : 'Wompi integration is coming next. Keep this option selected to preview the future flow.'}
                                        </p>
                                        <div className="mt-4 rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-sm">
                                            <div className="flex items-center justify-between gap-3 text-sm">
                                                <span className="font-semibold text-slate-500">Service subtotal</span>
                                                <span className="font-black text-slate-900">${subtotal.toFixed(2)}</span>
                                            </div>
                                            <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                                                <span className="font-semibold text-slate-500">Fixlife secure hold</span>
                                                <span className="font-black text-slate-900">${serviceFee.toFixed(2)}</span>
                                            </div>
                                            <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                                                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Total</span>
                                                <span className="text-2xl font-black text-slate-950">${amount.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid gap-4 md:grid-cols-2">
                                        <label className="text-xs font-bold text-slate-600">
                                            Full name
                                            <input
                                                type="text"
                                                value={paymentForm.fullName}
                                                onChange={(e) => setPaymentForm((prev) => ({ ...prev, fullName: e.target.value }))}
                                                className="mt-1.5 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-bird-blue focus:outline-none"
                                                placeholder="Claudia Lopez"
                                            />
                                        </label>
                                        <label className="text-xs font-bold text-slate-600">
                                            Email
                                            <input
                                                type="email"
                                                value={paymentForm.email}
                                                onChange={(e) => setPaymentForm((prev) => ({ ...prev, email: e.target.value }))}
                                                className="mt-1.5 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-bird-blue focus:outline-none"
                                                placeholder="claudia@email.com"
                                            />
                                        </label>
                                        <label className="text-xs font-bold text-slate-600">
                                            Phone
                                            <input
                                                type="text"
                                                value={paymentForm.phone}
                                                onChange={(e) => setPaymentForm((prev) => ({ ...prev, phone: e.target.value }))}
                                                className="mt-1.5 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-bird-blue focus:outline-none"
                                                placeholder="+503 7000 0000"
                                            />
                                        </label>
                                        <label className="text-xs font-bold text-slate-600">
                                            City
                                            <input
                                                type="text"
                                                value={paymentForm.city}
                                                onChange={(e) => setPaymentForm((prev) => ({ ...prev, city: e.target.value }))}
                                                className="mt-1.5 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-bird-blue focus:outline-none"
                                                placeholder="Santa Tecla"
                                            />
                                        </label>
                                    </div>

                                    <label className="text-xs font-bold text-slate-600">
                                        Country
                                        <select
                                            value={paymentForm.country}
                                            onChange={(e) => setPaymentForm((prev) => ({ ...prev, country: e.target.value }))}
                                            className="mt-1.5 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:border-bird-blue focus:outline-none"
                                        >
                                            <option value="El Salvador">El Salvador</option>
                                            <option value="Guatemala">Guatemala</option>
                                            <option value="Honduras">Honduras</option>
                                            <option value="Mexico">Mexico</option>
                                        </select>
                                    </label>

                                    <button
                                        type="button"
                                        onClick={() => void handleSecurePayment()}
                                        disabled={isPaying || isAlreadyPaid || paymentMethod === 'wompi'}
                                        className="w-full rounded-[24px] bg-bird-blue px-5 py-4 text-sm font-black text-slate-900 shadow-[0_18px_36px_rgba(29,78,216,0.24)] transition hover:bg-bird-darkBlue disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isAlreadyPaid
                                            ? 'Payment already secured'
                                            : isPaying
                                                ? 'Processing payment...'
                                                : paymentMethod === 'paypal'
                                                    ? 'Pay with PayPal and secure booking'
                                                    : 'Wompi coming soon'}
                                    </button>
                                </div>
                            </motion.div>
                        ) : (
                            renderFinalStage()
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PaymentCheckoutPage;
