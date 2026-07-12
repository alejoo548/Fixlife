import { useCallback, useEffect, useState, type ClipboardEvent, type DragEvent } from 'react';
import { Edit3, Plus, Trash2 } from 'lucide-react';
import { adminApi } from '../api/adminApi';
import { AdminCard, AdminNumberInput, EmptyState, FormSection, Skeleton, StatusBadge } from '../components/AdminUI';
import { DropifyUpload } from '../components/DropifyUpload';
import { HeroSlidesEditor } from './content/HeroSlidesEditor';
import { showSweetAlert, showSweetConfirm, showSweetToast } from '../../../utils/sweetAlert';

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
type FaqItem = {
  id_faq: number;
  question: string;
  answer: string;
  icon: string | null;
  audience: 'clients' | 'professionals' | 'all' | string;
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

const emptyFaqForm = {
  question: '',
  answer: '',
  icon: '',
  audience: 'all',
  sort_order: '1',
  is_active: true,
};

const fillerTextPattern =
  /\b(lorem|ipsum|dolor|sit\s+amet|consectetur|adipiscing|asdf|qwerty|test\s*test|dummy|placeholder|sample)\b/i;

const validateMeaningfulText = (value: string, label: string, minWords: number) => {
  const normalized = value.trim().toLowerCase();
  if (fillerTextPattern.test(normalized)) {
    return `${label} cannot contain placeholder or lorem ipsum text.`;
  }

  const words: string[] = normalized.match(/[\p{L}\p{N}]+/gu) || [];
  if (words.length < minWords) {
    return `${label} must contain at least ${minWords} meaningful words.`;
  }

  const uniqueWords = new Set(words.filter((word) => word.length > 2));
  if (words.length >= 6 && uniqueWords.size < 3) {
    return `${label} looks repetitive. Write a clear real ${label.toLowerCase()}.`;
  }

  const compact = normalized.replace(/\s+/g, '');
  if (compact.length >= 12 && /(.)\1{7,}/u.test(compact)) {
    return `${label} contains too many repeated characters.`;
  }

  return '';
};

const blockClipboardAction = (event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
  event.preventDefault();
  showSweetAlert({
    tone: 'warning',
    title: 'Manual entry required',
    message: 'For security and quality, write this FAQ content directly instead of copying or pasting text.',
    confirmText: 'Got it',
  });
};

const blockDropAction = (event: DragEvent<HTMLInputElement | HTMLTextAreaElement>) => {
  event.preventDefault();
  showSweetAlert({
    tone: 'warning',
    title: 'Manual entry required',
    message: 'Dropped text is blocked here. Please type the FAQ content manually.',
    confirmText: 'Got it',
  });
};

export default function ContentModule() {
  const [cards, setCards] = useState<ServiceCard[]>([]);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ServiceCard | null>(null);
  const [editingFaq, setEditingFaq] = useState<FaqItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [faqForm, setFaqForm] = useState(emptyFaqForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const faqQuestionWarning = validateMeaningfulText(faqForm.question, 'Question', 3);
  const faqAnswerWarning = validateMeaningfulText(faqForm.answer, 'Answer', 8);

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
      const faqPayload = await adminApi.get<{ faqs: FaqItem[] }>(adminApi.endpoints.faqItems);
      setFaqs(faqPayload.faqs || []);
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

  const resetFaqForm = () => {
    setEditingFaq(null);
    setFaqForm(emptyFaqForm);
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
    showSweetToast({
      tone: 'info',
      title: 'Editing FAQ',
      message: 'The selected question is ready to update.',
    });
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
      showSweetToast({
        tone: 'success',
        title: editing ? 'Card updated' : 'Card created',
        message: 'Homepage content was saved successfully.',
      });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Could not save homepage card.';
      setError(message);
      showSweetAlert({ tone: 'error', title: 'Could not save card', message });
    } finally {
      setSaving(false);
    }
  };

  const deleteCard = async (card: ServiceCard) => {
    const confirmed = await showSweetConfirm({
      tone: 'warning',
      title: 'Delete homepage card?',
      message: `"${card.headline || card.service_name}" will be removed from the public homepage.`,
      confirmText: 'Delete card',
      cancelText: 'Keep it',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await adminApi.delete(`${adminApi.endpoints.serviceCards}/${card.id_card}`);
      if (editing?.id_card === card.id_card) resetForm();
      await load();
      showSweetToast({
        tone: 'success',
        title: 'Card deleted',
        message: 'The homepage card was removed.',
      });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Could not delete homepage card.';
      setError(message);
      showSweetAlert({ tone: 'error', title: 'Could not delete card', message });
    }
  };

  const editFaq = (faq: FaqItem) => {
    setEditingFaq(faq);
    setFaqForm({
      question: faq.question || '',
      answer: faq.answer || '',
      icon: faq.icon || '',
      audience: faq.audience || 'all',
      sort_order: String(faq.sort_order || 1),
      is_active: Boolean(faq.is_active),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showSweetToast({
      tone: 'info',
      title: 'Editing homepage card',
      message: 'The selected card is ready to update.',
    });
  };

  const saveFaq = async () => {
    if (faqForm.question.trim().length < 6 || faqForm.answer.trim().length < 12) {
      setError('FAQ question and answer are required.');
      showSweetAlert({
        tone: 'warning',
        title: 'Complete the FAQ',
        message: 'Question and answer are required before publishing this FAQ.',
      });
      return;
    }
    const validationError =
      validateMeaningfulText(faqForm.question, 'Question', 3) ||
      validateMeaningfulText(faqForm.answer, 'Answer', 8);
    if (validationError) {
      setError(validationError);
      showSweetAlert({
        tone: 'warning',
        title: 'Improve this FAQ',
        message: validationError,
      });
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        question: faqForm.question.trim(),
        answer: faqForm.answer.trim(),
        icon: faqForm.icon.trim(),
        audience: faqForm.audience,
        sort_order: Number(faqForm.sort_order),
        is_active: faqForm.is_active,
      };
      if (editingFaq) {
        await adminApi.put(adminApi.endpoints.faqItem(editingFaq.id_faq), payload);
      } else {
        await adminApi.post(adminApi.endpoints.faqItems, payload);
      }
      resetFaqForm();
      await load();
      showSweetToast({
        tone: 'success',
        title: editingFaq ? 'FAQ updated' : 'FAQ created',
        message: 'The public question was saved successfully.',
      });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Could not save FAQ item.';
      setError(message);
      showSweetAlert({ tone: 'error', title: 'Could not save FAQ', message });
    } finally {
      setSaving(false);
    }
  };

  const deleteFaq = async (faq: FaqItem) => {
    const confirmed = await showSweetConfirm({
      tone: 'warning',
      title: 'Delete FAQ question?',
      message: `"${faq.question}" will disappear from the public FAQ section.`,
      confirmText: 'Delete question',
      cancelText: 'Keep it',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await adminApi.delete(adminApi.endpoints.faqItem(faq.id_faq));
      if (editingFaq?.id_faq === faq.id_faq) resetFaqForm();
      await load();
      showSweetToast({
        tone: 'success',
        title: 'FAQ deleted',
        message: 'The public question was removed.',
      });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Could not delete FAQ item.';
      setError(message);
      showSweetAlert({ tone: 'error', title: 'Could not delete FAQ', message });
    }
  };

  return (
    <div className="admin-page-stack">
      <HeroSlidesEditor />
      <AdminCard>
        <div className="admin-section-heading">
          <div>
            <p className="admin-section-title">{editingFaq ? 'Edit FAQ question' : 'Create FAQ question'}</p>
            <p className="admin-muted">Manage the public Frequently Asked Questions section without changing code.</p>
          </div>
          <Plus />
        </div>

        <FormSection title="Question content">
          <label className="admin-field admin-field--wide">
            <span>Question</span>
            <input
              value={faqForm.question}
              maxLength={180}
              autoComplete="off"
              onCopy={blockClipboardAction}
              onCut={blockClipboardAction}
              onPaste={blockClipboardAction}
              onDrop={blockDropAction}
              onChange={(event) => setFaqForm({ ...faqForm, question: event.target.value })}
            />
            <small className={faqForm.question.trim() && faqQuestionWarning ? 'text-amber-300' : 'text-slate-400'}>
              {faqForm.question.trim()
                ? faqQuestionWarning || `${faqForm.question.trim().length}/180 characters`
                : 'Write a real question manually. Minimum 3 meaningful words.'}
            </small>
          </label>
          <label className="admin-field admin-field--wide">
            <span>Answer</span>
            <textarea
              value={faqForm.answer}
              maxLength={1200}
              autoComplete="off"
              onCopy={blockClipboardAction}
              onCut={blockClipboardAction}
              onPaste={blockClipboardAction}
              onDrop={blockDropAction}
              onChange={(event) => setFaqForm({ ...faqForm, answer: event.target.value })}
            />
            <small className={faqForm.answer.trim() && faqAnswerWarning ? 'text-amber-300' : 'text-slate-400'}>
              {faqForm.answer.trim()
                ? faqAnswerWarning || `${faqForm.answer.trim().length}/1200 characters`
                : 'Write a useful answer manually. Minimum 8 meaningful words.'}
            </small>
          </label>
        </FormSection>

        <FormSection title="Display options">
          <div className="admin-form-grid">
            <label className="admin-field">
              <span>Audience</span>
              <select value={faqForm.audience} onChange={(event) => setFaqForm({ ...faqForm, audience: event.target.value })}>
                <option value="all">Everyone</option>
                <option value="clients">Clients</option>
                <option value="professionals">Professionals</option>
              </select>
            </label>
            <label className="admin-field"><span>Display order</span><AdminNumberInput min={1} max={5000} decimals={0} value={faqForm.sort_order} onChange={(value) => setFaqForm({ ...faqForm, sort_order: value })} /></label>
            <label className="admin-field admin-field--wide">
              <span>SVG icon path</span>
              <input value={faqForm.icon} maxLength={500} placeholder="Optional path d value" onChange={(event) => setFaqForm({ ...faqForm, icon: event.target.value })} />
            </label>
            <label className="admin-check"><input type="checkbox" checked={faqForm.is_active} onChange={(event) => setFaqForm({ ...faqForm, is_active: event.target.checked })} />Visible on homepage</label>
          </div>
        </FormSection>

        {error && <div className="admin-inline-error">{error}</div>}
        <div className="admin-action-row">
          {editingFaq && <button className="admin-button admin-button--secondary" onClick={resetFaqForm}>Cancel</button>}
          <button className="admin-button" disabled={saving} onClick={saveFaq}>{saving ? 'Saving...' : editingFaq ? 'Save question' : 'Create question'}</button>
        </div>
      </AdminCard>

      {loading ? (
        <Skeleton rows={4} />
      ) : faqs.length === 0 ? (
        <EmptyState title="No FAQ questions" description="Create public questions above. The homepage will use built-in defaults until then." />
      ) : (
        <div className="admin-content-grid">
          {faqs.map((faq) => (
            <AdminCard key={faq.id_faq} className="admin-content-card">
              <div className="admin-content-placeholder" />
              <div>
                <div className="admin-section-heading"><StatusBadge status={faq.is_active ? 'active' : 'inactive'} /><small>Order {faq.sort_order}</small></div>
                <p className="admin-eyebrow">{faq.audience === 'all' ? 'Everyone' : faq.audience}</p>
                <h3>{faq.question}</h3>
                <p className="admin-muted">{faq.answer}</p>
                <div className="admin-action-row">
                  <button className="admin-button admin-button--secondary admin-button--small" onClick={() => editFaq(faq)}><Edit3 size={13} /> Edit</button>
                  <button className="admin-button admin-button--danger admin-button--small" onClick={() => deleteFaq(faq)}><Trash2 size={13} /> Delete</button>
                </div>
              </div>
            </AdminCard>
          ))}
        </div>
      )}

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

        <FormSection title="Presentation options">
          <div className="admin-form-grid">
            <DropifyUpload
              label="Homepage Card Image"
              value={form.image_url}
              onChange={(url) => setForm({ ...form, image_url: url })}
            />
            <label className="admin-field"><span>Badge</span><input value={form.badge} maxLength={40} onChange={(event) => setForm({ ...form, badge: event.target.value })} /></label>
            <label className="admin-field"><span>CTA label</span><input value={form.cta_label} maxLength={60} onChange={(event) => setForm({ ...form, cta_label: event.target.value })} /></label>
            <label className="admin-field"><span>Display order</span><AdminNumberInput min={1} max={5000} decimals={0} value={form.sort_order} onChange={(value) => setForm({ ...form, sort_order: value })} /></label>
            <label className="admin-check"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />Visible on homepage</label>
          </div>
        </FormSection>

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
