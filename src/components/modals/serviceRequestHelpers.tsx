import React from 'react';

export interface ServiceRequestLike {
    status: string;
    assigned_worker?: { id_worker_profile?: number; name?: string | null } | null;
    proposed_budget?: number | null;
    counter_status?: 'pending' | 'accepted' | 'declined' | null;
}

export const statusBadgeClasses = (statusRaw: string) => {
    const status = String(statusRaw || 'pending').toLowerCase();
    if (status === 'done') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (status === 'awaiting_confirmation') return 'bg-violet-100 text-violet-700 border-violet-200';
    if (status === 'assigned') return 'bg-sky-100 text-gray-500 border-sky-200';
    if (status === 'payment_pending') return 'bg-yellow-100 text-yellow-700 border-yellow-200';
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
    request.proposed_budget == null;

export const statusLabel = (statusRaw: string, request?: ServiceRequestLike) => {
    const status = String(statusRaw || 'pending').toLowerCase();
    if (status === 'assigned') {
        if (request && hasPendingWorkerApproval(request)) return 'Review Worker';
        if (request && hasPendingCounter(request)) return 'Counter Pending';
        return 'Worker Accepted';
    }
    if (status === 'payment_pending') return 'Payment Pending';
    if (status === 'paid') return 'Payment Secured';
    if (status === 'awaiting_confirmation') return 'Awaiting Confirmation';
    if (status === 'in_progress') return 'In Progress';
    if (status === 'done') return 'Completed';
    if (status === 'pending') return 'Finding Worker';
    return status.charAt(0).toUpperCase() + status.slice(1);
};

export const getClientTimelineState = (request: ServiceRequestLike) => {
    const status = String(request.status || 'pending').toLowerCase();
    const workerAccepted =
        !!request.assigned_worker &&
        ['assigned', 'payment_pending', 'paid', 'in_progress', 'awaiting_confirmation', 'done'].includes(status);
    const paymentSecured = ['paid', 'in_progress', 'awaiting_confirmation', 'done'].includes(status);
    const onTheWay = ['paid', 'in_progress', 'awaiting_confirmation', 'done'].includes(status);
    const arrived = ['in_progress', 'awaiting_confirmation', 'done'].includes(status);
    const workInProgress = ['in_progress', 'awaiting_confirmation', 'done'].includes(status);
    const completed = status === 'done';

    return {
        workerAccepted,
        paymentSecured,
        onTheWay,
        arrived,
        workInProgress,
        completed,
    };
};

export const timelineSteps = [
    { key: 'workerAccepted', label: 'Worker accepted' },
    { key: 'paymentSecured', label: 'Payment secured' },
    { key: 'onTheWay', label: 'On the way' },
    { key: 'arrived', label: 'Arrived' },
    { key: 'workInProgress', label: 'Work in progress' },
    { key: 'completed', label: 'Completed' },
] as const;

export const canUseRequestChat = (request: ServiceRequestLike) => {
    const status = String(request.status || '').toLowerCase();
    return ['assigned', 'payment_pending', 'paid', 'in_progress', 'awaiting_confirmation', 'done'].includes(status) && !!request.assigned_worker;
};

export const getTimelineProgress = (request: ServiceRequestLike) => {
    const status = String(request.status || 'pending').toLowerCase();
    const hasCounter = request.proposed_budget != null;
    const counterAccepted = request.counter_status === 'accepted';

    if (status === 'done') return 6;
    if (status === 'awaiting_confirmation') return 5;
    if (status === 'in_progress') return 5;
    if (status === 'paid') return 4;
    if (status === 'payment_pending') return 3;
    if (status === 'cancelled') return 0;
    if (status === 'assigned') {
        if (hasCounter && !counterAccepted) return 2;
        if (counterAccepted) return 3;
        return 1;
    }
    return 0;
};

export const counterBadge = (request: ServiceRequestLike) => {
    if (request.proposed_budget == null) return null;
    if (request.counter_status === 'accepted') {
        return <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Counter Accepted</span>;
    }
    if (request.counter_status === 'declined') {
        return <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-red-100 text-red-700 border border-red-200">Counter Declined</span>;
    }
    return <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Counter Offer</span>;
};
