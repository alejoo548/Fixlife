import React from 'react';

interface ActiveTrackedRequestSummary {
    id_request: number;
    service_name: string;
    location_text: string;
    status: string;
    assigned_worker?: { name?: string | null } | null;
}

interface ServiceRequestHistorySectionProps {
    historyStatus: string;
    historyLoading: boolean;
    hasRequests: boolean;
    activeTrackedRequest: ActiveTrackedRequestSummary | null;
    statusBadgeClass: string;
    statusLabel: string;
    mobileTracker: React.ReactNode;
    onHistoryStatusChange: (value: string) => void;
    children: React.ReactNode;
}

export function ServiceRequestHistorySection({
    historyStatus,
    historyLoading,
    hasRequests,
    activeTrackedRequest,
    statusBadgeClass,
    statusLabel,
    mobileTracker,
    onHistoryStatusChange,
    children,
}: ServiceRequestHistorySectionProps) {
    return (
        <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
                <p className="text-xs uppercase tracking-wider font-bold text-gray-500">My Request History</p>
                <select
                    value={historyStatus}
                    onChange={(e) => onHistoryStatusChange(e.target.value)}
                    className="text-xs font-bold rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5"
                >
                    <option value="all">All</option>
                    <option value="pending">Pending</option>
                    <option value="payment_pending">Payment Pending</option>
                    <option value="paid">Paid</option>
                    <option value="assigned">Assigned</option>
                    <option value="in_progress">In Progress</option>
                    <option value="awaiting_confirmation">Awaiting Confirmation</option>
                    <option value="done">Done</option>
                    <option value="cancelled">Cancelled</option>
                </select>
            </div>

            {activeTrackedRequest && (
                <div className="mb-3 rounded-[2rem] border border-slate-200/50 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Live service active</p>
                            <p className="mt-1 text-base font-black text-slate-900 truncate">{activeTrackedRequest.service_name}</p>
                            <p className="text-xs font-medium text-slate-500 line-clamp-1">{activeTrackedRequest.location_text}</p>
                        </div>
                        <span className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${statusBadgeClass}`}>
                            {statusLabel}
                        </span>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">ETA</p>
                            <p className="mt-0.5 text-sm font-black text-slate-900">
                                {activeTrackedRequest.status === 'done' ? '0 min' : 'Live'}
                            </p>
                        </div>
                        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600">Worker</p>
                            <p className="mt-0.5 truncate text-sm font-black text-slate-900">
                                {activeTrackedRequest.assigned_worker?.name || 'Assigned'}
                            </p>
                        </div>
                        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Track</p>
                            <p className="mt-0.5 text-sm font-black text-slate-900">On map</p>
                        </div>
                    </div>
                </div>
            )}

            {activeTrackedRequest && mobileTracker}

            {historyLoading && hasRequests && (
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-500">
                    <span className="h-2 w-2 rounded-full bg-bird-blue animate-pulse" />
                    Refreshing requests
                </div>
            )}

            {children}
        </div>
    );
}
