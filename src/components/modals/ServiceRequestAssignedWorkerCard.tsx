import React from 'react';

interface AssignedWorker {
    name: string;
    phone_number?: string | null;
    bio?: string;
    profile_image_url?: string | null;
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
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Assigned pro</p>
                        <p className="mt-0.5 truncate text-base font-black text-slate-900">{worker.name}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                            <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            <p className="truncate text-[11px] font-bold text-slate-600">
                                {worker.phone_number || 'Visible in profile'}
                            </p>
                        </div>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onViewProfile}
                    className="w-full sm:w-auto shrink-0 rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 sm:py-2 text-[11px] font-black text-slate-900 shadow-sm transition hover:border-slate-900 hover:bg-slate-900 hover:text-white text-center"
                >
                    View profile
                </button>
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
