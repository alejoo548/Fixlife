import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BriefcaseBusiness, Briefcase, CheckCircle, CheckCircle2, Clock3, DollarSign, Download, MapPin, RefreshCw, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { showSweetToast } from '../../../utils/sweetAlert';
import { Link } from 'react-router-dom';
import { adminApi } from '../api/adminApi';
import { AdminCard, EmptyState, MetricCard, Skeleton, StatusBadge } from '../components/AdminUI';
import { adminErrorMessage, adminServiceName, useAdminT } from '../adminI18n';
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
const translateShortPeriod = (value: string, lang: 'en' | 'es') => {
  if (lang !== 'es') return value;
  const labels: Record<string, string> = {
    Jan: 'Ene', Feb: 'Feb', Mar: 'Mar', Apr: 'Abr', May: 'May', Jun: 'Jun', Jul: 'Jul', Aug: 'Ago', Sep: 'Sep', Oct: 'Oct', Nov: 'Nov', Dec: 'Dic',
    Sun: 'Dom', Mon: 'Lun', Tue: 'Mar', Wed: 'Mie', Thu: 'Jue', Fri: 'Vie', Sat: 'Sab',
  };
  return labels[value] || value;
};

export default function OverviewModule() {
  const { t, i18n } = useTranslation();
  const { t: at, lang } = useAdminT();
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
    if (hr < 12) return t('admin.overview.greeting.morning');
    if (hr < 17) return t('admin.overview.greeting.afternoon');
    return t('admin.overview.greeting.evening');
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
    }).catch((reason) => setError(adminErrorMessage(reason, at('overview.unavailable'), at)));
  }, [refreshTrigger]);

  useEffect(() => {
    setLoadingStats(true);
    const url = selectedServiceId === 'all' 
      ? adminApi.endpoints.stats 
      : `${adminApi.endpoints.stats}?service_id=${selectedServiceId}`;
      
    adminApi.get<{ success: boolean; stats: AdminStats }>(url)
      .then((payload) => setStats(payload.stats))
      .catch((reason) => setError(adminErrorMessage(reason, at('overview.unavailable'), at)))
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
    if (!token) { void showSweetToast({ tone: 'error', message: at('common.failedToFetch') }); return; }
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
        void showSweetToast({ tone: 'error', message: data?.error || at('overview.pdfExportError') });
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
      void showSweetToast({ tone: 'success', message: at('overview.pdfExported') });
    } catch {
      void showSweetToast({ tone: 'error', message: at('overview.pdfExportError') });
    } finally {
      setExportingPdf(false);
    }
  };

  if (error) return <EmptyState title={at('overview.unavailable')} description={error} />;
  if (!stats) return <Skeleton rows={7} />;

  const completed = stats.completedServicesWeekly.reduce((sum, item) => sum + item.value, 0);
  const revenue = stats.revenueData.reduce((sum, item) => sum + Number(item.uv || 0), 0);
  const requestDistribution = [
    { name: at('common.active'), value: Math.max(0, (stats.request_health?.created || 0) - (stats.request_health?.completed || 0) - (stats.request_health?.cancelled || 0)), color: '#0090FF' },
    { name: at('common.completed'), value: stats.request_health?.completed || 0, color: '#10B981' },
    { name: at('common.cancelled'), value: stats.request_health?.cancelled || 0, color: '#F97316' },
  ];

  const cardBase = `${isDark ? 'bg-slate-800/70' : 'bg-white/70'} backdrop-blur-xl rounded-3xl border ${isDark ? 'border-slate-700/50' : 'border-white'} shadow-xl ${isDark ? 'shadow-slate-900/20' : 'shadow-gray-200/20'} p-6 flex flex-col`;

  // Location names come as full addresses ("Bulevar Venezuela, Barrio El
  // Calvario, Centro Histórico, ..."). Show only the most specific first
  // segment, truncated, so the vertical axis stays readable. The full address
  // is kept for the tooltip.
  const topLocations = (stats.popularLocations || [])
    .slice(0, 6)
    .map((loc) => {
      const full = String(loc.name || '').trim() || at('overview.unknownArea');
      const firstSegment = full.split(',')[0].trim() || full;
      const label = firstSegment.length > 22 ? `${firstSegment.slice(0, 21)}…` : firstSegment;
      return { name: label, fullName: full, value: Number(loc.value || 0) };
    });
  const topLocationsMax = topLocations.reduce((max, loc) => Math.max(max, loc.value), 0);

  const LocationTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const point = payload[0]?.payload;
    return (
      <div
        className={`max-w-[260px] rounded-2xl px-3.5 py-2.5 text-xs shadow-xl ${
          isDark ? 'bg-slate-900/95 text-slate-100 border border-slate-700/60' : 'bg-white/97 text-slate-900'
        }`}
      >
        <p className="font-bold leading-snug break-words">{point?.fullName}</p>
        <p className={`mt-1 font-semibold ${isDark ? 'text-sky-300' : 'text-bird-blue'}`}>
          {point?.value} {point?.value === 1 ? at('overview.request') : at('overview.requests')}
        </p>
      </div>
    );
  };

  return (
    <div className="admin-page-stack">
      {/* Greeting Banner */}
      <div className="admin-card flex flex-col md:flex-row md:items-center justify-between gap-4" style={{ background: 'linear-gradient(135deg, var(--admin-primary), #0070e0)', color: '#fff', border: '0' }}>
        <div>
          <h2 className="text-xl md:text-2xl font-black">{getGreeting()}, {user?.name || at('common.admin')}!</h2>
          <p className="text-sm opacity-90 mt-1">{t('admin.overview.hero.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)' }}>
            {new Date().toLocaleDateString(i18n.language.startsWith('es') ? 'es-SV' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
          <button 
            type="button" 
            onClick={handleRefresh} 
            className="flex items-center justify-center w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white transition-all duration-200"
            title={at('overview.refreshTitle')}
          >
            <RefreshCw size={15} className={loadingStats ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="admin-metrics-grid">
        <MetricCard label={t('admin.overview.metrics.users')} value={stats.total_users.toLocaleString()} note={t('admin.overview.metrics.usersNote')} icon={<Users />} variant="primary" />
        <MetricCard label={t('admin.overview.metrics.pros')} value={stats.total_pros.toLocaleString()} note={t('admin.overview.metrics.prosNote', { count: stats.pending_pros })} icon={<BriefcaseBusiness />} variant="warning" />
        <MetricCard label={t('admin.overview.metrics.completedWeek')} value={completed.toLocaleString()} note={t('admin.overview.metrics.completedWeekNote')} icon={<CheckCircle2 />} variant="success" />
        <MetricCard label={t('admin.overview.metrics.revenue')} value={revenue.toLocaleString(i18n.language.startsWith('es') ? 'es-SV' : 'en-US', { style: 'currency', currency: 'USD' })} note={t('admin.overview.metrics.revenueNote')} icon={<DollarSign />} variant="info" />
      </div>

      {/* Charts header with PDF export */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="admin-section-title">{t('admin.overview.analytics.title')}</p>
          <p className="admin-muted">{t('admin.overview.analytics.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="admin-field" style={{ width: 180, marginBottom: 0 }}>
            <select
              value={selectedServiceId}
              onChange={(e) => setSelectedServiceId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              disabled={loadingStats}
              style={{ height: '36px', padding: '0 12px', opacity: loadingStats ? 0.6 : 1 }}
            >
              <option value="all">{at('overview.allServices')}</option>
              {servicesList.map(s => <option key={s.id_service} value={s.id_service}>{adminServiceName(s.name, lang)}</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={exportingPdf}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--admin-primary)] px-4 h-[36px] text-sm font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={16} />
            {exportingPdf ? at('overview.exporting') : at('overview.exportPdf')}
          </button>
        </div>
      </div>

      {/* Row 1: Service categories · Completed weekly · Top locations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={`${cardBase} h-[320px] md:h-[360px]`}>
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h3 className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{t('admin.overview.charts.serviceCategories')}</h3>
              <p className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{t('admin.overview.charts.serviceCategoriesNote')}</p>
            </div>
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${isDark ? 'bg-blue-900/40 text-blue-400 border-blue-700/40' : 'bg-bird-blue/10 text-bird-blue border-bird-blue/20'}`}>
              <Briefcase size={18} />
            </div>
          </div>
          <div className="w-full">
            <StableResponsiveContainer>
              <BarChart data={stats.serviceCategoryStats.map((item) => ({ ...item, name: adminServiceName(item.name, lang) }))} margin={{ top: 10, right: 0, left: -25, bottom: 0 }} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={adminChartTheme.grid} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: adminChartTheme.tick, fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: adminChartTheme.tick, fontSize: 12 }} />
                <Tooltip cursor={{ fill: adminChartTheme.cursor }} contentStyle={adminChartTheme.tooltip} itemStyle={adminChartTheme.itemStyle} labelStyle={{ color: adminChartTheme.tooltip.color }} />
                <Bar dataKey="value" name={at('overview.share')} fill="#0090FF" radius={[6, 6, 0, 0]} />
              </BarChart>
            </StableResponsiveContainer>
          </div>
        </div>

        <div className={`${cardBase} h-[320px] md:h-[360px]`}>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{t('admin.overview.charts.completedServices')}</h3>
              <p className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{t('admin.overview.charts.completedServicesNote')}</p>
            </div>
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${isDark ? 'bg-emerald-900/40 text-emerald-400 border-emerald-700/40' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
              <CheckCircle size={18} />
            </div>
          </div>
          <div className="w-full">
            <StableResponsiveContainer>
              <AreaChart data={stats.completedServicesWeekly.map((item) => ({ ...item, name: translateShortPeriod(item.name, lang) }))} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                <Area type="monotone" name={at('common.completed')} dataKey="value" stroke="#0090FF" strokeWidth={3} fillOpacity={1} fill="url(#completedFill)" />
              </AreaChart>
            </StableResponsiveContainer>
          </div>
        </div>

        <div className={`${cardBase} h-[320px] md:h-[360px]`}>
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h3 className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{t('admin.overview.charts.topLocations')}</h3>
              <p className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{t('admin.overview.charts.topLocationsNote')}</p>
            </div>
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${isDark ? 'bg-orange-900/40 text-orange-400 border-orange-700/40' : 'bg-bird-orange/10 text-bird-orange border-bird-orange/20'}`}>
              <MapPin size={18} />
            </div>
          </div>
          <div className="w-full flex-1">
            {topLocations.length === 0 ? (
              <div className={`flex h-full min-h-[180px] flex-col items-center justify-center text-center ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                <MapPin size={22} className="mb-2 opacity-60" />
                <p className="text-sm font-semibold">{at('overview.noLocationDataShort')}</p>
              </div>
            ) : (
              <StableResponsiveContainer height={240}>
                <BarChart data={topLocations} layout="vertical" margin={{ top: 4, right: 36, left: 4, bottom: 4 }} barCategoryGap={12}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={adminChartTheme.grid} />
                  <XAxis
                    type="number"
                    domain={[0, Math.max(1, topLocationsMax)]}
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: adminChartTheme.tick, fontSize: 12 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: adminChartTheme.tick, fontSize: 11 }}
                    width={140}
                    interval={0}
                  />
                  <Tooltip cursor={{ fill: adminChartTheme.cursor }} content={<LocationTooltip />} />
                  <Bar dataKey="value" name={at('overview.chartRequests')} fill="#FFC20E" radius={[0, 8, 8, 0]} maxBarSize={18}>
                    <LabelList
                      dataKey="value"
                      position="right"
                      style={{ fill: adminChartTheme.tick, fontSize: 11, fontWeight: 700 }}
                    />
                  </Bar>
                </BarChart>
              </StableResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Revenue overview (2/3) · User growth (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={`${cardBase} lg:col-span-2 h-[350px] md:h-[420px]`}>
          <div className="flex justify-between items-end mb-6">
            <div>
              <h3 className={`text-xl font-bold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{at('overview.revenueOverview')}</h3>
              <p className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{at('overview.revenueOverviewNote')}</p>
            </div>
          </div>
          <div className="w-full">
            <StableResponsiveContainer>
              <AreaChart data={(stats.revenueData.length ? stats.revenueData : DEFAULT_REVENUE_DATA).map((item) => ({ ...item, name: translateShortPeriod(item.name, lang) }))} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                <Area type="monotone" name={at('overview.actualRevenue')} dataKey="uv" stroke="#0090FF" strokeWidth={3} fillOpacity={1} fill="url(#colorUv)" />
                <Area type="monotone" name={at('overview.projected')} dataKey="pv" stroke="#FFC20E" strokeWidth={3} fillOpacity={1} fill="url(#colorPv)" />
              </AreaChart>
            </StableResponsiveContainer>
          </div>
        </div>

        <div className={`${cardBase} h-[350px] md:h-[420px]`}>
          <div className="mb-6">
            <h3 className={`text-xl font-bold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{at('overview.userGrowth')}</h3>
            <p className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{at('overview.userGrowthNote')}</p>
          </div>
          <div className="w-full">
            <StableResponsiveContainer>
              <BarChart data={(stats.trafficData.length ? stats.trafficData : DEFAULT_TRAFFIC_DATA).map((item) => ({ ...item, name: translateShortPeriod(item.name, lang) }))} margin={{ top: 10, right: 0, left: -25, bottom: 0 }} barSize={12}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={adminChartTheme.grid} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: adminChartTheme.tick, fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: adminChartTheme.tick, fontSize: 12 }} />
                <Tooltip cursor={{ fill: adminChartTheme.cursor }} contentStyle={adminChartTheme.tooltip} itemStyle={adminChartTheme.itemStyle} labelStyle={{ color: adminChartTheme.tooltip.color }} />
                <Legend iconType="circle" wrapperStyle={adminChartTheme.legendStyle} />
                <Bar dataKey="Users" name={at('overview.users')} fill="#0090FF" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Pros" name={at('overview.pros')} fill="#FF8000" radius={[4, 4, 0, 0]} />
              </BarChart>
            </StableResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Operational overview */}
      <div className="admin-overview-grid admin-overview-grid--analytics">
        <AdminCard>
          <div className="admin-section-heading">
            <div><p className="admin-section-title">{at('overview.requestFunnel')}</p><p className="admin-muted">{at('overview.requestFunnelNote')}</p></div>
            <span className="admin-muted">{at('overview.avgAssignment', { value: stats.request_health?.avg_assignment_minutes == null ? at('overview.noData') : stats.request_health.avg_assignment_minutes })}</span>
          </div>
          <div className="admin-funnel">
            {[[at('overview.created'), stats.request_health?.created], [at('overview.assigned'), stats.request_health?.assigned], [at('common.paid'), stats.request_health?.paid], [at('common.completed'), stats.request_health?.completed]].map(([label, value]) => (
              <div key={String(label)}><strong>{Number(value || 0).toLocaleString()}</strong><span>{label}</span></div>
            ))}
          </div>
          <p className="admin-muted admin-pad-top">{at('overview.cancellationRate', { rate: stats.request_health?.cancellation_rate || 0, count: stats.request_health?.cancelled || 0 })}</p>
        </AdminCard>
        <AdminCard>
          <div className="admin-section-heading"><div><p className="admin-section-title">{at('overview.requestDistribution')}</p><p className="admin-muted">{at('overview.requestDistributionNote')}</p></div></div>
          <div className="admin-donut-layout"><div className="admin-donut-chart"><StableResponsiveContainer height={190}><PieChart><Pie data={requestDistribution} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={4}>{requestDistribution.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip contentStyle={adminChartTheme.tooltip} itemStyle={adminChartTheme.itemStyle} /></PieChart></StableResponsiveContainer><div><strong>{stats.request_health?.created || 0}</strong><span>{at('overview.total')}</span></div></div><div className="admin-donut-legend">{requestDistribution.map((item) => <span key={item.name}><i style={{ background: item.color }} /><small>{item.name}</small><strong>{item.value}</strong></span>)}</div></div>
        </AdminCard>
        <AdminCard>
          <div className="admin-section-heading">
            <div><p className="admin-section-title">{at('overview.operationalAlerts')}</p><p className="admin-muted">{at('overview.operationalAlertsNote')}</p></div>
            <AlertCircle className="text-amber-500" />
          </div>
          <div className="admin-alert-list">
            <Link to="../pros"><span><Clock3 size={17} />{at('overview.professionalApprovals')}</span><strong>{stats.pending_pros}</strong></Link>
            <Link to="../requests"><span><AlertCircle size={17} />{at('overview.inactiveRequests')}</span><strong>{alerts.length}</strong></Link>
          </div>
        </AdminCard>
      </div>

      {/* Recent requests */}
      <AdminCard>
        <div className="admin-section-heading">
          <div><p className="admin-section-title">{at('overview.recentRequests')}</p><p className="admin-muted">{at('overview.recentRequestsNote')}</p></div>
          <Link className="admin-text-link" to="../requests">{at('overview.viewAll')}</Link>
        </div>
        {requests.length === 0
          ? <p className="admin-muted admin-pad-top">{at('overview.noRequestsYet')}</p>
          : <div className="admin-compact-list">
            {requests.map((r) => (
              <Link to={`../requests?request=${r.id_request}`} key={r.id_request}>
                <div><strong>#{r.id_request} · {adminServiceName(r.service_name, lang)}</strong><span>{r.client?.name || at('common.guest')} · {r.location_text}</span></div>
                <div><StatusBadge status={r.status} /><small>{new Date(r.created_at).toLocaleString(lang === 'es' ? 'es-ES' : 'en-US')}</small></div>
              </Link>
            ))}
          </div>
        }
      </AdminCard>
    </div>
  );
}
