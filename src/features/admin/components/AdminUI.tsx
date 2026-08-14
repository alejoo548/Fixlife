import React, { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { adminStatusLabel, useAdminT } from '../adminI18n';
import { normalizeImageUrl } from '../../../utils/imageUrls';

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

export const formatAdminLabel = (value: string) =>
  value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
export const StatusBadge = ({ status }: { status: string }) => {
  const { lang } = useAdminT();
  return <span className={`admin-badge admin-badge--${statusTone(status)}`}>{adminStatusLabel(status, lang)}</span>;
};

export const MetricCard = ({ label, value, note, icon, variant = 'primary' }: { label: string; value: ReactNode; note?: string; icon?: ReactNode; variant?: 'primary' | 'success' | 'warning' | 'info' | 'danger' }) => (
  <AdminCard className={`admin-metric admin-metric--${variant}`}>
    <div><p className="admin-eyebrow">{label}</p><p className="admin-metric__value">{value}</p>{note && <p className="admin-muted">{note}</p>}</div>
    {icon && <div className={`admin-icon-box admin-icon-box--${variant}`}>{icon}</div>}
  </AdminCard>
);

export const FilterBar = ({ children }: { children: ReactNode }) => <AdminCard className="admin-filter-bar">{children}</AdminCard>;

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateInputValue = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
};

