import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AdminShell } from './AdminShell';

const LocationProbe = () => <span data-testid="location">{useLocation().pathname}{useLocation().search}</span>;

const renderShell = (path = '/admin-dashboard/overview') => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/admin-dashboard" element={<AdminShell onClose={vi.fn()} />}>
        <Route path="*" element={<LocationProbe />} />
      </Route>
    </Routes>
  </MemoryRouter>
);

describe('AdminShell', () => {
  it('keeps deep route title and navigates between modules', () => {
    renderShell('/admin-dashboard/requests');
    expect(screen.getByRole('heading', { name: 'Service requests' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Users' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/admin-dashboard/users');
  });

  it('persists white and dark mode', async () => {
    window.localStorage.setItem('fixlife:dashboard-theme:admin:anon', 'light');
    const { container } = renderShell();
    expect(container.querySelector('.dashboard-theme-light')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
    await waitFor(() => expect(container.querySelector('.dashboard-theme-dark')).toBeInTheDocument());
    expect(window.localStorage.getItem('fixlife:dashboard-theme:admin:anon')).toBe('dark');
  });

  it('sends global search to request filters', () => {
    renderShell();
    const search = screen.getByRole('textbox', { name: 'Search users, requests, services...' });
    fireEvent.change(search, { target: { value: 'Ale Bufalo' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByTestId('location')).toHaveTextContent('/admin-dashboard/requests?search=Ale%20Bufalo');
  });
});
