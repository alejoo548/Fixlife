import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    CalendarClock,
    Loader2,
    MapPin,
    Receipt,
    ShieldAlert,
    ShieldCheck,
    Sparkles,
    Star,
    User2,
    XCircle,
    AlertTriangle,
} from 'lucide-react';
import { API_ENDPOINTS } from '../config/api';
import { getToken } from '../utils/session';
import { showSweetToast, showSweetConfirm } from '../utils/sweetAlert';
import { normalizeImageUrl } from '../utils/imageUrls';
import WorkerRatingModal from '../components/modals/WorkerRatingModal';
import { ServiceReportModal } from '../components/shared/ServiceReportModal';
import { useTranslation } from 'react-i18next';
import { localizeClientServiceDescription, localizeClientServiceName } from '../utils/clientTranslations';

type RequestStatus =
    | 'pending'
    | 'assigned'
    | 'route_in_progress'
    | 'arrived'
    | 'start_pending'
    | 'in_progress'
    | 'finish_pending'
    | 'payment_pending'
    | 'paid'
    | 'completion_pending'
    | 'awaiting_confirmation'
    | 'done'
    | 'cancelled';

interface AssignedWorker {
    id_worker_profile: number;
    name: string;
    profile_image_url?: string | null;
}

interface Payment {
    provider: string;
    checkout_reference: string | null;
    currency_code: string;
    amount: number;
    platform_fee: number | null;
    worker_payout: number | null;
    status: string;
    paid_at: string | null;
    released_at: string | null;
}

interface MyServiceRequest {
    id_request: number;
    id_service: number;
    service_name: string;
    service_icon: string | null;
    description: string;
    location_text: string;
    budget: number;
    final_budget: number | null;
    booking_type: string;
    scheduled_date: string | null;
    scheduled_time: string | null;
    scheduled_start_time: string | null;
    status: RequestStatus | string;
    created_at: string;
    assigned_worker: AssignedWorker | null;
    payment: Payment | null;
    has_rating?: boolean;
}

type FilterKey = 'all' | 'active' | 'completed' | 'cancelled';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'completed', label: 'Completed' },
    { key: 'cancelled', label: 'Cancelled' },
];

const bucketOf = (status: string): FilterKey => {
    const s = String(status || '').toLowerCase();
    if (s === 'done') return 'completed';
    if (s === 'cancelled') return 'cancelled';
    return 'active';
};

const statusLabel = (status: string, t: (key: string) => string) => {
    const s = String(status || '').toLowerCase();
    const key = `common.serviceHistory.status.${s}`;
    const label = t(key);
    if (label !== key) return label;
    return s.charAt(0).toUpperCase() + s.slice(1);
};

const paymentStatusLabel = (status: string | null | undefined, t: (key: string) => string) => {
    const s = String(status || 'pending').toLowerCase();
    const key = `common.serviceHistory.paymentStatus.${s}`;
    const label = t(key);
    if (label !== key) return label;
    return s.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

const statusTone = (status: string) => {
    const s = String(status || '').toLowerCase();
    if (s === 'done') return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-900/50';
    if (s === 'cancelled') return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-900/50';
    if (s === 'paid') return 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/40 dark:text-cyan-300 dark:border-cyan-900/50';
    if (s === 'payment_pending') return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-900/50';
    if (s === 'in_progress' || s === 'route_in_progress' || s === 'arrived') return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-900/50';
    return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/[0.06] dark:text-slate-400 dark:border-white/10';
};

const money = (value: number, currency = 'USD', language = 'en-US') =>
    Number(value || 0).toLocaleString(language, { style: 'currency', currency });

const formatDate = (iso: string, language = 'en-US') => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(language, { month: 'short', day: 'numeric', year: 'numeric' });
};

const paymentDisplayAmount = (request: MyServiceRequest) => {
    if (request.payment && request.payment.amount != null) return Number(request.payment.amount);
    if (request.final_budget != null) return Number(request.final_budget);
    return Number(request.budget || 0);
};