export const AdminDatePicker = ({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) => {
  const { t, lang } = useAdminT();
  const locale = lang === 'es' ? 'es-ES' : 'en-US';
  const selectedDate = parseDateInputValue(value);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => selectedDate || new Date());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedDate) setVisibleMonth(selectedDate);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const calendarDays = useMemo(() => {
    const start = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const firstDay = start.getDay();
    const gridStart = new Date(start);
    gridStart.setDate(start.getDate() - firstDay);
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + index);
      return day;
    });
  }, [visibleMonth]);

  const monthLabel = visibleMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const weekDays = Array.from({ length: 7 }, (_, index) =>
    new Date(2026, 1, 1 + index).toLocaleDateString(locale, { weekday: 'short' }).slice(0, 2)
  );

  const moveMonth = (amount: number) => {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  };

  const selectDate = (date: Date) => {
    onChange(toDateInputValue(date));
    setOpen(false);
  };

  return (
    <div className="admin-date-picker" ref={rootRef}>
      <button type="button" className="admin-date-trigger" aria-label={label} onClick={() => setOpen((current) => !current)}>
        <span>{selectedDate ? selectedDate.toLocaleDateString(locale) : placeholder}</span>
        <CalendarDays size={16} />
      </button>
      {open && (
        <div className="admin-calendar-popover">
          <div className="admin-calendar-head">
            <button type="button" aria-label={t('common.previousMonth')} onClick={() => moveMonth(-1)}><ChevronLeft size={16} /></button>
            <strong>{monthLabel}</strong>
            <button type="button" aria-label={t('common.nextMonth')} onClick={() => moveMonth(1)}><ChevronRight size={16} /></button>
          </div>
          <div className="admin-calendar-grid admin-calendar-weekdays">
            {weekDays.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="admin-calendar-grid">
            {calendarDays.map((day) => {
              const dayValue = toDateInputValue(day);
              const isCurrentMonth = day.getMonth() === visibleMonth.getMonth();
              const isSelected = value === dayValue;
              const isToday = dayValue === toDateInputValue(new Date());
              return (
                <button
                  key={dayValue}
                  type="button"
                  className={`${!isCurrentMonth ? 'muted' : ''} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
                  onClick={() => selectDate(day)}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
          <div className="admin-calendar-actions">
            <button type="button" onClick={() => { onChange(''); setOpen(false); }}>{t('common.clear')}</button>
            <button type="button" onClick={() => selectDate(new Date())}>{t('common.today')}</button>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Number input that actually enforces its bounds. A native <input type="number">
 * only flags out-of-range values; it still lets a user type 70000000 into a
 * 0-100 field. This sanitizes on each keystroke (digits + one dot, no sign, no
 * exponent, capped decimals, clamped to max) and clamps to [min,max] on blur.
 */
export const AdminNumberInput = ({
  value,
  onChange,
  min = 0,
  max,
  decimals = 0,
  placeholder,
  disabled,
  className,
  id,
}: {
  value: string | number;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  decimals?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}) => {
  const sanitize = (raw: string): string => {
    if (raw === '') return '';
    let cleaned = raw.replace(/[^\d.]/g, '');
    const firstDot = cleaned.indexOf('.');
    if (firstDot !== -1) {
      cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
    }
    if (decimals <= 0) {
      cleaned = cleaned.split('.')[0];
    } else if (cleaned.includes('.')) {
      const [intPart, decPart = ''] = cleaned.split('.');
      cleaned = `${intPart}.${decPart.slice(0, decimals)}`;
    }
    if (cleaned !== '' && cleaned !== '.') {
      const num = Number(cleaned);
      if (Number.isFinite(num) && max != null && num > max) cleaned = String(max);
    }
    return cleaned;
  };

  const handleBlur = (raw: string) => {
    if (raw === '' || raw === '.') {
      onChange('');
      return;
    }
    let num = Number(raw);
    if (!Number.isFinite(num)) {
      onChange('');
      return;
    }
    if (num < min) num = min;
    if (max != null && num > max) num = max;
    onChange(String(decimals > 0 ? Number(num.toFixed(decimals)) : Math.round(num)));
  };

  return (
    <input
      id={id}
      type="text"
      inputMode={decimals > 0 ? 'decimal' : 'numeric'}
      className={className}
      disabled={disabled}
      placeholder={placeholder}
      value={String(value ?? '')}
      onChange={(event) => onChange(sanitize(event.target.value))}
      onBlur={(event) => handleBlur(event.target.value)}
      onKeyDown={(event) => {
        if (['e', 'E', '+', '-'].includes(event.key)) event.preventDefault();
      }}
    />
  );
};

export const FormSection = ({ title, description, children }: { title: string; description?: string; children: ReactNode }) => (
  <fieldset className="admin-form-section"><legend>{title}</legend>{description && <p className="admin-muted">{description}</p>}<div className="admin-form-grid">{children}</div></fieldset>
);

export const EmptyState = ({ title, description }: { title: string; description: string }) => (
  <AdminCard className="admin-empty"><p className="admin-section-title">{title}</p><p className="admin-muted">{description}</p></AdminCard>
);

export const Skeleton = ({ rows = 4 }: { rows?: number }) => <AdminCard className="space-y-3">{Array.from({ length: rows }).map((_, i) => <div className="admin-skeleton" key={i} />)}</AdminCard>;

export const DetailDrawer = ({ open, title, subtitle, onClose, children }: { open: boolean; title: string; subtitle?: string; onClose: () => void; children: ReactNode }) => {
  const { t } = useAdminT();
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open, onClose]);
  if (!open) return null;
  return <div className="admin-drawer-layer" role="dialog" aria-modal="true" aria-label={title}>
    <button className="admin-drawer-backdrop" onClick={onClose} aria-label={t('common.close')} />
    <aside className="admin-drawer">
      <header className="admin-drawer__header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="admin-icon-button" onClick={onClose} aria-label={t('common.close')}><X size={20} /></button></header>
      <div className="admin-drawer__body">{children}</div>
    </aside>
  </div>;
};

export const ConfirmActionDialog = ({ open, title, description, confirmLabel, reason, onReasonChange, onCancel, onConfirm, busy }: { open: boolean; title: string; description: string; confirmLabel: string; reason: string; onReasonChange: (value: string) => void; onCancel: () => void; onConfirm: () => void; busy?: boolean }) => {
  const { t } = useAdminT();
  return open ? (
    <div className="admin-dialog-layer" role="dialog" aria-modal="true" aria-label={title}><div className="admin-dialog">
      <AlertTriangle className="text-amber-500" size={28} /><h2>{title}</h2><p className="admin-muted">{description}</p>
      <label className="admin-field"><span>{t('common.reason')}</span><textarea value={reason} onChange={(e) => onReasonChange(e.target.value.slice(0, 500))} minLength={8} maxLength={500} placeholder={t('common.reasonPlaceholder')} /></label>
      <div className="admin-dialog__actions"><button className="admin-button admin-button--secondary" onClick={onCancel}>{t('common.cancel')}</button><button className="admin-button admin-button--danger" disabled={busy || reason.trim().length < 8} onClick={onConfirm}>{busy ? t('common.processing') : confirmLabel}</button></div>
    </div></div>
  ) : null;
};

export const DocumentPreviewModal = ({ url, title, onClose }: { url: string | null; title: string; onClose: () => void }) => {
  const { t } = useAdminT();
  useEffect(() => {
    if (!url) return;
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [url, onClose]);
  if (!url) return null;
  const resolved = normalizeImageUrl(url);
  const isPdf = /\.pdf(\?|$)/i.test(resolved);
  return (
    <div className="admin-dialog-layer admin-document-preview-layer" role="dialog" aria-modal="true" aria-label={title}>
      <button className="admin-drawer-backdrop" onClick={onClose} aria-label={t('common.close')} />
      <div className="admin-document-preview">
        <header className="admin-document-preview__header">
          <h2>{title}</h2>
          <div className="admin-document-preview__actions">
            <a href={resolved} target="_blank" rel="noreferrer" className="admin-icon-button" aria-label={t('pros.openInNewTab')}><ExternalLink size={18} /></a>
            <button className="admin-icon-button" onClick={onClose} aria-label={t('common.close')}><X size={20} /></button>
          </div>
        </header>
        <div className="admin-document-preview__body">
          {isPdf ? (
            <iframe src={resolved} title={title} />
          ) : (
            <img src={resolved} alt={title} />
          )}
        </div>
      </div>
    </div>
  );
};

export function DataTable<T>({ columns, rows, rowKey, onRowClick, pagination, onPageChange }: { columns: Array<{ key: string; label: string; render: (row: T) => ReactNode; className?: string }>; rows: T[]; rowKey: (row: T) => React.Key; onRowClick?: (row: T) => void; pagination?: { page: number; pages: number; total: number }; onPageChange?: (page: number) => void }) {
  const { t, lang } = useAdminT();
  return <AdminCard className="admin-table-card">
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr>{columns.map((column) => <th key={column.key} className={column.className}>{column.label}</th>)}</tr></thead>
      <tbody>{rows.map((row) => <tr key={rowKey(row)} onClick={() => onRowClick?.(row)} className={onRowClick ? 'admin-table__clickable' : ''}>{columns.map((column) => <td key={column.key} className={column.className}>{column.render(row)}</td>)}</tr>)}</tbody>
    </table></div>
  {pagination && <footer className="admin-pagination"><span>{t('common.records', { count: pagination.total.toLocaleString(lang === 'es' ? 'es-ES' : 'en-US') })}</span><div><button aria-label={t('common.previousPage')} disabled={pagination.page <= 1} onClick={() => onPageChange?.(pagination.page - 1)}><ChevronLeft size={16} /></button><span>{t('common.pageOf', { page: pagination.page, pages: pagination.pages })}</span><button aria-label={t('common.nextPage')} disabled={pagination.page >= pagination.pages} onClick={() => onPageChange?.(pagination.page + 1)}><ChevronRight size={16} /></button></div></footer>}
  </AdminCard>;
}
