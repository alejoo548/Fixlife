import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, ShieldCheck, Crown, Lock } from 'lucide-react';
import { adminApi } from '../api/adminApi';
import { DataTable, EmptyState, FilterBar, Skeleton, StatusBadge } from '../components/AdminUI';
import { getAuthUser } from '../../../utils/session';
import { useAdminT } from '../adminI18n';

type AdminAccount = {
  id_user: number;
  name: string;
  lastname: string;
  email: string;
  rol: string;
  is_active: number;
  created_at: string;
  last_login: string | null;
};

export default function AdminsModule() {
  const { t, lang } = useAdminT();
  const locale = lang === 'es' ? 'es-SV' : 'en-US';
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const currentUser = getAuthUser('admin');
  const currentId = Number(currentUser?.id_user ?? currentUser?.user_id ?? 0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const query = new URLSearchParams({ role: 'admin' });
    if (search.trim()) query.set('search', search.trim());
    try {
      const payload = await adminApi.get<{ users: AdminAccount[] }>(`${adminApi.endpoints.users}?${query}`);
      setAdmins(payload.users || []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('admins.loadError'));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const { rootCount, adminCount } = useMemo(() => ({
    rootCount: admins.filter((a) => a.rol === 'root').length,
    adminCount: admins.filter((a) => a.rol === 'admin').length,
  }), [admins]);

  const RoleBadge = ({ rol }: { rol: string }) =>
    rol === 'root' ? (
      <span className="admin-pill" style={{ background: 'rgba(245,158,11,0.14)', color: '#b45309', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Crown size={13} /> {t('common.root')}
      </span>
    ) : (
      <span className="admin-pill" style={{ background: 'rgba(0,144,255,0.12)', color: '#0070e0', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <ShieldCheck size={13} /> {t('common.admin')}
      </span>
    );

  return (
    <div className="admin-page-stack">
      <div className="admin-metrics-grid">
        <div className="admin-card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.14)', color: '#b45309' }}><Crown size={18} /></div>
          <div><strong style={{ fontSize: 22 }}>{rootCount}</strong><p className="admin-muted">{t('admins.rootAccount')}</p></div>
        </div>
        <div className="admin-card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(0,144,255,0.12)', color: '#0070e0' }}><ShieldCheck size={18} /></div>
          <div><strong style={{ fontSize: 22 }}>{adminCount}</strong><p className="admin-muted">{t('admins.administrators')}</p></div>
        </div>
      </div>

      <div className="admin-card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
        <Lock size={15} className="admin-muted" />
        <span className="admin-muted" style={{ fontSize: 13 }}>
          {t('admins.readonly')}
        </span>
      </div>

      <FilterBar>
        <label className="admin-search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('admins.search')} maxLength={120} /></label>
      </FilterBar>

      {error && <div className="admin-inline-error">{error}</div>}
      {loading ? <Skeleton rows={5} /> : admins.length === 0 ? <EmptyState title={t('admins.emptyTitle')} description={t('admins.emptyDescription')} /> : (
        <DataTable
          rows={admins}
          rowKey={(admin) => admin.id_user}
          columns={[
            {
              key: 'admin', label: t('admins.administrator'), render: (admin) => (
                <div className="admin-primary-cell">
                  <strong>
                    {admin.name} {admin.lastname}
                    {admin.id_user === currentId && <span className="admin-pill" style={{ marginLeft: 8, background: 'rgba(16,185,129,0.14)', color: '#047857' }}>{t('admins.you')}</span>}
                  </strong>
                  <span>{admin.email}</span>
                </div>
              ),
            },
            { key: 'role', label: t('admins.role'), render: (admin) => <RoleBadge rol={admin.rol} /> },
            { key: 'status', label: t('common.status'), render: (admin) => <StatusBadge status={admin.is_active ? 'active' : 'inactive'} /> },
            { key: 'created', label: t('common.joined'), render: (admin) => new Date(admin.created_at).toLocaleDateString(locale) },
            { key: 'login', label: t('common.lastLogin'), render: (admin) => admin.last_login ? new Date(admin.last_login).toLocaleString(locale) : t('common.never') },
          ]}
        />
      )}
    </div>
  );
}
