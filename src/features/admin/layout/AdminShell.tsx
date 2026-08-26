import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, Banknote, ChevronLeft, ChevronRight, FileText, Gauge, Headphones, Image, LogOut, Menu, Search, Settings, ShieldCheck, ShieldAlert, Users, Wrench, X } from 'lucide-react';
import { DashboardThemeToggle } from '../../../components/common/DashboardThemeToggle';
import { LanguageSwitcher } from '../../../components/common/LanguageSwitcher';
import { useDashboardTheme } from '../../../hooks/useDashboardTheme';
import { getAuthUser, logoutAndReload } from '../../../utils/session';
import { getToken } from '../../../utils/session';
import { NotificationCenter } from '../../../components/common/NotificationCenter';
import { adminApi } from '../api/adminApi';
import { adminEntityLabel, adminServiceName, useAdminT } from '../adminI18n';

type SearchResult = { id: number; type: 'request' | 'user' | 'service'; title: string; subtitle: string; url: string };

const BASE = '/admin-dashboard';

const navGroups = [
  { labelKey: 'nav.operations', items: [
    { to: `${BASE}/overview`, labelKey: 'nav.overview', icon: Gauge }, { to: `${BASE}/requests`, labelKey: 'nav.requests', icon: FileText },
    { to: `${BASE}/support`, labelKey: 'nav.support', icon: Headphones },
  ]},
  { labelKey: 'nav.peopleCatalog', items: [
    { to: `${BASE}/users`, labelKey: 'nav.users', icon: Users }, { to: `${BASE}/pros`, labelKey: 'nav.pros', icon: ShieldCheck },
    { to: `${BASE}/admins`, labelKey: 'nav.admins', icon: ShieldAlert },
    { to: `${BASE}/services`, labelKey: 'nav.services', icon: Wrench }, { to: `${BASE}/content`, labelKey: 'nav.content', icon: Image },
  ]},
  { labelKey: 'nav.control', items: [
    { to: `${BASE}/finance`, labelKey: 'nav.finance', icon: Banknote }, { to: `${BASE}/activity`, labelKey: 'nav.activity', icon: Activity },
    { to: `${BASE}/settings`, labelKey: 'nav.settings', icon: Settings },
  ]},
];

