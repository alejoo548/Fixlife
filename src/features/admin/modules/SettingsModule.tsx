import { useEffect, useState } from 'react';
import { Bell, LockKeyhole, Palette, Save, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AdminCard, AdminNumberInput, FormSection } from '../components/AdminUI';
import { adminApi } from '../api/adminApi';
import { showSweetAlert, showSweetToast } from '../../../utils/sweetAlert';

type PolicySettings = {
  client_no_show_grace_minutes: number;
  worker_client_no_show_grace_minutes: number;
  late_cancel_window_minutes: number;
  warning_incident_count: number;
  penalty_incident_count: number;
  temporary_block_incident_count: number;
  admin_review_incident_count: number;
  repeated_incident_penalty_amount: number;
  temporary_block_hours: number;
};

const defaults: PolicySettings = {
  client_no_show_grace_minutes: 30,
  worker_client_no_show_grace_minutes: 20,
  late_cancel_window_minutes: 120,
  warning_incident_count: 1,
  penalty_incident_count: 2,
  temporary_block_incident_count: 3,
  admin_review_incident_count: 4,
  repeated_incident_penalty_amount: 10,
  temporary_block_hours: 72,
};

const toForm = (settings: PolicySettings) =>
  Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, String(value)])) as Record<keyof PolicySettings, string>;

export default function SettingsModule() {
  const [form, setForm] = useState<Record<keyof PolicySettings, string>>(toForm(defaults));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      try {
        const payload = await adminApi.get<{ settings: PolicySettings }>(adminApi.endpoints.policySettings, true);
        if (alive) setForm(toForm(payload.settings || defaults));
      } catch (error) {
        showSweetAlert({ tone: 'error', title: 'Could not load policy settings', message: error instanceof Error ? error.message : 'Please try again.' });
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => { alive = false; };
  }, []);

  const setField = (key: keyof PolicySettings, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const savePolicy = async () => {
    const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, Number(value)])) as PolicySettings;
    if (
      payload.penalty_incident_count <= payload.warning_incident_count ||
      payload.temporary_block_incident_count <= payload.penalty_incident_count ||
      payload.admin_review_incident_count <= payload.temporary_block_incident_count
    ) {
      showSweetAlert({ tone: 'warning', title: 'Check thresholds', message: 'Thresholds must increase in order: warning, penalty, block, admin review.' });
      return;
    }

    setSaving(true);
    try {
      const response = await adminApi.put<{ settings: PolicySettings }>(adminApi.endpoints.policySettings, payload);
      setForm(toForm(response.settings || payload));
      showSweetToast({ tone: 'success', message: 'Policy settings saved.' });
    } catch (error) {
      showSweetAlert({ tone: 'error', title: 'Could not save policy settings', message: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  return <div className="admin-page-stack">
    <AdminCard><p className="admin-section-title">Platform settings</p><p className="admin-muted">Each area of the platform has its own settings. Use the shortcuts below to navigate directly.</p></AdminCard>
    <AdminCard>
      <div className="admin-section-heading">
        <div>
          <p className="admin-section-title">Trust & Safety policy</p>
          <p className="admin-muted">Control legal-style penalties, no-show grace windows and automatic escalation without changing code.</p>
        </div>
        <ShieldAlert />
      </div>
      {loading ? <p className="admin-muted">Loading policy settings...</p> : <>
        <FormSection title="Operational windows" description="These values control when cancellation or no-show actions become enforceable.">
          <label className="admin-field"><span>Worker no-show grace (minutes)</span><AdminNumberInput min={5} max={180} decimals={0} value={form.client_no_show_grace_minutes} onChange={(value) => setField('client_no_show_grace_minutes', value)} /></label>
          <label className="admin-field"><span>Client no-show grace (minutes)</span><AdminNumberInput min={5} max={180} decimals={0} value={form.worker_client_no_show_grace_minutes} onChange={(value) => setField('worker_client_no_show_grace_minutes', value)} /></label>
          <label className="admin-field"><span>Late cancellation window (minutes)</span><AdminNumberInput min={15} max={1440} decimals={0} value={form.late_cancel_window_minutes} onChange={(value) => setField('late_cancel_window_minutes', value)} /></label>
        </FormSection>
        <FormSection title="Automatic escalation" description="The system counts recent incidents and applies the next action at each threshold.">
          <label className="admin-field"><span>Warning at incident #</span><AdminNumberInput min={1} max={10} decimals={0} value={form.warning_incident_count} onChange={(value) => setField('warning_incident_count', value)} /></label>
          <label className="admin-field"><span>Penalty at incident #</span><AdminNumberInput min={2} max={20} decimals={0} value={form.penalty_incident_count} onChange={(value) => setField('penalty_incident_count', value)} /></label>
          <label className="admin-field"><span>Temporary block at incident #</span><AdminNumberInput min={3} max={30} decimals={0} value={form.temporary_block_incident_count} onChange={(value) => setField('temporary_block_incident_count', value)} /></label>
          <label className="admin-field"><span>Admin review at incident #</span><AdminNumberInput min={4} max={40} decimals={0} value={form.admin_review_incident_count} onChange={(value) => setField('admin_review_incident_count', value)} /></label>
          <label className="admin-field"><span>Repeated incident penalty ($)</span><AdminNumberInput min={0} max={500} decimals={2} value={form.repeated_incident_penalty_amount} onChange={(value) => setField('repeated_incident_penalty_amount', value)} /></label>
          <label className="admin-field"><span>Temporary block duration (hours)</span><AdminNumberInput min={1} max={720} decimals={0} value={form.temporary_block_hours} onChange={(value) => setField('temporary_block_hours', value)} /></label>
        </FormSection>
        <div className="admin-action-row">
          <button className="admin-button" disabled={saving} onClick={savePolicy}><Save size={16} />{saving ? 'Saving...' : 'Save policy settings'}</button>
          <Link className="admin-button admin-button--secondary" to="../trust-safety">Open Trust & Safety cases</Link>
        </div>
      </>}
    </AdminCard>
    <div className="admin-settings-grid">
      <AdminCard><Palette/><div><h3>Public appearance</h3><p className="admin-muted">Manage the homepage carousel and the service cards visible to customers.</p></div><Link className="admin-button admin-button--secondary admin-button--small" to="../content">Open content settings</Link></AdminCard>
      <AdminCard><ShieldCheck/><div><h3>Professional tiers</h3><p className="admin-muted">Control tier benefits, matching priority and verification requirements for professionals.</p></div><Link className="admin-button admin-button--secondary admin-button--small" to="../pros">Open professional settings</Link></AdminCard>
      <AdminCard><Bell/><div><h3>Customer support</h3><p className="admin-muted">Review open support threads and respond to customer inquiries.</p></div><Link className="admin-button admin-button--secondary admin-button--small" to="../support">Open support</Link></AdminCard>
      <AdminCard><LockKeyhole/><div><h3>Security and audit</h3><p className="admin-muted">Every admin action is logged with the responsible administrator, reason and timestamp.</p></div><Link className="admin-button admin-button--secondary admin-button--small" to="../activity">Review audit log</Link></AdminCard>
    </div>
  </div>;
}
