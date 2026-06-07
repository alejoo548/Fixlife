import { FormSection, StatusBadge } from '../../components/AdminUI';

type WorkerResponse = {
  id_worker_profile?: number;
  worker_name?: string;
  status?: string;
  distance_km?: number | null;
  proposed_budget?: number | null;
  counter_message?: string | null;
  counter_status?: string | null;
  notified_at?: string;
  updated_at?: string;
};

const money = (value: number | null | undefined) => value == null ? 'No offer' : Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export function WorkerResponses({ responses }: { responses: Array<Record<string, unknown>> }) {
  const items = responses as WorkerResponse[];
  return (
    <FormSection title={`Professional responses (${items.length})`} description="Every professional notified and their response">
      <div className="admin-detail-list admin-field--wide">
        {items.length === 0 ? <p className="admin-muted">No professionals were notified.</p> : items.map((item) => (
          <div key={item.id_worker_profile}>
            <div><strong>{item.worker_name || `Professional #${item.id_worker_profile}`}</strong><span>{item.distance_km == null ? 'Distance unavailable' : `${Number(item.distance_km).toFixed(1)} km away`} · {item.counter_message || 'No message'}</span></div>
            <div><StatusBadge status={item.counter_status || item.status || 'new'} /><small>{money(item.proposed_budget)}</small></div>
          </div>
        ))}
      </div>
    </FormSection>
  );
}
