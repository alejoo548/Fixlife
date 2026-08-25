import { FormSection, StatusBadge } from '../../components/AdminUI';
import { useAdminT } from '../../adminI18n';

type WorkerResponse = {
  id_worker_profile?: number;
  worker_name?: string;
  status?: string;
  distance_km?: number | null;
  proposed_budget?: number | null;
  counter_message?: string | null;
  counter_status?: string | null;
};

export function WorkerResponses({ responses }: { responses: Array<Record<string, unknown>> }) {
  const { t, lang } = useAdminT();
  const locale = lang === 'es' ? 'es-SV' : 'en-US';
  const money = (value: number | null | undefined) =>
    value == null ? t('requests.noOffer') : Number(value).toLocaleString(locale, { style: 'currency', currency: 'USD' });
  const items = responses as WorkerResponse[];

  return (
    <FormSection title={t('requests.workerResponses', { count: items.length })} description={t('requests.workerResponsesNote')}>
      <div className="admin-detail-list admin-field--wide">
        {items.length === 0 ? <p className="admin-muted">{t('requests.noProfessionalsNotified')}</p> : items.map((item) => {
          const distance = item.distance_km == null
            ? t('requests.distanceUnavailable')
            : t('requests.kmAway', { distance: Number(item.distance_km).toFixed(1) });
          return (
            <div key={item.id_worker_profile}>
              <div>
                <strong>{item.worker_name || `${t('pros.professional')} #${item.id_worker_profile}`}</strong>
                <span>{distance} · {item.counter_message || t('requests.noMessage')}</span>
              </div>
              <div><StatusBadge status={item.counter_status || item.status || 'new'} /><small>{money(item.proposed_budget)}</small></div>
            </div>
          );
        })}
      </div>
    </FormSection>
  );
}
