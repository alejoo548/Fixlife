import { Bell, LockKeyhole, Palette, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AdminCard } from '../components/AdminUI';
import { useAdminT } from '../adminI18n';

export default function SettingsModule() {
  const { t } = useAdminT();
  return <div className="admin-page-stack">
    <AdminCard><p className="admin-section-title">{t('settings.title')}</p><p className="admin-muted">{t('settings.note')}</p></AdminCard>
    <div className="admin-settings-grid">
      <AdminCard><Palette/><div><h3>{t('settings.publicAppearance')}</h3><p className="admin-muted">{t('settings.publicAppearanceNote')}</p></div><Link className="admin-button admin-button--secondary admin-button--small" to="../content">{t('settings.openContent')}</Link></AdminCard>
      <AdminCard><ShieldCheck/><div><h3>{t('settings.professionalTiers')}</h3><p className="admin-muted">{t('settings.professionalTiersNote')}</p></div><Link className="admin-button admin-button--secondary admin-button--small" to="../pros">{t('settings.openPros')}</Link></AdminCard>
      <AdminCard><Bell/><div><h3>{t('settings.customerSupport')}</h3><p className="admin-muted">{t('settings.customerSupportNote')}</p></div><Link className="admin-button admin-button--secondary admin-button--small" to="../support">{t('settings.openSupport')}</Link></AdminCard>
      <AdminCard><LockKeyhole/><div><h3>{t('settings.securityAudit')}</h3><p className="admin-muted">{t('settings.securityAuditNote')}</p></div><Link className="admin-button admin-button--secondary admin-button--small" to="../activity">{t('settings.reviewAudit')}</Link></AdminCard>
    </div>
  </div>;
}
