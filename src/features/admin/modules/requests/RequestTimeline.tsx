import { CheckCircle2, CircleDollarSign, Clock3, Star, UserCheck } from 'lucide-react';
import type { AdminRequestDetail } from '../../types';
import { FormSection, StatusBadge } from '../../components/AdminUI';
import { adminServiceDescription, adminStatusLabel, useAdminT } from '../../adminI18n';

export function RequestTimeline({ request }: { request: AdminRequestDetail }) {
  const { t, lang } = useAdminT();
  const locale = lang === 'es' ? 'es-ES' : 'en-US';
  const isOverallComplete = String(request.status || '').toLowerCase() === 'done';
  const formatDate = (value: string | null | undefined) =>
    value ? new Date(value).toLocaleString(locale) : t('common.notAvailable');

  const events = [
    { label: t('requests.timelineCreated'), date: request.created_at, detail: adminServiceDescription(request.description, lang), icon: Clock3, done: true },
    { label: t('requests.timelineAssigned'), date: request.assigned_at, detail: request.assigned_worker?.name || t('requests.noProfessionalAssigned'), icon: UserCheck, done: !!request.assigned_at },
    { label: t('requests.timelinePaymentSecured'), date: request.payment?.paid_at, detail: request.payment ? `${request.payment.provider} · ${adminStatusLabel(request.payment.status, lang)}` : t('requests.noPaymentCreated'), icon: CircleDollarSign, done: !!request.payment?.paid_at },
    { label: t('requests.timelineFundsReleased'), date: request.payment?.released_at, detail: request.payment?.released_at ? t('requests.payoutReleased') : (isOverallComplete ? t('requests.payoutScheduled') : t('requests.notReleased')), icon: CheckCircle2, done: !!request.payment?.released_at || isOverallComplete },
    { label: t('requests.timelineRated'), date: request.rating?.created_at, detail: request.rating?.comment || (isOverallComplete ? t('common.completed') : t('requests.noRatingSubmitted')), icon: Star, done: !!request.rating || isOverallComplete },
  ];

  return (
    <FormSection title={t('requests.timeline')} description={t('requests.readOnlyContext')}>
      <div className="admin-timeline admin-field--wide">
        {events.map((event) => (
          <div key={event.label} className={event.done ? 'complete' : ''}>
            <span className="admin-timeline__icon"><event.icon size={15} /></span>
            <div><strong>{event.label}</strong><p>{event.detail}</p><small>{formatDate(event.date)}</small></div>
            {event.done ? <StatusBadge status="complete" /> : <StatusBadge status="pending" />}
          </div>
        ))}
      </div>
    </FormSection>
  );
}
