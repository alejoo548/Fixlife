import React from 'react';

export interface ServiceRequestLike {
    status: string;
    worker_arrived_at?: string | null;
    client_approved_at?: string | null;
    assigned_worker?: { id_worker_profile?: number; name?: string | null } | null;
    proposed_budget?: number | null;
    counter_status?: 'pending' | 'accepted' | 'declined' | null;
}

export const statusBadgeClasses = (statusRaw: string) => {
    const status = String(statusRaw || 'pending').toLowerCase();
    if (status === 'done') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (status === 'awaiting_confirmation') return 'bg-violet-100 text-violet-700 border-violet-200';
    if (['route_in_progress', 'arrived', 'start_pending', 'finish_pending', 'completion_pending'].includes(status)) return 'bg-blue-100 text-blue-700 border-blue-200';
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
    !request.client_approved_at &&
    request.proposed_budget == null;

export const statusLabel = (statusRaw: string, request?: ServiceRequestLike) => {
    const status = String(statusRaw || 'pending').toLowerCase();
    if (status === 'assigned') {
        if (request && hasPendingWorkerApproval(request)) return 'Review Worker';
        if (request && hasPendingCounter(request)) return 'Counter Pending';
        return 'Worker Accepted';
    }
    if (status === 'payment_pending') return 'Payment Pending';
    if (status === 'route_in_progress') return 'Worker On The Way';
    if (status === 'arrived') return 'Worker Arrived';
    if (status === 'start_pending') return 'Start Approval';
    if (status === 'finish_pending') return 'Finish Approval';
    if (status === 'paid') return 'Paid';
    if (status === 'completion_pending') return 'Final Approval';
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

export const timelineSteps = [
    { key: 'workerAccepted', label: 'Pro approved' },
    { key: 'onTheWay', label: 'On route' },
    { key: 'arrived', label: 'Arrived' },
    { key: 'workInProgress', label: 'Working' },
    { key: 'workFinished', label: 'Work finished' },
    { key: 'paymentSecured', label: 'Paid' },
    { key: 'completed', label: 'Completed' },
] as const;

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
        return <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Counter Accepted</span>;
    }
    if (request.counter_status === 'declined') {
        return <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-red-100 text-red-700 border border-red-200">Counter Declined</span>;
    }
    return <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Counter Offer</span>;
};
