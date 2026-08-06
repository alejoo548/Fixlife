import React from 'react';
import { useTranslation } from 'react-i18next';

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
    const { t } = useTranslation();
    return (
        <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-4 dark:bg-slate-900 dark:border-white/10">
            <div className="flex items-center justify-between gap-2 mb-3">
                <p className="text-xs uppercase tracking-wider font-bold text-gray-500 dark:text-slate-400">{t('serviceRequest.history.title')}</p>
                <select
                    value={historyStatus}
                    onChange={(e) => onHistoryStatusChange(e.target.value)}
                    className="text-xs font-bold rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 dark:bg-slate-800 dark:border-white/10"
                >
                    <option value="all">{t('serviceRequest.history.filters.all')}</option>
                    <option value="pending">{t('serviceRequest.history.filters.pending')}</option>
                    <option value="payment_pending">{t('serviceRequest.history.filters.payment_pending')}</option>
                    <option value="paid">{t('serviceRequest.history.filters.paid')}</option>
                    <option value="assigned">{t('serviceRequest.history.filters.assigned')}</option>
                    <option value="in_progress">{t('serviceRequest.history.filters.in_progress')}</option>
                    <option value="awaiting_confirmation">{t('serviceRequest.history.filters.awaiting_confirmation')}</option>
                    <option value="done">{t('serviceRequest.history.filters.done')}</option>
                    <option value="cancelled">{t('serviceRequest.history.filters.cancelled')}</option>
                </select>
            </div>

            {activeTrackedRequest && (
                <div className="mb-3 rounded-[2rem] border border-slate-200/50 bg-white p-4 shadow-sm dark:bg-slate-900 dark:border-white/10">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{t('serviceRequest.history.liveServiceActive')}</p>
                            <p className="mt-1 text-base font-black text-slate-900 truncate dark:text-slate-100">{activeTrackedRequest.service_name}</p>
                            <p className="text-xs font-medium text-slate-500 line-clamp-1">{activeTrackedRequest.location_text}</p>
                        </div>
                        <span className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${statusBadgeClass}`}>
                            {statusLabel}
                        </span>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 dark:bg-slate-800 dark:border-white/10">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{t('serviceRequest.history.eta')}</p>
                            <p className="mt-0.5 text-sm font-black text-slate-900 dark:text-slate-100">
                                {activeTrackedRequest.status === 'done' ? t('serviceRequest.history.zeroMinutes') : t('serviceRequest.history.live')}
                            </p>
                        </div>
                        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600">{t('serviceRequest.history.worker')}</p>
                            <p className="mt-0.5 truncate text-sm font-black text-slate-900 dark:text-slate-100">
                                {activeTrackedRequest.assigned_worker?.name || t('serviceRequest.history.assignedFallback')}
                            </p>
                        </div>
                        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 dark:bg-slate-800 dark:border-white/10">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{t('serviceRequest.history.track')}</p>
                            <p className="mt-0.5 text-sm font-black text-slate-900 dark:text-slate-100">{t('serviceRequest.history.onMap')}</p>
                        </div>
                    </div>
                </div>
            )}

            {activeTrackedRequest && mobileTracker}

            {historyLoading && hasRequests && (
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:bg-slate-800 dark:text-slate-400 dark:border-white/10">
                    <span className="h-2 w-2 rounded-full bg-bird-blue animate-pulse" />
                    {t('serviceRequest.history.refreshing')}
                </div>
            )}

            {children}
        </div>
    );
}
