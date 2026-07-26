import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useSSE } from '../../hooks/useSSE';
import { AnimatePresence, motion } from 'framer-motion';
import { showSweetToast } from '../../utils/sweetAlert';
import { API_ENDPOINTS } from '../../config/api';

type NotificationTone = 'info' | 'success' | 'warning';

interface NotificationItem {
  id_notification: number;
  id_request: number | null;
  event_type: string;
  title: string;
  message: string;
  tone: NotificationTone;
  is_read: boolean;
  action_url: string | null;
  created_at: string;
}

interface NotificationCenterProps {
  token: string | null;
  isActive?: boolean;
  variant?: 'landing' | 'panel' | 'admin' | 'plain';
  className?: string;
  theme?: 'light' | 'dark';
}

type NotificationFilter = 'all' | 'unread' | 'payments' | 'jobs';


const toneClasses: Record<NotificationTone, string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-slate-800/80 dark:text-blue-400',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-slate-800/80 dark:text-emerald-400',
  warning: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-slate-800/80 dark:text-amber-400',
};

const paymentEventTypes = new Set([
  'payment_secured',
  'payout_scheduled',
  'payout_paid',
  'counter_offer_accepted',
]);

const jobEventTypes = new Set([
  'request_accepted',
  'counter_offer_received',
  'counter_offer_sent',
  'tier_updated',
  'worker_arriving',
  'job_started',
  'job_completed_pending_confirmation',
  'job_completed',
  'chat_new_message',
]);

const filterOptions: Array<{ id: NotificationFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'payments', label: 'Payments' },
  { id: 'jobs', label: 'Jobs' },
];

const eventLabelMap: Record<string, string> = {
  request_accepted: 'Accepted',
  counter_offer_received: 'Counter offer',
  counter_offer_sent: 'Counter sent',
  counter_offer_accepted: 'Counter accepted',
  payment_secured: 'Payment',
  tier_updated: 'Tier upgrade',
  worker_arriving: 'Arriving',
  job_started: 'In progress',
  job_completed_pending_confirmation: 'Pending confirm',
  job_completed: 'Completed',
  payout_scheduled: 'Payout',
  payout_paid: 'Paid out',
  chat_new_message: 'New chat',
  support_thread_created: 'Support',
  admin_request_created: 'New request',
  admin_payment_secured: 'Payment secured',
  admin_job_completed: 'Completed',
};

const eventAccentClasses: Record<string, string> = {
  request_accepted: 'from-blue-500 to-sky-400 text-white',
  counter_offer_received: 'from-amber-400 to-orange-400 text-white',
  counter_offer_sent: 'from-amber-400 to-orange-400 text-white',
  counter_offer_accepted: 'from-emerald-500 to-green-400 text-white',
  payment_secured: 'from-emerald-500 to-teal-400 text-white',
  tier_updated: 'from-amber-400 to-orange-500 text-white',
  worker_arriving: 'from-blue-500 to-indigo-500 text-white',
  job_started: 'from-violet-500 to-indigo-500 text-white',
  job_completed_pending_confirmation: 'from-fuchsia-500 to-pink-500 text-white',
  job_completed: 'from-emerald-500 to-lime-400 text-white',
  payout_scheduled: 'from-bird-blue to-cyan-400 text-white',
  payout_paid: 'from-emerald-500 to-green-400 text-white',
  chat_new_message: 'from-bird-orange to-amber-400 text-white',
  support_thread_created: 'from-violet-500 to-indigo-500 text-white',
  admin_request_created: 'from-blue-500 to-cyan-400 text-white',
  admin_payment_secured: 'from-emerald-500 to-teal-400 text-white',
  admin_job_completed: 'from-emerald-500 to-lime-400 text-white',
};

