import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    CalendarClock,
    Loader2,
    MapPin,
    Receipt,
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
import WorkerRatingModal from '../components/modals/WorkerRatingModal';

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

const statusLabel = (status: string) => {
    const s = String(status || '').toLowerCase();
    if (s === 'done') return 'Completed';
    if (s === 'cancelled') return 'Cancelled';
    if (s === 'payment_pending') return 'Payment Pending';
    if (s === 'paid') return 'Paid';
    if (s === 'assigned') return 'Worker Assigned';
    if (s === 'route_in_progress') return 'On The Way';
    if (s === 'arrived') return 'Worker Arrived';
    if (s === 'start_pending') return 'Start Pending';
    if (s === 'in_progress') return 'In Progress';
    if (s === 'finish_pending') return 'Finish Pending';
    if (s === 'completion_pending') return 'Awaiting Final Approval';
    if (s === 'awaiting_confirmation') return 'Awaiting Confirmation';
    if (s === 'pending') return 'Finding Worker';
    return s.charAt(0).toUpperCase() + s.slice(1);
};

const statusTone = (status: string) => {
    const s = String(status || '').toLowerCase();
    if (s === 'done') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (s === 'cancelled') return 'bg-rose-50 text-rose-700 border-rose-200';
    if (s === 'paid') return 'bg-cyan-50 text-cyan-700 border-cyan-200';
    if (s === 'payment_pending') return 'bg-amber-50 text-amber-700 border-amber-200';
    if (s === 'in_progress' || s === 'route_in_progress' || s === 'arrived') return 'bg-blue-50 text-blue-700 border-blue-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
};

const money = (value: number, currency = 'USD') =>
    Number(value || 0).toLocaleString('en-US', { style: 'currency', currency });

