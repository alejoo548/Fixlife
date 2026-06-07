import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmActionDialog, DataTable, DetailDrawer } from './AdminUI';

describe('admin UI primitives', () => {
  it('closes detail drawer with Escape', () => {
    const onClose = vi.fn();
    render(<DetailDrawer open title="Request detail" onClose={onClose}><p>Full request</p></DetailDrawer>);
    expect(screen.getByRole('dialog', { name: 'Request detail' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('requires audit reason before sensitive action', () => {
    const onConfirm = vi.fn();
    const { rerender } = render(<ConfirmActionDialog open title="Cancel request" description="Audited action" confirmLabel="Confirm" reason="short" onReasonChange={() => undefined} onCancel={() => undefined} onConfirm={onConfirm} />);
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    rerender(<ConfirmActionDialog open title="Cancel request" description="Audited action" confirmLabel="Confirm" reason="Valid operational reason" onReasonChange={() => undefined} onCancel={() => undefined} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('renders pagination and changes page', () => {
    const onPageChange = vi.fn();
    render(<DataTable rows={[{ id: 1, name: 'Ale' }]} rowKey={(row) => row.id} columns={[{ key: 'name', label: 'Name', render: (row) => row.name }]} pagination={{ page: 2, pages: 3, total: 60 }} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPageChange).toHaveBeenCalledWith(3);
    expect(screen.getByText('60 records')).toBeInTheDocument();
  });
});