const formatTimeAgo = (value: string) => {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.max(1, Math.floor(diffMs / 60000));

  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

const renderEventGlyph = (eventType: string) => {
  switch (eventType) {
    case 'payment_secured':
    case 'payout_scheduled':
    case 'payout_paid':
      return '💸';
    case 'chat_new_message':
      return '💬';
    case 'job_completed':
    case 'job_completed_pending_confirmation':
      return '✅';
    case 'worker_arriving':
      return '🚗';
    case 'request_accepted':
      return '🛠️';
    case 'counter_offer_received':
    case 'counter_offer_sent':
    case 'counter_offer_accepted':
      return '💼';
    case 'job_started':
      return '⚡';
    default:
      return '🔔';
  }
};

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  token,
  isActive = true,
  variant = 'landing',
  className = '',
  theme = 'light',
}) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>('all');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null);

  const lastFetchRef = useRef(0);
  const MIN_FETCH_INTERVAL = 15000; // 15s throttle to reduce spam

  const fetchNotifications = async (silent = false) => {
    if (!token || !isActive) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    const now = Date.now();
    if (silent && now - lastFetchRef.current < MIN_FETCH_INTERVAL) {
      return; // throttle silent/background refreshes
    }
    lastFetchRef.current = now;

    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.notifications.list}?limit=20`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await res.json();
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || 'Could not load notifications.');
      }

      setNotifications(Array.isArray(payload.notifications) ? payload.notifications : []);
      setUnreadCount(Number(payload.summary?.unread_count || 0));
    } catch (error: any) {
      if (!silent) {
        void showSweetToast({ tone: 'error', message: error?.message || 'Could not load notifications.' });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (!isActive) {
      setIsOpen(false);
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }
    void fetchNotifications(true);
  }, [token, isActive]);

  useSSE({
    token,
    events: { notification: () => { void fetchNotifications(true); } },
    enabled: !!token && isActive,
  });

  useEffect(() => {
    if (!isActive) {
      setIsOpen(false);
      return;
    }
    if (!isOpen) return;
    void fetchNotifications(false); // explicit when user opens
  }, [isOpen, isActive]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }

    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || (variant !== 'panel' && variant !== 'admin') || !buttonRef.current) {
      setDropdownPos(null);
      return;
    }

    const updatePos = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    };

    updatePos();
    window.addEventListener('resize', updatePos);
    return () => window.removeEventListener('resize', updatePos);
  }, [isOpen, variant]);

  const unreadItems = useMemo(
    () => notifications.filter((item) => !item.is_read).slice(0, 3),
    [notifications]
  );

  const filteredNotifications = useMemo(() => {
    switch (activeFilter) {
      case 'unread':
        return notifications.filter((item) => !item.is_read);
      case 'payments':
        return notifications.filter((item) => paymentEventTypes.has(item.event_type));
      case 'jobs':
        return notifications.filter((item) => jobEventTypes.has(item.event_type));
      case 'all':
      default:
        return notifications;
    }
  }, [activeFilter, notifications]);

  const filterCounts = useMemo(
    () => ({
      all: notifications.length,
      unread: notifications.filter((item) => !item.is_read).length,
      payments: notifications.filter((item) => paymentEventTypes.has(item.event_type)).length,
      jobs: notifications.filter((item) => jobEventTypes.has(item.event_type)).length,
    }),
    [notifications]
  );

  const markOneRead = async (idNotification: number) => {
    if (!token) return false;
    const alreadyRead = notifications.some(
      (item) => item.id_notification === idNotification && item.is_read
    );
    if (alreadyRead) return true;
    try {
      const res = await fetch(API_ENDPOINTS.notifications.readOne(idNotification), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await res.json();
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || 'Could not mark notification as read.');
      }
      setNotifications((prev) =>
        prev.map((item) =>
          item.id_notification === idNotification ? { ...item, is_read: true } : item
        )
      );
      setUnreadCount((prev) => Math.max(prev - 1, 0));
      return true;
    } catch (error: any) {
      void showSweetToast({ tone: 'error', message: error?.message || 'Could not mark notification as read.' });
      return false;
    }
  };

  const markAllRead = async () => {
    if (!token) return;
    try {
      const res = await fetch(API_ENDPOINTS.notifications.readAll, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = await res.json();
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || 'Could not mark notifications as read.');
      }
      setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
      setUnreadCount(0);
    } catch (error: any) {
      void showSweetToast({ tone: 'error', message: error?.message || 'Could not mark notifications as read.' });
    }
  };

  const buildNotificationTarget = (item: NotificationItem) => {
    if (!item.action_url && !item.id_request) return '';
    if (item.id_request) {
      return `/?request=${item.id_request}`;
    }

    if (item.action_url === '/mis-servicios') {
      return '/?openRequests=true';
    }

    try {
      const url = new URL(item.action_url!, window.location.origin);
      if (url.pathname === '/app' || url.pathname === '/mis-servicios') {
        return `/?openRequests=true`;
      }
      if (url.pathname === '/pro-dashboard') {
        url.searchParams.set('request', String(item.id_request || ''));
        if (item.event_type === 'chat_new_message') {
          url.searchParams.set('chat', '1');
        }
      }
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return item.action_url === '/mis-servicios' ? '/?openRequests=true' : item.action_url || '';
    }
  };

  const openNotificationUrl = (item: NotificationItem) => {
    const target = buildNotificationTarget(item);
    if (!target) return;
    navigate(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!token) return null;

  const dropdown = (
    <motion.div
      ref={dropdownRef}
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={`notification-dropdown admin-notification-dropdown ${theme === 'dark' ? `admin-notification-dropdown--${theme}` : ''} w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[28px] border border-white/70 bg-white/96 shadow-[0_24px_60px_rgba(15,23,42,0.16)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/70 ${
        variant === 'panel'
          ? 'fixed z-[9999]'
          : 'absolute right-0 top-14 z-[160]'
      }`}
      style={
        (variant === 'panel' || variant === 'admin') && dropdownPos
          ? { top: dropdownPos.top, right: dropdownPos.right }
          : undefined
      }
    >
      <div className="admin-notification-head relative overflow-hidden border-b border-slate-100 dark:border-white/5 bg-gradient-to-r from-sky-50 via-white to-amber-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 px-5 py-4">
        <div className="pointer-events-none absolute -left-8 top-0 h-24 w-24 rounded-full bg-bird-blue/10 blur-2xl" />
        <div className="pointer-events-none absolute right-0 top-2 h-20 w-20 rounded-full bg-bird-yellow/20 blur-2xl" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="admin-notification-eyebrow text-[11px] font-black uppercase tracking-[0.18em] text-bird-blue">Notification Center</p>
            <h3 className="admin-notification-title mt-1 text-lg font-black text-slate-900 dark:text-slate-100">Recent activity</h3>
            <p className="admin-notification-subtitle mt-1 text-xs text-slate-500 dark:text-slate-400">
              {!isActive
                ? 'Go online to receive and review notifications.'
                : unreadCount > 0
                ? `${unreadCount} unread event${unreadCount === 1 ? '' : 's'} waiting`
                : 'Everything is up to date.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void markAllRead()}
            disabled={!isActive}
            className="admin-notification-read-all rounded-full border border-bird-blue/15 bg-white dark:bg-slate-900/70 px-3 py-1.5 text-[11px] font-black text-bird-blue shadow-sm transition hover:border-bird-blue hover:bg-bird-blue hover:text-white"
          >
            Read all
          </button>
        </div>
        {isActive && unreadItems.length > 0 && (
          <div className="admin-notification-peek mt-3 flex flex-wrap gap-2">
            {unreadItems.map((item) => (
              <span
                key={`peek-${item.id_notification}`}
                className={`admin-notification-chip rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${toneClasses[item.tone]}`}
              >
                {item.title}
              </span>
            ))}
          </div>
        )}
        <div className="admin-notification-filters mt-4 flex flex-wrap gap-2">
          {filterOptions.map((filter) => {
            const isSelected = activeFilter === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => setActiveFilter(filter.id)}
                disabled={!isActive}
                className={`admin-notification-filter ${isSelected ? 'admin-notification-filter--active' : ''} rounded-full px-3 py-1.5 text-[11px] font-black transition ${
                  isSelected
                    ? 'bg-bird-blue text-white shadow-sm shadow-blue-200'
                    : 'border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/70 text-slate-500 dark:text-slate-400 hover:border-bird-blue/25 hover:text-bird-blue'
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  {filter.label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {filterCounts[filter.id]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="admin-notification-body max-h-[420px] overflow-y-auto px-4 py-4">
        {!isActive ? (
          <div className="rounded-3xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] px-5 py-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white dark:bg-slate-900/70 shadow-sm">
              <svg className="h-6 w-6 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M18.364 5.636A9 9 0 105.636 18.364M15 17h5l-1.4-1.4a2 2 0 01-.6-1.4V11a6 6 0 00-1.221-3.636M9 17a3 3 0 006 0M6.343 6.343A5.978 5.978 0 006 11v3.2a2 2 0 01-.6 1.4L4 17h5" />
              </svg>
            </div>
            <p className="mt-4 text-sm font-bold text-slate-700 dark:text-slate-300">Notifications are hidden while offline</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Go online to receive new alerts for jobs, payments, and payout updates.
            </p>
          </div>
        ) : loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`notif-skeleton-${index}`} className="animate-pulse rounded-2xl border border-slate-100 dark:border-white/5 p-4">
                <div className="h-3 w-24 rounded-full bg-slate-200 dark:bg-white/[0.06]" />
                <div className="mt-3 h-4 w-3/4 rounded-full bg-slate-100 dark:bg-white/[0.06]" />
                <div className="mt-2 h-3 w-full rounded-full bg-slate-100 dark:bg-white/[0.06]" />
              </div>
            ))}
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="admin-notification-empty rounded-3xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] px-5 py-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white dark:bg-slate-900/70 shadow-sm">
              <svg className="h-6 w-6 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.4-1.4a2 2 0 01-.6-1.4V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0" />
              </svg>
            </div>
            <p className="mt-4 text-sm font-bold text-slate-700 dark:text-slate-300">
              {activeFilter === 'all' ? 'No notifications yet' : `No ${activeFilter} notifications`}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {activeFilter === 'all'
                ? "We'll save request, payment and payout events here."
                : 'Try another filter or check back in a moment.'}
            </p>
          </div>
        ) : (
          <motion.div layout className="space-y-3">
            <AnimatePresence initial={false}>
              {filteredNotifications.map((item, index) => (
                <motion.div
                  key={item.id_notification}
                  layout
                  initial={{ opacity: 0, y: 14, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.98 }}
                  transition={{ duration: 0.2, delay: index * 0.03 }}
                  className={`admin-notification-item ${item.is_read ? 'admin-notification-item--read' : 'admin-notification-item--unread'} rounded-3xl border p-4 transition ${
                    item.is_read
                      ? 'border-slate-100 dark:border-white/5 bg-slate-50/75 dark:bg-white/[0.04] hover:border-slate-200 dark:hover:border-white/10 hover:bg-white dark:hover:bg-slate-900/70'
                      : 'border-bird-blue/15 bg-white dark:bg-slate-900/70 shadow-[0_16px_32px_rgba(37,99,235,0.08)] hover:-translate-y-0.5 hover:shadow-[0_20px_36px_rgba(37,99,235,0.14)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`admin-notification-glyph flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-lg shadow-sm ${
                        eventAccentClasses[item.event_type] || 'from-slate-500 to-slate-400 text-white'
                      }`}
                    >
                      <span>{renderEventGlyph(item.event_type)}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`admin-notification-chip rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${toneClasses[item.tone]}`}>
                          {eventLabelMap[item.event_type] || item.event_type.replace(/_/g, ' ')}
                        </span>
                        {!item.is_read && <span className="h-2.5 w-2.5 rounded-full bg-bird-orange shadow-[0_0_0_4px_rgba(255,140,0,0.15)]" />}
                        <span className="admin-notification-time text-[11px] font-semibold text-slate-400 dark:text-slate-500">{formatTimeAgo(item.created_at)}</span>
                      </div>
                      <p className="admin-notification-item-title mt-2 text-sm font-black text-slate-900 dark:text-slate-100">{item.title}</p>
                      <p className="admin-notification-message mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{item.message}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => void markOneRead(item.id_notification)}
                      className="admin-notification-secondary rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/70 px-3 py-1.5 text-[11px] font-black text-slate-600 dark:text-slate-300 transition hover:-translate-y-0.5 hover:border-bird-blue/25 hover:text-bird-blue"
                    >
                      {item.is_read ? 'Read' : 'Mark read'}
                    </button>
                    {item.action_url && (
                      <button
                        type="button"
                        onClick={async () => {
                          await markOneRead(item.id_notification);
                          openNotificationUrl(item);
                          setIsOpen(false);
                        }}
                        className="admin-notification-primary rounded-full bg-bird-blue px-3 py-1.5 text-[11px] font-black text-white shadow-sm shadow-blue-200 transition hover:-translate-y-0.5 hover:bg-blue-700"
                      >
                        Open
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </motion.div>
  );

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`relative flex h-11 w-11 items-center justify-center rounded-2xl transition duration-300 ${
          variant === 'plain'
            ? 'border-transparent bg-transparent text-gray-700 dark:text-slate-300 hover:text-bird-blue'
            : variant === 'panel'
            ? 'admin-notification-button border border-white/60 dark:border-white/10 bg-white/90 dark:bg-slate-900/70 text-slate-700 dark:text-slate-300 shadow-[0_16px_30px_rgba(15,23,42,0.08)] hover:-translate-y-0.5 hover:border-bird-blue/30 hover:text-bird-blue hover:shadow-[0_18px_32px_rgba(0,144,255,0.18)]'
            : 'admin-notification-button border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-900/70 text-slate-700 dark:text-slate-300 shadow-sm hover:-translate-y-0.5 hover:border-bird-blue/20 hover:text-bird-blue hover:shadow-[0_12px_24px_rgba(0,144,255,0.14)]'
        }`}
        aria-label="Open notifications"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.9}
            d="M15 17h5l-1.4-1.4a2 2 0 01-.6-1.4V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0m6 0H9"
          />
        </svg>
        {isActive && unreadCount > 0 && (
          <>
            <span className="absolute -right-1 -top-1 inline-flex h-5 w-5 animate-ping rounded-full bg-bird-orange/35" />
            <span className="absolute -right-1 -top-1 inline-flex min-h-[22px] min-w-[22px] items-center justify-center rounded-full bg-bird-orange px-1.5 text-[10px] font-black text-white shadow-lg shadow-orange-400/40">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          </>
        )}
      </button>

      {variant === 'panel' || variant === 'admin'
        ? createPortal(
            <AnimatePresence>{isOpen && dropdown}</AnimatePresence>,
            document.body
          )
        : <AnimatePresence>{isOpen && dropdown}</AnimatePresence>
      }
    </div>
  );
};