const formatDate = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
    const [requests, setRequests] = useState<MyServiceRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<FilterKey>('all');
    const [cancelBusy, setCancelBusy] = useState<number | null>(null);
    const [ratingRequest, setRatingRequest] = useState<MyServiceRequest | null>(null);

    const loadRequests = async (silent = false) => {
        const token = getToken();
        if (!token) {
            setError('Login required.');
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
                setError(payload?.error || 'Could not load your service history.');
                return;
            }
            setRequests(payload.requests as MyServiceRequest[]);
            setError(null);
        } catch {
            setError('Network error loading your service history.');
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
            showSweetToast({ tone: 'error', message: 'This request can no longer be cancelled.' });
            return;
        }
        const confirmed = await showSweetConfirm({
            title: 'Cancel this request?',
            message: `Request #${request.id_request} for "${request.service_name}" will be cancelled and cannot be reopened.`,
            tone: 'warning',
            confirmText: 'Yes, cancel',
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
                showSweetToast({ tone: 'error', message: payload?.error || 'Could not cancel this request.' });
                return;
            }
            showSweetToast({ tone: 'success', message: 'Request cancelled.' });
            await loadRequests(true);
        } catch {
            showSweetToast({ tone: 'error', message: 'Network error cancelling this request.' });
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
                        Back to home
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
                                My Account
                            </div>
                            <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">
                                Services history
                            </h1>
                            <p className="mt-3 max-w-md text-sm font-medium text-slate-300 sm:text-base">
                                Every booking, payment and job you have with Fixlife — cleanly tracked, always available.
                            </p>
                        </div>
                        <div className="grid w-full max-w-md grid-cols-3 gap-3 lg:w-auto">
                            <HeroStat label="Total spent" value={`$${summary.totalSpent.toFixed(2)}`} accent />
                            <HeroStat label="Completed" value={String(summary.completed)} />
                            <HeroStat label="Active" value={String(summary.active)} />
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
                                    {f.label}
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
                        <LoadingState />
                    ) : error ? (
                        <ErrorState message={error} onRetry={() => void loadRequests()} />
                    ) : filtered.length === 0 ? (
                        <EmptyState filter={filter} onGoHome={handleBack} />
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
                                            onCancel={() => void handleCancel(r)}
                                            onReview={() => {
                                                if (r.has_rating) {
                                                    showSweetToast({ tone: 'info', message: 'You already reviewed this service.' });
                                                    return;
                                                }
                                                onOpenReview?.(r);
                                                setRatingRequest(r);
                                            }}
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
                    showSweetToast({ tone: 'success', message: 'Review submitted. Thanks!' });
                }}
            />
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
    onCancel: () => void;
    onReview: () => void;
}> = ({ request, cancelBusy, onCancel, onReview }) => {
    const status = String(request.status || '').toLowerCase();
    const amount = paymentDisplayAmount(request);
    const currency = request.payment?.currency_code || 'USD';
    const paymentStatus = String(request.payment?.status || '').toLowerCase();
    const paid = ['paid', 'released'].includes(paymentStatus);
    const canCancel = ['pending', 'assigned', 'payment_pending'].includes(status);
    const canReview = status === 'done' && !request.has_rating;
    const scheduledLabel = (() => {
        const raw = request.scheduled_start_time || (request.scheduled_date && request.scheduled_time ? `${request.scheduled_date}T${request.scheduled_time}` : '');
        if (!raw) return null;
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return null;
        return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    })();

    return (
        <article className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.04)] transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_18px_38px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-900/70 dark:shadow-black/20 dark:hover:border-white/20 dark:hover:shadow-black/40">
            <div className="p-6 sm:p-7">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                            <span>Request #{request.id_request}</span>
                            <span aria-hidden>·</span>
                            <span>{formatDate(request.created_at)}</span>
                        </div>
                        <h3 className="mt-2 text-xl font-black text-slate-900 truncate dark:text-slate-100">{request.service_name}</h3>
                        <p className="mt-1.5 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{request.description}</p>
                    </div>
                    <span
                        className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] ${statusTone(request.status)}`}
                    >
                        {statusLabel(request.status)}
                    </span>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <InfoTile
                        icon={<User2 className="h-4 w-4" />}
                        label="Professional"
                        value={request.assigned_worker?.name || 'Unassigned'}
                    />
                    <InfoTile
                        icon={<MapPin className="h-4 w-4" />}
                        label="Location"
                        value={request.location_text || 'Not provided'}
                    />
                    {scheduledLabel ? (
                        <InfoTile
                            icon={<CalendarClock className="h-4 w-4" />}
                            label="Scheduled"
                            value={scheduledLabel}
                        />
                    ) : (
                        <InfoTile
                            icon={<Receipt className="h-4 w-4" />}
                            label={paid ? 'Paid on' : 'Payment'}
                            value={
                                paid && request.payment?.paid_at
                                    ? formatDate(request.payment.paid_at)
                                    : String(request.payment?.status || 'pending').replace(/_/g, ' ')
                            }
                        />
                    )}
                </div>

                <div className="mt-6 flex flex-col gap-4 border-t border-slate-100 pt-5 sm:flex-row sm:items-end sm:justify-between dark:border-white/10">
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">Total</p>
                            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">{money(amount, currency)}</p>
                        </div>
                        {request.payment?.provider && (
                            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400">
                                {String(request.payment.provider).replace(/_/g, ' ')}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {canReview && (
                            <button
                                type="button"
                                onClick={onReview}
                                className="inline-flex items-center gap-1.5 rounded-2xl bg-slate-900 px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-white shadow-sm transition hover:bg-slate-800"
                            >
                                <Star className="h-3.5 w-3.5" />
                                Review pro
                            </button>
                        )}
                        {canCancel && (
                            <button
                                type="button"
                                onClick={onCancel}
                                disabled={cancelBusy}
                                className="inline-flex items-center gap-1.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 disabled:opacity-60"
                            >
                                {cancelBusy ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <XCircle className="h-3.5 w-3.5" />
                                )}
                                {cancelBusy ? 'Cancelling' : 'Cancel'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </article>
    );
};

const InfoTile: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
    <div className="flex items-start gap-2.5 rounded-2xl border border-slate-100 bg-slate-50/50 px-3.5 py-3 dark:border-white/5 dark:bg-white/[0.03]">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm dark:bg-slate-800 dark:text-slate-300">
            {icon}
        </span>
        <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">{label}</p>
            <p className="mt-0.5 truncate text-sm font-bold text-slate-800 dark:text-slate-100">{value}</p>
        </div>
    </div>
);

const LoadingState: React.FC = () => (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white p-16 text-center shadow-sm dark:border-white/10 dark:bg-slate-900/70">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400 dark:text-slate-500" />
        <p className="mt-4 text-sm font-bold text-slate-500 dark:text-slate-400">Loading your service history...</p>
    </div>
);

const ErrorState: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
    <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-rose-500" />
        <p className="mt-4 text-sm font-bold text-rose-700">{message}</p>
        <button
            type="button"
            onClick={onRetry}
            className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-5 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-white hover:bg-rose-700"
        >
            Retry
        </button>
    </div>
);

const EmptyState: React.FC<{ filter: FilterKey; onGoHome: () => void }> = ({ filter, onGoHome }) => {
    const copy: Record<FilterKey, string> = {
        all: "You haven't booked any services yet.",
        active: 'No active services right now.',
        completed: 'No completed services yet.',
        cancelled: 'No cancelled services.',
    };
    return (
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm dark:border-white/10 dark:bg-slate-900/70">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-400 dark:bg-white/[0.04] dark:text-slate-500">
                <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="mt-5 text-lg font-black text-slate-900 dark:text-slate-100">Nothing here yet</h3>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{copy[filter]}</p>
            <button
                type="button"
                onClick={onGoHome}
                className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-2.5 text-xs font-black uppercase tracking-[0.14em] text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
            >
                Book a service
            </button>
        </div>
    );
};

export default MyServicesHistory;
