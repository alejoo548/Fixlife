import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { showSweetToast } from '../utils/sweetAlert';
import { API_ENDPOINTS } from '../config/api';
import { getAuthUser, getToken } from '../utils/session';
import { localizeClientServiceName } from '../utils/clientTranslations';

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

type CheckoutStage = 'form' | 'success' | 'error';
type CheckoutPaymentMethod = 'paypal' | 'wompi' | 'cash' | 'virtual_wallet';

const notyf = {
  success: (message: string) => void showSweetToast({ tone: 'success', message }),
  error: (message: string) => void showSweetToast({ tone: 'error', message }),
  open: ({ type, message }: { type?: string; message: string; background?: string }) =>
    void showSweetToast({ tone: (type as 'info' | 'success' | 'error' | 'warning') || 'info', message }),
};
const DEFAULT_PLATFORM_PROTECTION_RATE = 0.12;

const CHECKOUT_FALLBACKS = {
    en: {
        back: 'Back',
        title: 'Fixlife secure checkout',
        loading: 'Loading secure checkout...',
        error: 'Error',
        requestNotFound: 'Request not found',
        requestNotFoundDescription: "We couldn't load the details for this payment.",
        goBack: 'Go back',
        securePayment: 'Secure payment',
        chooseMethod: 'Choose your payment method',
        paypalDescription: "Redirects to PayPal's secure checkout.",
        cashOnCompletion: 'Cash on completion',
        cashDescription: 'Pay the professional directly once the job is done.',
        virtualWallet: 'Virtual wallet',
        comingSoon: 'Coming soon.',
        active: 'Active',
        soon: 'Soon',
        sessionExpiredPaypal: 'Your session expired before PayPal confirmation could finish.',
        paypalConfirmError: 'Could not confirm PayPal payment.',
        paypalSuccessMessage: 'PayPal payment secured successfully. Your electronic invoice was sent to your email.',
        paypalSuccessToast: 'PayPal payment confirmed. Your professional can now start the job.',
        paypalNetworkError: 'Network error confirming PayPal payment.',
        paypalNetworkRetry: 'The connection dropped while we were confirming your PayPal payment. Please retry.',
        paypalCancelled: 'PayPal payment was cancelled. You can retry when ready.',
        paypalMissingToken: 'PayPal returned without an order token. Please try payment again.',
        loginRequired: 'Login required.',
        sessionExpiredCheckout: 'Your session expired before checkout could start.',
        wompiSoon: 'Wompi will be available soon. Please use PayPal for now.',
        walletSoon: 'Virtual Wallet will be available soon. Please use PayPal or cash for now.',
        alreadySecured: 'This request already has a secured payment.',
        alreadySecuredWorker: 'This request already has a secured payment. Your professional can continue with the job.',
        cashSelectError: 'Could not select cash payment.',
        cashReservedMessage: 'Cash payment reserved. Your invoice was sent to your email. Pay the professional directly once the job is finished.',
        cashReservedToast: 'Cash payment reserved. Booking secured.',
        cashNetworkError: 'Network error selecting cash payment.',
        cashNetworkRetry: 'The connection dropped while selecting cash payment. Please retry.',
        initPaymentError: 'Could not initialize payment.',
        paypalApprovalMissing: 'PayPal did not return an approval link. Please try again.',
        unsafeRedirect: 'Payment provider returned an unsafe redirect. Please retry checkout.',
        paymentNetworkError: 'Network error processing payment.',
        paymentNetworkRetry: 'The connection dropped while we were processing the payment. You can retry safely.',
        serverPaymentError: 'We could not finish confirming the payment because of a temporary server issue. Please try again.',
        paymentAlreadySecured: 'Payment already secured for this request.',
        visitPayment: 'Visit payment',
        protectedNow: 'Protected now',
        platformProtection: 'Platform protection',
        proRelease: 'Professional release',
        commission: '{{rate}}% commission',
        releasedAfterJob: 'Released after the job is confirmed complete.',
        commissionPolicy: 'Commission policy',
        paymentsSecure: 'Payments are secure and encrypted',
        scheduledVisit: 'Scheduled visit',
        expressService: 'Express service',
        paymentComplete: 'Payment complete',
        checkoutIssue: 'Checkout issue',
        bookingSecured: 'Booking secured',
        paymentNeedsRetry: 'Payment needs one more try',
        requestRecap: 'Request recap',
        charge: 'Charge',
        reference: 'Reference',
        sandboxBooking: 'Sandbox booking',
        keepReference: 'Keep this reference if you need support later.',
        status: 'Status',
        fundsSecured: 'Funds secured',
        retryAvailable: 'Retry available',
        continueFlow: 'The request can now continue into the active job flow.',
        bookingSafe: 'Your booking is still safe. You can retry the payment from here.',
        tryAgain: 'Try again',
        backToRequests: 'Back to requests',
        returningAutomatically: 'Returning automatically',
        currentPolicyProtected: 'Protected with the current platform fee policy.',
    },
    es: {
        back: 'Volver',
        title: 'Pago seguro de Fixlife',
        loading: 'Cargando pasarela de pago segura...',
        error: 'Error',
        requestNotFound: 'No se encontró la solicitud',
        requestNotFoundDescription: 'No pudimos cargar los detalles de este pago.',
        goBack: 'Volver',
        securePayment: 'Pago seguro',
        chooseMethod: 'Elige tu método de pago',
        paypalDescription: 'Te redirige al pago seguro de PayPal.',
        cashOnCompletion: 'Efectivo al finalizar',
        cashDescription: 'Paga directamente al profesional cuando el trabajo termine.',
        virtualWallet: 'Billetera virtual',
        comingSoon: 'Próximamente.',
        active: 'Activo',
        soon: 'Pronto',
        sessionExpiredPaypal: 'Tu sesión venció antes de terminar la confirmación con PayPal.',
        paypalConfirmError: 'No se pudo confirmar el pago de PayPal.',
        paypalSuccessMessage: 'Pago con PayPal asegurado correctamente. Enviamos tu factura electrónica a tu correo.',
        paypalSuccessToast: 'Pago con PayPal confirmado. Tu profesional ya puede iniciar el trabajo.',
        paypalNetworkError: 'Error de red al confirmar el pago de PayPal.',
        paypalNetworkRetry: 'La conexión se interrumpió mientras confirmábamos tu pago con PayPal. Inténtalo de nuevo.',
        paypalCancelled: 'El pago con PayPal fue cancelado. Puedes reintentarlo cuando quieras.',
        paypalMissingToken: 'PayPal regresó sin el código de orden. Intenta pagar de nuevo.',
        loginRequired: 'Debes iniciar sesión.',
        sessionExpiredCheckout: 'Tu sesión venció antes de iniciar el pago.',
        wompiSoon: 'Wompi estará disponible pronto. Por ahora usa PayPal.',
        walletSoon: 'La billetera virtual estará disponible pronto. Por ahora usa PayPal o efectivo.',
        alreadySecured: 'Esta solicitud ya tiene un pago asegurado.',
        alreadySecuredWorker: 'Esta solicitud ya tiene un pago asegurado. Tu profesional puede continuar con el trabajo.',
        cashSelectError: 'No se pudo seleccionar el pago en efectivo.',
        cashReservedMessage: 'Pago en efectivo reservado. Enviamos tu factura a tu correo. Paga directamente al profesional cuando el trabajo termine.',
        cashReservedToast: 'Pago en efectivo reservado. Solicitud asegurada.',
        cashNetworkError: 'Error de red al seleccionar pago en efectivo.',
        cashNetworkRetry: 'La conexión se interrumpió al seleccionar el pago en efectivo. Inténtalo de nuevo.',
        initPaymentError: 'No se pudo iniciar el pago.',
        paypalApprovalMissing: 'PayPal no devolvió un enlace de aprobación. Intenta de nuevo.',
        unsafeRedirect: 'El proveedor de pago devolvió una redirección no segura. Reintenta el pago.',
        paymentNetworkError: 'Error de red al procesar el pago.',
        paymentNetworkRetry: 'La conexión se interrumpió mientras procesábamos el pago. Puedes reintentar con seguridad.',
        serverPaymentError: 'No pudimos terminar la confirmación del pago por un problema temporal del servidor. Inténtalo de nuevo.',
        paymentAlreadySecured: 'El pago ya fue asegurado para esta solicitud.',
        visitPayment: 'Pago de visita',
        protectedNow: 'Protegido ahora',
        platformProtection: 'Protección de la plataforma',
        proRelease: 'Liberación al profesional',
        commission: '{{rate}}% de comisión',
        releasedAfterJob: 'Se libera después de confirmar que el trabajo se completó.',
        commissionPolicy: 'Política de comisión',
        paymentsSecure: 'Los pagos son seguros y cifrados',
        scheduledVisit: 'Visita programada',
        expressService: 'Servicio exprés',
        paymentComplete: 'Pago completado',
        checkoutIssue: 'Problema en el pago',
        bookingSecured: 'Solicitud asegurada',
        paymentNeedsRetry: 'El pago necesita un intento más',
        requestRecap: 'Resumen de la solicitud',
        charge: 'Cobro',
        reference: 'Referencia',
        sandboxBooking: 'Reserva de prueba',
        keepReference: 'Guarda esta referencia si luego necesitas soporte.',
        status: 'Estado',
        fundsSecured: 'Fondos asegurados',
        retryAvailable: 'Reintento disponible',
        continueFlow: 'La solicitud ya puede continuar al flujo activo del servicio.',
        bookingSafe: 'Tu solicitud sigue segura. Puedes reintentar el pago desde aquí.',
        tryAgain: 'Intentar de nuevo',
        backToRequests: 'Volver a mis solicitudes',
        returningAutomatically: 'Regresando automáticamente',
        currentPolicyProtected: 'Protegido con la política actual de comisión de la plataforma.',
    },
} as const;

