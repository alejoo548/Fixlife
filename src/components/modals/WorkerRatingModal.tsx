import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { CheckCircle2, Loader2, Sparkles, Star, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { API_ENDPOINTS } from '../../config/api';
import { getToken } from '../../utils/session';

export interface RatingRequestLike {
    id_request: number;
    service_name: string;
    assigned_worker?: { name?: string | null } | null;
}

interface Props {
    request: RatingRequestLike | null;
    onClose: () => void;
    onSubmitted?: (idRequest: number) => void;
}

type MetricKey = 'punctuality' | 'quality' | 'price_fairness';

const METRIC_KEYS: MetricKey[] = ['punctuality', 'quality', 'price_fairness'];

const clampStar = (value: unknown) => {
    const n = Math.round(Number(value) || 0);
    if (n < 1) return 1;
    if (n > 5) return 5;
    return n;
};

const StarRow: React.FC<{
    value: number;
    onChange: (value: number) => void;
    disabled?: boolean;
}> = ({ value, onChange, disabled = false }) => {
    const { t } = useTranslation();
    const [hover, setHover] = useState<number | null>(null);
    const display = hover ?? value;
    return (
        <div className="flex items-center gap-1.5" role="radiogroup">
            {[1, 2, 3, 4, 5].map((star) => {
                const active = star <= display;
                return (
                    <button
                        key={star}
                        type="button"
                        role="radio"
                        aria-checked={value === star}
                        aria-label={star === 1 ? t('workerRatingModal.starLabel_one', { count: star }) : t('workerRatingModal.starLabel_other', { count: star })}
                        disabled={disabled}
                        onMouseEnter={() => setHover(star)}
                        onMouseLeave={() => setHover(null)}
                        onClick={() => onChange(star)}
                        className={`relative flex h-11 w-11 items-center justify-center rounded-xl transition duration-150 disabled:cursor-not-allowed ${
                            active ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-500 dark:text-amber-400' : 'bg-slate-100 dark:bg-white/[0.06] text-slate-300 dark:text-slate-500 hover:text-slate-400 dark:hover:text-slate-400'
                        }`}
                    >
                        <Star className={`h-5 w-5 ${active ? 'fill-amber-400 stroke-amber-500' : ''}`} />
                    </button>
                );
            })}
        </div>
    );
};

export const WorkerRatingModal: React.FC<Props> = ({ request, onClose, onSubmitted }) => {
    const { t } = useTranslation();
    const METRICS: Array<{ key: MetricKey; label: string; hint: string }> = METRIC_KEYS.map((key) => ({
        key,
        label: t(`workerRatingModal.metrics.${key}.label`),
        hint: t(`workerRatingModal.metrics.${key}.hint`),
    }));
    const [ratings, setRatings] = useState<Record<MetricKey, number>>({
        punctuality: 5,
        quality: 5,
        price_fairness: 5,
    });
    const [comment, setComment] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (request) {
            setRatings({ punctuality: 5, quality: 5, price_fairness: 5 });
            setComment('');
            setError(null);
            setSuccess(false);
        }
    }, [request?.id_request]);

    if (!request) return null;

    const workerName = request.assigned_worker?.name?.trim() || t('workerRatingModal.yourProFallback');
    const commentTrimmed = comment.trim();
    const commentTooLong = commentTrimmed.length > 255;
    const overallAverage = Number(
        ((ratings.punctuality + ratings.quality + ratings.price_fairness) / 3).toFixed(1)
    );

    const handleSubmit = async () => {
        if (busy) return;
        const token = getToken();
        if (!token) {
            setError(t('workerRatingModal.loginRequired'));
            return;
        }
        for (const key of Object.keys(ratings) as MetricKey[]) {
            const n = ratings[key];
            if (!Number.isInteger(n) || n < 1 || n > 5) {
                setError(t('workerRatingModal.rateEveryCategory'));
                return;
            }
        }
        if (commentTooLong) {
            setError(t('workerRatingModal.commentTooLong'));
            return;
        }

        setBusy(true);
        setError(null);
        try {
            const res = await fetch(API_ENDPOINTS.services.requestRating(request.id_request), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    punctuality: clampStar(ratings.punctuality),
                    quality: clampStar(ratings.quality),
                    price_fairness: clampStar(ratings.price_fairness),
                    comment: commentTrimmed || null,
                }),
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok || !payload?.success) {
                const message = payload?.error || t('workerRatingModal.submitError');
                if (payload?.already_rated) {
                    setError(t('workerRatingModal.alreadyRated'));
                } else {
                    setError(message);
                }
                return;
            }
            setSuccess(true);
            onSubmitted?.(request.id_request);
        } catch {
            setError(t('workerRatingModal.networkError'));
        } finally {
            setBusy(false);
        }
    };

    const modal = (
        <AnimatePresence>
            <motion.div
                key="rating-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[95] flex items-center justify-center overflow-y-auto bg-slate-950/45 p-3 backdrop-blur-sm sm:p-4"
                onClick={busy ? undefined : onClose}
            >
                <motion.div
                    key="rating-card"
                    initial={{ opacity: 0, scale: 0.96, y: 16 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 16 }}
                    transition={{ type: 'spring', damping: 24, stiffness: 220 }}
                    onClick={(e) => e.stopPropagation()}
                    className="my-auto w-full max-w-lg overflow-hidden rounded-[28px] border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/70 shadow-2xl"
                >
                    {success ? (
                        <div className="relative overflow-hidden p-8 text-center sm:p-10">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="h-8 w-8" />
                            </div>
                            <p className="mt-5 text-[11px] font-black uppercase tracking-[0.24em] text-emerald-500">
                                {t('workerRatingModal.reviewSubmitted')}
                            </p>
                            <h2 className="mt-2 text-2xl font-black text-slate-900 dark:text-slate-100">{t('workerRatingModal.thanksForFeedback')}</h2>
                            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                                {t('workerRatingModal.reviewHelpsWorker', { workerName })}
                            </p>
                            <button
                                type="button"
                                onClick={onClose}
                                className="mt-6 w-full rounded-2xl bg-slate-900 dark:bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200"
                            >
                                {t('workerRatingModal.done')}
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-800 p-6 text-white sm:p-8">
                                <div
                                    aria-hidden
                                    className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-cyan-400/20 blur-3xl"
                                />
                                <button
                                    type="button"
                                    onClick={onClose}
                                    disabled={busy}
                                    className="absolute right-4 top-4 rounded-2xl bg-white/10 p-2 text-white/80 transition hover:bg-white/20 hover:text-white disabled:opacity-50"
                                    aria-label={t('workerRatingModal.close')}
                                >
                                    <X className="h-4 w-4" />
                                </button>
                                <div className="relative">
                                    <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-100">
                                        <Sparkles className="h-3.5 w-3.5" />
                                        {t('workerRatingModal.rateThisService')}
                                    </div>
                                    <h2 className="mt-4 text-2xl font-black tracking-tight">{t('workerRatingModal.howWasWorker', { workerName })}</h2>
                                    <p className="mt-2 text-sm text-slate-300">
                                        {t('workerRatingModal.shareHow', { service: request.service_name })}
                                    </p>
                                </div>
                            </div>

                            <div className="p-6 sm:p-8">
                                <div className="space-y-5">
                                    {METRICS.map(({ key, label, hint }) => (
                                        <div
                                            key={key}
                                            className="flex flex-col gap-2 rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between"
                                        >
                                            <div className="min-w-0">
                                                <p className="text-sm font-black text-slate-900 dark:text-slate-100">{label}</p>
                                                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
                                            </div>
                                            <StarRow
                                                value={ratings[key]}
                                                disabled={busy}
                                                onChange={(v) => setRatings((prev) => ({ ...prev, [key]: v }))}
                                            />
                                        </div>
                                    ))}
                                </div>

                                <label className="mt-5 block text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                                    {t('workerRatingModal.optionalComment')}
                                    <textarea
                                        value={comment}
                                        onChange={(e) => setComment(e.target.value.slice(0, 255))}
                                        disabled={busy}
                                        rows={3}
                                        maxLength={255}
                                        placeholder={t('workerRatingModal.commentPlaceholder')}
                                        className="mt-2 w-full resize-none rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100 dark:focus:ring-white/10"
                                    />
                                    <span className={`mt-1 block text-right text-[10px] font-bold ${commentTooLong ? 'text-rose-500' : 'text-slate-400 dark:text-slate-500'}`}>
                                        {commentTrimmed.length}/255
                                    </span>
                                </label>

                                <div className="mt-5 flex items-center justify-between rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50/60 dark:bg-white/[0.04] px-4 py-3">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">{t('workerRatingModal.overall')}</p>
                                        <p className="mt-1 text-lg font-black text-slate-900 dark:text-slate-100">{overallAverage.toFixed(1)} / 5</p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <Star
                                                key={star}
                                                className={`h-4 w-4 ${star <= Math.round(overallAverage) ? 'fill-amber-400 stroke-amber-500' : 'text-slate-300 dark:text-slate-600'}`}
                                            />
                                        ))}
                                    </div>
                                </div>

                                {error ? (
                                    <div className="mt-4 rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-900/40 px-4 py-3 text-sm font-semibold text-rose-700 dark:text-rose-300">
                                        {error}
                                    </div>
                                ) : null}

                                <div className="mt-6 grid gap-2 sm:grid-cols-[1fr_auto]">
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        disabled={busy}
                                        className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400 hover:border-slate-300 hover:text-slate-800 dark:hover:text-slate-100 disabled:opacity-50"
                                    >
                                        {t('workerRatingModal.maybeLater')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void handleSubmit()}
                                        disabled={busy || commentTooLong}
                                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 dark:bg-white px-6 py-3 text-sm font-black uppercase tracking-[0.14em] text-white dark:text-slate-900 shadow-sm transition hover:bg-slate-800 dark:hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                                        {busy ? t('workerRatingModal.submitting') : t('workerRatingModal.submitReview')}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );

    return createPortal(modal, document.body);
};

export default WorkerRatingModal;