interface Props {
    onOpenReview?: (request: MyServiceRequest) => void;
    onGoHome?: () => void;
}

const MyServicesHistory: React.FC<Props> = ({ onOpenReview, onGoHome }) => {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const [requests, setRequests] = useState<MyServiceRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<FilterKey>('all');
    const [cancelBusy, setCancelBusy] = useState<number | null>(null);
    const [ratingRequest, setRatingRequest] = useState<MyServiceRequest | null>(null);
    const [reportRequest, setReportRequest] = useState<MyServiceRequest | null>(null);
    const [selectedWorkerProfile, setSelectedWorkerProfile] = useState<{
        worker: any;
        portfolio: any[];
        requestId: number;
    } | null>(null);
    const [workerProfileLoading, setWorkerProfileLoading] = useState(false);
    const [fetchingWorkerId, setFetchingWorkerId] = useState<number | null>(null);

    const handleOpenWorkerProfile = async (idRequest: number) => {
        const token = getToken();
        if (!token) return;
        setWorkerProfileLoading(true);
        setFetchingWorkerId(idRequest);
        try {
            const res = await fetch(API_ENDPOINTS.services.requestWorkerProfile(idRequest), {
                headers: { Authorization: `Bearer ${token}` },
            });
            const payload = await res.json().catch(() => ({}));
            if (res.ok && payload.success && payload.worker) {
                setSelectedWorkerProfile({
                    worker: payload.worker,
                    portfolio: Array.isArray(payload.portfolio) ? payload.portfolio : [],
                    requestId: idRequest,
                });
            } else {
                showSweetToast({ tone: 'error', message: payload?.error || t('common.serviceHistory.errors.workerProfileLoadError') });
            }
        } catch {
            showSweetToast({ tone: 'error', message: t('common.serviceHistory.errors.workerProfileError') });
        } finally {
            setWorkerProfileLoading(false);
            setFetchingWorkerId(null);
        }
    };

    const loadRequests = async (silent = false) => {
        const token = getToken();
        if (!token) {
            setError(t('common.serviceHistory.errors.loginRequired'));
            setLoading(false);
            return;
        }
        if (!silent) setLoading(true);
        try {
            const res = await fetch(`${API_ENDPOINTS.services.myRequests}?status=all`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const payload = await res.json();
            if (!res.ok || !payload?.success || !Array.isArray(payload?.requests)) {
                setError(payload?.error || t('common.serviceHistory.errors.loadError'));
                return;
            }
            setRequests(payload.requests as MyServiceRequest[]);
            setError(null);
        } catch {
            setError(t('common.serviceHistory.errors.networkLoadError'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadRequests();
    }, []);

    const summary = useMemo(() => {
        let totalSpent = 0;
        let completed = 0;
        let active = 0;
        let cancelled = 0;
        for (const r of requests) {
            const bucket = bucketOf(r.status);
            if (bucket === 'completed') completed += 1;
            else if (bucket === 'cancelled') cancelled += 1;
            else active += 1;

            const paymentStatus = String(r.payment?.status || '').toLowerCase();
            if (['paid', 'released'].includes(paymentStatus)) {
                totalSpent += paymentDisplayAmount(r);
            }
        }
        return { totalSpent, completed, active, cancelled, total: requests.length };
    }, [requests]);

    const filtered = useMemo(() => {
        return requests.filter((r) => {
            if (filter !== 'all' && bucketOf(r.status) !== filter) return false;
            return true;
        });
    }, [requests, filter]);

    const filterCounts = useMemo(
        () => ({
            all: requests.length,
            active: summary.active,
            completed: summary.completed,
            cancelled: summary.cancelled,
        }),
        [requests.length, summary]
    );

    const handleCancel = async (request: MyServiceRequest) => {
        const s = String(request.status || '').toLowerCase();
        if (!['pending', 'assigned', 'payment_pending'].includes(s)) {
            showSweetToast({ tone: 'error', message: t('common.serviceHistory.errors.cancelUnavailable') });
            return;
        }
        const confirmed = await showSweetConfirm({
            title: t('common.serviceHistory.confirm.cancelTitle'),
            message: t('common.serviceHistory.confirm.cancelMessage', { id: request.id_request, service: request.service_name }),
            tone: 'warning',
            confirmText: t('common.serviceHistory.confirm.cancelAction'),
        });
        if (!confirmed) return;

        const token = getToken();
        if (!token) return;
        setCancelBusy(request.id_request);
        try {
            const res = await fetch(API_ENDPOINTS.services.cancelRequest(request.id_request), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok || !payload?.success) {
                showSweetToast({ tone: 'error', message: payload?.error || t('common.serviceHistory.errors.cancelError') });
                return;
            }
            showSweetToast({ tone: 'success', message: t('common.serviceHistory.messages.cancelled') });
            await loadRequests(true);
        } catch {
            showSweetToast({ tone: 'error', message: t('common.serviceHistory.errors.cancelNetworkError') });
        } finally {
            setCancelBusy(null);
        }
    };

    const handleBack = () => {
        if (onGoHome) {
            onGoHome();
            return;
        }
        navigate('/');
    };

    return (
        <div className="relative min-h-screen bg-transparent">
            <main className="relative mx-auto max-w-6xl px-4 pt-28 pb-24 sm:px-6 lg:px-8 lg:pt-40">
                <div className="mb-8">
                    <button
                        type="button"
                        onClick={handleBack}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500 backdrop-blur transition hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400 dark:hover:border-white/20 dark:hover:text-slate-100"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        {t('common.serviceHistory.back')}
                    </button>
                </div>

                {/* Hero */}
                <motion.section
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35 }}
                    className="relative overflow-hidden rounded-[32px] border border-white/70 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-800 p-8 text-white shadow-[0_24px_60px_rgba(15,23,42,0.16)] sm:p-10"
                >
                    <div
                        aria-hidden
                        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl"
                    />
                    <div
                        aria-hidden
                        className="pointer-events-none absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl"
                    />
                    <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
                        <div className="max-w-xl">
                            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-100 backdrop-blur">
                                <ShieldCheck className="h-3.5 w-3.5" />
                                {t('common.serviceHistory.badge')}
                            </div>
                            <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">
                                {t('common.serviceHistory.title')}
                            </h1>
                            <p className="mt-3 max-w-md text-sm font-medium text-slate-300 sm:text-base">
                                {t('common.serviceHistory.description')}
                            </p>
                        </div>
                        <div className="grid w-full max-w-md grid-cols-3 gap-3 lg:w-auto">
                            <HeroStat label={t('common.serviceHistory.stats.totalSpent')} value={money(summary.totalSpent, 'USD', i18n.language)} accent />
                            <HeroStat label={t('common.serviceHistory.stats.completed')} value={String(summary.completed)} />
                            <HeroStat label={t('common.serviceHistory.stats.active')} value={String(summary.active)} />
                        </div>
                    </div>
                </motion.section>

                {/* Filters */}
                <section className="mt-10">
                    <div className="inline-flex flex-wrap items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-white/10 dark:bg-slate-900/70">
                        {FILTERS.map((f) => {
                            const active = filter === f.key;
                            const count = filterCounts[f.key];
                            return (
                                <button
                                    key={f.key}
                                    type="button"
                                    onClick={() => setFilter(f.key)}
                                    aria-pressed={active}
                                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-[0.14em] transition ${
                                        active
                                            ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900'
                                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-100'
                                    }`}
                                >
                                    {t(`common.serviceHistory.filters.${f.key}`)}
                                    <span
                                        className={`inline-flex min-w-[1.4rem] items-center justify-center rounded-full px-2 py-[2px] text-[10px] font-black ${
                                            active ? 'bg-white/20 text-white dark:bg-slate-900/10 dark:text-slate-900' : 'bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-400'
                                        }`}
                                    >
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </section>

                {/* List */}
                <section className="mt-6">
                    {loading ? (
                        <LoadingState t={t} />
                    ) : error ? (
                        <ErrorState message={error} onRetry={() => void loadRequests()} t={t} />
                    ) : filtered.length === 0 ? (
                        <EmptyState filter={filter} onGoHome={handleBack} t={t} />
                    ) : (
                        <ul className="grid gap-4">
                            <AnimatePresence initial={false}>
                                {filtered.map((r) => (
                                    <motion.li
                                        key={r.id_request}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -8 }}
                                        transition={{ duration: 0.18 }}
                                    >
                                        <RequestCard
                                            request={r}
                                            cancelBusy={cancelBusy === r.id_request}
                                            fetchingWorkerId={fetchingWorkerId}
                                            onOpenWorkerProfile={(id) => void handleOpenWorkerProfile(id)}
                                            onCancel={() => void handleCancel(r)}
                                            onReview={() => {
                                                if (r.has_rating) {
                                                    showSweetToast({ tone: 'info', message: t('common.serviceHistory.errors.reviewedAlready') });
                                                    return;
                                                }
                                                onOpenReview?.(r);
                                                setRatingRequest(r);
                                            }}
                                            onReport={() => setReportRequest(r)}
                                            t={t}
                                            language={i18n.language}
                                        />
                                    </motion.li>
                                ))}
                            </AnimatePresence>
                        </ul>
                    )}
                </section>
            </main>

            <WorkerRatingModal
                request={ratingRequest}
                onClose={() => setRatingRequest(null)}
                onSubmitted={() => {
                    setRatingRequest(null);
                    void loadRequests(true);
                    showSweetToast({ tone: 'success', message: t('common.serviceHistory.messages.reviewSubmitted') });
                }}
            />

            <ServiceReportModal
                open={!!reportRequest}
                idRequest={reportRequest?.id_request || null}
                reporterRole="client"
                counterpartName={reportRequest?.assigned_worker?.name || null}
                onClose={() => setReportRequest(null)}
                onSubmitted={() => void loadRequests(true)}
            />

            {/* Worker Profile Modal */}
            <AnimatePresence>
                {selectedWorkerProfile && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.94, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 15 }}
                            className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-white/10"
                        >
                            {/* Sticky Header */}
                            <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-100 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-6 py-4">
                                <div className="flex items-center gap-3">
                                    <span className="flex h-3 w-3 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20 animate-pulse" />
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-bird-blue">{t('navbar.myRequestTracker.verifiedFixlifePro')}</p>
                                        <h3 className="text-xl font-black text-slate-950 dark:text-slate-100">{t('navbar.myRequestTracker.professionalProfilePortfolio')}</h3>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedWorkerProfile(null)}
                                    className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-950 dark:hover:text-white transition-all"
                                    aria-label={t('navbar.myRequestTracker.closeWorkerProfileAria')}
                                >
                                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <div className="p-6 sm:p-8 space-y-6">
                                {/* Top Hero Card */}
                                <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 dark:border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 p-6 text-white shadow-xl">
                                    <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-bird-blue/20 blur-3xl" />
                                    <div className="relative flex flex-col sm:flex-row items-center sm:items-start gap-5">
                                        <div className="relative shrink-0">
                                            {selectedWorkerProfile.worker.profile_image_url ? (
                                                <img
                                                    src={normalizeImageUrl(selectedWorkerProfile.worker.profile_image_url)}
                                                    alt={selectedWorkerProfile.worker.name}
                                                    className="h-24 w-24 rounded-2xl object-cover ring-4 ring-bird-blue/30 shadow-lg"
                                                />
                                            ) : (
                                                <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-bird-blue text-3xl font-black text-white ring-4 ring-bird-blue/30 shadow-lg">
                                                    {selectedWorkerProfile.worker.name.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white text-xs font-bold ring-2 ring-slate-950" title={t('navbar.myRequestTracker.verifiedProfessionalTitle')}>
                                                ✓
                                            </span>
                                        </div>

                                        <div className="min-w-0 text-center sm:text-left flex-1">
                                            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                                                <h2 className="text-2xl font-black tracking-tight text-white">{selectedWorkerProfile.worker.name}</h2>
                                                <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-3 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-300">
                                                    {t('navbar.myRequestTracker.verifiedIdentity')}
                                                </span>
                                            </div>
                                            <p className="mt-1 text-xs font-semibold text-slate-300">
                                                {t('navbar.myRequestTracker.fixlifePartnerPro')} • {selectedWorkerProfile.worker.experience_label || t('navbar.myRequestTracker.expertServiceProvider')}
                                            </p>

                                            {/* Phone contact if available */}
                                            {selectedWorkerProfile.worker.phone_number && (
                                                <a
                                                    href={`tel:${selectedWorkerProfile.worker.phone_number}`}
                                                    className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 px-3.5 py-1.5 text-xs font-bold text-slate-200 transition"
                                                >
                                                    <svg className="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                                    </svg>
                                                    {selectedWorkerProfile.worker.phone_number}
                                                </a>
                                            )}
                                        </div>

                                        <div className="shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const reqId = selectedWorkerProfile.requestId;
                                                    setSelectedWorkerProfile(null);
                                                    navigate(`/?request=${reqId}`);
                                                }}
                                                className="inline-flex items-center gap-2 rounded-xl bg-bird-blue hover:bg-bird-darkBlue px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg transition active:scale-95"
                                            >
                                                <Sparkles className="h-4 w-4" />
                                                {t('common.serviceHistory.card.openLiveTracker')}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Quick Stats Grid */}
                                    <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-white/10 pt-5">
                                        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center sm:text-left">
                                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('navbar.myRequestTracker.rating')}</p>
                                            <p className="mt-1 text-xl font-black text-amber-300 flex items-center justify-center sm:justify-start gap-1">
                                                <span>★</span>
                                                <span>{selectedWorkerProfile.worker.rating_average != null ? Number(selectedWorkerProfile.worker.rating_average).toFixed(1) : '5.0'}</span>
                                            </p>
                                            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{t('navbar.myRequestTracker.clientReviews', { count: selectedWorkerProfile.worker.rating_count || 0 })}</p>
                                        </div>

                                        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center sm:text-left">
                                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('navbar.myRequestTracker.completedJobs')}</p>
                                            <p className="mt-1 text-xl font-black text-emerald-400">{selectedWorkerProfile.worker.completed_jobs || 0}</p>
                                            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{t('navbar.myRequestTracker.onFixlifePlatform')}</p>
                                        </div>

                                        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center sm:text-left">
                                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('navbar.myRequestTracker.experience')}</p>
                                            <p className="mt-1 text-base font-black text-sky-300 truncate">{selectedWorkerProfile.worker.experience_label || t('navbar.myRequestTracker.verifiedLevel')}</p>
                                            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{t('navbar.myRequestTracker.backgroundChecked')}</p>
                                        </div>

                                        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center sm:text-left">
                                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('navbar.myRequestTracker.portfolio')}</p>
                                            <p className="mt-1 text-xl font-black text-indigo-300">{Array.isArray(selectedWorkerProfile.portfolio) ? selectedWorkerProfile.portfolio.length : 0}</p>
                                            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{t('navbar.myRequestTracker.projectSamples')}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Services Offered Badges */}
                                {Array.isArray(selectedWorkerProfile.worker.services_offered) && selectedWorkerProfile.worker.services_offered.length > 0 && (
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">{t('navbar.myRequestTracker.specializedServices')}</p>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedWorkerProfile.worker.services_offered.map((svc: string, i: number) => (
                                                <span key={i} className="rounded-xl border border-bird-blue/20 bg-bird-blue/10 dark:bg-bird-blue/20 px-3 py-1.5 text-xs font-bold text-bird-blue dark:text-sky-300">
                                                    🛠️ {svc}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Biography */}
                                <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-slate-800/50 p-5">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">{t('navbar.myRequestTracker.aboutWorker', { name: selectedWorkerProfile.worker.name })}</p>
                                    <p className="text-sm font-medium leading-relaxed text-slate-700 dark:text-slate-300 italic">
                                        "{selectedWorkerProfile.worker.bio || t('navbar.myRequestTracker.defaultBio')}"
                                    </p>
                                </div>

                                {/* Portfolio & Work Samples Gallery */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-base font-black text-slate-950 dark:text-slate-100 flex items-center gap-2">
                                            <span>📸</span>
                                            {t('navbar.myRequestTracker.workPortfolioPhotos')}
                                        </h4>
                                        <span className="text-xs font-bold text-slate-400">
                                            {t('navbar.myRequestTracker.photosCount', { count: Array.isArray(selectedWorkerProfile.portfolio) ? selectedWorkerProfile.portfolio.length : 0 })}
                                        </span>
                                    </div>

                                    {Array.isArray(selectedWorkerProfile.portfolio) && selectedWorkerProfile.portfolio.length > 0 ? (
                                        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                                            {selectedWorkerProfile.portfolio.map((photo: any, index: number) => (
                                                <figure
                                                    key={photo.id_portfolio || photo.id_photo || index}
                                                    className="group overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 shadow-sm transition hover:shadow-lg hover:border-bird-blue/40"
                                                >
                                                    {photo.image_url ? (
                                                        <div className="relative h-44 w-full overflow-hidden bg-slate-100 dark:bg-slate-900">
                                                            <img
                                                                src={normalizeImageUrl(photo.image_url)}
                                                                alt={photo.description || t('navbar.myRequestTracker.portfolioSampleAlt')}
                                                                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div className="grid h-44 place-items-center bg-slate-100 dark:bg-slate-900 text-xs font-bold text-slate-400">{t('navbar.myRequestTracker.noImage')}</div>
                                                    )}
                                                    {photo.description && (
                                                        <figcaption className="line-clamp-2 p-3 text-xs font-semibold text-slate-700 dark:text-slate-300 border-t border-slate-100 dark:border-white/5">
                                                            {photo.description}
                                                        </figcaption>
                                                    )}
                                                </figure>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/50 p-8 text-center">
                                            <p className="text-sm font-black text-slate-700 dark:text-slate-300">{t('navbar.myRequestTracker.noPortfolioPhotos')}</p>
                                            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                                {t('navbar.myRequestTracker.ratingVerifiesQuality')}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const HeroStat: React.FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent = false }) => (
    <div
        className={`rounded-2xl border p-3 backdrop-blur ${
            accent ? 'border-cyan-300/30 bg-cyan-400/10' : 'border-white/10 bg-white/[0.06]'
        }`}
    >
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/80">{label}</p>
        <p className={`mt-2 truncate text-xl font-black ${accent ? 'text-cyan-300' : 'text-white'}`}>{value}</p>
    </div>
);

const RequestCard: React.FC<{
    request: MyServiceRequest;
    cancelBusy: boolean;
    fetchingWorkerId: number | null;
    onOpenWorkerProfile: (idRequest: number) => void;
    onCancel: () => void;
    onReview: () => void;
    onReport: () => void;
    t: (key: string) => string;
    language: string;
}> = ({ request, cancelBusy, fetchingWorkerId, onOpenWorkerProfile, onCancel, onReview, onReport, t, language }) => {
    const navigate = useNavigate();
    const status = String(request.status || '').toLowerCase();
    const amount = paymentDisplayAmount(request);
    const currency = request.payment?.currency_code || 'USD';
    const paymentStatus = String(request.payment?.status || '').toLowerCase();
    const paid = ['paid', 'released'].includes(paymentStatus);
    const canCancel = ['pending', 'assigned', 'payment_pending'].includes(status);
    const canReview = status === 'done' && !request.has_rating;
    const localizedServiceName = localizeClientServiceName(request.service_name, language);
    const localizedDescription = localizeClientServiceDescription(request.description, language);
    const scheduledLabel = (() => {
        const raw = request.scheduled_start_time || (request.scheduled_date && request.scheduled_time ? `${request.scheduled_date}T${request.scheduled_time}` : '');
        if (!raw) return null;
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return null;
        return d.toLocaleString(language, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    })();

    return (
        <article className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.04)] transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_18px_38px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-900/70 dark:shadow-black/20 dark:hover:border-white/20 dark:hover:shadow-black/40">
            <div className="p-6 sm:p-7">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                            <span>{t('common.serviceHistory.card.request').replace('{{id}}', String(request.id_request))}</span>
                            <span aria-hidden>·</span>
                            <span>{formatDate(request.created_at, language)}</span>
                        </div>
                        <h3 className="mt-2 text-xl font-black text-slate-900 truncate dark:text-slate-100">{localizedServiceName}</h3>
                        <p className="mt-1.5 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{localizedDescription}</p>
                    </div>
                    <span
                        className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] ${statusTone(request.status)}`}
                    >
                        {statusLabel(request.status, t)}
                    </span>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <InfoTile
                        icon={<User2 className="h-4 w-4" />}
                        label={t('common.serviceHistory.card.professional')}
                        value={request.assigned_worker?.name || t('common.serviceHistory.card.unassigned')}
                        onClick={request.assigned_worker ? () => onOpenWorkerProfile(request.id_request) : undefined}
                        isClickable={!!request.assigned_worker}
                        viewProfileLabel={t('common.serviceHistory.card.viewProfile')}
                    />
                    <InfoTile
                        icon={<MapPin className="h-4 w-4" />}
                        label={t('common.serviceHistory.card.location')}
                        value={request.location_text || t('common.serviceHistory.card.noLocation')}
                    />
                    {scheduledLabel ? (
                        <InfoTile
                            icon={<CalendarClock className="h-4 w-4" />}
                            label={t('common.serviceHistory.card.scheduled')}
                            value={scheduledLabel}
                        />
                    ) : (
                        <InfoTile
                            icon={<Receipt className="h-4 w-4" />}
                            label={paid ? t('common.serviceHistory.card.paidOn') : t('common.serviceHistory.card.payment')}
                            value={
                                paid && request.payment?.paid_at
                                    ? formatDate(request.payment.paid_at, language)
                                    : paymentStatusLabel(request.payment?.status, t)
                            }
                        />
                    )}
                </div>

                <div className="mt-6 flex flex-col gap-4 border-t border-slate-100 pt-5 sm:flex-row sm:items-end sm:justify-between dark:border-white/10">
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">{t('common.serviceHistory.card.total')}</p>
                            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">{money(amount, currency, language)}</p>
                        </div>
                        {request.payment?.provider && (
                            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400">
                                {String(request.payment.provider).replace(/_/g, ' ')}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {!['done', 'cancelled'].includes(status) && (
                            <button
                                type="button"
                                disabled={fetchingWorkerId === request.id_request}
                                onClick={() => {
                                    if (request.assigned_worker) {
                                        onOpenWorkerProfile(request.id_request);
                                    } else {
                                        navigate(`/?request=${request.id_request}`);
                                    }
                                }}
                                className="inline-flex items-center gap-1.5 rounded-2xl bg-bird-blue hover:bg-bird-darkBlue px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-white shadow-md shadow-bird-blue/20 transition active:scale-95 disabled:opacity-50"
                            >
                                {fetchingWorkerId === request.id_request ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Sparkles className="h-3.5 w-3.5" />
                                )}
                                {t('common.serviceHistory.card.liveTrackerProDetails')}
                            </button>
                        )}
                        {canReview && (
                            <button
                                type="button"
                                onClick={onReview}
                                className="inline-flex items-center gap-1.5 rounded-2xl bg-slate-900 dark:bg-white px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-white dark:text-slate-900 shadow-sm transition hover:bg-slate-800 dark:hover:bg-slate-200"
                            >
                                <Star className="h-3.5 w-3.5" />
                                {t('common.serviceHistory.card.reviewPro')}
                            </button>
                        )}
                        {canCancel && (
                            <button
                                type="button"
                                onClick={onCancel}
                                disabled={cancelBusy}
                                className="inline-flex items-center gap-1.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 disabled:opacity-60 dark:border-rose-900/50 dark:bg-rose-900/40 dark:text-rose-300 dark:hover:border-rose-900/60 dark:hover:bg-rose-900/60"
                            >
                                {cancelBusy ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <XCircle className="h-3.5 w-3.5" />
                                )}
                                {cancelBusy ? t('common.serviceHistory.card.cancelling') : t('common.serviceHistory.card.cancel')}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onReport}
                            className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-slate-500 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400 dark:hover:border-amber-900/50 dark:hover:bg-amber-900/30 dark:hover:text-amber-300"
                        >
                            <ShieldAlert className="h-3.5 w-3.5" />
                            {t('common.serviceHistory.card.report')}
                        </button>
                    </div>
                </div>
            </div>
        </article>
    );
};

const InfoTile: React.FC<{
    icon: React.ReactNode;
    label: string;
    value: string;
    onClick?: () => void;
    isClickable?: boolean;
    viewProfileLabel?: string;
}> = ({ icon, label, value, onClick, isClickable = false, viewProfileLabel }) => (
    <div
        onClick={onClick}
        className={`flex items-start gap-2.5 rounded-2xl border px-3.5 py-3 transition ${
            isClickable
                ? 'cursor-pointer border-bird-blue/30 bg-bird-blue/5 hover:border-bird-blue hover:bg-bird-blue/10 dark:border-bird-blue/20 dark:bg-bird-blue/10 dark:hover:border-bird-blue'
                : 'border-slate-100 bg-slate-50/50 dark:border-white/5 dark:bg-white/[0.03]'
        }`}
    >
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm dark:bg-slate-800 dark:text-slate-300">
            {icon}
        </span>
        <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">{label}</p>
                {isClickable && (
                    <span className="text-[9px] font-black text-bird-blue uppercase tracking-wider">{viewProfileLabel ?? 'View Profile →'}</span>
                )}
            </div>
            <p className="mt-0.5 truncate text-sm font-bold text-slate-800 dark:text-slate-100">{value}</p>
        </div>
    </div>
);

const LoadingState: React.FC<{ t: (key: string) => string }> = ({ t }) => (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white p-16 text-center shadow-sm dark:border-white/10 dark:bg-slate-900/70">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400 dark:text-slate-500" />
        <p className="mt-4 text-sm font-bold text-slate-500 dark:text-slate-400">{t('common.serviceHistory.loading')}</p>
    </div>
);

const ErrorState: React.FC<{ message: string; onRetry: () => void; t: (key: string) => string }> = ({ message, onRetry, t }) => (
    <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center dark:border-rose-900/50 dark:bg-rose-900/40">
        <AlertTriangle className="mx-auto h-8 w-8 text-rose-500" />
        <p className="mt-4 text-sm font-bold text-rose-700 dark:text-rose-300">{message}</p>
        <button
            type="button"
            onClick={onRetry}
            className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-5 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-white hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600"
        >
            {t('common.serviceHistory.retry')}
        </button>
    </div>
);

const EmptyState: React.FC<{ filter: FilterKey; onGoHome: () => void; t: (key: string) => string }> = ({ filter, onGoHome, t }) => {
    const copy: Record<FilterKey, string> = {
        all: t('common.serviceHistory.empty.all'),
        active: t('common.serviceHistory.empty.active'),
        completed: t('common.serviceHistory.empty.completed'),
        cancelled: t('common.serviceHistory.empty.cancelled'),
    };
    return (
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-white/10 dark:bg-slate-900/70">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-400 dark:bg-white/[0.04] dark:text-slate-500">
                <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="mt-5 text-lg font-black text-slate-900 dark:text-slate-100">{t('common.serviceHistory.empty.title')}</h3>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{copy[filter]}</p>
            <button
                type="button"
                onClick={onGoHome}
                className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
            >
                {t('common.serviceHistory.empty.bookService')}
            </button>
        </div>
    );
};

export default MyServicesHistory;
