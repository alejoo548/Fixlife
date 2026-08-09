import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Plus, Save, Trash2 } from 'lucide-react';
import { adminApi } from '../../api/adminApi';
import { AdminCard, EmptyState, Skeleton } from '../../components/AdminUI';
import { DropifyUpload } from '../../components/DropifyUpload';
import { adminErrorMessage, useAdminT } from '../../adminI18n';

type HeroSlide = {
  id?: number;
  image: string;
  tag: string;
  title: string;
  description: string;
  cta: string;
  tag_es?: string;
  title_es?: string;
  description_es?: string;
  cta_es?: string;
};

const createSlide = (): HeroSlide => ({ image: '', tag: '', title: '', description: '', cta: '', tag_es: '', title_es: '', description_es: '', cta_es: '' });

export function HeroSlidesEditor() {
  const { t } = useAdminT();
  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await adminApi.get<{ slides: HeroSlide[] }>(adminApi.endpoints.heroSlides);
      setSlides(payload.slides || []);
      setDirty(false);
    } catch (reason) {
      setError(adminErrorMessage(reason, t('content.slides.loadError'), t));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = (index: number, field: keyof HeroSlide, value: string) => {
    setSlides((current) => current.map((slide, slideIndex) => slideIndex === index ? { ...slide, [field]: value } : slide));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = await adminApi.put<{ slides: HeroSlide[] }>(adminApi.endpoints.heroSlides, { slides });
      setSlides(payload.slides || slides);
      setDirty(false);
    } catch (reason) {
      setError(adminErrorMessage(reason, t('content.slides.saveError'), t));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton rows={4} />;

  return (
    <AdminCard>
      <div className="admin-section-heading">
        <div>
          <p className="admin-section-title">{t('content.slides.title')}</p>
          <p className="admin-muted">{t('content.slides.note')}</p>
        </div>
        <button
          className="admin-button admin-button--secondary admin-button--small"
          disabled={slides.length >= 10}
          onClick={() => { setSlides((current) => [...current, createSlide()]); setDirty(true); }}
        >
          <Plus size={14} /> {t('content.slides.add')}
        </button>
      </div>

      {slides.length === 0 ? (
        <EmptyState title={t('content.slides.noSlides')} description={t('content.slides.noSlidesNote')} />
      ) : (
        <div className="admin-slide-list">
          {slides.map((slide, index) => (
            <details key={slide.id || `new-${index}`} className="admin-slide-editor" open={index === 0 && slides.length === 1}>
              <summary>
                <div><strong>{index + 1}. {slide.title || t('content.slides.untitled')}</strong><span>{slide.tag || t('content.slides.noTag')}</span></div>
                <ChevronDown size={16} />
              </summary>
              <div className="admin-form-grid">
                <label className="admin-field"><span>{t('content.slides.tagEn')}</span><input value={slide.tag} maxLength={50} onChange={(event) => update(index, 'tag', event.target.value)} /></label>
                <label className="admin-field"><span>{t('content.slides.ctaEn')}</span><input value={slide.cta} maxLength={80} onChange={(event) => update(index, 'cta', event.target.value)} /></label>
                <label className="admin-field admin-field--wide"><span>{t('content.slides.titleEn')}</span><input value={slide.title} maxLength={120} onChange={(event) => update(index, 'title', event.target.value)} /></label>
                <label className="admin-field admin-field--wide"><span>{t('content.slides.descriptionEn')}</span><textarea value={slide.description} maxLength={255} onChange={(event) => update(index, 'description', event.target.value)} /></label>
                <DropifyUpload
                  label={t('content.slides.image')}
                  value={slide.image}
                  onChange={(url) => update(index, 'image', url)}
                />
              </div>
              <p className="admin-muted" style={{ marginTop: '0.75rem' }}>{t('content.slides.spanishNote')}</p>
              <div className="admin-form-grid">
                <label className="admin-field"><span>{t('content.slides.tagEs')}</span><input value={slide.tag_es || ''} maxLength={50} onChange={(event) => update(index, 'tag_es', event.target.value)} /></label>
                <label className="admin-field"><span>{t('content.slides.ctaEs')}</span><input value={slide.cta_es || ''} maxLength={80} onChange={(event) => update(index, 'cta_es', event.target.value)} /></label>
                <label className="admin-field admin-field--wide"><span>{t('content.slides.titleEs')}</span><input value={slide.title_es || ''} maxLength={120} onChange={(event) => update(index, 'title_es', event.target.value)} /></label>
                <label className="admin-field admin-field--wide"><span>{t('content.slides.descriptionEs')}</span><textarea value={slide.description_es || ''} maxLength={255} onChange={(event) => update(index, 'description_es', event.target.value)} /></label>
              </div>
              <button
                className="admin-button admin-button--danger admin-button--small"
                disabled={slides.length <= 1}
                onClick={() => { setSlides((current) => current.filter((_, slideIndex) => slideIndex !== index)); setDirty(true); }}
              >
                <Trash2 size={14} /> {t('content.slides.remove')}
              </button>
            </details>
          ))}
        </div>
      )}

      {error && <div className="admin-inline-error">{error}</div>}
      <div className="admin-action-row">
        <button className="admin-button admin-button--secondary" disabled={!dirty || saving} onClick={load}>{t('content.slides.discard')}</button>
        <button className="admin-button" disabled={!dirty || saving || slides.length === 0} onClick={save}><Save size={15} /> {saving ? t('common.saving') : t('content.slides.save')}</button>
      </div>
    </AdminCard>
  );
}
