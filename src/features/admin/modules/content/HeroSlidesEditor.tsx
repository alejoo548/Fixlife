import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Plus, Save, Trash2 } from 'lucide-react';
import { adminApi } from '../../api/adminApi';
import { AdminCard, EmptyState, Skeleton } from '../../components/AdminUI';
import { DropifyUpload } from '../../components/DropifyUpload';

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
      setError(reason instanceof Error ? reason.message : 'Could not load hero slides.');
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
      setError(reason instanceof Error ? reason.message : 'Could not save hero slides.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton rows={4} />;

  return (
    <AdminCard>
      <div className="admin-section-heading">
        <div>
          <p className="admin-section-title">Homepage hero carousel</p>
          <p className="admin-muted">Slide images and texts (Tag, Title, Description) will be displayed in the homepage background carousel and captions.</p>
        </div>
        <button
          className="admin-button admin-button--secondary admin-button--small"
          disabled={slides.length >= 10}
          onClick={() => { setSlides((current) => [...current, createSlide()]); setDirty(true); }}
        >
          <Plus size={14} /> Add slide
        </button>
      </div>

      {slides.length === 0 ? (
        <EmptyState title="No hero slides" description="Add at least one slide before saving." />
      ) : (
        <div className="admin-slide-list">
          {slides.map((slide, index) => (
            <details key={slide.id || `new-${index}`} className="admin-slide-editor" open={index === 0 && slides.length === 1}>
              <summary>
                <div><strong>{index + 1}. {slide.title || 'Untitled slide'}</strong><span>{slide.tag || 'No tag'}</span></div>
                <ChevronDown size={16} />
              </summary>
              <div className="admin-form-grid">
                <label className="admin-field"><span>Tag (English)</span><input value={slide.tag} maxLength={50} onChange={(event) => update(index, 'tag', event.target.value)} /></label>
                <label className="admin-field"><span>CTA label (English)</span><input value={slide.cta} maxLength={80} onChange={(event) => update(index, 'cta', event.target.value)} /></label>
                <label className="admin-field admin-field--wide"><span>Title (English)</span><input value={slide.title} maxLength={120} onChange={(event) => update(index, 'title', event.target.value)} /></label>
                <label className="admin-field admin-field--wide"><span>Description (English)</span><textarea value={slide.description} maxLength={255} onChange={(event) => update(index, 'description', event.target.value)} /></label>
                <DropifyUpload
                  label="Slide Image"
                  value={slide.image}
                  onChange={(url) => update(index, 'image', url)}
                />
              </div>
              <p className="admin-muted" style={{ marginTop: '0.75rem' }}>Spanish translation (optional — falls back to English if left blank)</p>
              <div className="admin-form-grid">
                <label className="admin-field"><span>Tag (Español)</span><input value={slide.tag_es || ''} maxLength={50} onChange={(event) => update(index, 'tag_es', event.target.value)} /></label>
                <label className="admin-field"><span>CTA label (Español)</span><input value={slide.cta_es || ''} maxLength={80} onChange={(event) => update(index, 'cta_es', event.target.value)} /></label>
                <label className="admin-field admin-field--wide"><span>Title (Español)</span><input value={slide.title_es || ''} maxLength={120} onChange={(event) => update(index, 'title_es', event.target.value)} /></label>
                <label className="admin-field admin-field--wide"><span>Description (Español)</span><textarea value={slide.description_es || ''} maxLength={255} onChange={(event) => update(index, 'description_es', event.target.value)} /></label>
              </div>
              <button
                className="admin-button admin-button--danger admin-button--small"
                disabled={slides.length <= 1}
                onClick={() => { setSlides((current) => current.filter((_, slideIndex) => slideIndex !== index)); setDirty(true); }}
              >
                <Trash2 size={14} /> Remove slide
              </button>
            </details>
          ))}
        </div>
      )}

      {error && <div className="admin-inline-error">{error}</div>}
      <div className="admin-action-row">
        <button className="admin-button admin-button--secondary" disabled={!dirty || saving} onClick={load}>Discard changes</button>
        <button className="admin-button" disabled={!dirty || saving || slides.length === 0} onClick={save}><Save size={15} /> {saving ? 'Saving...' : 'Save carousel'}</button>
      </div>
    </AdminCard>
  );
}
