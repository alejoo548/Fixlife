import { useState } from 'react';
import { Activity, BadgeDollarSign, BriefcaseBusiness, CheckCircle2, FileText, Mail, Phone, Star, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { AdminUserDetail } from '../types';
import { AdminCard, DetailDrawer, DocumentPreviewModal, FormSection, Skeleton, StatusBadge } from './AdminUI';
import { normalizeImageUrl } from '../../../utils/imageUrls';
import { adminActionLabel, adminServiceName, adminStatusLabel, useAdminT } from '../adminI18n';

export function UserDetailDrawer({ detail, loading, open, onClose }: { detail: AdminUserDetail | null; loading: boolean; open: boolean; onClose: () => void }) {
  const { t, lang } = useAdminT();
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);
  const locale = lang === 'es' ? 'es-ES' : 'en-US';
  const money = (value: number) => value.toLocaleString(locale, { style: 'currency', currency: 'USD' });
  return (
    <DetailDrawer open={open} title={detail?.name || t('userDetail.accountDetail')} subtitle={detail ? `${adminStatusLabel(detail.role, lang)} · ${t('userDetail.userNumber', { id: detail.id_user })}` : t('userDetail.loadingAccount')} onClose={onClose}>
      {loading || !detail ? <Skeleton rows={7} /> : (
        <div className="admin-detail-stack">
          <div className="admin-profile-hero">
            <div className="admin-profile-avatar">{detail.profile_image ? <img src={normalizeImageUrl(detail.profile_image)} alt="" /> : <span>{detail.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>}</div>
            <div><h3>{detail.name}</h3><div className="admin-action-row"><StatusBadge status={detail.role} /><StatusBadge status={detail.is_active ? 'active' : 'inactive'} />{detail.professional && <StatusBadge status={detail.professional.membership_tier} />}</div></div>
          </div>

          <div className="admin-detail-grid">
            <AdminCard><Mail /><span>{t('common.email')}</span><strong>{detail.email}</strong><small>{t('userDetail.primaryEmail')}</small></AdminCard>
            <AdminCard><Phone /><span>{t('userDetail.phone')}</span><strong>{detail.phone_number || t('userDetail.notProvided')}</strong><small>{t('userDetail.username')}: {detail.username || t('userDetail.notConfigured')}</small></AdminCard>
            <AdminCard><UserRound /><span>{t('common.joined')}</span><strong>{new Date(detail.created_at).toLocaleDateString(locale)}</strong><small>{t('common.lastLogin')}: {detail.last_login ? new Date(detail.last_login).toLocaleString(locale) : t('common.never')}</small></AdminCard>
            <AdminCard><BadgeDollarSign /><span>{t('services.paidVolume')}</span><strong>{money(detail.summary.paid_volume)}</strong><small>{t('userDetail.visibleRequests')}</small></AdminCard>
          </div>

          <div className="admin-mini-metrics">
            <div><FileText /><strong>{detail.summary.request_count}</strong><span>{t('userDetail.totalRequests')}</span></div>
            <div><CheckCircle2 /><strong>{detail.summary.completed_count}</strong><span>{t('common.completed')}</span></div>
            <div><Activity /><strong>{detail.summary.cancelled_count}</strong><span>{t('common.cancelled')}</span></div>
          </div>

          {detail.professional && (
            <FormSection title={t('userDetail.professionalProfile')} description={detail.professional.bio || t('userDetail.noBio')}>
              <div className="admin-kv"><span>{t('pros.verification')}</span><StatusBadge status={detail.professional.is_verified === 1 ? 'approved' : detail.professional.is_verified === 2 ? 'rejected' : 'pending'} /></div>
              <div className="admin-kv"><span>{t('pros.tier')}</span><StatusBadge status={detail.professional.membership_tier} /></div>
              <div className="admin-kv"><span>{t('pros.rating')}</span><strong className="admin-rating-inline"><Star size={14} />{detail.professional.rating.average?.toFixed(1) || t('userDetail.noRating')} ({detail.professional.rating.count})</strong></div>
              <div className="admin-kv"><span>{t('nav.services')}</span><strong>{detail.professional.services.map((service) => service.name).join(', ') || t('common.none')}</strong></div>
              <div className="admin-document-links admin-field--wide">
        {detail.professional.dui_document_url && <button type="button" onClick={() => setPreview({ url: detail.professional!.dui_document_url!, title: t('pros.viewIdentity') })}><FileText size={15} /> {t('pros.viewIdentity')}</button>}
        {detail.professional.cert_document_url && <button type="button" onClick={() => setPreview({ url: detail.professional!.cert_document_url!, title: t('pros.viewCertificate') })}><BriefcaseBusiness size={15} /> {t('pros.viewCertificate')}</button>}
              </div>
            </FormSection>
          )}

          <FormSection title={t('userDetail.recentRequests', { count: detail.requests.length })}>
            <div className="admin-detail-list admin-field--wide">
              {detail.requests.length === 0 ? <p className="admin-muted">{t('userDetail.noRequests')}</p> : detail.requests.map((request) => (
                <Link key={request.id_request} to={`../requests?request=${request.id_request}`}>
                  <div><strong>#{request.id_request} · {adminServiceName(request.service_name, lang)}</strong><span>{request.location_text}</span></div>
                  <div><StatusBadge status={request.status} /><small>{money(request.payment_amount || request.budget)}</small></div>
                </Link>
              ))}
            </div>
          </FormSection>

          <FormSection title={t('userDetail.adminHistory', { count: detail.admin_activity.length })}>
            <div className="admin-event-list admin-field--wide">
              {detail.admin_activity.length === 0 ? <p className="admin-muted">{t('userDetail.noAdminChanges')}</p> : detail.admin_activity.map((item) => <div key={item.id_activity}><span className="admin-badge admin-badge--info">{adminActionLabel(item.action, lang)}</span><div><strong>{item.summary}</strong><p>{item.entity}</p></div><time>{new Date(item.created_at).toLocaleString(locale)}</time></div>)}
            </div>
          </FormSection>
        </div>
      )}
      <DocumentPreviewModal url={preview?.url ?? null} title={preview?.title ?? ''} onClose={() => setPreview(null)} />
    </DetailDrawer>
  );
}
