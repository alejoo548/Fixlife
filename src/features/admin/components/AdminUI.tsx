import React, { ReactNode, useEffect } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, X } from 'lucide-react';

export const AdminCard = ({ children, className = '', as: Tag = 'section' }: { children: ReactNode; className?: string; as?: React.ElementType }) => (
  <Tag className={`admin-card ${className}`}>{children}</Tag>
);

const statusTone = (status: string) => {
  const value = status.toLowerCase();
  if (['done', 'paid', 'released', 'resolved', 'active', 'approved', 'healthy', 'platinum'].includes(value)) return 'success';
  if (['cancelled', 'failed', 'rejected', 'inactive', 'critical', 'error', 'dead'].includes(value)) return 'danger';
  if (['pending', 'payment_pending', 'waiting_for_user', 'warning', 'gold'].includes(value)) return 'warning';
  if (['assigned', 'in_progress', 'awaiting_confirmation', 'open', 'info', 'scheduled', 'silver'].includes(value)) return 'info';
  return 'neutral';
};

export const formatAdminLabel = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
export const StatusBadge = ({ status }: { status: string }) => <span className={`admin-badge admin-badge--${statusTone(status)}`}>{formatAdminLabel(status)}</span>;

export const MetricCard = ({ label, value, note, icon, variant = 'primary' }: { label: string; value: ReactNode; note?: string; icon?: ReactNode; variant?: 'primary' | 'success' | 'warning' | 'info' | 'danger' }) => (
  <AdminCard className={`admin-metric admin-metric--${variant}`}>
    <div><p className="admin-eyebrow">{label}</p><p className="admin-metric__value">{value}</p>{note && <p className="admin-muted">{note}</p>}</div>
    {icon && <div className={`admin-icon-box admin-icon-box--${variant}`}>{icon}</div>}
  </AdminCard>
);

export const FilterBar = ({ children }: { children: ReactNode }) => <AdminCard className="admin-filter-bar">{children}</AdminCard>;

export const FormSection = ({ title, description, children }: { title: string; description?: string; children: ReactNode }) => (
  <fieldset className="admin-form-section"><legend>{title}</legend>{description && <p className="admin-muted">{description}</p>}<div className="admin-form-grid">{children}</div></fieldset>
);

export const EmptyState = ({ title, description }: { title: string; description: string }) => (
  <AdminCard className="admin-empty"><p className="admin-section-title">{title}</p><p className="admin-muted">{description}</p></AdminCard>
);

export const Skeleton = ({ rows = 4 }: { rows?: number }) => <AdminCard className="space-y-3">{Array.from({ length: rows }).map((_, i) => <div className="admin-skeleton" key={i} />)}</AdminCard>;

export const DetailDrawer = ({ open, title, subtitle, onClose, children }: { open: boolean; title: string; subtitle?: string; onClose: () => void; children: ReactNode }) => {
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open, onClose]);
  if (!open) return null;
  return <div className="admin-drawer-layer" role="dialog" aria-modal="true" aria-label={title}>
    <button className="admin-drawer-backdrop" onClick={onClose} aria-label="Close detail" />
    <aside className="admin-drawer">
      <header className="admin-drawer__header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="admin-icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button></header>
      <div className="admin-drawer__body">{children}</div>
    </aside>
  </div>;
};

export const ConfirmActionDialog = ({ open, title, description, confirmLabel, reason, onReasonChange, onCancel, onConfirm, busy }: { open: boolean; title: string; description: string; confirmLabel: string; reason: string; onReasonChange: (value: string) => void; onCancel: () => void; onConfirm: () => void; busy?: boolean }) => open ? (
  <div className="admin-dialog-layer" role="dialog" aria-modal="true" aria-label={title}><div className="admin-dialog">
    <AlertTriangle className="text-amber-500" size={28} /><h2>{title}</h2><p className="admin-muted">{description}</p>
    <label className="admin-field"><span>Reason (required)</span><textarea value={reason} onChange={(e) => onReasonChange(e.target.value)} minLength={8} placeholder="Explain why this action is required..." /></label>
    <div className="admin-dialog__actions"><button className="admin-button admin-button--secondary" onClick={onCancel}>Cancel</button><button className="admin-button admin-button--danger" disabled={busy || reason.trim().length < 8} onClick={onConfirm}>{busy ? 'Working...' : confirmLabel}</button></div>
  </div></div>
) : null;

export function DataTable<T>({ columns, rows, rowKey, onRowClick, pagination, onPageChange }: { columns: Array<{ key: string; label: string; render: (row: T) => ReactNode; className?: string }>; rows: T[]; rowKey: (row: T) => React.Key; onRowClick?: (row: T) => void; pagination?: { page: number; pages: number; total: number }; onPageChange?: (page: number) => void }) {
  return <AdminCard className="admin-table-card">
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr>{columns.map((column) => <th key={column.key} className={column.className}>{column.label}</th>)}</tr></thead>
      <tbody>{rows.map((row) => <tr key={rowKey(row)} onClick={() => onRowClick?.(row)} className={onRowClick ? 'admin-table__clickable' : ''}>{columns.map((column) => <td key={column.key} className={column.className}>{column.render(row)}</td>)}</tr>)}</tbody>
    </table></div>
    {pagination && <footer className="admin-pagination"><span>{pagination.total.toLocaleString()} records</span><div><button aria-label="Previous page" disabled={pagination.page <= 1} onClick={() => onPageChange?.(pagination.page - 1)}><ChevronLeft size={16} /></button><span>Page {pagination.page} of {pagination.pages}</span><button aria-label="Next page" disabled={pagination.page >= pagination.pages} onClick={() => onPageChange?.(pagination.page + 1)}><ChevronRight size={16} /></button></div></footer>}
  </AdminCard>;
}