export const AdminShell = ({ onClose }: { onClose: () => void }) => {
  const { theme, toggleTheme } = useDashboardTheme('admin', { syncDocumentClass: true });
  const { t, lang } = useAdminT();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const user = getAuthUser('admin');
  const section = location.pathname.split('/')[2] || 'overview';
  const [title, subtitle] = (t(`titles.${section}`) as unknown as [string, string]) || (t('titles.overview') as unknown as [string, string]);
  const signOut = () => { logoutAndReload('admin'); };

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2) { setSearchResults([]); setSearching(false); return; }
    const timeout = window.setTimeout(async () => {
      setSearching(true);
      try {
        const payload = await adminApi.get<{ results: SearchResult[] }>(`${adminApi.endpoints.search}?q=${encodeURIComponent(query)}`, true);
        setSearchResults(payload.results || []);
        setSearchOpen(true);
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    const close = (event: MouseEvent) => { if (!searchRef.current?.contains(event.target as Node)) setSearchOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const openSearchResult = (result: SearchResult) => {
    navigate(result.url); setSearch(''); setSearchOpen(false);
  };

  useEffect(() => {
    const handleExpiredSession = () => onClose();
    window.addEventListener('fixlife:admin-session-expired', handleExpiredSession);
    return () => window.removeEventListener('fixlife:admin-session-expired', handleExpiredSession);
  }, [onClose]);

  return <div className={`admin-app dashboard-shell dashboard-theme-${theme}`}>
    {mobileOpen && <button className="admin-mobile-backdrop" onClick={() => setMobileOpen(false)} aria-label={t('common.close')} />}
    <aside className={`admin-sidebar ${collapsed ? 'admin-sidebar--collapsed' : ''} ${mobileOpen ? 'admin-sidebar--open' : ''}`}>
      <div className="admin-brand"><img src="/Fixilogo.webp" alt="Fixlife" />{!collapsed && <div><strong>Fixlife</strong><span>{t('nav.adminControl')}</span></div>}<button className="admin-icon-button admin-mobile-close" onClick={() => setMobileOpen(false)}><X size={18} /></button></div>
      <button className="admin-collapse" onClick={() => setCollapsed((value) => !value)} aria-label={t('nav.toggleSidebar')}>{collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}</button>
      <nav className="admin-nav" aria-label={t('nav.adminNavigation')}>{navGroups.map((group) => <div className="admin-nav-group" key={group.labelKey}>
        {!collapsed && <p>{t(group.labelKey)}</p>}{group.items.map((item) => <NavLink key={item.to} to={item.to} onClick={() => setMobileOpen(false)} className={({ isActive }) => `admin-nav-link ${isActive ? 'admin-nav-link--active' : ''}`} title={collapsed ? t(item.labelKey) : undefined}><item.icon size={19} /><span>{t(item.labelKey)}</span></NavLink>)}
      </div>)}</nav>
      <div className="admin-sidebar-footer"><button className="admin-signout" onClick={signOut} title={collapsed ? t('nav.signOut') : undefined}><LogOut size={18} /><span>{t('nav.signOut')}</span></button></div>
    </aside>
    <div className="admin-workspace">
      <header className="admin-header"><div className="admin-header-title"><button className="admin-icon-button admin-menu" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div><h1>{title}</h1><p>{subtitle}</p></div></div>
        <div className="admin-header-actions">
          <div className="admin-global-search-wrap" ref={searchRef}>
            <label className="admin-global-search"><Search size={17} /><input aria-label={t('common.searchGlobal')} value={search} placeholder={t('common.searchGlobal')} maxLength={120} onFocus={() => setSearchOpen(true)} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setSearchOpen(false); if (event.key === 'Enter') { if (searchResults[0]) openSearchResult(searchResults[0]); else if (search.trim()) navigate(`/admin-dashboard/requests?search=${encodeURIComponent(search.trim())}`); } }} /></label>
            {searchOpen && search.trim().length >= 2 && <div className="admin-search-results" role="listbox" aria-label={t('common.searchResults')}>
              <div className="admin-search-results__header"><span>{t('common.searchResults')}</span><small>{searching ? t('common.searching') : t('common.found', { count: searchResults.length })}</small></div>
              {!searching && searchResults.length === 0 && <p>{t('common.noMatches')}</p>}
              {searchResults.map((result) => <button key={`${result.type}-${result.id}`} type="button" onClick={() => openSearchResult(result)}>
                <span className={`admin-search-result-icon admin-search-result-icon--${result.type}`}>{result.type === 'request' ? <FileText size={16} /> : result.type === 'user' ? <Users size={16} /> : <Wrench size={16} />}</span>
                <span><strong>{result.type === 'service' ? adminServiceName(result.title, lang) : result.title}</strong><small>{result.subtitle}</small></span><em>{adminEntityLabel(result.type, lang)}</em>
              </button>)}
            </div>}
          </div>
          <LanguageSwitcher />
          <DashboardThemeToggle theme={theme} onToggle={toggleTheme} />
          <NotificationCenter token={getToken('admin')} variant="admin" theme={theme} />
          
          <div className="admin-header-profile">
            <button className="admin-profile-toggle" onClick={() => setProfileOpen(!profileOpen)} aria-label={t('common.profile')}>
              <span className="admin-profile-avatar">
                {(user?.name || 'A')[0]}{((user?.lastname as string | undefined) || 'D')[0]}
              </span>
              <span className="admin-profile-name">
                {user?.name || t('common.system')}
              </span>
            </button>
            
            {profileOpen && (
              <div className="admin-profile-dropdown">
                <div className="admin-profile-dropdown-header">
                  <strong>{user?.name || t('common.system')} {(user?.lastname as string | undefined) || t('common.admin')}</strong>
                  <span>{user?.rol === 'root' ? t('common.rootAdmin') : t('nav.admins')}</span>
                </div>
                <NavLink to="/admin-dashboard/settings" className="admin-profile-dropdown-item" onClick={() => setProfileOpen(false)}>
                  <Settings size={14} />
                  <span>{t('nav.settings')}</span>
                </NavLink>
                <button className="admin-profile-dropdown-item admin-profile-dropdown-item--danger" onClick={signOut}>
                  <LogOut size={14} />
                  <span>{t('common.signOut')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="admin-main">
        <AnimatePresence mode="wait">
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  </div>;
};
