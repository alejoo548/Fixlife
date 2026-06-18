import { CheckCircle2, CircleDollarSign, Clock3, Star, UserCheck } from 'lucide-react';
import type { AdminRequestDetail } from '../../types';
import { FormSection, StatusBadge } from '../../components/AdminUI';

const formatDate = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : 'Not recorded';

export function RequestTimeline({ request }: { request: AdminRequestDetail }) {
  const isOverallComplete = String(request.status || '').toLowerCase() === 'done';

  const events = [
    { label: 'Request created', date: request.created_at, detail: request.description, icon: Clock3, done: true },
    { label: 'Professional assigned', date: request.assigned_at, detail: request.assigned_worker?.name || 'No professional assigned', icon: UserCheck, done: !!request.assigned_at },
    { label: 'Payment secured', date: request.payment?.paid_at, detail: request.payment ? `${request.payment.provider} · ${request.payment.status}` : 'No payment created', icon: CircleDollarSign, done: !!request.payment?.paid_at },
    { label: 'Funds released', date: request.payment?.released_at, detail: request.payment?.released_at ? 'Professional payout released' : (isOverallComplete ? 'Completed (payout scheduled)' : 'Not released'), icon: CheckCircle2, done: !!request.payment?.released_at || isOverallComplete },
    { label: 'Customer rated service', date: request.rating?.created_at, detail: request.rating?.comment || (isOverallComplete ? 'Completed' : 'No rating submitted'), icon: Star, done: !!request.rating || isOverallComplete },
  ];
  return (
    <FormSection title="Operational timeline" description="Recorded milestones for this request">
      <div className="admin-timeline admin-field--wide">
        {events.map((event) => <div key={event.label} className={event.done ? 'complete' : ''}>
          <span className="admin-timeline__icon"><event.icon size={15} /></span>
          <div><strong>{event.label}</strong><p>{event.detail}</p><small>{formatDate(event.date)}</small></div>
          {event.done ? <StatusBadge status="complete" /> : <StatusBadge status="pending" />}
        </div>)}
      </div>
    </FormSection>
  );
}
