import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { localizeClientServiceName } from '../utils/clientTranslations';
import { useLocation, useNavigate } from 'react-router-dom';
import { showSweetToast } from '../utils/sweetAlert';
import { API_ENDPOINTS, VIRTUAL_WALLET_CONFIG } from '../config/api';
import { getAuthUser, getToken } from '../utils/session';
import { loadVirtualWalletWidget } from '../utils/virtualWalletLoader';

interface PaymentCheckoutPageProps {
    requestId: number | null;
    onBack: () => void;
}

interface MyServiceRequest {
    id_request: number;
    id_service: number;
    service_name: string;
    urgency_level?: 'standard' | 'urgent' | 'emergency' | string;
    booking_type?: 'express' | 'scheduled' | string;
    scheduled_date?: string | null;
    scheduled_time?: string | null;
    scheduled_start_time?: string | null;
    scheduled_end_time?: string | null;
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
        currency_code?: string | null;
        amount: number;
        platform_fee?: number | null;
        worker_payout?: number | null;
        commission_rate?: number | null;
        commission_snapshot?: {
            commission_rate?: number | null;
            policy_label?: string | null;
            applied_rules?: Array<{
                id_rule: number;
                name: string;
                rule_type: string;
                id_service: number | null;
                adjustment_mode: string;
                rate_percent: number;
                priority: number;
                service_name?: string | null;
            }>;
        } | null;
        status: string;
        paid_at: string | null;
    } | null;
}

type CheckoutStage = 'form' | 'success' | 'error' | 'pending';
type CheckoutPaymentMethod = 'paypal' | 'wompi' | 'cash' | 'virtual_wallet';

const notyf = {
  success: (message: string) => void showSweetToast({ tone: 'success', message }),
  error: (message: string) => void showSweetToast({ tone: 'error', message }),
  open: ({ type, message }: { type?: string; message: string; background?: string }) =>
    void showSweetToast({ tone: (type as 'info' | 'success' | 'error' | 'warning') || 'info', message }),
};
const DEFAULT_PLATFORM_PROTECTION_RATE = 0.12;

const getChargeAmount = (request: MyServiceRequest | null) =>
    Number(request?.final_budget ?? request?.proposed_budget ?? request?.budget ?? 0);

const getStatusCopy = (status: string, t: (key: string, opts?: any) => string) => {
    if (status === 'payment_pending') return t('paymentCheckout.status.paymentPending');
    if (status === 'paid') return t('paymentCheckout.status.paid');
    if (status === 'assigned') return t('paymentCheckout.status.assigned');
    if (status === 'in_progress') return t('paymentCheckout.status.inProgress');
    if (status === 'awaiting_confirmation') return t('paymentCheckout.status.awaitingConfirmation');
    if (status === 'done') return t('paymentCheckout.status.done');
    return t('paymentCheckout.status.pendingFallback');
};

const getLocationMeta = (label: string, t: (key: string, opts?: any) => string) => {
    const parts = String(label || '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .filter((part) => part.toLowerCase() !== 'el salvador');

    return {
        primary: parts[0] || t('paymentCheckout.location.serviceAddress'),
        secondary: parts.slice(1, 3).join(' - ') || t('paymentCheckout.location.elSalvador'),
        city: parts[1] || t('paymentCheckout.location.sanSalvador'),
        country: t('paymentCheckout.location.elSalvador'),
    };
};

const isScheduledRequest = (request: MyServiceRequest | null) =>
    String(request?.booking_type || 'express').toLowerCase() === 'scheduled';

const formatScheduledWindow = (request: MyServiceRequest | null) => {
    if (!request) return '';
    const startValue = request.scheduled_start_time || (
        request.scheduled_date && request.scheduled_time
            ? `${request.scheduled_date}T${request.scheduled_time}`
            : ''
    );
    if (!startValue) return '';

    const start = new Date(startValue);
    const end = request.scheduled_end_time ? new Date(request.scheduled_end_time) : null;
    if (Number.isNaN(start.getTime())) return '';

    const dateLabel = start.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    });
    const startLabel = start.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
    });
    const endLabel = end && !Number.isNaN(end.getTime())
        ? end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : '';

    return endLabel ? `${dateLabel}, ${startLabel} - ${endLabel}` : `${dateLabel}, ${startLabel}`;
};

