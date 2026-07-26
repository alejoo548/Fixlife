import React from 'react';
import { normalizeImageUrl } from '../../utils/imageUrls';

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
    const ratingLabel = worker.rating_average != null
        ? `${Number(worker.rating_average).toFixed(1)} rating`
        : 'New pro';
    const reviewLabel = `${Number(worker.rating_count || 0)} review${Number(worker.rating_count || 0) === 1 ? '' : 's'}`;
    const jobsLabel = `${Number(worker.completed_jobs || 0)} job${Number(worker.completed_jobs || 0) === 1 ? '' : 's'}`;
    const portfolioLabel = `${Number(worker.portfolio_count || 0)} portfolio photo${Number(worker.portfolio_count || 0) === 1 ? '' : 's'}`;
    const experienceLabel = worker.experience_label || (
        worker.years_of_experience != null
            ? `${worker.years_of_experience}+ year${worker.years_of_experience === 1 ? '' : 's'}`
            : 'Experience not available'
    );

    return (
        <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 w-full sm:w-auto">
                    {worker.profile_image_url ? (
                        <img
                            src={normalizeImageUrl(worker.profile_image_url)}
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
                                Worker response
                            </p>
                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] ${
                                pendingWorkerApproval
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-emerald-100 text-emerald-700'
                            }`}>
                                {pendingWorkerApproval ? 'Needs review' : 'Approved'}
                            </span>
                            {worker.is_online && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-700">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                    Online
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
                    View profile & portfolio
                </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                    { label: 'Rating', value: ratingLabel, detail: reviewLabel },
                    { label: 'Completed', value: jobsLabel, detail: 'on Fixlife' },
                    { label: 'Experience', value: experienceLabel, detail: 'declared level' },
                    { label: 'Portfolio', value: portfolioLabel, detail: 'tap profile' },
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
                        <p className="text-xs font-black uppercase tracking-widest text-slate-900">Action Required</p>
                    </div>
                    <p className="text-[13px] font-medium text-slate-600 mb-3">
                        Review the profile and portfolio. Approve to move to payment, or decline to find another pro.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            disabled={workerApprovalBusy}
                            onClick={onDecline}
                            className="rounded-xl border-2 border-red-200 bg-white px-4 py-2.5 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-50 text-center"
                        >
                            {workerApprovalBusy ? 'Saving...' : 'Decline'}
                        </button>
                        <button
                            type="button"
                            disabled={workerApprovalBusy}
                            onClick={onAccept}
                            className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-black disabled:opacity-50 shadow-md text-center"
                        >
                            {workerApprovalBusy ? 'Saving...' : 'Approve Pro'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
