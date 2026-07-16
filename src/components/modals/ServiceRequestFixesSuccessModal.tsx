import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { localizeServiceName } from '../../utils/serviceLocalization';

type FixesRequest = {
    id_request: number;
    service_name: string;
    assigned_worker?: { name?: string | null } | null;
};

interface ServiceRequestFixesSuccessModalProps {
    request: FixesRequest;
    punctuality: number;
    quality: number;
    priceFairness: number;
    onClose: () => void;
}

export function ServiceRequestFixesSuccessModal({
    request,
    punctuality,
    quality,
    priceFairness,
    onClose,
}: ServiceRequestFixesSuccessModalProps) {
    const { t, i18n } = useTranslation();

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-35 bg-slate-950/35 backdrop-blur-[3px] flex items-center justify-center p-4"
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 16 }}
                transition={{ type: 'spring', damping: 22, stiffness: 240 }}
                className="w-full max-w-xl overflow-hidden rounded-[30px] border border-emerald-200 bg-white shadow-[0_30px_70px_rgba(15,23,42,0.18)]"
            >
                <div className="relative overflow-hidden bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-6 py-6 text-white">
                    <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
                    <div className="relative flex items-start justify-between gap-4">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/80">{t('serviceRequest.rating.fixesSaved')}</p>
                            <h3 className="mt-2 text-3xl font-black">{t('serviceRequest.rating.thanks')}</h3>
                            <p className="mt-2 text-sm text-gray-900">
                                {t('serviceRequest.rating.profileSaved', { service: localizeServiceName(request.service_name, i18n.resolvedLanguage || i18n.language || 'en') })}
                            </p>
                        </div>
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 text-white shadow-[0_20px_34px_rgba(15,23,42,0.18)]">
                            <span className="text-3xl font-black">★</span>
                        </div>
                    </div>
                </div>

                <div className="p-6">
                    <div className="rounded-[26px] border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{t('serviceRequest.rating.reviewedPro')}</p>
                                <p className="mt-1 text-lg font-black text-slate-900">
                                    {request.assigned_worker?.name || t('serviceRequest.rating.assignedPro')}
                                </p>
                            </div>
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
                                {t('serviceRequest.rating.reviewSubmitted')}
                            </span>
                        </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-bird-yellow/20 bg-bird-yellow/10 px-4 py-4 text-center">
                            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">{t('serviceRequest.rating.punctuality')}</p>
                            <p className="mt-2 text-2xl font-black text-slate-950">{punctuality}/5</p>
                        </div>
                        <div className="rounded-2xl border border-bird-blue/15 bg-bird-blue/10 px-4 py-4 text-center">
                            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-900">{t('serviceRequest.rating.quality')}</p>
                            <p className="mt-2 text-2xl font-black text-slate-950">{quality}/5</p>
                        </div>
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-center">
                            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">{t('serviceRequest.rating.priceFairness')}</p>
                            <p className="mt-2 text-2xl font-black text-slate-950">{priceFairness}/5</p>
                        </div>
                    </div>

                    <div className="mt-5 flex justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-2xl bg-bird-blue px-5 py-3 text-sm font-black text-white shadow-[0_16px_30px_rgba(0,144,255,0.18)] transition hover:-translate-y-0.5 hover:bg-blue-700"
                        >
                            {t('serviceRequest.rating.backToRequests')}
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}
