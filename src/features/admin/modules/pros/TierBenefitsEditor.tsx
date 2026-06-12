import { useCallback, useEffect, useState } from 'react';
import { Save, SlidersHorizontal } from 'lucide-react';
import { adminApi } from '../../api/adminApi';
import { AdminCard, AdminNumberInput, Skeleton, StatusBadge } from '../../components/AdminUI';

type Benefit = {
  tier: 'standard'|'verified'|'trusted'|'premium'|'elite';
  priority_weight: number;
  featured_profile_boost: number;
  max_active_leads: number;
  support_level: string;
  badge_label: string;
  monthly_fee: number;
  benefits_summary: string | null;
};

export function TierBenefitsEditor() {
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const payload = await adminApi.get<{ benefits: Benefit[] }>(adminApi.endpoints.workerTierBenefits); setBenefits(payload.benefits || []); setDirty(false); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load tier benefits.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const change = (tier: Benefit['tier'], field: keyof Benefit, value: string) => {
    setBenefits((current) => current.map((benefit) => benefit.tier === tier ? { ...benefit, [field]: ['priority_weight','featured_profile_boost','max_active_leads','monthly_fee'].includes(field) ? Number(value) : value } : benefit));
    setDirty(true);
  };
  const save = async () => { setSaving(true); setError(''); try { await adminApi.put(adminApi.endpoints.workerTierBenefits, { benefits }); setDirty(false); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save tier benefits.'); } finally { setSaving(false); } };

  if (loading) return <Skeleton rows={4}/>;
  return <AdminCard><div className="admin-section-heading"><div><p className="admin-section-title">Professional tier benefits</p><p className="admin-muted">Matching priority, lead limits and support level per tier.</p></div><SlidersHorizontal/></div>
    <div className="admin-tier-grid">{benefits.map((benefit)=><details key={benefit.tier} className="admin-slide-editor"><summary><div><strong>{benefit.badge_label||benefit.tier}</strong><span>{benefit.tier}</span></div><StatusBadge status={benefit.tier}/></summary><div className="admin-form-grid"><label className="admin-field"><span>Badge label</span><input value={benefit.badge_label} onChange={(e)=>change(benefit.tier,'badge_label',e.target.value)}/></label><label className="admin-field"><span>Support level</span><input value={benefit.support_level} onChange={(e)=>change(benefit.tier,'support_level',e.target.value)}/></label><label className="admin-field"><span>Priority weight</span><AdminNumberInput min={1} max={20} decimals={0} value={benefit.priority_weight} onChange={(v)=>change(benefit.tier,'priority_weight',v)}/></label><label className="admin-field"><span>Profile boost</span><AdminNumberInput min={1} max={10} decimals={2} value={benefit.featured_profile_boost} onChange={(v)=>change(benefit.tier,'featured_profile_boost',v)}/></label><label className="admin-field"><span>Max active leads</span><AdminNumberInput min={1} max={500} decimals={0} value={benefit.max_active_leads} onChange={(v)=>change(benefit.tier,'max_active_leads',v)}/></label><label className="admin-field"><span>Monthly fee</span><AdminNumberInput min={0} max={9999} decimals={2} value={benefit.monthly_fee} onChange={(v)=>change(benefit.tier,'monthly_fee',v)}/></label><label className="admin-field admin-field--wide"><span>Benefits summary</span><textarea value={benefit.benefits_summary||''} onChange={(e)=>change(benefit.tier,'benefits_summary',e.target.value)}/></label></div></details>)}</div>
    {error&&<div className="admin-inline-error">{error}</div>}<div className="admin-action-row"><button className="admin-button admin-button--secondary" disabled={!dirty||saving} onClick={load}>Discard</button><button className="admin-button" disabled={!dirty||saving} onClick={save}><Save size={14}/>{saving?'Saving...':'Save tier benefits'}</button></div>
  </AdminCard>;
}
