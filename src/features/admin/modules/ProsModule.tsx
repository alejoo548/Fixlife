import { useCallback, useEffect, useState } from 'react';
import { Search, Star } from 'lucide-react';
import { adminApi } from '../api/adminApi';
import {
  AdminCard,
  ConfirmActionDialog,
  DataTable,
  DocumentPreviewModal,
  EmptyState,
  FilterBar,
  Skeleton,
  StatusBadge,
} from '../components/AdminUI';
import { UserDetailDrawer } from '../components/UserDetailDrawer';
import { useAdminT } from '../adminI18n';
import type { AdminUserDetail } from '../types';
import { TierBenefitsEditor } from './pros/TierBenefitsEditor';

type Professional = {
  id_user: number;
  name: string;
  lastname: string;
  email: string;
  is_active: number;
  is_verified: number;
  membership_tier: string;
  completed_jobs: number;
  rating_average: number | null;
  rating_count: number;
};

type PendingProfessional = {
  id_user: number;
  name: string;
  lastname: string;
  email: string;
  services: Array<{ name: string }>;
  phone_number?: string | null;
  bio?: string | null;
  dui_document_url?: string | null;
  cert_document_url?: string | null;
};

type Decision = { professional: PendingProfessional; action: 'approve' | 'reject' };
export default function ProsModule() {
  const { t } = useAdminT();
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [pending, setPending] = useState<PendingProfessional[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersPayload, pendingPayload] = await Promise.all([
        adminApi.get<{ users: Professional[] }>(
          `${adminApi.endpoints.users}?role=worker&search=${encodeURIComponent(search)}`,
        ),
        adminApi.get<{ workers: PendingProfessional[] }>(adminApi.endpoints.pendingWorkers),
      ]);
      setProfessionals(usersPayload.users || []);
      setPending(pendingPayload.workers || []);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const submitDecision = async () => {
    if (!decision) return;
    setSaving(true);
    try {
      const endpoint = decision.action === 'approve'
        ? adminApi.endpoints.approveWorker(decision.professional.id_user)
        : adminApi.endpoints.rejectWorker(decision.professional.id_user);
      await adminApi.put(endpoint, { reason });
      setDecision(null);
      setReason('');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (professional: Professional) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const payload = await adminApi.get<{ data: AdminUserDetail }>(adminApi.endpoints.userDetail(professional.id_user));
      setDetail(payload.data);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="admin-page-stack">
      <TierBenefitsEditor />
      {pending.length > 0 && (
        <AdminCard>
          <div className="admin-section-heading">
            <div>
              <p className="admin-section-title">{t('pros.pendingVerification')}</p>
              <p className="admin-muted">{t('pros.pendingVerificationNote')}</p>
            </div>
            <StatusBadge status="pending" />
          </div>
          <div className="admin-compact-list">
            {pending.map((professional) => (
              <div key={professional.id_user}>
                <div>
                  <strong>{professional.name} {professional.lastname}</strong>
                  <span>
                    {professional.email} · {professional.services?.map((service) => service.name).join(', ') || t('pros.noServices')}
                  </span>
                  <small>{professional.phone_number || t('common.noPhone')}{professional.bio ? ` · ${professional.bio}` : ''}</small>
                  <div className="admin-document-links">
                    {professional.dui_document_url && <button type="button" onClick={() => setPreview({ url: professional.dui_document_url!, title: t('pros.viewIdentity') })}>{t('pros.viewIdentity')}</button>}
                    {professional.cert_document_url && <button type="button" onClick={() => setPreview({ url: professional.cert_document_url!, title: t('pros.viewCertificate') })}>{t('pros.viewCertificate')}</button>}
                  </div>
                </div>
                <div className="admin-action-row">
                  <button
                    className="admin-button admin-button--secondary admin-button--small"
                    onClick={() => setDecision({ professional, action: 'reject' })}
                  >
                    {t('pros.reject')}
                  </button>
                  <button
                    className="admin-button admin-button--small"
                    onClick={() => setDecision({ professional, action: 'approve' })}
                  >
                    {t('pros.approve')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </AdminCard>
      )}

      <FilterBar>
        <label className="admin-search-field">
          <Search size={17} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('pros.search')} maxLength={120} />
        </label>
      </FilterBar>

      {loading ? (
        <Skeleton rows={7} />
      ) : professionals.length === 0 ? (
        <EmptyState title={t('pros.emptyTitle')} description={t('pros.emptyDescription')} />
      ) : (
        <DataTable
          rows={professionals}
          rowKey={(professional) => professional.id_user}
          onRowClick={openDetail}
          columns={[
            { key: 'professional', label: t('pros.professional'), render: (professional) => <div className="admin-primary-cell"><strong>{professional.name} {professional.lastname}</strong><span>{professional.email}</span></div> },
            { key: 'verified', label: t('pros.verification'), render: (professional) => <StatusBadge status={professional.is_verified ? 'approved' : 'pending'} /> },
            { key: 'tier', label: t('pros.tier'), render: (professional) => <StatusBadge status={professional.membership_tier || 'standard'} /> },
            { key: 'jobs', label: t('pros.completed'), render: (professional) => <strong>{professional.completed_jobs || 0}</strong> },
            { key: 'rating', label: t('pros.rating'), render: (professional) => <span className="admin-rating-inline"><Star size={14} />{professional.rating_average?.toFixed(1) || '-'} ({professional.rating_count || 0})</span> },
            { key: 'status', label: t('pros.account'), render: (professional) => <StatusBadge status={professional.is_active ? 'active' : 'inactive'} /> },
          ]}
        />
      )}

      <ConfirmActionDialog
        open={!!decision}
        title={decision?.action === 'approve' ? t('pros.approveProfessional') : t('pros.rejectProfessional')}
        description={t('pros.decisionDescription')}
        confirmLabel={decision?.action === 'approve' ? t('pros.approveProfessional') : t('pros.rejectProfessional')}
        reason={reason}
        onReasonChange={setReason}
        onCancel={() => { setDecision(null); setReason(''); }}
        onConfirm={submitDecision}
        busy={saving}
      />
      <UserDetailDrawer detail={detail} loading={detailLoading} open={detailLoading || !!detail} onClose={() => setDetail(null)} />
      <DocumentPreviewModal url={preview?.url ?? null} title={preview?.title ?? ''} onClose={() => setPreview(null)} />
    </div>
  );
}