const readString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const isAllowedPaymentRedirect = (value: string) => {
    try {
        const url = new URL(value);
        const hostname = url.hostname.toLowerCase();
        if (url.protocol !== 'https:') return false;
        if (hostname === 'paypal.com' || hostname === 'www.paypal.com' || hostname.endsWith('.paypal.com')) return true;
        if (hostname === 'wompi.sv' || hostname.endsWith('.wompi.sv')) return true;
        return false;
    } catch {
        return false;
    }
};

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

    if (stage === 'pending') {
        return (
            <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
                <motion.div
                    initial={{ scale: 0.75, opacity: 0 }}
                    animate={{ scale: 1.15, opacity: 0.16 }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                    className="absolute inset-0 rounded-full bg-blue-300"
                />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 text-blue-600 shadow-[0_18px_42px_rgba(29,78,216,0.2)]">
                    <div className="h-9 w-9 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
                </div>
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
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const [loading, setLoading] = useState(true);
    const [request, setRequest] = useState<MyServiceRequest | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethod>('paypal');
    const [isPaying, setIsPaying] = useState(false);
    const [checkoutStage, setCheckoutStage] = useState<CheckoutStage>('form');
    const [checkoutMessage, setCheckoutMessage] = useState('');
    const [successCountdown, setSuccessCountdown] = useState(4);
    const paypalReturnHandledRef = useRef(false);
    const [vwCheckout, setVwCheckout] = useState<{ reference: string; amount: number } | null>(null);
    const [vwMounting, setVwMounting] = useState(false);
    const [vwLoadError, setVwLoadError] = useState(false);
    const [vwConfirming, setVwConfirming] = useState(false);

    const amount = useMemo(() => getChargeAmount(request), [request]);
    const locationMeta = useMemo(() => getLocationMeta(request?.location_text || '', t), [request?.location_text, t]);
    const scheduledWindow = useMemo(() => formatScheduledWindow(request), [request]);
    const bookingLabel = isScheduledRequest(request) ? t('paymentCheckout.booking.scheduled') : t('paymentCheckout.booking.express');
    const displayCurrency = useMemo(() => readString(request?.payment?.currency_code).toUpperCase() || 'USD', [request?.payment?.currency_code]);
    const platformFee = useMemo(() => {
        if (request?.payment?.platform_fee != null) {
            return Number(request.payment.platform_fee);
        }

        return Number((amount * DEFAULT_PLATFORM_PROTECTION_RATE).toFixed(2));
    }, [amount, request?.payment?.platform_fee]);
    const workerPayout = useMemo(() => {
        if (request?.payment?.worker_payout != null) {
            return Number(request.payment.worker_payout);
        }

        return Number(Math.max(amount - platformFee, 0).toFixed(2));
    }, [amount, platformFee, request?.payment?.worker_payout]);
    const commissionRate = useMemo(() => {
        if (request?.payment?.commission_rate != null) {
            return Number(request.payment.commission_rate);
        }

        if (amount <= 0) return DEFAULT_PLATFORM_PROTECTION_RATE;
        return Number((platformFee / amount).toFixed(4));
    }, [amount, platformFee, request?.payment?.commission_rate]);
    const commissionLabel = useMemo(
        () => readString(request?.payment?.commission_snapshot?.policy_label) || t('paymentCheckout.summary.defaultCommissionLabel'),
        [request?.payment?.commission_snapshot?.policy_label, t]
    );
    const appliedCommissionRules = useMemo(() => {
        const rules = request?.payment?.commission_snapshot?.applied_rules;
        if (!Array.isArray(rules) || rules.length === 0) return null;

        return rules
            .map((rule) => `${rule.name} ${Math.round(Number(rule.rate_percent || 0) * 1000) / 10}%`)
            .join(' · ');
    }, [request?.payment?.commission_snapshot?.applied_rules]);
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

        const fetchCheckoutRequest = async () => {
            try {
                const res = await fetch(API_ENDPOINTS.services.myRequests, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const payload = await res.json();

                if (!res.ok || !payload?.success || !Array.isArray(payload?.requests)) {
                    notyf.error(payload?.error || t('paymentCheckout.messages.loadFailed'));
                    setRequest(null);
                    return;
                }

                const matchedRequest = payload.requests.find(
                    (item: MyServiceRequest) => Number(item.id_request) === Number(requestId)
                ) as MyServiceRequest | undefined;

                if (!matchedRequest) {
                    notyf.error(t('paymentCheckout.messages.requestUnavailable'));
                    setRequest(null);
                    return;
                }

                setRequest(matchedRequest);
            } catch {
                notyf.error(t('paymentCheckout.messages.networkLoadError'));
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

    const handlePaypalReturnConfirmation = async (paypalOrderId: string) => {
        const token = getToken();
        if (!token || !request) {
            moveToErrorStage(t('paymentCheckout.messages.sessionExpiredPaypal'));
            return;
        }

        setIsPaying(true);
        try {
            const authUser = getAuthUser();
            const authName = readString(authUser?.name);
            const authEmail = readString(authUser?.email);

            const payer = {
                full_name: authName || 'Fixlife Client',
                email: authEmail || '',
            };

            const payRes = await fetch(API_ENDPOINTS.services.confirmPayment(request.id_request), {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    payment_method: 'paypal',
                    paypal_order_id: paypalOrderId,
                    payer,
                }),
            });
            const payPayload = await payRes.json();
            if (!payRes.ok || !payPayload?.success) {
                const message = payPayload?.error || t('paymentCheckout.messages.paypalConfirmFailed');
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
                              provider: payPayload?.payment?.provider || 'paypal',
                              checkout_reference: payPayload?.payment?.checkout_reference || prev.payment?.checkout_reference || null,
                              currency_code: payPayload?.payment?.currency_code || prev.payment?.currency_code || displayCurrency,
                              amount: Number(payPayload?.payment?.amount || amount),
                              platform_fee: Number(payPayload?.payment?.platform_fee ?? prev.payment?.platform_fee ?? platformFee),
                              worker_payout: Number(payPayload?.payment?.worker_payout ?? prev.payment?.worker_payout ?? workerPayout),
                              commission_rate: Number(payPayload?.payment?.commission_rate ?? prev.payment?.commission_rate ?? commissionRate),
                              commission_snapshot: payPayload?.payment?.commission_snapshot ?? prev.payment?.commission_snapshot ?? null,
                              status: 'paid',
                              paid_at: new Date().toISOString(),
                          },
                      }
                    : prev
            );

            navigate(`/checkout/${request.id_request}`, { replace: true });
            setCheckoutStage('success');
            setCheckoutMessage(t('paymentCheckout.messages.paypalSuccessMessage'));
            notyf.success(t('paymentCheckout.messages.paypalSuccessToast'));
        } catch {
            notyf.error(t('paymentCheckout.messages.paypalNetworkError'));
            moveToErrorStage(t('paymentCheckout.messages.paypalNetworkErrorStage'));
        } finally {
            setIsPaying(false);
        }
    };

    // Wompi confirms asynchronously via webhook, which only fires once the
    // customer actually finishes entering card details on Wompi's page — that
    // can take minutes, not seconds. Poll patiently instead of giving up fast.
    const checkWompiPaymentOnce = async (): Promise<'paid' | 'pending' | 'failed'> => {
        const token = getToken();
        if (!token || !request) return 'failed';

        const payRes = await fetch(API_ENDPOINTS.services.confirmPayment(request.id_request), {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ payment_method: 'wompi' }),
        });
        const payPayload = await payRes.json();
        if (!payRes.ok || !payPayload?.success) {
            notyf.error(payPayload?.error || t('paymentCheckout.messages.wompiCheckFailed'));
            return 'failed';
        }

        if (payPayload?.payment?.status === 'paid') {
            setRequest((prev) =>
                prev
                    ? {
                          ...prev,
                          status: 'paid',
                          payment: {
                              provider: 'wompi',
                              checkout_reference: payPayload?.payment?.checkout_reference || prev.payment?.checkout_reference || null,
                              currency_code: payPayload?.payment?.currency_code || prev.payment?.currency_code || displayCurrency,
                              amount: Number(payPayload?.payment?.amount ?? amount),
                              platform_fee: Number(payPayload?.payment?.platform_fee ?? prev.payment?.platform_fee ?? platformFee),
                              worker_payout: Number(payPayload?.payment?.worker_payout ?? prev.payment?.worker_payout ?? workerPayout),
                              commission_rate: Number(payPayload?.payment?.commission_rate ?? prev.payment?.commission_rate ?? commissionRate),
                              commission_snapshot: payPayload?.payment?.commission_snapshot ?? prev.payment?.commission_snapshot ?? null,
                              status: 'paid',
                              paid_at: new Date().toISOString(),
                          },
                      }
                    : prev
            );

            navigate(`/checkout/${request.id_request}`, { replace: true });
            setCheckoutStage('success');
            setCheckoutMessage(t('paymentCheckout.messages.wompiSuccessMessage'));
            notyf.success(t('paymentCheckout.messages.wompiSuccessToast'));
            return 'paid';
        }

        return 'pending';
    };

    const handleWompiReturnConfirmation = async () => {
        if (!request) {
            moveToErrorStage(t('paymentCheckout.messages.wompiSessionExpired'));
            return;
        }

        setPaymentMethod('wompi');
        setCheckoutStage('pending');
        setCheckoutMessage(t('paymentCheckout.messages.wompiConfirming'));
        setIsPaying(true);
        try {
            const maxAttempts = 45; // ~3 minutes at 4s apart
            for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
                const outcome = await checkWompiPaymentOnce();
                if (outcome === 'paid') return;
                if (outcome === 'failed') {
                    moveToErrorStage(t('paymentCheckout.messages.wompiConfirmFailedStage'));
                    return;
                }
                await new Promise((resolve) => window.setTimeout(resolve, 4000));
            }

            setCheckoutMessage(t('paymentCheckout.messages.wompiStillWaiting'));
        } catch {
            notyf.error(t('paymentCheckout.messages.wompiNetworkError'));
            setCheckoutMessage(t('paymentCheckout.messages.wompiNetworkErrorStage'));
        } finally {
            setIsPaying(false);
        }
    };

    const handleWompiCheckAgain = async () => {
        if (isPaying) return;
        setIsPaying(true);
        try {
            const outcome = await checkWompiPaymentOnce();
            if (outcome === 'pending') {
                setCheckoutMessage(t('paymentCheckout.messages.wompiStillWaitingShort'));
            }
        } finally {
            setIsPaying(false);
        }
    };

    useEffect(() => {
        if (!vwCheckout) return;
        setVwMounting(true);
        setVwLoadError(false);
        loadVirtualWalletWidget({
            scriptUrl: VIRTUAL_WALLET_CONFIG.scriptUrl,
            clientId: VIRTUAL_WALLET_CONFIG.clientId,
            secretKey: VIRTUAL_WALLET_CONFIG.secretKey,
            amountElementId: 'vw_monto',
            descElementId: 'DescCarrito',
            containerId: 'virtual-wallet-checkout',
        })
            .then(() => setVwMounting(false))
            .catch(() => {
                setVwMounting(false);
                setVwLoadError(true);
                notyf.error(t('paymentCheckout.messages.vwLoadError'));
            });
    }, [vwCheckout]);

    const startVirtualWalletCheckout = async () => {
        if (isPaying || !request) return;
        const token = getToken();
        if (!token) {
            notyf.error(t('paymentCheckout.messages.loginRequired'));
            moveToErrorStage(t('paymentCheckout.messages.sessionExpiredCheckout'));
            return;
        }
        if (isAlreadyPaid) {
            notyf.open({ type: 'info', message: t('paymentCheckout.messages.alreadySecuredToast'), background: '#1d4ed8' });
            return;
        }

        setPaymentMethod('virtual_wallet');
        setIsPaying(true);
        try {
            const checkoutRes = await fetch(API_ENDPOINTS.services.paymentCheckout(request.id_request), {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ payment_method: 'virtual_wallet' }),
            });
            const checkoutPayload = await checkoutRes.json();
            if (!checkoutRes.ok || !checkoutPayload?.success) {
                const message = checkoutPayload?.error || t('paymentCheckout.messages.vwInitFailed');
                notyf.error(message);
                moveToErrorStage(message);
                return;
            }

            const reference = readString(checkoutPayload?.checkout?.checkout_reference);
            const chargeAmount = Number(checkoutPayload?.checkout?.amount ?? amount);
            setVwCheckout({ reference, amount: chargeAmount });
        } catch {
            notyf.error(t('paymentCheckout.messages.vwNetworkError'));
            moveToErrorStage(t('paymentCheckout.messages.vwNetworkErrorStage'));
        } finally {
            setIsPaying(false);
        }
    };

    const confirmVirtualWalletPayment = async () => {
        const token = getToken();
        if (!token || !request) {
            moveToErrorStage(t('paymentCheckout.messages.vwSessionExpired'));
            return;
        }

        setVwConfirming(true);
        try {
            const authUser = getAuthUser();
            const payRes = await fetch(API_ENDPOINTS.services.confirmPayment(request.id_request), {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    payment_method: 'virtual_wallet',
                    payer: {
                        full_name: readString(authUser?.name) || 'Fixlife Client',
                        email: readString(authUser?.email) || '',
                    },
                }),
            });
            const payPayload = await payRes.json();
            if (!payRes.ok || !payPayload?.success) {
                const message = payPayload?.error || t('paymentCheckout.messages.vwConfirmFailed');
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
                              provider: 'virtual_wallet',
                              checkout_reference: payPayload?.payment?.checkout_reference || vwCheckout?.reference || null,
                              currency_code: payPayload?.payment?.currency_code || displayCurrency,
                              amount: Number(payPayload?.payment?.amount || amount),
                              platform_fee: Number(payPayload?.payment?.platform_fee ?? platformFee),
                              worker_payout: Number(payPayload?.payment?.worker_payout ?? workerPayout),
                              commission_rate: Number(payPayload?.payment?.commission_rate ?? commissionRate),
                              commission_snapshot: payPayload?.payment?.commission_snapshot ?? null,
                              status: 'paid',
                              paid_at: new Date().toISOString(),
                          },
                      }
                    : prev
            );

            setCheckoutStage('success');
            setCheckoutMessage(t('paymentCheckout.messages.vwSuccessMessage'));
            notyf.success(t('paymentCheckout.messages.vwSuccessToast'));
        } catch {
            notyf.error(t('paymentCheckout.messages.vwNetworkErrorConfirm'));
            moveToErrorStage(t('paymentCheckout.messages.vwNetworkErrorConfirmStage'));
        } finally {
            setVwConfirming(false);
        }
    };

    useEffect(() => {
        if (loading || !requestId || !request) return;

        const params = new URLSearchParams(location.search);
        // `payment`/`method` is the current scheme for both providers; `paypal` is
        // kept for any already-issued PayPal return URLs from before this existed.
        const paymentState = (readString(params.get('payment')) || readString(params.get('paypal'))).toLowerCase();
        const methodFromUrl = readString(params.get('method')).toLowerCase() || 'paypal';
        if (!paymentState) return;

        if (paymentState === 'cancel') {
            if (!paypalReturnHandledRef.current) {
                notyf.open({
                    type: 'info',
                    message: t('paymentCheckout.messages.paymentCancelled', { provider: methodFromUrl === 'wompi' ? 'Wompi' : 'PayPal' }),
                    background: '#1d4ed8',
                });
            }
            paypalReturnHandledRef.current = true;
            navigate(`/checkout/${request.id_request}`, { replace: true });
            return;
        }

        if (paymentState === 'success') {
            if (paypalReturnHandledRef.current) return;

            // The webhook (Wompi) or an earlier tab (PayPal) may have already
            // confirmed this by the time the redirect lands here — show the
            // success screen instead of silently doing nothing, which used to
            // leave the payment buttons active and let the client "retry" an
            // already-paid request into a confusing 409.
            if (isAlreadyPaid) {
                paypalReturnHandledRef.current = true;
                navigate(`/checkout/${request.id_request}`, { replace: true });
                setCheckoutStage('success');
                setCheckoutMessage(t('paymentCheckout.messages.alreadyConfirmedMessage'));
                return;
            }

            if (methodFromUrl === 'wompi') {
                paypalReturnHandledRef.current = true;
                void handleWompiReturnConfirmation();
                return;
            }

            const tokenFromUrl = readString(params.get('token'));
            if (!tokenFromUrl) {
                moveToErrorStage(t('paymentCheckout.messages.paypalNoToken'));
                navigate(`/checkout/${request.id_request}`, { replace: true });
                return;
            }
            paypalReturnHandledRef.current = true;
            void handlePaypalReturnConfirmation(tokenFromUrl);
        }
    }, [loading, requestId, request, isAlreadyPaid, location.search, navigate]);

    const handleSecurePayment = async (selectedMethod: CheckoutPaymentMethod = paymentMethod) => {
        if (isPaying) return;
        const token = getToken();
        if (!token || !request) {
            notyf.error(t('paymentCheckout.messages.loginRequired'));
            moveToErrorStage(t('paymentCheckout.messages.sessionExpiredCheckout'));
            return;
        }
        if (selectedMethod === 'cash') {
            if (isAlreadyPaid) {
                notyf.open({
                    type: 'info',
                    message: t('paymentCheckout.messages.alreadySecuredToast'),
                    background: '#1d4ed8',
                });
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
                    body: JSON.stringify({ payment_method: 'cash' }),
                });
                const checkoutPayload = await checkoutRes.json();
                if (!checkoutRes.ok || !checkoutPayload?.success) {
                    const message = checkoutPayload?.error || t('paymentCheckout.messages.cashSelectFailed');
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
                                  provider: 'cash',
                                  checkout_reference: checkoutPayload?.checkout?.checkout_reference || null,
                                  currency_code: displayCurrency,
                                  amount: Number(checkoutPayload?.checkout?.amount ?? amount),
                                  platform_fee: Number(checkoutPayload?.checkout?.platform_fee ?? platformFee),
                                  worker_payout: Number(checkoutPayload?.checkout?.worker_payout ?? workerPayout),
                                  commission_rate: Number(checkoutPayload?.checkout?.commission_rate ?? commissionRate),
                                  commission_snapshot: checkoutPayload?.checkout?.commission_snapshot ?? prev.payment?.commission_snapshot ?? null,
                                  status: 'paid',
                                  paid_at: new Date().toISOString(),
                              },
                          }
                        : prev
                );

                setCheckoutStage('success');
                setCheckoutMessage(t('paymentCheckout.messages.cashSuccessMessage'));
                notyf.success(t('paymentCheckout.messages.cashSuccessToast'));
            } catch {
                notyf.error(t('paymentCheckout.messages.cashNetworkError'));
                moveToErrorStage(t('paymentCheckout.messages.cashNetworkErrorStage'));
            } finally {
                setIsPaying(false);
            }
            return;
        }
        if (isAlreadyPaid) {
            notyf.open({
                type: 'info',
                message: t('paymentCheckout.messages.alreadySecuredToast'),
                background: '#1d4ed8',
            });
            setCheckoutStage('success');
            setCheckoutMessage(t('paymentCheckout.messages.alreadyPaidSuccessMessage'));
            return;
        }

        setIsPaying(true);
        try {
            const authUser = getAuthUser();
            const authName = readString(authUser?.name);
            const authEmail = readString(authUser?.email);

            const checkoutRes = await fetch(API_ENDPOINTS.services.paymentCheckout(request.id_request), {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    payment_method: selectedMethod,
                    return_url: `${window.location.origin}/checkout/${request.id_request}?payment=success&method=${selectedMethod}`,
                    cancel_url: `${window.location.origin}/checkout/${request.id_request}?payment=cancel&method=${selectedMethod}`,
                    payer: {
                        full_name: authName || '',
                        email: authEmail || '',
                    },
                }),
            });
            const checkoutPayload = await checkoutRes.json();
            if (!checkoutRes.ok || !checkoutPayload?.success) {
                const message = checkoutPayload?.error || t('paymentCheckout.messages.initFailed');
                notyf.error(message);
                moveToErrorStage(message);
                return;
            }
            const approvalUrl = readString(checkoutPayload?.checkout?.approval_url);
            if (!approvalUrl) {
                moveToErrorStage(t('paymentCheckout.messages.noApprovalUrl'));
                return;
            }
            if (!isAllowedPaymentRedirect(approvalUrl)) {
                moveToErrorStage(t('paymentCheckout.messages.unsafeRedirect'));
                return;
            }

            window.location.href = approvalUrl;
            return;
        } catch {
            notyf.error(t('paymentCheckout.messages.genericNetworkError'));
            moveToErrorStage(t('paymentCheckout.messages.genericNetworkErrorStage'));
        } finally {
            setIsPaying(false);
        }
    };

    const stageAccentClass =
        checkoutStage === 'success'
            ? 'from-emerald-500/18 via-cyan-400/10 to-transparent'
            : checkoutStage === 'pending'
            ? 'from-blue-500/18 via-sky-400/10 to-transparent'
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
            <p className={`mt-6 text-[11px] font-black uppercase tracking-[0.24em] ${checkoutStage === 'success' ? 'text-emerald-500' : checkoutStage === 'pending' ? 'text-blue-500' : 'text-amber-500'}`}>
                {checkoutStage === 'success' ? t('paymentCheckout.stage.complete') : checkoutStage === 'pending' ? t('paymentCheckout.stage.confirming') : t('paymentCheckout.stage.issue')}
            </p>
            <h2 className="mt-3 text-3xl font-black text-slate-950">
                {checkoutStage === 'success' ? t('paymentCheckout.stage.successTitle') : checkoutStage === 'pending' ? t('paymentCheckout.stage.pendingTitle') : t('paymentCheckout.stage.errorTitle')}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">
                {checkoutMessage}
            </p>

            <div className="mt-7 rounded-[28px] border border-slate-200 bg-slate-50 p-5 text-left dark:bg-slate-800 dark:border-white/10">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{t('paymentCheckout.recap.title')}</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                        <p className="text-sm font-black text-slate-900 dark:text-slate-100">{localizeClientServiceName(request?.service_name, i18n.language)}</p>
                        <p className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-blue-600">{bookingLabel}</p>
                        {scheduledWindow && <p className="mt-1 text-sm font-semibold text-slate-600">{scheduledWindow}</p>}
                        <p className="mt-1 text-sm text-slate-500">{locationMeta.primary}</p>
                        <p className="mt-1 text-xs text-slate-400">{locationMeta.secondary}</p>
                    </div>
                    <div className="text-left sm:text-right">
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{t('paymentCheckout.recap.chargeLabel')}</p>
                        <p className="mt-2 text-3xl font-black text-slate-950">${amount.toFixed(2)}</p>
                    </div>
                </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[24px] border border-slate-200 bg-white/85 p-4 text-left shadow-sm dark:border-white/10">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{t('paymentCheckout.recap.referenceLabel')}</p>
                    <p className="mt-2 text-base font-black text-slate-950">
                        {request?.payment?.checkout_reference || t('paymentCheckout.recap.referenceFallback')}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{t('paymentCheckout.recap.referenceHint')}</p>
                </div>
                <div className="rounded-[24px] border border-slate-200 bg-white/85 p-4 text-left shadow-sm dark:border-white/10">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{t('paymentCheckout.recap.statusLabel')}</p>
                    <p className="mt-2 text-base font-black text-slate-950">
                        {checkoutStage === 'success' ? t('paymentCheckout.recap.statusFundsSecured') : checkoutStage === 'pending' ? t('paymentCheckout.recap.statusWaitingWompi') : t('paymentCheckout.recap.statusRetryAvailable')}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                        {checkoutStage === 'success'
                            ? t('paymentCheckout.recap.statusDescSuccess')
                            : checkoutStage === 'pending'
                            ? t('paymentCheckout.recap.statusDescPending')
                            : t('paymentCheckout.recap.statusDescError')}
                    </p>
                </div>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                {checkoutStage === 'error' && (
                    <button
                        type="button"
                        onClick={() => setCheckoutStage('form')}
                        className="rounded-2xl bg-bird-blue px-6 py-3 text-sm font-black text-slate-900 shadow-[0_16px_34px_rgba(29,78,216,0.24)] hover:bg-bird-darkBlue dark:text-slate-100"
                    >
                        {t('paymentCheckout.actions.tryAgain')}
                    </button>
                )}
                {checkoutStage === 'pending' && (
                    <button
                        type="button"
                        onClick={() => void handleWompiCheckAgain()}
                        disabled={isPaying}
                        className="rounded-2xl bg-bird-blue px-6 py-3 text-sm font-black text-slate-900 shadow-[0_16px_34px_rgba(29,78,216,0.24)] hover:bg-bird-darkBlue disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-100"
                    >
                        {isPaying ? t('paymentCheckout.actions.checking') : t('paymentCheckout.actions.checkAgain')}
                    </button>
                )}
                <button
                    type="button"
                    onClick={onBack}
                    className="rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-700 hover:border-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:border-white/10"
                >
                    {t('paymentCheckout.actions.backToRequests')}
                </button>
            </div>

            {checkoutStage === 'success' && (
                <div className="mx-auto mt-6 max-w-md">
                    <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600">
                        <span>{t('paymentCheckout.returning')}</span>
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
        <div className="min-h-screen bg-transparent px-4 py-8 sm:px-6 lg:px-10 flex items-center justify-center">
            <div className="w-full max-w-lg">
                <button
                    type="button"
                    onClick={onBack}
                    className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors"
                >
                    <span className="text-lg leading-none">&larr;</span>
                    {t('paymentCheckout.back')}
                </button>

                {loading ? (
                    <div className="rounded-[32px] bg-white p-8 shadow-sm border border-slate-100 flex flex-col items-center justify-center min-h-[400px] dark:bg-slate-900 dark:border-white/10">
                         <div className="h-8 w-8 rounded-full border-4 border-slate-100 border-t-bird-blue animate-spin dark:border-white/10" />
                         <p className="mt-4 text-sm font-semibold text-slate-500">{t('paymentCheckout.loading')}</p>
                    </div>
                ) : !request ? (
                    <div className="rounded-[32px] bg-white p-10 text-center shadow-sm border border-slate-100 dark:bg-slate-900 dark:border-white/10">
                        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">{t('paymentCheckout.errors.title')}</p>
                        <h1 className="mt-3 text-2xl font-black text-slate-900 dark:text-slate-100">{t('paymentCheckout.errors.notFound')}</h1>
                        <p className="mt-2 text-sm text-slate-500">{t('paymentCheckout.errors.notFoundDesc')}</p>
                        <button
                            type="button"
                            onClick={onBack}
                            className="mt-6 rounded-2xl bg-bird-blue px-6 py-3 text-sm font-black text-slate-900 hover:bg-bird-darkBlue transition dark:text-slate-100"
                        >
                            {t('paymentCheckout.errors.goBack')}
                        </button>
                    </div>
                ) : checkoutStage === 'form' ? (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-[32px] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden dark:bg-slate-900/80 dark:border-white/10 dark:shadow-black/40"
                    >
                        <div className="p-8 pb-6 border-b border-slate-100 dark:border-white/10">
                            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400 text-center">{t('paymentCheckout.header.securePayment')}</p>
                            <h1 className="mt-4 text-3xl font-black text-slate-900 text-center dark:text-slate-100">{t('paymentCheckout.header.title')}</h1>
                            <p className="mt-2 text-sm text-slate-500 text-center">{localizeClientServiceName(request.service_name, i18n.language)}</p>
                            <div className="mt-3 flex flex-col items-center gap-1">
                                <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">
                                    {bookingLabel}
                                </span>
                                {scheduledWindow && (
                                    <span className="text-sm font-bold text-slate-600">{scheduledWindow}</span>
                                )}
                            </div>
                            
                            <div className="mt-8 flex justify-center">
                                <div className="text-center">
                                    <span className="text-5xl font-black text-slate-950">${amount.toFixed(2)}</span>
                                    <span className="ml-1 text-sm font-bold text-slate-400">{displayCurrency}</span>
                                </div>
                            </div>
                        </div>

                        <div className="p-8 bg-slate-50/50 dark:bg-slate-800">
                            <p className="text-[12px] font-bold text-slate-500 mb-4 text-center">{t('paymentCheckout.chooseMethod')}</p>

                            <div className="space-y-2.5">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setPaymentMethod('paypal');
                                        void handleSecurePayment('paypal');
                                    }}
                                    disabled={isPaying || isAlreadyPaid}
                                    aria-pressed={paymentMethod === 'paypal'}
                                    className={`w-full flex items-center gap-4 rounded-2xl border px-5 py-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                        paymentMethod === 'paypal' && isPaying
                                            ? 'border-blue-400 bg-blue-50/70 ring-1 ring-blue-400/20'
                                            : 'border-slate-200 bg-white hover:border-slate-300'
                                    }`}
                                >
                                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFC439]">
                                        {isPaying && paymentMethod === 'paypal' ? (
                                            <div className="h-4 w-4 rounded-full border-2 border-slate-800/30 border-t-slate-800 animate-spin" />
                                        ) : (
                                            <svg viewBox="0 0 124 33" className="h-4 w-7" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M46.211 32.748c-5.748 0-8.815-2.617-9.351-7.85l-1.32-12.87c-.126-1.229.83-2.28 2.068-2.28h5.365c1.11 0 2.05.815 2.19 1.916l.89 7.027c.22 1.745 1.71 3.064 3.47 3.064h2.793c2.906 0 4.398-1.571 4.887-4.482l1.32-7.855c.16-1.047-1.12-2.116-2.58-2.116h-4.321c-1.238 0-2.095-1.051-1.96-2.28l.261-2.298c.135-1.23 1.258-2.28 2.496-2.28h11.96c5.748 0 8.816 2.618 9.352 7.854.34 3.32-.47 6.471-2.215 8.922-2.482 3.486-6.865 5.528-11.832 5.528H46.211z" fill="#003087"/>
                                                <path d="M85.731 32.748c-5.748 0-8.816-2.617-9.352-7.85l-1.319-12.87c-.126-1.229.83-2.28 2.068-2.28h5.365c1.11 0 2.05.815 2.19 1.916l.89 7.027c.22 1.745 1.71 3.064 3.47 3.064h2.793c2.906 0 4.398-1.571 4.887-4.482l1.32-7.855c.16-1.047-1.12-2.116-2.58-2.116h-4.322c-1.238 0-2.095-1.051-1.96-2.28l.262-2.298c.135-1.23 1.258-2.28 2.496-2.28h11.96c5.748 0 8.816 2.618 9.352 7.854.34 3.32-.471 6.471-2.215 8.922-2.482 3.486-6.865 5.528-11.832 5.528H85.731z" fill="#009CDE"/>
                                                <path d="M22.06 1.836c.219-1.047 1.119-1.836 2.188-1.836h14.072c4.01 0 7.234 1.122 9.07 3.197 1.91 2.146 2.5 5.58 1.62 9.467-.93 4.29-3.23 7.404-6.42 8.953-2.73 1.34-6.32 1.855-10.74 1.855H28.43c-1.07 0-1.97.79-2.19 1.836l-1.92 9.176c-.16 1.046-1.07 1.835-2.14 1.835H15.93c-1.39 0-2.43-1.27-2.18-2.646L22.06 1.836z" fill="#003087"/>
                                                <path d="M12.98 1.836c.219-1.047 1.12-1.836 2.19-1.836H29.24c4.01 0 7.235 1.122 9.071 3.197 1.91 2.146 2.5 5.58 1.62 9.467-1.36 6.284-5.914 10.808-13.87 10.808H21.5c-1.07 0-1.97.79-2.19 1.836l-1.92 9.176c-.16 1.046-1.07 1.835-2.14 1.835H8.99c-1.39 0-2.43-1.27-2.18-2.646L12.98 1.836z" fill="#009CDE"/>
                                            </svg>
                                        )}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-black text-slate-900 dark:text-slate-100">{t('paymentCheckout.methods.paypal.name')}</span>
                                        <span className="mt-0.5 block text-xs font-semibold text-slate-500">{t('paymentCheckout.methods.paypal.desc')}</span>
                                    </span>
                                    <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                                        {t('paymentCheckout.methods.active')}
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setPaymentMethod('wompi');
                                        void handleSecurePayment('wompi');
                                    }}
                                    disabled={isPaying || isAlreadyPaid}
                                    aria-pressed={paymentMethod === 'wompi'}
                                    className={`w-full flex items-center gap-4 rounded-2xl border px-5 py-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                        paymentMethod === 'wompi' && isPaying
                                            ? 'border-[#4353FF]/60 bg-[#4353FF]/5 ring-1 ring-[#4353FF]/20'
                                            : 'border-slate-200 bg-white hover:border-slate-300'
                                    }`}
                                >
                                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#4353FF]">
                                        {isPaying && paymentMethod === 'wompi' ? (
                                            <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                                        ) : (
                                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                                                <path d="m9 12 2 2 4-4" />
                                            </svg>
                                        )}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-black text-slate-900 dark:text-slate-100">{t('paymentCheckout.methods.wompi.name')}</span>
                                        <span className="mt-0.5 block text-xs font-semibold text-slate-500">{t('paymentCheckout.methods.wompi.desc')}</span>
                                    </span>
                                    <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                                        {t('paymentCheckout.methods.active')}
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setPaymentMethod('cash');
                                        void handleSecurePayment('cash');
                                    }}
                                    disabled={isPaying || isAlreadyPaid}
                                    aria-pressed={paymentMethod === 'cash'}
                                    className={`w-full flex items-center gap-4 rounded-2xl border px-5 py-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                        paymentMethod === 'cash' && isPaying
                                            ? 'border-emerald-400 bg-emerald-50/70 ring-1 ring-emerald-400/20'
                                            : 'border-slate-200 bg-white hover:border-slate-300'
                                    }`}
                                >
                                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                                        {isPaying && paymentMethod === 'cash' ? (
                                            <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                                        ) : (
                                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                                <rect x="2" y="6" width="20" height="12" rx="2" />
                                                <circle cx="12" cy="12" r="2" />
                                                <path d="M6 12h.01M18 12h.01" />
                                            </svg>
                                        )}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-black text-slate-900 dark:text-slate-100">{t('paymentCheckout.methods.cash.name')}</span>
                                        <span className="mt-0.5 block text-xs font-semibold text-slate-500">{t('paymentCheckout.methods.cash.desc')}</span>
                                    </span>
                                    <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                                        {t('paymentCheckout.methods.active')}
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => void startVirtualWalletCheckout()}
                                    disabled={isPaying || isAlreadyPaid || Boolean(vwCheckout)}
                                    aria-pressed={paymentMethod === 'virtual_wallet'}
                                    className={`w-full flex items-center gap-4 rounded-2xl border px-5 py-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                        paymentMethod === 'virtual_wallet' && isPaying
                                            ? 'border-violet-400 bg-violet-50/70 ring-1 ring-violet-400/20'
                                            : 'border-slate-200 bg-white hover:border-slate-300'
                                    }`}
                                >
                                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white">
                                        {isPaying && paymentMethod === 'virtual_wallet' ? (
                                            <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                                        ) : (
                                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2 2 0 00-2-2h-1.5a1.5 1.5 0 000 3H19a2 2 0 002-2zM3 7v10a2 2 0 002 2h14a2 2 0 002-2v-6a2 2 0 00-2-2H5a2 2 0 01-2-2zm0 0a2 2 0 012-2h12" />
                                            </svg>
                                        )}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-black text-slate-900 dark:text-slate-100">{t('paymentCheckout.methods.virtualWallet.name')}</span>
                                        <span className="mt-0.5 block text-xs font-semibold text-slate-500">{t('paymentCheckout.methods.virtualWallet.desc')}</span>
                                    </span>
                                    <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                                        {t('paymentCheckout.methods.active')}
                                    </span>
                                </button>

                                {vwCheckout && (
                                    <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
                                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-500">{t('paymentCheckout.virtualWallet.label')}</p>
                                        <input type="hidden" id="vw_monto" value={vwCheckout.amount} readOnly />
                                        <input type="hidden" id="DescCarrito" value={vwCheckout.reference} readOnly />
                                        <div id="virtual-wallet-checkout" className="mt-2 flex justify-center" />
                                        {vwMounting && (
                                            <p className="mt-2 text-center text-xs font-semibold text-slate-500">{t('paymentCheckout.virtualWallet.loadingWidget')}</p>
                                        )}
                                        {vwLoadError && (
                                            <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-3 text-center">
                                                <p className="text-xs font-bold text-red-600">{t('paymentCheckout.virtualWallet.loadError')}</p>
                                                <button
                                                    type="button"
                                                    onClick={() => setVwCheckout((prev) => (prev ? { ...prev } : prev))}
                                                    className="mt-2 text-xs font-black text-red-700 underline"
                                                >
                                                    {t('paymentCheckout.virtualWallet.retry')}
                                                </button>
                                            </div>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => void confirmVirtualWalletPayment()}
                                            disabled={vwConfirming}
                                            className="mt-3 w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {vwConfirming ? t('paymentCheckout.virtualWallet.confirming') : t('paymentCheckout.virtualWallet.confirmButton')}
                                        </button>
                                        <p className="mt-2 text-center text-[11px] text-slate-500">{t('paymentCheckout.virtualWallet.finishHint')}</p>
                                    </div>
                                )}
                            </div>

                            {isPaying && (paymentMethod === 'wompi' || paymentMethod === 'paypal') && (
                                <div className="mt-4 flex items-center justify-center gap-2.5 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-center dark:border-blue-400/20 dark:bg-blue-500/10">
                                    <div className="h-4 w-4 shrink-0 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
                                    <p className="text-xs font-bold text-blue-700 dark:text-blue-300">
                                        {t('paymentCheckout.redirectingHint', { provider: paymentMethod === 'wompi' ? 'Wompi' : 'PayPal' })}
                                    </p>
                                </div>
                            )}

                            {isAlreadyPaid && (
                                <p className="mt-4 text-center text-sm font-bold text-emerald-600">
                                    {t('paymentCheckout.alreadyPaid')}
                                </p>
                            )}

                            <div className="mt-5 grid gap-3 rounded-[24px] border border-slate-200 bg-white/80 p-4 sm:grid-cols-3 dark:border-white/10">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{isScheduledRequest(request) ? t('paymentCheckout.summary.visitPayment') : t('paymentCheckout.summary.protectedNow')}</p>
                                    <p className="mt-2 text-lg font-black text-slate-950">
                                        ${amount.toFixed(2)} <span className="text-xs font-bold text-slate-400">{displayCurrency}</span>
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{t('paymentCheckout.summary.platformProtection')}</p>
                                    <p className="mt-2 text-lg font-black text-slate-950">${platformFee.toFixed(2)}</p>
                                    <p className="mt-1 text-[11px] text-slate-500">{t('paymentCheckout.summary.commission', { rate: (commissionRate * 100).toFixed(1) })}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{t('paymentCheckout.summary.proRelease')}</p>
                                    <p className="mt-2 text-lg font-black text-slate-950">${workerPayout.toFixed(2)}</p>
                                    <p className="mt-1 text-[11px] text-slate-500">{t('paymentCheckout.summary.releasedAfter')}</p>
                                </div>
                            </div>
                            <div className="mt-3 rounded-[22px] border border-slate-200 bg-white/70 p-4 dark:border-white/10">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{t('paymentCheckout.summary.commissionPolicy')}</p>
                                <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-300">{commissionLabel}</p>
                                {appliedCommissionRules && (
                                    <p className="mt-1 text-xs text-slate-500">{appliedCommissionRules}</p>
                                )}
                            </div>

                            <div className="mt-6 flex items-center justify-center gap-2 opacity-50">
                                <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                                <span className="text-xs font-semibold text-slate-500">{t('paymentCheckout.secureNote')}</span>
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    renderFinalStage()
                )}
            </div>
        </div>
    );
};

export default PaymentCheckoutPage;

