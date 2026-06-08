import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AdminApp } from './AdminApp';

vi.mock('./modules/OverviewModule', () => ({ default: () => <div>Overview module loaded</div> }));
vi.mock('./modules/RequestsModule', () => ({ default: () => <div>Requests module loaded</div> }));

const renderRoute = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/admin-dashboard/*" element={<AdminApp isOpen onClose={() => undefined} />} /></Routes>
  </MemoryRouter>,
);

describe('AdminApp routing', () => {
  it('redirects admin root to overview', async () => {
    renderRoute('/admin-dashboard');
    expect(await screen.findByText('Overview module loaded')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
  });

  it('loads requests from direct URL', async () => {
    renderRoute('/admin-dashboard/requests?status=pending');
    expect(await screen.findByText('Requests module loaded')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Service requests' })).toBeInTheDocument());
  });
});
