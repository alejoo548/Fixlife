import { Activity, BadgeDollarSign, BriefcaseBusiness, CheckCircle2, FileText, Mail, Phone, Star, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { AdminUserDetail } from '../types';
import { AdminCard, DetailDrawer, FormSection, Skeleton, StatusBadge } from './AdminUI';

const money = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export function UserDetailDrawer({ detail, loading, open, onClose }: { detail: AdminUserDetail | null; loading: boolean; open: boolean; onClose: () => void }) {
  return (
    <DetailDrawer open={open} title={detail?.name || 'Account detail'} subtitle={detail ? `${detail.role} · User #${detail.id_user}` : 'Loading account'} onClose={onClose}>
      {loading || !detail ? <Skeleton rows={7} /> : (
        <div className="admin-detail-stack">
          <div className="admin-profile-hero">
            <div className="admin-profile-avatar">{detail.profile_image ? <img src={detail.profile_image} alt="" /> : <span>{detail.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>}</div>
            <div><h3>{detail.name}</h3><div className="admin-action-row"><StatusBadge status={detail.role} /><StatusBadge status={detail.is_active ? 'active' : 'inactive'} />{detail.professional && <StatusBadge status={detail.professional.membership_tier} />}</div></div>
          </div>

          <div className="admin-detail-grid">
            <AdminCard><Mail /><span>Email</span><strong>{detail.email}</strong><small>Primary account address</small></AdminCard>
            <AdminCard><Phone /><span>Phone</span><strong>{detail.phone_number || 'Not provided'}</strong><small>Username: {detail.username || 'Not configured'}</small></AdminCard>
            <AdminCard><UserRound /><span>Joined</span><strong>{new Date(detail.created_at).toLocaleDateString()}</strong><small>Last login: {detail.last_login ? new Date(detail.last_login).toLocaleString() : 'Never'}</small></AdminCard>
            <AdminCard><BadgeDollarSign /><span>Paid volume</span><strong>{money(detail.summary.paid_volume)}</strong><small>Across visible requests</small></AdminCard>
          </div>

          <div className="admin-mini-metrics">
            <div><FileText /><strong>{detail.summary.request_count}</strong><span>Total requests</span></div>
            <div><CheckCircle2 /><strong>{detail.summary.completed_count}</strong><span>Completed</span></div>
            <div><Activity /><strong>{detail.summary.cancelled_count}</strong><span>Cancelled</span></div>
          </div>

          {detail.professional && (
            <FormSection title="Professional profile" description={detail.professional.bio || 'No professional biography.'}>
              <div className="admin-kv"><span>Verification</span><StatusBadge status={detail.professional.is_verified === 1 ? 'approved' : detail.professional.is_verified === 2 ? 'rejected' : 'pending'} /></div>
              <div className="admin-kv"><span>Tier</span><StatusBadge status={detail.professional.membership_tier} /></div>
              <div className="admin-kv"><span>Rating</span><strong className="admin-rating-inline"><Star size={14} />{detail.professional.rating.average?.toFixed(1) || 'No rating'} ({detail.professional.rating.count})</strong></div>
              <div className="admin-kv"><span>Services</span><strong>{detail.professional.services.map((service) => service.name).join(', ') || 'None'}</strong></div>
              <div className="admin-document-links admin-field--wide">
                {detail.professional.dui_document_url && <a href={detail.professional.dui_document_url} target="_blank" rel="noreferrer"><FileText size={15} /> View identity document</a>}
                {detail.professional.cert_document_url && <a href={detail.professional.cert_document_url} target="_blank" rel="noreferrer"><BriefcaseBusiness size={15} /> View certificate</a>}
              </div>
            </FormSection>
          )}

          <FormSection title={`Recent requests (${detail.requests.length})`}>
            <div className="admin-detail-list admin-field--wide">
              {detail.requests.length === 0 ? <p className="admin-muted">No requests associated with this account.</p> : detail.requests.map((request) => (
                <Link key={request.id_request} to={`../requests?request=${request.id_request}`}>
                  <div><strong>#{request.id_request} · {request.service_name}</strong><span>{request.location_text}</span></div>
                  <div><StatusBadge status={request.status} /><small>{money(request.payment_amount || request.budget)}</small></div>
                </Link>
              ))}
            </div>
          </FormSection>

          <FormSection title={`Administrative history (${detail.admin_activity.length})`}>
            <div className="admin-event-list admin-field--wide">
              {detail.admin_activity.length === 0 ? <p className="admin-muted">No administrative changes recorded.</p> : detail.admin_activity.map((item) => <div key={item.id_activity}><StatusBadge status={item.action} /><div><strong>{item.summary}</strong><p>{item.entity}</p></div><time>{new Date(item.created_at).toLocaleString()}</time></div>)}
            </div>
          </FormSection>
        </div>
      )}
    </DetailDrawer>
  );
}
