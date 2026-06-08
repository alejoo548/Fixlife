import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../api/adminApi';
import RequestsModule from './RequestsModule';

vi.mock('../api/adminApi', () => ({
  adminApi: {
    get: vi.fn(),
    post: vi.fn(),
    endpoints: {
      requestsHistory: '/admin/requests-history',
      requestDetail: (id: number) => `/admin/requests/${id}`,
      requestActions: (id: number) => `/admin/requests/${id}/actions`,
    },
  },
}));

const detail = {
  id_request: 21, service_name: 'AC Installation', description: 'Install unit in main room', status: 'assigned',
  budget: 50, initial_budget: 50, final_budget: 50, location_text: 'San Salvador', latitude: 13.7, longitude: -89.2,
  created_at: '2026-06-01T10:00:00Z', updated_at: '2026-06-02T10:00:00Z',
  client: { name: 'Client One', email: 'client@example.com', phone: '7000-0000' },
  assigned_worker: { name: 'Pro One', email: 'pro@example.com', phone: '7000-0001' },
  payment: { amount: 50, platform_fee: 6, worker_payout: 44, status: 'paid' },
  offer: null, images: [], messages: [], rating: null, worker_responses: [],
};

describe('RequestsModule', () => {
  beforeEach(() => {
    vi.mocked(adminApi.get).mockReset().mockImplementation(async (url: string) => {
      if (url === '/admin/requests/21') return { data: detail } as never;
      return {
        data: [{ id_request: 21, service_name: 'AC Installation', status: 'assigned', payment_status: 'paid', budget: 50, created_at: '2026-06-01T10:00:00Z', client: { name: 'Client One', email: 'client@example.com' }, assigned_worker: { name: 'Pro One' } }],
        pagination: { page: 1, limit: 25, total: 1, pages: 1 },
      } as never;
    });
  });

  it('opens complete request detail with one detail request', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><RequestsModule /></MemoryRouter>);
    await user.click(await screen.findByText('#21'));
    expect(await screen.findByRole('dialog', { name: 'Request #21' })).toBeInTheDocument();
    expect(screen.getAllByText('Install unit in main room')).toHaveLength(2);
    expect(screen.getByText('Financial breakdown')).toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(adminApi.get).mock.calls.filter(([url]) => url === '/admin/requests/21')).toHaveLength(1));
  });
});
