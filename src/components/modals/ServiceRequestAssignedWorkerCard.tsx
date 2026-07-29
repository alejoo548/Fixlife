import React from 'react';
import { useTranslation } from 'react-i18next';
import { localizeExperienceLabel } from '../../utils/clientTranslations';

interface AssignedWorker {
    name: string;
    phone_number?: string | null;
    bio?: string;
    profile_image_url?: string | null;
    is_online?: boolean | null;
    years_of_experience?: number | null;
    experience_label?: string | null;
    rating_average?: number | null;
    rating_count?: number;
    completed_jobs?: number;
    portfolio_count?: number;
}

interface ServiceRequestAssignedWorkerCardProps {
    worker: AssignedWorker;
    pendingWorkerApproval: boolean;
    workerApprovalBusy: boolean;
    getInitials: (name: string) => string;
    onViewProfile: () => void;
    onDecline: () => void;
    onAccept: () => void;
}

export function ServiceRequestAssignedWorkerCard({
    worker,
    pendingWorkerApproval,
    workerApprovalBusy,
    getInitials,
    onViewProfile,
    onDecline,
    onAccept,
}: ServiceRequestAssignedWorkerCardProps) {
    const { i18n } = useTranslation();
    const isSpanish = i18n.language.startsWith('es');
    const copy = {
        workerResponse: isSpanish ? 'Respuesta del profesional' : 'Worker response',
        needsReview: isSpanish ? 'Requiere revisión' : 'Needs review',
        approved: isSpanish ? 'Aprobado' : 'Approved',
        online: isSpanish ? 'En línea' : 'Online',
        viewProfile: isSpanish ? 'Ver perfil y portafolio' : 'View profile & portfolio',
        newPro: isSpanish ? 'Profesional nuevo' : 'New pro',
        rating: isSpanish ? 'Calificación' : 'Rating',
        reviews: (count: number) => isSpanish ? `${count} reseña${count === 1 ? '' : 's'}` : `${count} review${count === 1 ? '' : 's'}`,
        jobs: (count: number) => isSpanish ? `${count} trabajo${count === 1 ? '' : 's'}` : `${count} job${count === 1 ? '' : 's'}`,
        completed: isSpanish ? 'Completados' : 'Completed',
        onFixlife: isSpanish ? 'en Fixlife' : 'on Fixlife',
        experience: isSpanish ? 'Experiencia' : 'Experience',
        declaredLevel: isSpanish ? 'nivel declarado' : 'declared level',
        portfolio: isSpanish ? 'Portafolio' : 'Portfolio',
        portfolioPhotos: (count: number) => isSpanish ? `${count} foto${count === 1 ? '' : 's'} de portafolio` : `${count} portfolio photo${count === 1 ? '' : 's'}`,
        tapProfile: isSpanish ? 'toca el perfil' : 'tap profile',
        actionRequired: isSpanish ? 'Acción requerida' : 'Action Required',
        reviewInstruction: isSpanish
            ? 'Revisa el perfil y portafolio. Aprueba para pasar al pago, o rechaza para buscar otro profesional.'
            : 'Review the profile and portfolio. Approve to move to payment, or decline to find another pro.',
        saving: isSpanish ? 'Guardando...' : 'Saving...',
        decline: isSpanish ? 'Rechazar' : 'Decline',
        approve: isSpanish ? 'Aprobar profesional' : 'Approve Pro',
    };
    const ratingLabel = worker.rating_average != null
        ? `${Number(worker.rating_average).toFixed(1)} / 5`
        : copy.newPro;
    const reviewLabel = copy.reviews(Number(worker.rating_count || 0));
    const jobsLabel = copy.jobs(Number(worker.completed_jobs || 0));
    const portfolioLabel = copy.portfolioPhotos(Number(worker.portfolio_count || 0));
    const experienceLabel = localizeExperienceLabel(worker.experience_label || (
        worker.years_of_experience != null
            ? `${worker.years_of_experience}+ year${worker.years_of_experience === 1 ? '' : 's'}`
            : ''
    ), i18n.language);

    return (
        <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 w-full sm:w-auto">
                    {worker.profile_image_url ? (
                        <img
                            src={worker.profile_image_url}
                            alt={worker.name}
                            className="h-12 w-12 shrink-0 rounded-2xl object-cover ring-2 ring-white shadow-sm"
                        />
                    ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-bird-blue text-sm font-black text-white shadow-sm">
                            {getInitials(worker.name)}
                        </div>
                    )}
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                                {copy.workerResponse}
                            </p>
                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] ${
                                pendingWorkerApproval
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-emerald-100 text-emerald-700'
                            }`}>
                                {pendingWorkerApproval ? copy.needsReview : copy.approved}
                            </span>
                            {worker.is_online && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-700">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                    {copy.online}
                                </span>
                            )}
                        </div>
                        <p className="mt-0.5 truncate text-base font-black text-slate-900">{worker.name}</p>
                        <p className="mt-1 text-[11px] font-bold text-slate-500">{experienceLabel}</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onViewProfile}
                    className="w-full sm:w-auto shrink-0 rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 sm:py-2 text-[11px] font-black text-slate-900 shadow-sm transition hover:border-slate-900 hover:bg-slate-900 hover:text-white text-center"
                >
                    {copy.viewProfile}
                </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                    { label: copy.rating, value: ratingLabel, detail: reviewLabel },
                    { label: copy.completed, value: jobsLabel, detail: copy.onFixlife },
                    { label: copy.experience, value: experienceLabel, detail: copy.declaredLevel },
                    { label: copy.portfolio, value: portfolioLabel, detail: copy.tapProfile },
                ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">{item.label}</p>
                        <p className="mt-1 truncate text-xs font-black text-slate-900">{item.value}</p>
                        <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-500">{item.detail}</p>
                    </div>
                ))}
            </div>

            {worker.bio && (
                <p className="mt-3 line-clamp-2 text-xs font-medium text-slate-500 bg-white/50 p-2.5 rounded-lg border border-slate-100">
                    "{worker.bio}"
                </p>
            )}

            {pendingWorkerApproval && (
                <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/50 p-3.5">
                    <div className="flex items-center gap-2 mb-1.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                        </span>
                        <p className="text-xs font-black uppercase tracking-widest text-slate-900">{copy.actionRequired}</p>
                    </div>
                    <p className="text-[13px] font-medium text-slate-600 mb-3">
                        {copy.reviewInstruction}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            disabled={workerApprovalBusy}
                            onClick={onDecline}
                            className="rounded-xl border-2 border-red-200 bg-white px-4 py-2.5 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-50 text-center"
                        >
                            {workerApprovalBusy ? copy.saving : copy.decline}
                        </button>
                        <button
                            type="button"
                            disabled={workerApprovalBusy}
                            onClick={onAccept}
                            className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-black disabled:opacity-50 shadow-md text-center"
                        >
                            {workerApprovalBusy ? copy.saving : copy.approve}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
