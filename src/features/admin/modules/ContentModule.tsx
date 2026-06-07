import { useCallback, useEffect, useState } from 'react';
import { Edit3, Plus, Trash2 } from 'lucide-react';
import { adminApi } from '../api/adminApi';
import { AdminCard, EmptyState, FormSection, Skeleton, StatusBadge } from '../components/AdminUI';
import { DropifyUpload } from '../components/DropifyUpload';
import { HeroSlidesEditor } from './content/HeroSlidesEditor';

type Service = { id_service: number; name: string };
type ServiceCard = {
  id_card: number;
  id_service: number;
  service_name: string;
  image_url: string | null;
  badge: string | null;
  headline: string | null;
  summary: string | null;
  cta_label: string | null;
  sort_order: number;
  is_active: number | boolean;
};

const emptyForm = {
  id_service: '',
  image_url: '',
  badge: '',
  headline: '',
  summary: '',
  cta_label: 'Learn more',
  sort_order: '1',
  is_active: true,
};

export default function ContentModule() {
  const [cards, setCards] = useState<ServiceCard[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ServiceCard | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [cardsPayload, servicesPayload] = await Promise.all([
        adminApi.get<{ cards: ServiceCard[] }>(adminApi.endpoints.serviceCards),
        adminApi.get<{ services: Service[] }>(adminApi.endpoints.services),
      ]);
      setCards(cardsPayload.cards || []);
      setServices(servicesPayload.services || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load homepage content.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setEditing(null);
    setForm(emptyForm);
  };

  const editCard = (card: ServiceCard) => {
    setEditing(card);
    setForm({
      id_service: String(card.id_service),
      image_url: card.image_url || '',
      badge: card.badge || '',
      headline: card.headline || '',
      summary: card.summary || '',
      cta_label: card.cta_label || 'Learn more',
      sort_order: String(card.sort_order),
      is_active: Boolean(card.is_active),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveCard = async () => {
    if (!form.id_service) {
      setError('Service is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        id_service: Number(form.id_service),
        image_url: form.image_url.trim(),
        badge: form.badge.trim(),
        headline: form.headline.trim(),
        summary: form.summary.trim(),
        cta_label: form.cta_label.trim(),
        sort_order: Number(form.sort_order),
        is_active: form.is_active,
      };
      if (editing) {
        await adminApi.put(`${adminApi.endpoints.serviceCards}/${editing.id_card}`, payload);
      } else {
        await adminApi.post(adminApi.endpoints.serviceCards, payload);
      }
      resetForm();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save homepage card.');
    } finally {
      setSaving(false);
    }
  };

  const deleteCard = async (card: ServiceCard) => {
    if (!window.confirm(`Delete homepage card "${card.headline || card.service_name}"?`)) return;
    try {
      await adminApi.delete(`${adminApi.endpoints.serviceCards}/${card.id_card}`);
      if (editing?.id_card === card.id_card) resetForm();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete homepage card.');
    }
  };

  return (
    <div className="admin-page-stack">
      <HeroSlidesEditor />
      <AdminCard>
        <div className="admin-section-heading">
          <div>
            <p className="admin-section-title">{editing ? 'Edit homepage card' : 'Create homepage card'}</p>
            <p className="admin-muted">Public presentation stays separate from operational service configuration.</p>
          </div>
          <Plus />
        </div>

        <FormSection title="Essential content">
          <label className="admin-field">
            <span>Service</span>
            <select value={form.id_service} onChange={(event) => setForm({ ...form, id_service: event.target.value })}>
              <option value="">Select service</option>
              {services.map((service) => <option key={service.id_service} value={service.id_service}>{service.name}</option>)}
            </select>
          </label>
          <label className="admin-field">
            <span>Headline</span>
            <input value={form.headline} maxLength={150} onChange={(event) => setForm({ ...form, headline: event.target.value })} />
          </label>
          <label className="admin-field admin-field--wide">
            <span>Summary</span>
            <textarea value={form.summary} maxLength={500} onChange={(event) => setForm({ ...form, summary: event.target.value })} />
          </label>
        </FormSection>

        <details className="admin-advanced">
          <summary>Presentation options</summary>
          <div className="admin-form-grid">
            <DropifyUpload
              label="Homepage Card Image"
              value={form.image_url}
              onChange={(url) => setForm({ ...form, image_url: url })}
            />
            <label className="admin-field"><span>Badge</span><input value={form.badge} maxLength={40} onChange={(event) => setForm({ ...form, badge: event.target.value })} /></label>
            <label className="admin-field"><span>CTA label</span><input value={form.cta_label} maxLength={60} onChange={(event) => setForm({ ...form, cta_label: event.target.value })} /></label>
            <label className="admin-field"><span>Display order</span><input type="number" min="1" max="5000" value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: event.target.value })} /></label>
            <label className="admin-check"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />Visible on homepage</label>
          </div>
        </details>

        {error && <div className="admin-inline-error">{error}</div>}
        <div className="admin-action-row">
          {editing && <button className="admin-button admin-button--secondary" onClick={resetForm}>Cancel</button>}
          <button className="admin-button" disabled={saving} onClick={saveCard}>{saving ? 'Saving...' : editing ? 'Save changes' : 'Create card'}</button>
        </div>
      </AdminCard>

      {loading ? (
        <Skeleton rows={6} />
      ) : cards.length === 0 ? (
        <EmptyState title="No homepage cards" description="Create first public service card above." />
      ) : (
        <div className="admin-content-grid">
          {cards.map((card) => (
            <AdminCard key={card.id_card} className="admin-content-card">
              {card.image_url ? <img src={card.image_url} alt="" /> : <div className="admin-content-placeholder" />}
              <div>
                <div className="admin-section-heading"><StatusBadge status={card.is_active ? 'active' : 'inactive'} /><small>Order {card.sort_order}</small></div>
                <p className="admin-eyebrow">{card.badge || card.service_name}</p>
                <h3>{card.headline || card.service_name}</h3>
                <p className="admin-muted">{card.summary || 'No summary configured.'}</p>
                <div className="admin-action-row">
                  <button className="admin-button admin-button--secondary admin-button--small" onClick={() => editCard(card)}><Edit3 size={13} /> Edit</button>
                  <button className="admin-button admin-button--danger admin-button--small" onClick={() => deleteCard(card)}><Trash2 size={13} /> Delete</button>
                </div>
              </div>
            </AdminCard>
          ))}
        </div>
      )}
    </div>
  );
}
