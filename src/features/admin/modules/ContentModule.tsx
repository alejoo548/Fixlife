import { useCallback, useEffect, useState, type ClipboardEvent, type DragEvent } from 'react';
import { Edit3, Plus, Trash2 } from 'lucide-react';
import { adminApi } from '../api/adminApi';
import { AdminCard, AdminNumberInput, EmptyState, FormSection, Skeleton, StatusBadge } from '../components/AdminUI';
import { DropifyUpload } from '../components/DropifyUpload';
import { HeroSlidesEditor } from './content/HeroSlidesEditor';
import { HeroTextEditor } from './content/HeroTextEditor';
import { showSweetAlert, showSweetConfirm, showSweetToast } from '../../../utils/sweetAlert';
import { normalizeImageUrl } from '../../../utils/imageUrls';
import { adminErrorMessage, adminServiceDescription, adminServiceName, useAdminT } from '../adminI18n';

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

const localizeCardText = (value: string | null | undefined, lang: string, fallback = '') => {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  const byName = adminServiceName(raw, lang as any);
  if (byName !== raw) return byName;
  return adminServiceDescription(raw, lang as any);
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

const validateMeaningfulText = (value: string, label: string, minWords: number, t: (key: string, vars?: Record<string, unknown>) => string) => {
  const normalized = value.trim().toLowerCase();
  if (fillerTextPattern.test(normalized)) {
    return t('content.validation.placeholder', { label });
  }

  const words: string[] = normalized.match(/[\p{L}\p{N}]+/gu) || [];
  if (words.length < minWords) {
    return t('content.validation.minWords', { label, count: minWords });
  }

  const uniqueWords = new Set(words.filter((word) => word.length > 2));
  if (words.length >= 6 && uniqueWords.size < 3) {
    return t('content.validation.repetitive', { label });
  }

  const compact = normalized.replace(/\s+/g, '');
  if (compact.length >= 12 && /(.)\1{7,}/u.test(compact)) {
    return t('content.validation.repeatedCharacters', { label });
  }

  return '';
};

const blockClipboardAction = (event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>, t: (key: string) => string) => {
  event.preventDefault();
  showSweetAlert({
    tone: 'warning',
    title: t('common.manualEntryRequired'),
    message: t('common.manualEntryMessage'),
    confirmText: t('common.gotIt'),
  });
};

const blockDropAction = (event: DragEvent<HTMLInputElement | HTMLTextAreaElement>, t: (key: string) => string) => {
  event.preventDefault();
  showSweetAlert({
    tone: 'warning',
    title: t('common.manualEntryRequired'),
    message: t('common.droppedTextBlocked'),
    confirmText: t('common.gotIt'),
  });
};

export default function ContentModule() {
  const { t, lang } = useAdminT();
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
  const faqQuestionWarning = validateMeaningfulText(faqForm.question, t('content.faq.question'), 3, t);
  const faqAnswerWarning = validateMeaningfulText(faqForm.answer, t('content.faq.answer'), 8, t);

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
      setError(adminErrorMessage(reason, t('content.cards.saveError'), t));
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
      title: t('content.cards.edit'),
      message: t('content.cards.note'),
    });
  };

  const saveCard = async () => {
    if (!form.id_service) {
      setError(t('content.cards.serviceRequired'));
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
        title: editing ? t('content.cards.updated') : t('content.cards.created'),
        message: t('content.cards.saved'),
      });
    } catch (reason) {
      const message = adminErrorMessage(reason, t('content.cards.saveError'), t);
      setError(message);
      showSweetAlert({ tone: 'error', title: t('content.cards.saveErrorTitle'), message });
    } finally {
      setSaving(false);
    }
  };

  const deleteCard = async (card: ServiceCard) => {
    const confirmed = await showSweetConfirm({
      tone: 'warning',
      title: t('content.cards.deleteQuestion'),
      message: t('content.cards.deleteMessage', { name: card.headline || adminServiceName(card.service_name, lang) }),
      confirmText: t('content.cards.deleteConfirm'),
      cancelText: t('content.faq.keep'),
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await adminApi.delete(`${adminApi.endpoints.serviceCards}/${card.id_card}`);
      if (editing?.id_card === card.id_card) resetForm();
      await load();
      showSweetToast({
        tone: 'success',
        title: t('content.cards.deleted'),
        message: t('content.cards.deletedMessage'),
      });
    } catch (reason) {
      const message = adminErrorMessage(reason, t('content.cards.deleteError'), t);
      setError(message);
      showSweetAlert({ tone: 'error', title: t('content.cards.deleteErrorTitle'), message });
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
      title: t('content.faq.edit'),
      message: t('content.faq.note'),
    });
  };

  const saveFaq = async () => {
    if (faqForm.question.trim().length < 6 || faqForm.answer.trim().length < 12) {
      setError(t('content.faq.completeMessage'));
      showSweetAlert({
        tone: 'warning',
        title: t('content.faq.completeTitle'),
        message: t('content.faq.completeMessage'),
      });
      return;
    }
    const validationError =
      validateMeaningfulText(faqForm.question, t('content.faq.question'), 3, t) ||
      validateMeaningfulText(faqForm.answer, t('content.faq.answer'), 8, t);
    if (validationError) {
      setError(validationError);
      showSweetAlert({
        tone: 'warning',
        title: t('content.faq.improveTitle'),
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
        title: editingFaq ? t('content.faq.updated') : t('content.faq.created'),
        message: t('content.faq.saved'),
      });
    } catch (reason) {
      const message = adminErrorMessage(reason, t('content.faq.saveError'), t);
      setError(message);
      showSweetAlert({ tone: 'error', title: t('content.faq.saveErrorTitle'), message });
    } finally {
      setSaving(false);
    }
  };

  const deleteFaq = async (faq: FaqItem) => {
    const confirmed = await showSweetConfirm({
      tone: 'warning',
      title: t('content.faq.deleteQuestion'),
      message: t('content.faq.deleteMessage', { question: faq.question }),
      confirmText: t('content.faq.deleteConfirm'),
      cancelText: t('content.faq.keep'),
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await adminApi.delete(adminApi.endpoints.faqItem(faq.id_faq));
      if (editingFaq?.id_faq === faq.id_faq) resetFaqForm();
      await load();
      showSweetToast({
        tone: 'success',
        title: t('content.faq.deleted'),
        message: t('content.faq.deletedMessage'),
      });
    } catch (reason) {
      const message = adminErrorMessage(reason, t('content.faq.deleteError'), t);
      setError(message);
      showSweetAlert({ tone: 'error', title: t('content.faq.deleteErrorTitle'), message });
    }
  };

  return (
    <div className="admin-page-stack">
      <HeroTextEditor />
      <HeroSlidesEditor />
      <AdminCard>
        <div className="admin-section-heading">
          <div>
            <p className="admin-section-title">{editingFaq ? t('content.faq.edit') : t('content.faq.create')}</p>
            <p className="admin-muted">{t('content.faq.note')}</p>
          </div>
          <Plus />
        </div>

        <FormSection title={t('content.faq.content')}>
          <label className="admin-field admin-field--wide">
            <span>{t('content.faq.question')}</span>
            <input
              value={faqForm.question}
              maxLength={180}
              autoComplete="off"
              onCopy={(event) => blockClipboardAction(event, t)}
              onCut={(event) => blockClipboardAction(event, t)}
              onPaste={(event) => blockClipboardAction(event, t)}
              onDrop={(event) => blockDropAction(event, t)}
              onChange={(event) => setFaqForm({ ...faqForm, question: event.target.value })}
            />
            <small className={faqForm.question.trim() && faqQuestionWarning ? 'text-amber-300' : 'text-slate-400'}>
              {faqForm.question.trim()
                ? faqQuestionWarning || `${faqForm.question.trim().length}/180`
                : t('content.faq.questionHelp')}
            </small>
          </label>
          <label className="admin-field admin-field--wide">
            <span>{t('content.faq.answer')}</span>
            <textarea
              value={faqForm.answer}
              maxLength={1200}
              autoComplete="off"
              onCopy={(event) => blockClipboardAction(event, t)}
              onCut={(event) => blockClipboardAction(event, t)}
              onPaste={(event) => blockClipboardAction(event, t)}
              onDrop={(event) => blockDropAction(event, t)}
              onChange={(event) => setFaqForm({ ...faqForm, answer: event.target.value })}
            />
            <small className={faqForm.answer.trim() && faqAnswerWarning ? 'text-amber-300' : 'text-slate-400'}>
              {faqForm.answer.trim()
                ? faqAnswerWarning || `${faqForm.answer.trim().length}/1200`
                : t('content.faq.answerHelp')}
            </small>
          </label>
        </FormSection>

        <FormSection title={t('content.faq.displayOptions')}>
          <div className="admin-form-grid">
            <label className="admin-field">
              <span>{t('content.faq.audience')}</span>
              <select value={faqForm.audience} onChange={(event) => setFaqForm({ ...faqForm, audience: event.target.value })}>
                <option value="all">{t('content.faq.everyone')}</option>
                <option value="clients">{t('content.faq.clients')}</option>
                <option value="professionals">{t('content.faq.professionals')}</option>
              </select>
            </label>
            <label className="admin-field"><span>{t('content.faq.displayOrder')}</span><AdminNumberInput min={1} max={5000} decimals={0} value={faqForm.sort_order} onChange={(value) => setFaqForm({ ...faqForm, sort_order: value })} /></label>
            <label className="admin-field admin-field--wide">
              <span>{t('content.faq.svgIconPath')}</span>
              <input value={faqForm.icon} maxLength={500} placeholder={t('content.faq.iconPlaceholder')} onChange={(event) => setFaqForm({ ...faqForm, icon: event.target.value })} />
            </label>
            <label className="admin-check"><input type="checkbox" checked={faqForm.is_active} onChange={(event) => setFaqForm({ ...faqForm, is_active: event.target.checked })} />{t('content.faq.visibleHomepage')}</label>
          </div>
        </FormSection>

        {error && <div className="admin-inline-error">{error}</div>}
        <div className="admin-action-row">
          {editingFaq && <button className="admin-button admin-button--secondary" onClick={resetFaqForm}>{t('common.cancel')}</button>}
          <button className="admin-button" disabled={saving} onClick={saveFaq}>{saving ? t('common.saving') : editingFaq ? t('content.faq.saveQuestion') : t('content.faq.createQuestion')}</button>
        </div>
      </AdminCard>

      {loading ? (
        <Skeleton rows={4} />
      ) : faqs.length === 0 ? (
        <EmptyState title={t('content.faq.noQuestions')} description={t('content.faq.noQuestionsNote')} />
      ) : (
        <div className="admin-content-grid">
          {faqs.map((faq) => (
            <AdminCard key={faq.id_faq} className="admin-content-card">
              <div className="admin-content-placeholder" />
              <div>
                <div className="admin-section-heading"><StatusBadge status={faq.is_active ? 'active' : 'inactive'} /><small>{t('content.faq.order', { order: faq.sort_order })}</small></div>
                <p className="admin-eyebrow">{faq.audience === 'all' ? t('content.faq.everyone') : faq.audience === 'clients' ? t('content.faq.clients') : faq.audience === 'professionals' ? t('content.faq.professionals') : faq.audience}</p>
                <h3>{faq.question}</h3>
                <p className="admin-muted">{faq.answer}</p>
                <div className="admin-action-row">
                  <button className="admin-button admin-button--secondary admin-button--small" onClick={() => editFaq(faq)}><Edit3 size={13} /> {t('content.faq.editButton')}</button>
                  <button className="admin-button admin-button--danger admin-button--small" onClick={() => deleteFaq(faq)}><Trash2 size={13} /> {t('content.faq.deleteButton')}</button>
                </div>
              </div>
            </AdminCard>
          ))}
        </div>
      )}

      <AdminCard>
        <div className="admin-section-heading">
          <div>
            <p className="admin-section-title">{editing ? t('content.cards.edit') : t('content.cards.create')}</p>
            <p className="admin-muted">{t('content.cards.note')}</p>
          </div>
          <Plus />
        </div>

        <FormSection title={t('content.cards.essential')}>
          <label className="admin-field">
            <span>{t('content.cards.service')}</span>
            <select value={form.id_service} onChange={(event) => setForm({ ...form, id_service: event.target.value })}>
              <option value="">{t('content.cards.selectService')}</option>
              {services.map((service) => <option key={service.id_service} value={service.id_service}>{adminServiceName(service.name, lang)}</option>)}
            </select>
          </label>
          <label className="admin-field">
            <span>{t('content.cards.headline')}</span>
            <input value={form.headline} maxLength={150} onChange={(event) => setForm({ ...form, headline: event.target.value })} />
          </label>
          <label className="admin-field admin-field--wide">
            <span>{t('content.cards.summary')}</span>
            <textarea value={form.summary} maxLength={500} onChange={(event) => setForm({ ...form, summary: event.target.value })} />
          </label>
        </FormSection>

        <FormSection title={t('content.cards.presentation')}>
          <div className="admin-form-grid">
            <DropifyUpload
              label={t('content.cards.image')}
              value={form.image_url}
              onChange={(url) => setForm({ ...form, image_url: url })}
            />
            <label className="admin-field"><span>{t('content.cards.badge')}</span><input value={form.badge} maxLength={40} onChange={(event) => setForm({ ...form, badge: event.target.value })} /></label>
            <label className="admin-field"><span>{t('content.cards.ctaLabel')}</span><input value={form.cta_label} maxLength={60} onChange={(event) => setForm({ ...form, cta_label: event.target.value })} /></label>
            <label className="admin-field"><span>{t('content.cards.displayOrder')}</span><AdminNumberInput min={1} max={5000} decimals={0} value={form.sort_order} onChange={(value) => setForm({ ...form, sort_order: value })} /></label>
            <label className="admin-check"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />{t('content.cards.visibleHomepage')}</label>
          </div>
        </FormSection>

        {error && <div className="admin-inline-error">{error}</div>}
        <div className="admin-action-row">
          {editing && <button className="admin-button admin-button--secondary" onClick={resetForm}>{t('common.cancel')}</button>}
          <button className="admin-button" disabled={saving} onClick={saveCard}>{saving ? t('common.saving') : editing ? t('content.saveChanges') : t('content.cards.create')}</button>
        </div>
      </AdminCard>

      {loading ? (
        <Skeleton rows={6} />
      ) : cards.length === 0 ? (
        <EmptyState title={t('content.cards.noCards')} description={t('content.cards.noCardsNote')} />
      ) : (
        <div className="admin-content-grid">
          {cards.map((card) => (
            <AdminCard key={card.id_card} className="admin-content-card">
              {card.image_url ? <img src={normalizeImageUrl(card.image_url)} alt="" /> : <div className="admin-content-placeholder" />}
              <div>
                <div className="admin-section-heading"><StatusBadge status={card.is_active ? 'active' : 'inactive'} /><small>{t('content.faq.order', { order: card.sort_order })}</small></div>
                <p className="admin-eyebrow">{localizeCardText(card.badge, lang, adminServiceName(card.service_name, lang))}</p>
                <h3>{localizeCardText(card.headline, lang, adminServiceName(card.service_name, lang))}</h3>
                <p className="admin-muted">{localizeCardText(card.summary, lang, t('content.cards.noSummary'))}</p>
                <div className="admin-action-row">
                  <button className="admin-button admin-button--secondary admin-button--small" onClick={() => editCard(card)}><Edit3 size={13} /> {t('content.faq.editButton')}</button>
                  <button className="admin-button admin-button--danger admin-button--small" onClick={() => deleteCard(card)}><Trash2 size={13} /> {t('content.faq.deleteButton')}</button>
                </div>
              </div>
            </AdminCard>
          ))}
        </div>
      )}
    </div>
  );
}
