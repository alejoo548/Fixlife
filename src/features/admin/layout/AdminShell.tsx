import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, Banknote, ChevronLeft, ChevronRight, FileText, Gauge, Headphones, Image, LogOut, Menu, Search, Settings, ShieldCheck, ShieldAlert, Users, Wrench, X } from 'lucide-react';
import { DashboardThemeToggle } from '../../../components/common/DashboardThemeToggle';
import { useDashboardTheme } from '../../../hooks/useDashboardTheme';
import { getAuthUser, logoutAndReload } from '../../../utils/session';
import { getToken } from '../../../utils/session';
import { NotificationCenter } from '../../../components/common/NotificationCenter';
import { adminApi } from '../api/adminApi';

type SearchResult = { id: number; type: 'request' | 'user' | 'service'; title: string; subtitle: string; url: string };

const BASE = '/admin-dashboard';

const navGroups = [
  { label: 'Operations', items: [
    { to: `${BASE}/overview`, label: 'Overview', icon: Gauge }, { to: `${BASE}/requests`, label: 'Requests', icon: FileText },
    { to: `${BASE}/support`, label: 'Support', icon: Headphones },
  ]},
  { label: 'People & catalog', items: [
    { to: `${BASE}/users`, label: 'Users', icon: Users }, { to: `${BASE}/pros`, label: 'Professionals', icon: ShieldCheck },
    { to: `${BASE}/admins`, label: 'Administrators', icon: ShieldAlert },
    { to: `${BASE}/services`, label: 'Services', icon: Wrench }, { to: `${BASE}/content`, label: 'Content', icon: Image },
  ]},
  { label: 'Control', items: [
    { to: `${BASE}/finance`, label: 'Finance', icon: Banknote }, { to: `${BASE}/activity`, label: 'Admin activity', icon: Activity },
    { to: `${BASE}/settings`, label: 'Settings', icon: Settings },
  ]},
];

const titles: Record<string, [string, string]> = {
  overview: ['Overview', 'Live platform health and priorities'], requests: ['Service requests', 'Investigate and manage every job'],
  users: ['Users', 'Client accounts and access'], pros: ['Professionals', 'Verification, tiers and performance'],
  admins: ['Administrators', 'Staff accounts and access levels'],
  services: ['Services', 'Operational service catalog'], content: ['Homepage content', 'Cards and public presentation'],
  finance: ['Finance', 'Revenue, settlements and exceptions'], support: ['Support', 'Customer support workspace'],
  activity: ['Admin activity', 'Audited changes across platform'],
  settings: ['Platform settings', 'Controlled configuration'],
};

export const AdminShell = ({ onClose }: { onClose: () => void }) => {
  const { theme, toggleTheme } = useDashboardTheme('admin');
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
  const [title, subtitle] = titles[section] || titles.overview;
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
    {mobileOpen && <button className="admin-mobile-backdrop" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}
    <aside className={`admin-sidebar ${collapsed ? 'admin-sidebar--collapsed' : ''} ${mobileOpen ? 'admin-sidebar--open' : ''}`}>
      <div className="admin-brand"><img src="/Fixilogo.webp" alt="Fixlife" />{!collapsed && <div><strong>Fixlife</strong><span>Admin control</span></div>}<button className="admin-icon-button admin-mobile-close" onClick={() => setMobileOpen(false)}><X size={18} /></button></div>
      <button className="admin-collapse" onClick={() => setCollapsed((value) => !value)} aria-label="Toggle sidebar">{collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}</button>
      <nav className="admin-nav" aria-label="Admin navigation">{navGroups.map((group) => <div className="admin-nav-group" key={group.label}>
        {!collapsed && <p>{group.label}</p>}{group.items.map((item) => <NavLink key={item.to} to={item.to} onClick={() => setMobileOpen(false)} className={({ isActive }) => `admin-nav-link ${isActive ? 'admin-nav-link--active' : ''}`} title={collapsed ? item.label : undefined}><item.icon size={19} /><span>{item.label}</span></NavLink>)}
      </div>)}</nav>
      <div className="admin-sidebar-footer"><button className="admin-signout" onClick={signOut} title={collapsed ? "Close dashboard" : undefined}><LogOut size={18} /><span>Close dashboard</span></button></div>
    </aside>
    <div className="admin-workspace">
      <header className="admin-header"><div className="admin-header-title"><button className="admin-icon-button admin-menu" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div><h1>{title}</h1><p>{subtitle}</p></div></div>
        <div className="admin-header-actions">
          <div className="admin-global-search-wrap" ref={searchRef}>
            <label className="admin-global-search"><Search size={17} /><input aria-label="Global search" value={search} placeholder="Search users, requests, services..." maxLength={120} onFocus={() => setSearchOpen(true)} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setSearchOpen(false); if (event.key === 'Enter') { if (searchResults[0]) openSearchResult(searchResults[0]); else if (search.trim()) navigate(`/admin-dashboard/requests?search=${encodeURIComponent(search.trim())}`); } }} /></label>
            {searchOpen && search.trim().length >= 2 && <div className="admin-search-results" role="listbox" aria-label="Global search results">
              <div className="admin-search-results__header"><span>Search results</span><small>{searching ? 'Searching...' : `${searchResults.length} found`}</small></div>
              {!searching && searchResults.length === 0 && <p>No matching users, requests or services.</p>}
              {searchResults.map((result) => <button key={`${result.type}-${result.id}`} type="button" onClick={() => openSearchResult(result)}>
                <span className={`admin-search-result-icon admin-search-result-icon--${result.type}`}>{result.type === 'request' ? <FileText size={16} /> : result.type === 'user' ? <Users size={16} /> : <Wrench size={16} />}</span>
                <span><strong>{result.title}</strong><small>{result.subtitle}</small></span><em>{result.type}</em>
              </button>)}
            </div>}
          </div>
          <DashboardThemeToggle theme={theme} onToggle={toggleTheme} />
          <NotificationCenter token={getToken('admin')} variant="admin" theme={theme} />
          
          <div className="admin-header-profile">
            <button className="admin-profile-toggle" onClick={() => setProfileOpen(!profileOpen)} aria-label="User profile">
              <span className="admin-profile-avatar">
                {(user?.name || 'A')[0]}{((user?.lastname as string | undefined) || 'D')[0]}
              </span>
              <span className="admin-profile-name">
                {user?.name || 'System'}
              </span>
            </button>
            
            {profileOpen && (
              <div className="admin-profile-dropdown">
                <div className="admin-profile-dropdown-header">
                  <strong>{user?.name || 'System'} {(user?.lastname as string | undefined) || 'Admin'}</strong>
                  <span>{user?.rol === 'root' ? 'Root administrator' : 'Administrator'}</span>
                </div>
                <NavLink to="/admin-dashboard/settings" className="admin-profile-dropdown-item" onClick={() => setProfileOpen(false)}>
                  <Settings size={14} />
                  <span>Settings</span>
                </NavLink>
                <button className="admin-profile-dropdown-item admin-profile-dropdown-item--danger" onClick={signOut}>
                  <LogOut size={14} />
                  <span>Sign Out</span>
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
