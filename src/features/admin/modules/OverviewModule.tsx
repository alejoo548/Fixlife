import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BriefcaseBusiness, Briefcase, CheckCircle, CheckCircle2, Clock3, DollarSign, Download, MapPin, RefreshCw, Users } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { showSweetToast } from '../../../utils/sweetAlert';
import { Link } from 'react-router-dom';
import { adminApi } from '../api/adminApi';
import { AdminCard, EmptyState, MetricCard, Skeleton, StatusBadge } from '../components/AdminUI';
import { useDashboardTheme } from '../../../hooks/useDashboardTheme';
import { getAuthUser, getToken } from '../../../utils/session';
import type { AdminRequestListItem, AdminStats } from '../types';

const StableResponsiveContainer = ({ children, height }: { children: React.ReactNode; height?: number }) => (
  <ResponsiveContainer width="100%" height={height ?? 220} minWidth={0} debounce={80}>
    {children as React.ReactElement}
  </ResponsiveContainer>
);

const DEFAULT_REVENUE_DATA = [{ name: 'Jan', uv: 0, pv: 0 }];
const DEFAULT_TRAFFIC_DATA = [{ name: 'Mon', Users: 0, Pros: 0 }];

export default function OverviewModule() {
  const { isDark } = useDashboardTheme('admin');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [requests, setRequests] = useState<AdminRequestListItem[]>([]);
  const [servicesList, setServicesList] = useState<{ id_service: number; name: string }[]>([]);
  const [error, setError] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<number | 'all'>('all');
  const [loadingStats, setLoadingStats] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const user = getAuthUser('admin');

  const getGreeting = () => {
    const hr = new Date().getHours();
    if (hr < 12) return 'Good morning';
    if (hr < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  useEffect(() => {
    Promise.all([
      adminApi.get<{ services: { id_service: number; name: string }[] }>(adminApi.endpoints.services).catch(() => ({ services: [] })),
      adminApi.get<{ data?: AdminRequestListItem[]; requests?: AdminRequestListItem[] }>(`${adminApi.endpoints.requestsHistory}?limit=8`).catch(() => ({ data: [] as AdminRequestListItem[], requests: [] as AdminRequestListItem[] })),
    ]).then(([servicesPayload, requestPayload]) => {
      setServicesList(servicesPayload.services || []);
      setRequests(requestPayload.data || requestPayload.requests || []);
    }).catch((reason) => setError(reason.message));
  }, [refreshTrigger]);

  useEffect(() => {
    setLoadingStats(true);
    const url = selectedServiceId === 'all' 
      ? adminApi.endpoints.stats 
      : `${adminApi.endpoints.stats}?service_id=${selectedServiceId}`;
      
    adminApi.get<{ success: boolean; stats: AdminStats }>(url)
      .then((payload) => setStats(payload.stats))
      .catch((reason) => setError(reason.message))
      .finally(() => setLoadingStats(false));
  }, [selectedServiceId, refreshTrigger]);

  const adminChartTheme = useMemo(() => ({
    grid: isDark ? 'rgba(71, 85, 105, 0.45)' : '#E5E7EB',
    tick: isDark ? '#94A3B8' : '#6B7280',
    cursor: isDark ? 'rgba(30, 41, 59, 0.72)' : '#F3F4F6',
    tooltip: {
      borderRadius: '16px',
      border: isDark ? '1px solid rgba(71, 85, 105, 0.55)' : 'none',
      backgroundColor: isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.96)',
      color: isDark ? '#E2E8F0' : '#0F172A',
      boxShadow: isDark
        ? '0 18px 40px rgba(2, 6, 23, 0.45)'
        : '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
    },
    itemStyle: { fontWeight: 'bold', color: isDark ? '#E2E8F0' : '#0F172A' } as React.CSSProperties,
    legendStyle: { color: isDark ? '#CBD5E1' : '#475569', paddingTop: '20px' } as React.CSSProperties,
  }), [isDark]);

  const alerts = useMemo(() => {
    const now = Date.now();
    return requests.filter((r) => !['done', 'cancelled'].includes(r.status) && now - new Date(r.updated_at || r.created_at).getTime() > 24 * 60 * 60 * 1000);
  }, [requests]);

  const handleExportPdf = async () => {
    if (exportingPdf) return;
    const token = getToken('admin');
    if (!token) { void showSweetToast({ tone: 'error', message: 'Session expired. Please sign in again.' }); return; }
    setExportingPdf(true);
    try {
      const exportUrl = selectedServiceId === 'all' 
        ? adminApi.endpoints.exportStatsPdf 
        : `${adminApi.endpoints.exportStatsPdf}?service_id=${selectedServiceId}`;
      const res = await fetch(exportUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        void showSweetToast({ tone: 'error', message: data?.error || 'Could not export stats PDF.' });
        return;
      }
      const blob = await res.blob();
      const fileName = res.headers.get('Content-Disposition')?.match(/filename="?([^"]+)"?/)?.[1]?.trim()
        || `fixlife-admin-stats-${new Date().toISOString().slice(0, 10)}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      void showSweetToast({ tone: 'success', message: 'Stats PDF exported.' });
    } catch {
      void showSweetToast({ tone: 'error', message: 'Connection error exporting stats PDF.' });
    } finally {
      setExportingPdf(false);
    }
  };

  if (error) return <EmptyState title="Overview unavailable" description={error} />;
  if (!stats) return <Skeleton rows={7} />;

  const completed = stats.completedServicesWeekly.reduce((sum, item) => sum + item.value, 0);
  const revenue = stats.revenueData.reduce((sum, item) => sum + Number(item.uv || 0), 0);
  const requestDistribution = [
    { name: 'Active', value: Math.max(0, (stats.request_health?.created || 0) - (stats.request_health?.completed || 0) - (stats.request_health?.cancelled || 0)), color: '#0090FF' },
    { name: 'Completed', value: stats.request_health?.completed || 0, color: '#10B981' },
    { name: 'Cancelled', value: stats.request_health?.cancelled || 0, color: '#F97316' },
  ];

  const cardBase = `${isDark ? 'bg-slate-800/70' : 'bg-white/70'} backdrop-blur-xl rounded-3xl border ${isDark ? 'border-slate-700/50' : 'border-white'} shadow-xl ${isDark ? 'shadow-slate-900/20' : 'shadow-gray-200/20'} p-6 flex flex-col`;

  return (
    <div className="admin-page-stack">
      {/* Greeting Banner */}
      <div className="admin-card flex flex-col md:flex-row md:items-center justify-between gap-4" style={{ background: 'linear-gradient(135deg, var(--admin-primary), #0070e0)', color: '#fff', border: '0' }}>
        <div>
          <h2 className="text-xl md:text-2xl font-black">{getGreeting()}, {user?.name || 'Admin'}!</h2>
          <p className="text-sm opacity-90 mt-1">Here's what is happening with the platform today. All services are operational.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
          <button 
            type="button" 
            onClick={handleRefresh} 
            className="flex items-center justify-center w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white transition-all duration-200"
            title="Refresh dashboard data"
          >
            <RefreshCw size={15} className={loadingStats ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="admin-metrics-grid">
        <MetricCard label="Registered users" value={stats.total_users.toLocaleString()} note="Live account total" icon={<Users />} variant="primary" />
        <MetricCard label="Active professionals" value={stats.total_pros.toLocaleString()} note={`${stats.pending_pros} awaiting approval`} icon={<BriefcaseBusiness />} variant="warning" />
        <MetricCard label="Completed this week" value={completed.toLocaleString()} note="Based on closed requests" icon={<CheckCircle2 />} variant="success" />
        <MetricCard label="Platform revenue" value={revenue.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} note="Last six months" icon={<DollarSign />} variant="info" />
      </div>

      {/* Charts header with PDF export */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="admin-section-title">Platform analytics</p>
          <p className="admin-muted">Live charts across all tracked metrics</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="admin-field" style={{ width: 180, marginBottom: 0 }}>
            <select
              value={selectedServiceId}
              onChange={(e) => setSelectedServiceId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              disabled={loadingStats}
              style={{ height: '36px', padding: '0 12px', opacity: loadingStats ? 0.6 : 1 }}
            >
              <option value="all">All Services</option>
              {servicesList.map(s => <option key={s.id_service} value={s.id_service}>{s.name}</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={exportingPdf}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--admin-primary)] px-4 h-[36px] text-sm font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={16} />
            {exportingPdf ? 'Exporting...' : 'Export PDF'}
          </button>
        </div>
      </div>

      {/* Row 1: Service categories · Completed weekly · Top locations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={`${cardBase} h-[320px] md:h-[360px]`}>
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h3 className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>Service Categories</h3>
              <p className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Current distribution by category</p>
            </div>
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${isDark ? 'bg-blue-900/40 text-blue-400 border-blue-700/40' : 'bg-bird-blue/10 text-bird-blue border-bird-blue/20'}`}>
              <Briefcase size={18} />
            </div>
          </div>
          <div className="w-full">
            <StableResponsiveContainer>
              <BarChart data={stats.serviceCategoryStats} margin={{ top: 10, right: 0, left: -25, bottom: 0 }} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={adminChartTheme.grid} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: adminChartTheme.tick, fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: adminChartTheme.tick, fontSize: 12 }} />
                <Tooltip cursor={{ fill: adminChartTheme.cursor }} contentStyle={adminChartTheme.tooltip} itemStyle={adminChartTheme.itemStyle} labelStyle={{ color: adminChartTheme.tooltip.color }} />
                <Bar dataKey="value" name="Share" fill="#0090FF" radius={[6, 6, 0, 0]} />
              </BarChart>
            </StableResponsiveContainer>
          </div>
        </div>

        <div className={`${cardBase} h-[320px] md:h-[360px]`}>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>Completed Services</h3>
              <p className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Weekly completion trend</p>
            </div>
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${isDark ? 'bg-emerald-900/40 text-emerald-400 border-emerald-700/40' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
              <CheckCircle size={18} />
            </div>
          </div>
          <div className="w-full">
            <StableResponsiveContainer>
              <AreaChart data={stats.completedServicesWeekly} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="completedFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0090FF" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#0090FF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={adminChartTheme.grid} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: adminChartTheme.tick, fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: adminChartTheme.tick, fontSize: 12 }} />
                <Tooltip contentStyle={adminChartTheme.tooltip} itemStyle={adminChartTheme.itemStyle} labelStyle={{ color: adminChartTheme.tooltip.color }} />
                <Area type="monotone" name="Completed" dataKey="value" stroke="#0090FF" strokeWidth={3} fillOpacity={1} fill="url(#completedFill)" />
              </AreaChart>
            </StableResponsiveContainer>
          </div>
        </div>

        <div className={`${cardBase} h-[320px] md:h-[360px]`}>
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h3 className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>Top Locations</h3>
              <p className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Areas with most requests</p>
            </div>
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${isDark ? 'bg-orange-900/40 text-orange-400 border-orange-700/40' : 'bg-bird-orange/10 text-bird-orange border-bird-orange/20'}`}>
              <MapPin size={18} />
            </div>
          </div>
          <div className="w-full">
            <StableResponsiveContainer>
              <BarChart data={stats.popularLocations} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }} barSize={10}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={adminChartTheme.grid} />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: adminChartTheme.tick, fontSize: 12 }} />
                <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: adminChartTheme.tick, fontSize: 12 }} width={90} />
                <Tooltip cursor={{ fill: adminChartTheme.cursor }} contentStyle={adminChartTheme.tooltip} itemStyle={adminChartTheme.itemStyle} labelStyle={{ color: adminChartTheme.tooltip.color }} />
                <Bar dataKey="value" name="Requests" fill="#FFC20E" radius={[0, 6, 6, 0]} />
              </BarChart>
            </StableResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 2: Revenue overview (2/3) · User growth (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={`${cardBase} lg:col-span-2 h-[350px] md:h-[420px]`}>
          <div className="flex justify-between items-end mb-6">
            <div>
              <h3 className={`text-xl font-bold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>Revenue Overview</h3>
              <p className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Monthly generated income vs projected</p>
            </div>
          </div>
          <div className="w-full">
            <StableResponsiveContainer>
              <AreaChart data={stats.revenueData.length ? stats.revenueData : DEFAULT_REVENUE_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0090FF" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0090FF" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorPv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FFC20E" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#FFC20E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={adminChartTheme.grid} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: adminChartTheme.tick, fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: adminChartTheme.tick, fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip contentStyle={adminChartTheme.tooltip} itemStyle={adminChartTheme.itemStyle} labelStyle={{ color: adminChartTheme.tooltip.color }} />
                <Legend iconType="circle" wrapperStyle={adminChartTheme.legendStyle} />
                <Area type="monotone" name="Actual Revenue" dataKey="uv" stroke="#0090FF" strokeWidth={3} fillOpacity={1} fill="url(#colorUv)" />
                <Area type="monotone" name="Projected" dataKey="pv" stroke="#FFC20E" strokeWidth={3} fillOpacity={1} fill="url(#colorPv)" />
              </AreaChart>
            </StableResponsiveContainer>
          </div>
        </div>

        <div className={`${cardBase} h-[350px] md:h-[420px]`}>
          <div className="mb-6">
            <h3 className={`text-xl font-bold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>User Growth</h3>
            <p className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Weekly active registrations</p>
          </div>
          <div className="w-full">
            <StableResponsiveContainer>
              <BarChart data={stats.trafficData.length ? stats.trafficData : DEFAULT_TRAFFIC_DATA} margin={{ top: 10, right: 0, left: -25, bottom: 0 }} barSize={12}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={adminChartTheme.grid} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: adminChartTheme.tick, fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: adminChartTheme.tick, fontSize: 12 }} />
                <Tooltip cursor={{ fill: adminChartTheme.cursor }} contentStyle={adminChartTheme.tooltip} itemStyle={adminChartTheme.itemStyle} labelStyle={{ color: adminChartTheme.tooltip.color }} />
                <Legend iconType="circle" wrapperStyle={adminChartTheme.legendStyle} />
                <Bar dataKey="Users" fill="#0090FF" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Pros" fill="#FF8000" radius={[4, 4, 0, 0]} />
              </BarChart>
            </StableResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Operational overview */}
      <div className="admin-overview-grid admin-overview-grid--analytics">
        <AdminCard>
          <div className="admin-section-heading">
            <div><p className="admin-section-title">30-day request funnel</p><p className="admin-muted">Conversion and operational speed from live requests</p></div>
            <span className="admin-muted">Avg assignment: {stats.request_health?.avg_assignment_minutes == null ? 'No data' : `${stats.request_health.avg_assignment_minutes} min`}</span>
          </div>
          <div className="admin-funnel">
            {[['Created', stats.request_health?.created], ['Assigned', stats.request_health?.assigned], ['Paid', stats.request_health?.paid], ['Completed', stats.request_health?.completed]].map(([label, value]) => (
              <div key={String(label)}><strong>{Number(value || 0).toLocaleString()}</strong><span>{label}</span></div>
            ))}
          </div>
          <p className="admin-muted admin-pad-top">Cancellation rate: {stats.request_health?.cancellation_rate || 0}% ({stats.request_health?.cancelled || 0} requests)</p>
        </AdminCard>
        <AdminCard>
          <div className="admin-section-heading"><div><p className="admin-section-title">Request distribution</p><p className="admin-muted">Last 30 days by current outcome</p></div></div>
          <div className="admin-donut-layout"><div className="admin-donut-chart"><StableResponsiveContainer height={190}><PieChart><Pie data={requestDistribution} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={4}>{requestDistribution.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip contentStyle={adminChartTheme.tooltip} itemStyle={adminChartTheme.itemStyle} /></PieChart></StableResponsiveContainer><div><strong>{stats.request_health?.created || 0}</strong><span>Total</span></div></div><div className="admin-donut-legend">{requestDistribution.map((item) => <span key={item.name}><i style={{ background: item.color }} /><small>{item.name}</small><strong>{item.value}</strong></span>)}</div></div>
        </AdminCard>
        <AdminCard>
          <div className="admin-section-heading">
            <div><p className="admin-section-title">Operational alerts</p><p className="admin-muted">Items requiring attention</p></div>
            <AlertCircle className="text-amber-500" />
          </div>
          <div className="admin-alert-list">
            <Link to="../pros"><span><Clock3 size={17} />Professional approvals</span><strong>{stats.pending_pros}</strong></Link>
            <Link to="../requests"><span><AlertCircle size={17} />Requests inactive 24h+</span><strong>{alerts.length}</strong></Link>
          </div>
        </AdminCard>
      </div>

      {/* Recent requests */}
      <AdminCard>
        <div className="admin-section-heading">
          <div><p className="admin-section-title">Recent requests</p><p className="admin-muted">Newest activity across platform</p></div>
          <Link className="admin-text-link" to="../requests">View all</Link>
        </div>
        {requests.length === 0
          ? <p className="admin-muted admin-pad-top">No service requests yet.</p>
          : <div className="admin-compact-list">
            {requests.map((r) => (
              <Link to={`../requests?request=${r.id_request}`} key={r.id_request}>
                <div><strong>#{r.id_request} · {r.service_name}</strong><span>{r.client?.name || 'Guest'} · {r.location_text}</span></div>
                <div><StatusBadge status={r.status} /><small>{new Date(r.created_at).toLocaleString()}</small></div>
              </Link>
            ))}
          </div>
        }
      </AdminCard>
    </div>
  );
}
