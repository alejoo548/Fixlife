import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { adminApi } from '../api/adminApi';
import { ConfirmActionDialog, DataTable, EmptyState, FilterBar, Skeleton, StatusBadge } from '../components/AdminUI';
import { UserDetailDrawer } from '../components/UserDetailDrawer';
import { useAdminT } from '../adminI18n';
import type { AdminUserDetail } from '../types';

type User = {
  id_user: number;
  name: string;
  lastname: string;
  email: string;
  rol: string;
  is_active: number;
  created_at: string;
  last_login: string | null;
};

export default function UsersModule() {
  const { t, lang } = useAdminT();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [target, setTarget] = useState<User | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const query = new URLSearchParams({ role: 'client' });
    if (search) query.set('search', search);
    if (status !== 'all') query.set('status', status);
    try {
      const payload = await adminApi.get<{ users: User[] }>(`${adminApi.endpoints.users}?${query}`);
      setUsers(payload.users || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('users.loadError'));
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const openDetail = async (user: User) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const payload = await adminApi.get<{ data: AdminUserDetail }>(adminApi.endpoints.userDetail(user.id_user));
      setDetail(payload.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('users.detailError'));
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleStatus = async () => {
    if (!target) return;
    setSaving(true);
    try {
      await adminApi.put(adminApi.endpoints.updateUserStatus(target.id_user), {
        is_active: !target.is_active,
        reason,
      });
      setTarget(null);
      setReason('');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('users.updateError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-page-stack">
      <FilterBar>
        <label className="admin-search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('users.search')} maxLength={120} /></label>
        <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">{t('common.allAccounts')}</option><option value="active">{t('common.active')}</option><option value="inactive">{t('common.inactive')}</option></select>
      </FilterBar>

      {error && <div className="admin-inline-error">{error}</div>}
      {loading ? <Skeleton rows={7} /> : users.length === 0 ? <EmptyState title={t('users.emptyTitle')} description={t('users.emptyDescription')} /> : (
        <DataTable
          rows={users}
          rowKey={(user) => user.id_user}
          onRowClick={openDetail}
          columns={[
            { key: 'user', label: t('users.user'), render: (user) => <div className="admin-primary-cell"><strong>{user.name} {user.lastname}</strong><span>{user.email}</span></div> },
            { key: 'status', label: t('common.status'), render: (user) => <StatusBadge status={user.is_active ? 'active' : 'inactive'} /> },
            { key: 'created', label: t('common.joined'), render: (user) => new Date(user.created_at).toLocaleDateString(lang === 'es' ? 'es-SV' : 'en-US') },
            { key: 'login', label: t('common.lastLogin'), render: (user) => user.last_login ? new Date(user.last_login).toLocaleString(lang === 'es' ? 'es-SV' : 'en-US') : t('common.never') },
            { key: 'action', label: t('common.action'), render: (user) => <button className="admin-button admin-button--secondary admin-button--small" onClick={(event) => { event.stopPropagation(); setTarget(user); }}>{user.is_active ? t('users.deactivate') : t('users.activate')}</button> },
          ]}
        />
      )}

      <UserDetailDrawer detail={detail} loading={detailLoading} open={detailLoading || !!detail} onClose={() => setDetail(null)} />
      <ConfirmActionDialog
        open={!!target}
        title={`${target?.is_active ? t('users.deactivate') : t('users.activate')} ${target?.name || t('users.account')}`}
        description={t('users.statusDescription')}
        confirmLabel={target?.is_active ? t('users.deactivateAccount') : t('users.activateAccount')}
        reason={reason}
        onReasonChange={setReason}
        onCancel={() => { setTarget(null); setReason(''); }}
        onConfirm={toggleStatus}
        busy={saving}
      />
    </div>
  );
}