const interpolateFallback = (template: string, options?: Record<string, unknown>) =>
    Object.entries(options || {}).reduce(
        (value, [key, replacement]) => value.replaceAll(`{{${key}}}`, String(replacement ?? '')),
        template
    );

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
        return (
            url.protocol === 'https:' &&
            (hostname === 'paypal.com' || hostname === 'www.paypal.com' || hostname.endsWith('.paypal.com'))
        );
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
        );``
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
    const { t: translate, i18n } = useTranslation();
    const t = useCallback((key: string, options?: Record<string, unknown>) => {
        const translated = translate(key, options);
        if (!key.startsWith('auth.checkout.') || translated !== key) return translated;

        const checkoutKey = key.replace('auth.checkout.', '') as keyof typeof CHECKOUT_FALLBACKS.en;
        const fallbackLanguage = i18n.language.startsWith('es') ? 'es' : 'en';
        const fallback = CHECKOUT_FALLBACKS[fallbackLanguage][checkoutKey] || CHECKOUT_FALLBACKS.en[checkoutKey];
        return fallback ? interpolateFallback(fallback, options) : key;
    }, [i18n.language, translate]);
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

    const amount = useMemo(() => getChargeAmount(request), [request]);
    const locationMeta = useMemo(() => getLocationMeta(request?.location_text || ''), [request?.location_text]);
    const scheduledWindow = useMemo(() => formatScheduledWindow(request), [request]);
    const localizedServiceName = useMemo(
        () => localizeClientServiceName(request?.service_name || '', i18n.language),
        [i18n.language, request?.service_name]
    );
    const bookingLabel = isScheduledRequest(request) ? t('auth.checkout.scheduledVisit') : t('auth.checkout.expressService');
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
        () => readString(request?.payment?.commission_snapshot?.policy_label) || t('auth.checkout.currentPolicyProtected'),
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
                    notyf.error(payload?.error || t('auth.checkout.requestNotFoundDescription'));
                    setRequest(null);
                    return;
                }

                const matchedRequest = payload.requests.find(
                    (item: MyServiceRequest) => Number(item.id_request) === Number(requestId)
                ) as MyServiceRequest | undefined;

                if (!matchedRequest) {
                    notyf.error(t('auth.checkout.requestNotFoundDescription'));
                    setRequest(null);
                    return;
                }

                setRequest(matchedRequest);
            } catch {
                notyf.error(t('auth.checkout.loading'));
                setRequest(null);
            } finally {
                setLoading(false);
            }
        };

        void fetchCheckoutRequest();
    }, [requestId, t]);

    const moveToErrorStage = (message: string) => {
        setCheckoutStage('error');
        setCheckoutMessage(message);
    };

    const handlePaypalReturnConfirmation = async (paypalOrderId: string) => {
        const token = getToken();
        if (!token || !request) {
            moveToErrorStage(t('auth.checkout.sessionExpiredPaypal'));
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
                const rawMessage = payPayload?.error || '';
                const message = rawMessage === 'Internal server error' ? t('auth.checkout.serverPaymentError') : rawMessage || t('auth.checkout.paypalConfirmError');
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
            setCheckoutMessage(t('auth.checkout.paypalSuccessMessage'));
            notyf.success(t('auth.checkout.paypalSuccessToast'));
        } catch {
            notyf.error(t('auth.checkout.paypalNetworkError'));
            moveToErrorStage(t('auth.checkout.paypalNetworkRetry'));
        } finally {
            setIsPaying(false);
        }
    };

    useEffect(() => {
        if (loading || !requestId || !request) return;

        const params = new URLSearchParams(location.search);
        const paypalState = readString(params.get('paypal')).toLowerCase();
        if (!paypalState) return;

        if (paypalState === 'cancel') {
            if (!paypalReturnHandledRef.current) {
                notyf.open({
                    type: 'info',
                    message: t('auth.checkout.paypalCancelled'),
                    background: '#1d4ed8',
                });
            }
            paypalReturnHandledRef.current = true;
            navigate(`/checkout/${request.id_request}`, { replace: true });
            return;
        }

        if (paypalState === 'success') {
            const tokenFromUrl = readString(params.get('token'));
            if (!tokenFromUrl) {
                moveToErrorStage(t('auth.checkout.paypalMissingToken'));
                navigate(`/checkout/${request.id_request}`, { replace: true });
                return;
            }
            if (paypalReturnHandledRef.current || isAlreadyPaid) return;
            paypalReturnHandledRef.current = true;
            void handlePaypalReturnConfirmation(tokenFromUrl);
        }
    }, [loading, requestId, request, isAlreadyPaid, location.search, navigate]);

    const handleSecurePayment = async (selectedMethod: CheckoutPaymentMethod = paymentMethod) => {
        if (isPaying) return;
        const token = getToken();
        if (!token || !request) {
            notyf.error(t('auth.checkout.loginRequired'));
            moveToErrorStage(t('auth.checkout.sessionExpiredCheckout'));
            return;
        }
        if (selectedMethod === 'wompi') {
            notyf.open({
                type: 'info',
                message: t('auth.checkout.wompiSoon'),
                background: '#1d4ed8',
            });
            return;
        }
        if (selectedMethod === 'virtual_wallet') {
            notyf.open({
                type: 'info',
                message: t('auth.checkout.walletSoon'),
                background: '#1d4ed8',
            });
            return;
        }
        if (selectedMethod === 'cash') {
            if (isAlreadyPaid) {
                notyf.open({
                    type: 'info',
                    message: t('auth.checkout.alreadySecured'),
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
                    const rawMessage = checkoutPayload?.error || '';
                    const message = rawMessage === 'Internal server error' ? t('auth.checkout.serverPaymentError') : rawMessage || t('auth.checkout.cashSelectError');
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
                setCheckoutMessage(t('auth.checkout.cashReservedMessage'));
                notyf.success(t('auth.checkout.cashReservedToast'));
            } catch {
                notyf.error(t('auth.checkout.cashNetworkError'));
                moveToErrorStage(t('auth.checkout.cashNetworkRetry'));
            } finally {
                setIsPaying(false);
            }
            return;
        }
        if (isAlreadyPaid) {
            notyf.open({
                type: 'info',
                message: t('auth.checkout.alreadySecured'),
                background: '#1d4ed8',
            });
            setCheckoutStage('success');
            setCheckoutMessage(t('auth.checkout.alreadySecuredWorker'));
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
                    return_url: `${window.location.origin}/checkout/${request.id_request}?paypal=success`,
                    cancel_url: `${window.location.origin}/checkout/${request.id_request}?paypal=cancel`,
                    payer: {
                        full_name: authName || '',
                        email: authEmail || '',
                    },
                }),
            });
            const checkoutPayload = await checkoutRes.json();
            if (!checkoutRes.ok || !checkoutPayload?.success) {
                const rawMessage = checkoutPayload?.error || '';
                const message = rawMessage === 'Internal server error' ? t('auth.checkout.serverPaymentError') : rawMessage || t('auth.checkout.initPaymentError');
                notyf.error(message);
                moveToErrorStage(message);
                return;
            }
            const approvalUrl = readString(checkoutPayload?.checkout?.approval_url);
            if (!approvalUrl) {
                moveToErrorStage(t('auth.checkout.paypalApprovalMissing'));
                return;
            }
            if (!isAllowedPaymentRedirect(approvalUrl)) {
                moveToErrorStage(t('auth.checkout.unsafeRedirect'));
                return;
            }

            window.location.href = approvalUrl;
            return;
        } catch {
            notyf.error(t('auth.checkout.paymentNetworkError'));
            moveToErrorStage(t('auth.checkout.paymentNetworkRetry'));
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
                {checkoutStage === 'success' ? t('auth.checkout.paymentComplete') : t('auth.checkout.checkoutIssue')}
            </p>
            <h2 className="mt-3 text-3xl font-black text-slate-950">
                {checkoutStage === 'success' ? t('auth.checkout.bookingSecured') : t('auth.checkout.paymentNeedsRetry')}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">
                {checkoutMessage}
            </p>

            <div className="mt-7 rounded-[28px] border border-slate-200 bg-slate-50 p-5 text-left">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{t('auth.checkout.requestRecap')}</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                        <p className="text-sm font-black text-slate-900">{localizedServiceName}</p>
                        <p className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-blue-600">{bookingLabel}</p>
                        {scheduledWindow && <p className="mt-1 text-sm font-semibold text-slate-600">{scheduledWindow}</p>}
                        <p className="mt-1 text-sm text-slate-500">{locationMeta.primary}</p>
                        <p className="mt-1 text-xs text-slate-400">{locationMeta.secondary}</p>
                    </div>
                    <div className="text-left sm:text-right">
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{t('auth.checkout.charge')}</p>
                        <p className="mt-2 text-3xl font-black text-slate-950">${amount.toFixed(2)}</p>
                    </div>
                </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[24px] border border-slate-200 bg-white/85 p-4 text-left shadow-sm">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{t('auth.checkout.reference')}</p>
                    <p className="mt-2 text-base font-black text-slate-950">
                        {request?.payment?.checkout_reference || t('auth.checkout.sandboxBooking')}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{t('auth.checkout.keepReference')}</p>
                </div>
                <div className="rounded-[24px] border border-slate-200 bg-white/85 p-4 text-left shadow-sm">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{t('auth.checkout.status')}</p>
                    <p className="mt-2 text-base font-black text-slate-950">
                        {checkoutStage === 'success' ? t('auth.checkout.fundsSecured') : t('auth.checkout.retryAvailable')}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                        {checkoutStage === 'success'
                            ? t('auth.checkout.continueFlow')
                            : t('auth.checkout.bookingSafe')}
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
                        {t('auth.checkout.tryAgain')}
                    </button>
                )}
                <button
                    type="button"
                    onClick={onBack}
                    className="rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-black text-slate-700 hover:border-slate-300"
                >
                    {t('auth.checkout.backToRequests')}
                </button>
            </div>

            {checkoutStage === 'success' && (
                <div className="mx-auto mt-6 max-w-md">
                    <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600">
                        <span>{t('auth.checkout.returningAutomatically')}</span>
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
            <div className="w-full max-w-xl">
                <button
                    type="button"
                    onClick={onBack}
                    className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors"
                >
                    <span className="text-lg leading-none">&larr;</span>
                    {t('auth.checkout.back')}
                </button>

                {loading ? (
                    <div className="rounded-[32px] bg-white p-8 shadow-sm border border-slate-100 flex flex-col items-center justify-center min-h-[400px]">
                         <div className="h-8 w-8 rounded-full border-4 border-slate-100 border-t-bird-blue animate-spin" />
                         <p className="mt-4 text-sm font-semibold text-slate-500">{t('auth.checkout.loading')}</p>
                    </div>
                ) : !request ? (
                    <div className="rounded-[32px] bg-white p-10 text-center shadow-sm border border-slate-100">
                        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">{t('auth.checkout.error')}</p>
                        <h1 className="mt-3 text-2xl font-black text-slate-900">{t('auth.checkout.requestNotFound')}</h1>
                        <p className="mt-2 text-sm text-slate-500">{t('auth.checkout.requestNotFoundDescription')}</p>
                        <button
                            type="button"
                            onClick={onBack}
                            className="mt-6 rounded-2xl bg-bird-blue px-6 py-3 text-sm font-black text-slate-900 hover:bg-bird-darkBlue transition"
                        >
                            {t('auth.checkout.goBack')}
                        </button>
                    </div>
                ) : checkoutStage === 'form' ? (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-[32px] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden dark:bg-slate-900/80 dark:border-white/10 dark:shadow-black/40"
                    >
                        <div className="p-8 pb-6 border-b border-slate-100">
                            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400 text-center">{t('auth.checkout.securePayment')}</p>
                            <h1 className="mt-4 text-3xl font-black text-slate-900 text-center">{t('auth.checkout.title')}</h1>
                            <p className="mt-2 text-sm text-slate-500 text-center">{localizedServiceName}</p>
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

                        <div className="p-8 bg-slate-50/50">
                            <p className="text-[12px] font-bold text-slate-500 mb-4 text-center">{t('auth.checkout.chooseMethod')}</p>

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
                                        <span className="block text-sm font-black text-slate-900">PayPal</span>
                                        <span className="mt-0.5 block text-xs font-semibold text-slate-500">{t('auth.checkout.paypalDescription')}</span>
                                    </span>
                                    <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                                        {t('auth.checkout.active')}
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setPaymentMethod('wompi');
                                        void handleSecurePayment('wompi');
                                    }}
                                    disabled={isPaying || isAlreadyPaid}
                                    className="w-full flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black">
                                        <span className="text-xs font-black text-white tracking-tight">wompi.</span>
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-black text-slate-900">Wompi</span>
                                        <span className="mt-0.5 block text-xs font-semibold text-slate-500">{t('auth.checkout.comingSoon')}</span>
                                    </span>
                                    <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-700">
                                        {t('auth.checkout.soon')}
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
                                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                                                <rect x="2" y="6" width="20" height="12" rx="2" />
                                                <circle cx="12" cy="12" r="2.5" />
                                            </svg>
                                        )}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-black text-slate-900">{t('auth.checkout.cashOnCompletion')}</span>
                                        <span className="mt-0.5 block text-xs font-semibold text-slate-500">{t('auth.checkout.cashDescription')}</span>
                                    </span>
                                    <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                                        {t('auth.checkout.active')}
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setPaymentMethod('virtual_wallet');
                                        void handleSecurePayment('virtual_wallet');
                                    }}
                                    disabled={isPaying || isAlreadyPaid}
                                    className="w-full flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white">
                                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2 2 0 00-2-2h-1.5a1.5 1.5 0 000 3H19a2 2 0 002-2zM3 7v10a2 2 0 002 2h14a2 2 0 002-2v-6a2 2 0 00-2-2H5a2 2 0 01-2-2zm0 0a2 2 0 012-2h12" />
                                        </svg>
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-black text-slate-900">{t('auth.checkout.virtualWallet')}</span>
                                        <span className="mt-0.5 block text-xs font-semibold text-slate-500">{t('auth.checkout.comingSoon')}</span>
                                    </span>
                                    <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-700">
                                        {t('auth.checkout.soon')}
                                    </span>
                                </button>
                            </div>

                            {isAlreadyPaid && (
                                <p className="mt-4 text-center text-sm font-bold text-emerald-600">
                                    {t('auth.checkout.paymentAlreadySecured')}
                                </p>
                            )}

                            <div className="mt-5 grid gap-3 rounded-[24px] border border-slate-200 bg-white/80 p-4 sm:grid-cols-3">
                                <div className="min-w-0 rounded-2xl bg-slate-50/80 p-3">
                                    <p className="text-[10px] font-black uppercase leading-4 tracking-[0.08em] text-slate-400">{isScheduledRequest(request) ? t('auth.checkout.visitPayment') : t('auth.checkout.protectedNow')}</p>
                                    <p className="mt-2 text-lg font-black text-slate-950">
                                        ${amount.toFixed(2)} <span className="text-xs font-bold text-slate-400">{displayCurrency}</span>
                                    </p>
                                </div>
                                <div className="min-w-0 rounded-2xl bg-slate-50/80 p-3">
                                    <p className="text-[10px] font-black uppercase leading-4 tracking-[0.08em] text-slate-400">{t('auth.checkout.platformProtection')}</p>
                                    <p className="mt-2 text-lg font-black text-slate-950">${platformFee.toFixed(2)}</p>
                                    <p className="mt-1 text-[11px] text-slate-500">{t('auth.checkout.commission', { rate: (commissionRate * 100).toFixed(1) })}</p>
                                </div>
                                <div className="min-w-0 rounded-2xl bg-slate-50/80 p-3">
                                    <p className="text-[10px] font-black uppercase leading-4 tracking-[0.08em] text-slate-400">{t('auth.checkout.proRelease')}</p>
                                    <p className="mt-2 text-lg font-black text-slate-950">${workerPayout.toFixed(2)}</p>
                                    <p className="mt-1 text-[11px] text-slate-500">{t('auth.checkout.releasedAfterJob')}</p>
                                </div>
                            </div>
                            <div className="mt-3 rounded-[22px] border border-slate-200 bg-white/70 p-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{t('auth.checkout.commissionPolicy')}</p>
                                <p className="mt-2 text-sm font-semibold text-slate-700">{commissionLabel}</p>
                                {appliedCommissionRules && (
                                    <p className="mt-1 text-xs text-slate-500">{appliedCommissionRules}</p>
                                )}
                            </div>

                            <div className="mt-6 flex items-center justify-center gap-2 opacity-50">
                                <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                                <span className="text-xs font-semibold text-slate-500">{t('auth.checkout.paymentsSecure')}</span>
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



