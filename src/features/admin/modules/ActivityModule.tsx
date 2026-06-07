import { useMemo, useEffect, useState } from 'react';
import { adminApi } from '../api/adminApi';
import { AdminCard, DetailDrawer, EmptyState, FilterBar, Skeleton, formatAdminLabel } from '../components/AdminUI';
import { connectSupportSocket, addActivityListener } from '../../../services/supportSocket';
import { getToken } from '../../../utils/session';

type Item = { id_activity: number; action: string; entity: string; entity_id: number | null; summary: string; created_at: string; admin: { name: string; email: string | null } | null; metadata: unknown };

const actionStyle = (action: string) => {
  const a = action.toLowerCase();
  if (['create', 'approve', 'activate', 'resolve'].includes(a)) return { background: 'rgba(5,150,105,0.12)', color: '#059669', border: '1px solid rgba(5,150,105,0.25)' };
  if (a === 'update') return { background: 'rgba(37,99,235,0.1)', color: '#3b82f6', border: '1px solid rgba(37,99,235,0.2)' };
  if (['delete', 'reject', 'cancel'].includes(a)) return { background: 'rgba(220,38,38,0.1)', color: '#ef4444', border: '1px solid rgba(220,38,38,0.2)' };
  if (['deactivate', 'status_change', 'reassign'].includes(a)) return { background: 'rgba(217,119,6,0.12)', color: '#d97706', border: '1px solid rgba(217,119,6,0.25)' };
  if (a === 'role_change') return { background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.25)' };
  return { background: 'rgba(100,116,139,0.1)', color: 'var(--admin-muted)', border: '1px solid var(--admin-border)' };
};

const entityStyle = (entity: string) => {
  const e = entity.toLowerCase();
  if (e === 'service') return { background: 'rgba(234,179,8,0.12)', color: '#ca8a04', border: '1px solid rgba(234,179,8,0.25)' };
  if (e === 'service_card') return { background: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.25)' };
  if (e === 'worker') return { background: 'rgba(5,150,105,0.12)', color: '#059669', border: '1px solid rgba(5,150,105,0.25)' };
  if (e === 'hero_slide') return { background: 'rgba(168,85,247,0.12)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.25)' };
  if (e === 'request') return { background: 'rgba(14,165,233,0.12)', color: '#0ea5e9', border: '1px solid rgba(14,165,233,0.25)' };
  return { background: 'rgba(100,116,139,0.1)', color: 'var(--admin-muted)', border: '1px solid var(--admin-border)' };
};

const Badge = ({ label, style }: { label: string; style: React.CSSProperties }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, textTransform: 'capitalize', letterSpacing: '0.03em', ...style }}>
    {label.replace(/_/g, ' ')}
  </span>
);

export default function ActivityModule() {
  const [allRows, setAllRows] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('all');
  const [entity, setEntity] = useState('all');
  const [selected, setSelected] = useState<Item | null>(null);

  useEffect(() => {
    setLoading(true);
    adminApi.get<any>(`${adminApi.endpoints.activity}?limit=300`)
      .then((payload) => setAllRows(payload.activities || payload.data || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const token = getToken('admin');
    if (!token) return;

    connectSupportSocket({ token });

    const off = addActivityListener((item) => {
      setAllRows((prev) => (prev.some((r) => r.id_activity === item.id_activity) ? prev : [item as Item, ...prev]));
    });

    return off;
  }, []);

  const actionOptions = useMemo(() => ['all', ...Array.from(new Set(allRows.map((r) => r.action))).sort()], [allRows]);
  const entityOptions = useMemo(() => ['all', ...Array.from(new Set(allRows.map((r) => r.entity))).sort()], [allRows]);

  const rows = useMemo(() => allRows.filter((r) => (action === 'all' || r.action === action) && (entity === 'all' || r.entity === entity)), [allRows, action, entity]);

  return (
    <div className="admin-page-stack">
      <FilterBar>
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          {actionOptions.map((v) => <option key={v} value={v}>{v === 'all' ? 'All actions' : formatAdminLabel(v)}</option>)}
        </select>
        <select value={entity} onChange={(e) => setEntity(e.target.value)}>
          {entityOptions.map((v) => <option key={v} value={v}>{v === 'all' ? 'All sections' : formatAdminLabel(v)}</option>)}
        </select>
      </FilterBar>

      {loading ? <Skeleton rows={8} /> : rows.length === 0 ? <EmptyState title="No activity found" description="Audited admin actions appear here." /> : (
        <AdminCard className="admin-table-card">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Summary</th>
                  <th>Action</th>
                  <th>Section</th>
                  <th>Administrator</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id_activity} className="admin-table__clickable" onClick={() => setSelected(row)}>
                    <td>
                      <p style={{ fontWeight: 600, fontSize: 13, margin: 0 }}>{row.summary}</p>
                      {row.entity_id && <p style={{ fontSize: 11, color: 'var(--admin-muted)', margin: 0 }}>ID {row.entity_id}</p>}
                    </td>
                    <td><Badge label={row.action} style={actionStyle(row.action)} /></td>
                    <td><Badge label={row.entity} style={entityStyle(row.entity)} /></td>
                    <td>
                      <p style={{ fontWeight: 600, fontSize: 13, margin: 0 }}>{row.admin?.name || 'System'}</p>
                      <p style={{ fontSize: 11, color: 'var(--admin-muted)', margin: 0 }}>{row.admin?.email || ''}</p>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--admin-muted)' }}>{new Date(row.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminCard>
      )}

      <DetailDrawer
        open={!!selected}
        title={selected ? formatAdminLabel(`${selected.action} ${selected.entity}`) : 'Activity detail'}
        subtitle={selected ? `Audit record #${selected.id_activity}` : undefined}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <div className="admin-detail-stack">
            <AdminCard>
              <div className="admin-kv"><span>Administrator</span><strong>{selected.admin?.name || 'System'}</strong></div>
              <div className="admin-kv"><span>Email</span><strong>{selected.admin?.email || 'Not available'}</strong></div>
              <div className="admin-kv"><span>Action</span><Badge label={selected.action} style={actionStyle(selected.action)} /></div>
              <div className="admin-kv"><span>Section</span><Badge label={selected.entity} style={entityStyle(selected.entity)} />{selected.entity_id ? <span style={{ fontSize: 12, color: 'var(--admin-muted)', marginLeft: 6 }}>#{selected.entity_id}</span> : null}</div>
              <div className="admin-kv"><span>Timestamp</span><strong>{new Date(selected.created_at).toLocaleString()}</strong></div>
            </AdminCard>
            <AdminCard>
              <p className="admin-section-title">Recorded summary</p>
              <p className="admin-muted">{selected.summary}</p>
            </AdminCard>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
