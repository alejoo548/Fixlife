import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { adminApi } from '../api/adminApi';
import { ConfirmActionDialog, DataTable, EmptyState, FilterBar, Skeleton, StatusBadge } from '../components/AdminUI';
import { UserDetailDrawer } from '../components/UserDetailDrawer';
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
      setError(reason instanceof Error ? reason.message : 'Could not load users.');
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
      setError(reason instanceof Error ? reason.message : 'Could not load user detail.');
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
      setError(reason instanceof Error ? reason.message : 'Could not update account status.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-page-stack">
      <FilterBar>
        <label className="admin-search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search clients" /></label>
        <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All accounts</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
      </FilterBar>

      {error && <div className="admin-inline-error">{error}</div>}
      {loading ? <Skeleton rows={7} /> : users.length === 0 ? <EmptyState title="No users found" description="No client accounts match filters." /> : (
        <DataTable
          rows={users}
          rowKey={(user) => user.id_user}
          onRowClick={openDetail}
          columns={[
            { key: 'user', label: 'User', render: (user) => <div className="admin-primary-cell"><strong>{user.name} {user.lastname}</strong><span>{user.email}</span></div> },
            { key: 'status', label: 'Status', render: (user) => <StatusBadge status={user.is_active ? 'active' : 'inactive'} /> },
            { key: 'created', label: 'Joined', render: (user) => new Date(user.created_at).toLocaleDateString() },
            { key: 'login', label: 'Last login', render: (user) => user.last_login ? new Date(user.last_login).toLocaleString() : 'Never' },
            { key: 'action', label: 'Action', render: (user) => <button className="admin-button admin-button--secondary admin-button--small" onClick={(event) => { event.stopPropagation(); setTarget(user); }}>{user.is_active ? 'Deactivate' : 'Activate'}</button> },
          ]}
        />
      )}

      <UserDetailDrawer detail={detail} loading={detailLoading} open={detailLoading || !!detail} onClose={() => setDetail(null)} />
      <ConfirmActionDialog
        open={!!target}
        title={`${target?.is_active ? 'Deactivate' : 'Activate'} ${target?.name || 'account'}`}
        description="Account access changes immediately and creates audit record."
        confirmLabel={target?.is_active ? 'Deactivate account' : 'Activate account'}
        reason={reason}
        onReasonChange={setReason}
        onCancel={() => { setTarget(null); setReason(''); }}
        onConfirm={toggleStatus}
        busy={saving}
      />
    </div>
  );
}
