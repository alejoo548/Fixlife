import React from 'react';
import i18n from '../../i18n';

export interface ServiceRequestLike {
    status: string;
    worker_arrived_at?: string | null;
    client_approved_at?: string | null;
    assigned_worker?: { id_worker_profile?: number; name?: string | null } | null;
    proposed_budget?: number | null;
    counter_status?: 'pending' | 'accepted' | 'declined' | null;
    payment?: { provider?: string | null; status?: string | null } | null;
}

export const isCashReservedRequest = (request?: ServiceRequestLike) =>
    Boolean(
        request &&
            String(request.payment?.provider || '').toLowerCase() === 'cash' &&
            !['released'].includes(String(request.payment?.status || '').toLowerCase())
    );

export const statusBadgeClasses = (statusRaw: string, request?: ServiceRequestLike) => {
    const status = String(statusRaw || 'pending').toLowerCase();
    if (status === 'done') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (status === 'awaiting_confirmation') return 'bg-violet-100 text-violet-700 border-violet-200';
    if (['route_in_progress', 'arrived', 'start_pending', 'finish_pending', 'completion_pending'].includes(status)) return 'bg-blue-100 text-blue-700 border-blue-200';
    if (status === 'assigned') return 'bg-sky-100 text-gray-500 border-sky-200';
    if (status === 'payment_pending') return isCashReservedRequest(request) ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-yellow-100 text-yellow-700 border-yellow-200';
    if (status === 'paid') return 'bg-cyan-100 text-cyan-700 border-cyan-200';
    if (status === 'in_progress') return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    if (status === 'cancelled') return 'bg-red-100 text-red-700 border-red-200';
    return 'bg-amber-100 text-amber-700 border-amber-200';
};

export const hasPendingCounter = (request: ServiceRequestLike) =>
    request.status === 'assigned' &&
    request.proposed_budget != null &&
    (request.counter_status == null || request.counter_status === 'pending');

export const hasPendingWorkerApproval = (request: ServiceRequestLike) =>
    String(request.status || '').toLowerCase() === 'assigned' &&
    !!request.assigned_worker &&
    !request.client_approved_at &&
    request.proposed_budget == null;

export const statusLabel = (statusRaw: string, request?: ServiceRequestLike) => {
    const status = String(statusRaw || 'pending').toLowerCase();
    if (status === 'assigned') {
        if (request && hasPendingWorkerApproval(request)) return i18n.t('serviceRequest.statuses.reviewWorker');
        if (request && hasPendingCounter(request)) return i18n.t('serviceRequest.statuses.counterPending');
        return i18n.t('serviceRequest.statuses.workerAccepted');
    }
    if (status === 'payment_pending') return isCashReservedRequest(request) ? i18n.t('serviceRequest.statuses.cashReserved') : i18n.t('serviceRequest.statuses.paymentPending');
    if (status === 'route_in_progress') return i18n.t('serviceRequest.statuses.workerOnTheWay');
    if (status === 'arrived') return i18n.t('serviceRequest.statuses.workerArrived');
    if (status === 'start_pending') return i18n.t('serviceRequest.statuses.startApproval');
    if (status === 'finish_pending') return i18n.t('serviceRequest.statuses.finishApproval');
    if (status === 'paid') return i18n.t('serviceRequest.statuses.paid');
    if (status === 'completion_pending') return i18n.t('serviceRequest.statuses.finalApproval');
    if (status === 'awaiting_confirmation') return i18n.t('serviceRequest.statuses.awaitingConfirmation');
    if (status === 'in_progress') return i18n.t('serviceRequest.statuses.inProgress');
    if (status === 'done') return i18n.t('serviceRequest.statuses.completed');
    if (status === 'pending') return i18n.t('serviceRequest.statuses.findingWorker');
    return status.charAt(0).toUpperCase() + status.slice(1);
};

export const getClientTimelineState = (request: ServiceRequestLike) => {
    const status = String(request.status || 'pending').toLowerCase();
    const workerAccepted =
        !!request.assigned_worker &&
        ['assigned', 'route_in_progress', 'arrived', 'start_pending', 'in_progress', 'finish_pending', 'payment_pending', 'paid', 'completion_pending', 'done'].includes(status);
    const paymentSecured = ['paid', 'completion_pending', 'done'].includes(status);
    const onTheWay = ['route_in_progress'].includes(status);
    const arrived = Boolean(request.worker_arrived_at) || ['arrived', 'start_pending', 'in_progress', 'finish_pending', 'payment_pending', 'paid', 'completion_pending', 'done'].includes(status);
    const workInProgress = ['in_progress', 'finish_pending'].includes(status);
    const workFinished = ['payment_pending', 'paid', 'completion_pending', 'done'].includes(status);
    const completed = status === 'done';

    return {
        workerAccepted,
        paymentSecured,
        onTheWay,
        arrived,
        workInProgress,
        workFinished,
        completed,
    };
};

const TIMELINE_STEP_KEYS = [
    { key: 'workerAccepted', i18nKey: 'proApproved' },
    { key: 'onTheWay', i18nKey: 'onRoute' },
    { key: 'arrived', i18nKey: 'arrived' },
    { key: 'workInProgress', i18nKey: 'working' },
    { key: 'workFinished', i18nKey: 'workFinished' },
    { key: 'paymentSecured', i18nKey: 'paid' },
    { key: 'completed', i18nKey: 'completed' },
] as const;

export const timelineSteps = TIMELINE_STEP_KEYS.map((step) => ({
    key: step.key,
    get label() {
        return i18n.t(`serviceRequest.timeline.${step.i18nKey}`);
    },
}));

export const canUseRequestChat = (request: ServiceRequestLike) => {
    const status = String(request.status || '').toLowerCase();
    return ['assigned', 'route_in_progress', 'arrived', 'start_pending', 'in_progress', 'finish_pending', 'payment_pending', 'paid', 'completion_pending', 'done'].includes(status) && !!request.assigned_worker;
};

export const getTimelineProgress = (request: ServiceRequestLike) => {
    const status = String(request.status || 'pending').toLowerCase();
    const hasCounter = request.proposed_budget != null;
    const counterAccepted = request.counter_status === 'accepted';

    if (status === 'done') return 6;
    if (status === 'completion_pending') return 5;
    if (status === 'paid') return 5;
    if (status === 'payment_pending') return 4;
    if (status === 'finish_pending') return 3;
    if (status === 'in_progress') return 3;
    if (status === 'start_pending' || status === 'arrived') return 2;
    if (status === 'route_in_progress') return 1;
    if (status === 'cancelled') return 0;
    if (status === 'assigned') {
        if (hasCounter && !counterAccepted) return 0;
        if (counterAccepted) return 0;
        return 0;
    }
    return 0;
};

export const counterBadge = (request: ServiceRequestLike) => {
    if (request.proposed_budget == null) return null;
    if (request.counter_status === 'accepted') {
        return <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">{i18n.t('serviceRequest.counters.accepted')}</span>;
    }
    if (request.counter_status === 'declined') {
        return <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-red-100 text-red-700 border border-red-200">{i18n.t('serviceRequest.counters.declined')}</span>;
    }
    return <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">{i18n.t('serviceRequest.counters.offer')}</span>;
};
