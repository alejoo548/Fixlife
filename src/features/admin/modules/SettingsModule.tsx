import { Bell, LockKeyhole, Palette, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AdminCard } from '../components/AdminUI';

export default function SettingsModule() {
  return <div className="admin-page-stack">
    <AdminCard><p className="admin-section-title">Platform settings</p><p className="admin-muted">Each area of the platform has its own settings. Use the shortcuts below to navigate directly.</p></AdminCard>
    <div className="admin-settings-grid">
      <AdminCard><Palette/><div><h3>Public appearance</h3><p className="admin-muted">Manage the homepage carousel and the service cards visible to customers.</p></div><Link className="admin-button admin-button--secondary admin-button--small" to="../content">Open content settings</Link></AdminCard>
      <AdminCard><ShieldCheck/><div><h3>Professional tiers</h3><p className="admin-muted">Control tier benefits, matching priority and verification requirements for professionals.</p></div><Link className="admin-button admin-button--secondary admin-button--small" to="../pros">Open professional settings</Link></AdminCard>
      <AdminCard><Bell/><div><h3>Customer support</h3><p className="admin-muted">Review open support threads and respond to customer inquiries.</p></div><Link className="admin-button admin-button--secondary admin-button--small" to="../support">Open support</Link></AdminCard>
      <AdminCard><LockKeyhole/><div><h3>Security and audit</h3><p className="admin-muted">Every admin action is logged with the responsible administrator, reason and timestamp.</p></div><Link className="admin-button admin-button--secondary admin-button--small" to="../activity">Review audit log</Link></AdminCard>
    </div>
  </div>;
}
