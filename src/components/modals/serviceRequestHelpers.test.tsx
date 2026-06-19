import { describe, expect, it } from 'vitest';
import {
  getClientTimelineState,
  hasPendingWorkerApproval,
  statusLabel,
} from './serviceRequestHelpers';

describe('double approval workflow helpers', () => {
  it('stops showing worker review after client accepts worker', () => {
    const request = {
      status: 'assigned',
      assigned_worker: { id_worker_profile: 4, name: 'Alex' },
      client_approved_at: '2026-06-13T18:00:00.000Z',
    };

    expect(hasPendingWorkerApproval(request)).toBe(false);
    expect(statusLabel(request.status, request)).toBe('Worker Accepted');
  });

  it('keeps route, work, payment, and completion as distinct stages', () => {
    expect(getClientTimelineState({ status: 'route_in_progress' })).toMatchObject({
      onTheWay: true,
      workInProgress: false,
      paymentSecured: false,
    });
    expect(getClientTimelineState({ status: 'in_progress', worker_arrived_at: '2026-06-13T18:00:00.000Z' })).toMatchObject({
      onTheWay: false,
      arrived: true,
      workInProgress: true,
      paymentSecured: false,
    });
    expect(getClientTimelineState({ status: 'payment_pending', worker_arrived_at: '2026-06-13T18:00:00.000Z' })).toMatchObject({
      workInProgress: false,
      workFinished: true,
      paymentSecured: false,
      completed: false,
    });
    expect(getClientTimelineState({ status: 'completion_pending' })).toMatchObject({
      paymentSecured: true,
      completed: false,
    });
    expect(getClientTimelineState({ status: 'done' })).toMatchObject({ completed: true });
  });
});
