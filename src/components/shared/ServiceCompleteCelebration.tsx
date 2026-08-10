import React, { useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface ServiceCompleteCelebrationProps {
    open: boolean;
    onDone: () => void;
    autoDismissMs?: number;
}

const CONFETTI_COLORS = ['#0090FF', '#FFC72C', '#22C55E', '#FF7A00', '#F472B6'];

const generateConfetti = () =>
    Array.from({ length: 22 }, (_, index) => ({
        id: index,
        left: 6 + Math.random() * 88,
        delay: Math.random() * 0.35,
        duration: 1.4 + Math.random() * 0.9,
        color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
        rotate: Math.random() * 360,
        size: 6 + Math.random() * 6,
    }));

export function ServiceCompleteCelebration({ open, onDone, autoDismissMs = 3200 }: ServiceCompleteCelebrationProps) {
    const { t } = useTranslation();
    const confetti = useMemo(() => generateConfetti(), [open]);

    useEffect(() => {
        if (!open) return;
        const timer = window.setTimeout(onDone, autoDismissMs);
        return () => window.clearTimeout(timer);
    }, [open, autoDismissMs, onDone]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/55 backdrop-blur-sm px-4"
                    onClick={onDone}
                >
                    <div className="pointer-events-none absolute inset-0 overflow-hidden">
                        {confetti.map((piece) => (
                            <motion.span
                                key={piece.id}
                                initial={{ y: '-10vh', opacity: 0, rotate: 0 }}
                                animate={{ y: '110vh', opacity: [0, 1, 1, 0], rotate: piece.rotate }}
                                transition={{ duration: piece.duration, delay: piece.delay, ease: 'easeIn' }}
                                className="absolute top-0 rounded-sm"
                                style={{
                                    left: `${piece.left}%`,
                                    width: piece.size,
                                    height: piece.size * 1.6,
                                    backgroundColor: piece.color,
                                }}
                            />
                        ))}
                    </div>

                    <motion.div
                        initial={{ opacity: 0, scale: 0.82, y: 24 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 12 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                        onClick={(event) => event.stopPropagation()}
                        className="relative w-full max-w-sm overflow-hidden rounded-[32px] border border-white/70 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.28)] dark:bg-slate-900 dark:border-white/10"
                    >
                        <div className="relative bg-gradient-to-br from-bird-blue via-sky-500 to-bird-yellow px-6 pt-8 pb-16 text-center">
                            <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
                            <div className="pointer-events-none absolute -left-8 bottom-0 h-24 w-24 rounded-full bg-white/15 blur-2xl" />
                            <motion.img
                                src="/mascot.webp"
                                alt={t('serviceComplete.mascotAlt')}
                                initial={{ scale: 0.5, rotate: -8, opacity: 0 }}
                                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                                transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.1 }}
                                className="relative mx-auto h-24 w-24 object-contain drop-shadow-[0_12px_20px_rgba(15,23,42,0.25)]"
                            />
                        </div>

                        <div className="relative -mt-10 px-6 pb-7 text-center">
                            <motion.div
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: 'spring', stiffness: 300, damping: 16, delay: 0.25 }}
                                className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_14px_28px_rgba(16,185,129,0.35)] ring-4 ring-white dark:ring-slate-900"
                            >
                                <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            </motion.div>

                            <h2 className="mt-4 text-2xl font-black text-slate-950 dark:text-slate-100">
                                {t('serviceComplete.title')}
                            </h2>
                            <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
                                {t('serviceComplete.subtitle')}
                            </p>

                            <button
                                type="button"
                                onClick={onDone}
                                className="mt-6 rounded-2xl bg-bird-blue px-6 py-3 text-sm font-black text-white shadow-[0_16px_30px_rgba(0,144,255,0.24)] transition hover:-translate-y-0.5 hover:bg-blue-700"
                            >
                                {t('serviceComplete.dismiss')}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
