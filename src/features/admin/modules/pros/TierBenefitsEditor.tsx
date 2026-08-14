import { useCallback, useEffect, useState } from 'react';
import { Save, SlidersHorizontal } from 'lucide-react';
import { adminApi } from '../../api/adminApi';
import { AdminCard, AdminNumberInput, Skeleton, StatusBadge } from '../../components/AdminUI';
import { adminStatusLabel, useAdminT } from '../../adminI18n';

type Benefit = {
  tier: 'standard'|'verified'|'trusted'|'premium'|'elite';
  priority_weight: number;
  featured_profile_boost: number;
  max_active_leads: number;
  support_level: string;
  badge_label: string;
  monthly_fee: number;
  min_completed_jobs: number;
  benefits_summary: string | null;
};

export function TierBenefitsEditor() {
  const { t, lang } = useAdminT();
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const payload = await adminApi.get<{ benefits: Benefit[] }>(adminApi.endpoints.workerTierBenefits); setBenefits(payload.benefits || []); setDirty(false); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t('tiers.loadError')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const change = (tier: Benefit['tier'], field: keyof Benefit, value: string) => {
    setBenefits((current) => current.map((benefit) => benefit.tier === tier ? { ...benefit, [field]: ['priority_weight','featured_profile_boost','max_active_leads','monthly_fee','min_completed_jobs'].includes(field) ? Number(value) : value } : benefit));
    setDirty(true);
  };
  const save = async () => { setSaving(true); setError(''); try { await adminApi.put(adminApi.endpoints.workerTierBenefits, { benefits }); setDirty(false); } catch (reason) { setError(reason instanceof Error ? reason.message : t('tiers.saveError')); } finally { setSaving(false); } };

  if (loading) return <Skeleton rows={4}/>;
  return <AdminCard><div className="admin-section-heading"><div><p className="admin-section-title">{t('tiers.title')}</p><p className="admin-muted">{t('tiers.note')}</p></div><SlidersHorizontal/></div>
    <div className="admin-tier-grid">{benefits.map((benefit)=><details key={benefit.tier} className="admin-slide-editor"><summary><div><strong>{benefit.badge_label||adminStatusLabel(benefit.tier,lang)}</strong><span>{adminStatusLabel(benefit.tier,lang)}</span></div><StatusBadge status={benefit.tier}/></summary><div className="admin-form-grid"><label className="admin-field"><span>{t('tiers.badgeLabel')}</span><input value={benefit.badge_label} maxLength={60} onChange={(e)=>change(benefit.tier,'badge_label',e.target.value)}/></label><label className="admin-field"><span>{t('tiers.supportLevel')}</span><input value={benefit.support_level} maxLength={30} onChange={(e)=>change(benefit.tier,'support_level',e.target.value)}/></label><label className="admin-field"><span>{t('tiers.priorityWeight')}</span><AdminNumberInput min={1} max={20} decimals={0} value={benefit.priority_weight} onChange={(v)=>change(benefit.tier,'priority_weight',v)}/></label><label className="admin-field"><span>{t('tiers.profileBoost')}</span><AdminNumberInput min={1} max={10} decimals={2} value={benefit.featured_profile_boost} onChange={(v)=>change(benefit.tier,'featured_profile_boost',v)}/></label><label className="admin-field"><span>{t('tiers.maxActiveLeads')}</span><AdminNumberInput min={1} max={500} decimals={0} value={benefit.max_active_leads} onChange={(v)=>change(benefit.tier,'max_active_leads',v)}/></label><label className="admin-field"><span>{t('tiers.monthlyFee')}</span><AdminNumberInput min={0} max={9999} decimals={2} value={benefit.monthly_fee} onChange={(v)=>change(benefit.tier,'monthly_fee',v)}/></label><label className="admin-field"><span>{t('tiers.minCompletedJobs')}</span><AdminNumberInput min={0} max={100000} decimals={0} value={benefit.min_completed_jobs} onChange={(v)=>change(benefit.tier,'min_completed_jobs',v)}/></label><label className="admin-field admin-field--wide"><span>{t('tiers.benefitsSummary')}</span><textarea value={benefit.benefits_summary||''} maxLength={255} onChange={(e)=>change(benefit.tier,'benefits_summary',e.target.value)}/></label></div></details>)}</div>
    {error&&<div className="admin-inline-error">{error}</div>}<div className="admin-action-row"><button className="admin-button admin-button--secondary" disabled={!dirty||saving} onClick={load}>{t('common.discard')}</button><button className="admin-button" disabled={!dirty||saving} onClick={save}><Save size={14}/>{saving?t('common.saving'):t('tiers.save')}</button></div>
  </AdminCard>;
}
