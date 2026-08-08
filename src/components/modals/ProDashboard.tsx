import React, { useState, useEffect, Suspense, lazy, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ReviewSubmitSection } from '../sections/ReviewSubmitSection';
import { useLocation } from 'react-router-dom';
import { useSSE } from '../../hooks/useSSE';
import { motion, AnimatePresence } from 'framer-motion';
import { ProSidebar } from './ProSidebar';
import { API_URL } from '../../config/api';
import { AUTH_SESSION_CHANGED_EVENT, getAuthUser, getToken as getSessionToken, isAuthenticated, logoutAndReload, updateStoredAuthUser } from '../../utils/session';
import { NotificationCenter } from '../common/NotificationCenter';
import { DashboardThemeToggle } from '../common/DashboardThemeToggle';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import { useDashboardTheme } from '../../hooks/useDashboardTheme';
import { showSweetAlert } from '../../utils/sweetAlert';
import { normalizeImageUrl } from '../../utils/imageUrls';

const RequestsView = lazy(() =>
   import('../dashboard/RequestsView').then((module) => ({
      default: module.RequestsView,
   }))
);
const AppointmentsView = lazy(() =>
   import('../dashboard/AppointmentsView').then((module) => ({
      default: module.AppointmentsView,
   }))
);
const EarningsView = lazy(() =>
   import('../dashboard/EarningsView').then((module) => ({
      default: module.EarningsView,
   }))
);
const ScheduleView = lazy(() =>
   import('../dashboard/ScheduleView').then((module) => ({
      default: module.ScheduleView,
   }))
);
const CompletedWorkView = lazy(() =>
   import('../dashboard/CompletedWorkView').then((module) => ({
      default: module.CompletedWorkView,
   }))
);
const SettingsView = lazy(() =>
   import('../dashboard/SettingsView').then((module) => ({
      default: module.SettingsView,
   }))
);
const UploadDocumentsView = lazy(() =>
   import('../dashboard/UploadDocumentsView').then((module) => ({
      default: module.UploadDocumentsView,
   }))
);

interface ProDashboardProps {
   isOpen: boolean;
   onClose: () => void;
   onSignOut?: () => void;
}

const WORKER_PRESENCE_STORAGE_KEY = 'fixlife:worker-presence';
const WORKER_DASHBOARD_BUILD_MARKER = 'worker-dashboard-schedule-planner-v2';
const WORKER_TIER_RANK: Record<string, number> = {
   standard: 0,
   verified: 1,
   trusted: 2,
   elite: 3,
};

type WorkerTierBenefit = {
   tier: string;
   badge_label?: string;
   benefits_summary?: string | null;
   max_active_leads?: number;
   support_level?: string;
   min_completed_jobs?: number;
};

type WorkerService = {
   id_service: number;
   name: string;
   icon?: string | null;
};

type WorkerTierUpdatedEvent = {
   membership_tier?: string | null;
   previous_tier?: string | null;
   completed_jobs?: number | null;
   benefit?: WorkerTierBenefit | null;
};

const DashboardPanelFallback: React.FC<{ label?: string }> = ({ label }) => {
   const { t } = useTranslation();
   return (
   <div className="w-full h-full min-h-[220px] p-4">
      <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/82 px-3 py-2 shadow-[0_14px_34px_rgba(15,23,42,0.08)] backdrop-blur-xl">
         <div className="h-3.5 w-3.5 rounded-full border-2 border-bird-blue/20 border-t-bird-blue animate-spin" />
         <p className="text-[11px] font-black uppercase tracking-[0.16em] text-bird-blue">{label || t('workerDashboard.dashboard.loadingPanel')}</p>
      </div>
   </div>
   );
};

export const ProDashboard: React.FC<ProDashboardProps> = ({ isOpen, onClose, onSignOut }) => {
   const { t } = useTranslation();
   const location = useLocation();
   const { theme, isDark, toggleTheme } = useDashboardTheme('worker');
   const [isOnline, setIsOnline] = useState<boolean | null>(null);
   const [activeTab, setActiveTab] = useState('requests');
   const [mobileView, setMobileView] = useState<'list' | 'map'>('list');
   const [isSidebarOpen, setIsSidebarOpen] = useState(true);
   const [isPresenceMenuOpen, setIsPresenceMenuOpen] = useState(false);
   const [isVerified, setIsVerified] = useState(false);
   const [hasUploadedDocs, setHasUploadedDocs] = useState(false);
   const [userName, setUserName] = useState('');
   const [userAvatar, setUserAvatar] = useState<string | null>(null);
   const [token, setToken] = useState<string | null>(null);
   const [focusRequestId, setFocusRequestId] = useState<number | null>(null);
   const [openChatRequestId, setOpenChatRequestId] = useState<number | null>(null);
   const [currentTier, setCurrentTier] = useState('standard');
   const [currentTierLabel, setCurrentTierLabel] = useState('');
   const [currentService, setCurrentService] = useState<WorkerService | null>(null);
   const [serviceCount, setServiceCount] = useState(0);
   const presenceMenuRef = useRef<HTMLDivElement | null>(null);
   const lastTierAlertRef = useRef<string>('');

   const formatTierLabel = (tier?: string | null, fallback?: string | null) => {
      if (fallback && fallback.trim()) return fallback.trim();
      const normalized = String(tier || 'standard').trim();
      if (!normalized) return t('workerDashboard.dashboard.standardPro');
      return normalized
         .split('_')
         .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
         .join(' ');
   };

   const showTierUpgradeAlert = (tier: string, benefits?: WorkerTierBenefit | null, completedJobs?: number | null) => {
      const normalizedTier = String(tier || 'standard').toLowerCase();
      const isElite = normalizedTier === 'elite';
      const alertKey = `${normalizedTier}:${completedJobs ?? 'unknown'}`;
      if (lastTierAlertRef.current === alertKey) return;
      lastTierAlertRef.current = alertKey;
      const title = isElite
         ? t('workerDashboard.dashboard.youReachedElite')
         : t('workerDashboard.dashboard.youMovedUpTo', { tier: formatTierLabel(tier, benefits?.badge_label) });
      const detailParts = [
         completedJobs != null ? t('workerDashboard.dashboard.completedJobsDetail', { count: Number(completedJobs) }) : '',
         benefits?.benefits_summary ? String(benefits.benefits_summary).trim() : '',
         benefits?.max_active_leads != null ? t('workerDashboard.dashboard.activeLeadsDetail', { count: Number(benefits.max_active_leads) }) : '',
         benefits?.support_level ? t('workerDashboard.dashboard.supportLevelDetail', { level: String(benefits.support_level) }) : '',
      ].filter(Boolean);

      void showSweetAlert({
         title,
         message: detailParts.join(' ') || (isElite
            ? t('workerDashboard.dashboard.eliteUnlocked')
            : t('workerDashboard.dashboard.benefitsUpdated')),
         tone: 'success',
         confirmText: isElite ? t('workerDashboard.dashboard.viewEliteBenefits') : t('workerDashboard.dashboard.viewMyTier'),
      });
   };

   const handleWorkerTierUpdated = (event?: unknown) => {
      const payload = (event && typeof event === 'object' ? event : {}) as WorkerTierUpdatedEvent;
      const nextTier = String(payload.membership_tier || '').toLowerCase();
      const previousTier = String(payload.previous_tier || currentTier || '').toLowerCase();

      if (
         nextTier &&
         nextTier !== previousTier &&
         (WORKER_TIER_RANK[nextTier] ?? -1) > (WORKER_TIER_RANK[previousTier] ?? -1)
      ) {
         showTierUpgradeAlert(nextTier, payload.benefit || null, payload.completed_jobs ?? null);
      }

      if (token) syncWorkerStatus(token);
   };

   const getInitials = (name: string) => {
      if (!name) return 'U';
      const parts = name.split(' ').filter(p => p.trim() !== '');
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return name.slice(0, 2).toUpperCase();
   };

   const getServiceIconLabel = (service?: WorkerService | null) => {
      const normalized = String(service?.icon || '').trim();
      if (normalized) return normalized;
      return String(service?.name || 'F').trim().charAt(0).toUpperCase() || 'F';
   };

   const handleSignOut = () => {
      logoutAndReload('worker');
   };

   const normalizeBool = (value: any) => {
      if (value === true || value === 1) return true;
      if (typeof value === 'string') {
         const v = value.trim().toLowerCase();
         return v === '1' || v === 'true' || v === 'yes';
      }
      return false;
   };

   const readStoredPresence = (): boolean | null => {
      if (typeof window === 'undefined') return null;
      const raw = window.localStorage.getItem(WORKER_PRESENCE_STORAGE_KEY);
      if (raw === 'online') return true;
      if (raw === 'offline') return false;
      return null;
   };

   const writeStoredPresence = (nextOnline: boolean) => {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(
         WORKER_PRESENCE_STORAGE_KEY,
         nextOnline ? 'online' : 'offline'
      );
   };

   const resolveWorkerOnline = (payload: any): boolean | null => {
      const candidates = [
         payload?.worker_profile?.is_online,
         payload?.worker?.is_online,
         payload?.user?.is_online,
         payload?.is_online,
      ];

      for (const candidate of candidates) {
         if (candidate === null || candidate === undefined || candidate === '') continue;
         return normalizeBool(candidate);
      }

      return null;
   };

   const persistWorkerStatus = (nextOnline: boolean, workerProfilePatch?: Record<string, unknown>) => {
      writeStoredPresence(nextOnline);

      const user = getAuthUser('worker');
      if (!user) return;

      user.worker_profile = {
         ...(user.worker_profile || {}),
         ...(workerProfilePatch || {}),
         is_online: nextOnline,
      };
      updateStoredAuthUser(user, 'worker');
   };

   const pushWorkerPresence = (nextOnline: boolean) => {
      if (!token) return;
      void fetch(`${API_URL}/api/worker/presence`, {
         method: 'PUT',
         headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
         },
         body: JSON.stringify({ is_online: nextOnline ? 1 : 0 }),
      }).catch((error) => console.error('pushWorkerPresence error:', error));
   };

   const handlePresenceChange = (nextOnline: boolean) => {
      setIsOnline(nextOnline);
      setIsPresenceMenuOpen(false);
      persistWorkerStatus(nextOnline);
      pushWorkerPresence(nextOnline);
   };

   const syncWorkerStatus = async (jwtToken: string) => {
      try {
         const response = await fetch(`${API_URL}/api/worker/me`, {
            headers: { Authorization: `Bearer ${jwtToken}` },
         });
         if (!response.ok) return;

         const data = await response.json();
         const wp = data?.worker_profile || {};
         const currentTierBenefits = data?.current_tier_benefits || null;
         const servicesOffered = Array.isArray(data?.services_offered) ? data.services_offered as WorkerService[] : [];
         const currentTier = String(wp.membership_tier || 'standard').toLowerCase();
         const previousTier = String(getAuthUser('worker')?.worker_profile?.membership_tier || '').toLowerCase();
         const verified = normalizeBool(wp.is_verified);
         const onlineFromPayload = resolveWorkerOnline(data);
         const online = onlineFromPayload ?? readStoredPresence() ?? false;
         const uploaded = Boolean(wp.dui_document) || Boolean(wp.cert_document);

         setIsVerified(verified);
         setIsOnline(online);
         setHasUploadedDocs(uploaded);
         setCurrentTier(currentTier);
         setCurrentTierLabel(formatTierLabel(currentTier, currentTierBenefits?.badge_label));
         setCurrentService(servicesOffered[0] || null);
         setServiceCount(servicesOffered.length);

         persistWorkerStatus(online, {
            ...wp,
            is_verified: verified,
            current_tier_benefits: currentTierBenefits,
            services_offered: servicesOffered,
         });

         if (
            previousTier &&
            currentTier &&
            previousTier !== currentTier &&
            (WORKER_TIER_RANK[currentTier] ?? -1) > (WORKER_TIER_RANK[previousTier] ?? -1)
         ) {
            showTierUpgradeAlert(currentTier, currentTierBenefits);
         }
      } catch (error) {
         console.error('syncWorkerStatus error:', error);
      }
   };

   useEffect(() => {
      if (!isAuthenticated('worker')) {
         onClose();
         return;
      }

      const user = getAuthUser('worker');
      const storedToken = getSessionToken('worker');

      if (storedToken) {
         setToken(storedToken);
         syncWorkerStatus(storedToken);
      }

      if (user) {
         setIsOnline(
            resolveWorkerOnline(user) ?? readStoredPresence() ?? false
         );
         setIsVerified(normalizeBool(user.worker_profile?.is_verified));
         setHasUploadedDocs(!!user.worker_profile?.dui_document || !!user.worker_profile?.cert_document);
         setCurrentTier(String(user.worker_profile?.membership_tier || 'standard').toLowerCase());
         setCurrentTierLabel(formatTierLabel(
            String(user.worker_profile?.membership_tier || 'standard'),
            typeof user.worker_profile?.current_tier_benefits === 'object' && user.worker_profile?.current_tier_benefits
               ? String((user.worker_profile.current_tier_benefits as Record<string, unknown>).badge_label || '')
               : null
         ));
         const storedServices = Array.isArray(user.worker_profile?.services_offered)
            ? user.worker_profile.services_offered as WorkerService[]
            : [];
         setCurrentService(storedServices[0] || null);
         setServiceCount(storedServices.length);
         setUserName(typeof user.name === 'string' ? user.name : '');
         const rawAvatar = typeof user.profile_image_url === 'string' && user.profile_image_url
            ? user.profile_image_url
            : typeof user.profile_image === 'string' ? user.profile_image : null;
         const resolvedAvatar = rawAvatar ? normalizeImageUrl(rawAvatar) || null : null;
         setUserAvatar(resolvedAvatar);
      } else {
         setIsOnline(readStoredPresence() ?? false);
      }
   }, [onClose]);

   useEffect(() => {
      if (!isOpen || !token) return;
      syncWorkerStatus(token);
   }, [isOpen, token]);

   useEffect(() => {
      if (!isOpen || !token || !isVerified) return;
      handlePresenceChange(true);
   }, [isOpen, token, isVerified]);

   useEffect(() => {
      if (!isOpen || typeof window === 'undefined') return;
      const params = new URLSearchParams(location.search);
      const requestId = Number(params.get('request') || 0);
      const shouldOpenChat = params.get('chat') === '1';
      if (!Number.isFinite(requestId) || requestId <= 0) return;

      setActiveTab('requests');
      setFocusRequestId(requestId);
      setOpenChatRequestId(shouldOpenChat ? requestId : null);
   }, [isOpen, location.search]);

   useEffect(() => {
      if (!isPresenceMenuOpen) return;

      const handlePointerDown = (event: MouseEvent) => {
         if (!presenceMenuRef.current?.contains(event.target as Node)) {
            setIsPresenceMenuOpen(false);
         }
      };

      window.addEventListener('mousedown', handlePointerDown);
      return () => window.removeEventListener('mousedown', handlePointerDown);
   }, [isPresenceMenuOpen]);

   useEffect(() => {
      const syncStoredUser = () => {
         const user = getAuthUser('worker');
         const storedToken = getSessionToken('worker');
         setToken(storedToken);
         if (!user) return;

         setCurrentTier(String(user.worker_profile?.membership_tier || 'standard').toLowerCase());
         setCurrentTierLabel(formatTierLabel(
            String(user.worker_profile?.membership_tier || 'standard'),
            typeof user.worker_profile?.current_tier_benefits === 'object' && user.worker_profile?.current_tier_benefits
               ? String((user.worker_profile.current_tier_benefits as Record<string, unknown>).badge_label || '')
               : null
         ));
         const storedServices = Array.isArray(user.worker_profile?.services_offered)
            ? user.worker_profile.services_offered as WorkerService[]
            : [];
         setCurrentService(storedServices[0] || null);
         setServiceCount(storedServices.length);
         setUserName(typeof user.name === 'string' ? user.name : '');
         const rawAvatar = typeof user.profile_image_url === 'string' && user.profile_image_url
            ? user.profile_image_url
            : typeof user.profile_image === 'string' ? user.profile_image : null;
         const resolvedAvatar = rawAvatar ? normalizeImageUrl(rawAvatar) || null : null;
         setUserAvatar(resolvedAvatar);
      };

      window.addEventListener(AUTH_SESSION_CHANGED_EVENT, syncStoredUser);
      return () => window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, syncStoredUser);
   }, []);

   useSSE({
      token,
      events: {
         worker_status: () => { if (token) syncWorkerStatus(token); },
         worker_tier_updated: handleWorkerTierUpdated,
      },
      enabled: isOpen && !!token,
   });

   if (!isOpen) return null;

   return (
      <motion.div
         initial={{ opacity: 0 }}
         animate={{ opacity: 1 }}
         exit={{ opacity: 0 }}
         className={`dashboard-theme dashboard-shell dashboard-theme--worker fixed inset-0 z-40 min-h-[100dvh] overflow-hidden bg-slate-100 font-sans ${isDark ? 'dashboard-theme-dark' : 'dashboard-theme-light'}`}
         data-dashboard-theme={theme}
         data-build-marker={WORKER_DASHBOARD_BUILD_MARKER}
         style={{ colorScheme: theme }}
      >
         <div className="relative z-10 grid h-full min-h-[100dvh] w-full grid-cols-1 overflow-hidden lg:grid-cols-[auto_minmax(0,1fr)]">
         {/* Sidebar */}
         <motion.div
            initial={{ x: -100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ type: "spring", damping: 20 }}
            className="relative z-30 hidden min-h-0 shrink-0 p-4 lg:block"
         >
            <ProSidebar
               activeItem={activeTab}
               setActiveItem={setActiveTab}
               onClose={onClose}
               onSignOut={handleSignOut}
               isOpen={isSidebarOpen}
               setIsOpen={setIsSidebarOpen}
               currentTier={currentTier}
               tierLabel={currentTierLabel}
               isDark={isDark}
            />
         </motion.div>

         {/* Main content */}
         <div className="relative z-10 h-full min-h-0 min-w-0 overflow-hidden flex flex-col transition-all duration-300">
            {/* Header */}
            <motion.div
               initial={{ y: -20, opacity: 0 }}
               animate={{ y: 0, opacity: 1 }}
               transition={{ delay: 0.2 }}
               className="relative z-[700] flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200/80 bg-white/95 px-3 shadow-[0_4px_18px_rgba(15,23,42,0.04)] backdrop-blur sm:px-4 md:h-[72px] md:px-6"
            >
               <div className="flex-1 min-w-0 flex items-center gap-3">
                  <motion.div
                     whileHover={{ scale: 1.05 }}
                     whileTap={{ scale: 0.95 }}
                     className="lg:hidden flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 cursor-pointer shrink-0"
                     onClick={handleSignOut}
                  >
                     <svg className="w-4 h-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
                     </svg>
                  </motion.div>
                  <div className="min-w-0">
                     <motion.h2
                        key={activeTab}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-2 truncate text-lg font-black capitalize text-slate-950 md:gap-3 md:text-xl"
                     >
                        <span className="truncate">{({
                           requests: t('workerDashboard.dashboard.tabRequests'),
                           appointments: t('workerDashboard.dashboard.tabAppointments'),
                           schedule: t('workerDashboard.dashboard.tabSchedule'),
                           earnings: t('workerDashboard.dashboard.tabEarnings'),
                           'completed-work': t('workerDashboard.dashboard.tabCompletedWork'),
                           review: t('workerDashboard.dashboard.tabReview'),
                           settings: t('workerDashboard.dashboard.tabSettings'),
                        } as Record<string, string>)[activeTab] || activeTab.replace('-', ' ')}</span>
                        {activeTab === 'requests' && (
                           <motion.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700"
                           >
                              <motion.span
                                 animate={{ scale: [1, 1.3, 1] }}
                                 transition={{ duration: 2, repeat: Infinity }}
                                 className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                              />
                              {t('workerDashboard.dashboard.live')}
                           </motion.span>
                        )}
                     </motion.h2>
                     <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="hidden truncate text-xs font-semibold text-slate-500 sm:block"
                     >
                        {userName ? t('workerDashboard.dashboard.welcomeBackName', { name: userName }) : t('workerDashboard.dashboard.welcomeBack')}
                     </motion.p>
                  </div>
                  {currentService?.name && (
                     <motion.div
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.28 }}
                        className="hidden min-w-0 lg:flex"
                     >
                        <div className={`inline-flex min-w-0 items-center gap-2 rounded-full border px-3 py-2 shadow-[0_12px_24px_rgba(15,23,42,0.06)] ${
                           isDark
                              ? 'border-white/12 bg-slate-900/80'
                              : 'border-white/70 bg-white/88'
                        }`}>
                           <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm ${
                              isDark
                                 ? 'bg-white/10 text-white'
                                 : 'bg-bird-blue/10 text-bird-blue'
                           }`}>
                              {getServiceIconLabel(currentService)}
                           </span>
                           <span className={`max-w-[180px] truncate text-xs font-black ${
                              isDark ? 'text-white' : 'text-slate-900'
                           }`}>
                              {currentService.name}
                           </span>
                           {serviceCount > 1 && (
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${
                                 isDark
                                    ? 'bg-white/10 text-slate-200'
                                    : 'bg-slate-100 text-slate-500'
                              }`}>
                                 +{serviceCount - 1}
                              </span>
                           )}
                        </div>
                     </motion.div>
                  )}
               </div>

               <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2 md:gap-3">
                  <LanguageSwitcher />
                  <DashboardThemeToggle
                     theme={theme}
                     onToggle={toggleTheme}
                     className="hidden min-w-0 bg-white/90 text-slate-700 shadow-[0_14px_30px_rgba(15,23,42,0.08)] sm:inline-flex"
                     labelClassName="hidden 2xl:block"
                     shortLabelClassName="hidden"
                  />
                  <NotificationCenter token={token} isActive={isOnline === true} variant="panel" />
                  <motion.div
                     ref={presenceMenuRef}
                     initial={{ scale: 0, opacity: 0 }}
                     animate={{ scale: 1, opacity: 1 }}
                     transition={{ delay: 0.4, type: "spring" }}
                     className="relative z-[710]"
                  >
                     {(() => {
                        const buttonClass = isDark
                           ? 'border-white/15 bg-slate-900/90 text-slate-100 shadow-[0_16px_30px_rgba(15,23,42,0.18)] hover:border-cyan-300/25 hover:text-white hover:shadow-[0_18px_32px_rgba(34,211,238,0.12)]'
                           : 'border-white/60 bg-white/90 text-slate-700 shadow-[0_16px_30px_rgba(15,23,42,0.08)] hover:border-bird-blue/30 hover:text-bird-blue hover:shadow-[0_18px_32px_rgba(0,144,255,0.18)]';
                        const menuClass = isDark
                           ? 'border-white/10 bg-slate-900 text-slate-100'
                           : 'border-white/70 bg-white text-slate-700';
                        const statusOptions = [
                           {
                              value: true,
                              title: t('workerDashboard.dashboard.availableForJobs'),
                              dotClass: 'bg-emerald-400',
                           },
                           {
                              value: false,
                              title: t('workerDashboard.dashboard.pauseRequests'),
                              dotClass: 'bg-slate-400',
                           },
                        ];

                        return (
                           <>
                     <button
                        type="button"
                        onClick={() => setIsPresenceMenuOpen((prev) => !prev)}
                        className={`relative flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition duration-300 sm:min-w-[142px] sm:gap-3 sm:px-3 ${buttonClass}`}
                     >
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-slate-400'}`} />
                        <div className="min-w-0 flex-1">
                           <div className={`hidden truncate text-[10px] font-black uppercase tracking-[0.16em] sm:block ${isDark ? 'text-white' : 'text-slate-900'}`}>
                              {isOnline ? t('workerDashboard.dashboard.available') : t('workerDashboard.dashboard.paused')}
                           </div>
                        </div>
                        <svg
                           className={`h-4 w-4 shrink-0 transition-transform ${isPresenceMenuOpen ? 'rotate-180' : ''} ${isDark ? 'text-slate-300' : 'text-slate-500'}`}
                           fill="none"
                           stroke="currentColor"
                           viewBox="0 0 24 24"
                        >
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                     </button>

                     <AnimatePresence>
                        {isPresenceMenuOpen && (
                           <motion.div
                              initial={{ opacity: 0, y: -8, scale: 0.96 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -8, scale: 0.96 }}
                              transition={{ duration: 0.18 }}
                              className={`absolute right-0 top-[calc(100%+12px)] z-[720] w-56 rounded-3xl border p-2 shadow-[0_24px_60px_rgba(15,23,42,0.16)] backdrop-blur-xl ${menuClass}`}
                           >
                              <div className="space-y-1">
                              {statusOptions.map((option) => {
                                 const selected = isOnline === option.value;
                                 const optionClass = selected
                                    ? isDark
                                       ? 'border-cyan-400/20 bg-slate-800 text-white shadow-[0_10px_24px_rgba(15,23,42,0.24)]'
                                       : 'border-slate-200 bg-slate-100 text-slate-900 shadow-sm'
                                    : isDark
                                       ? 'border-white/10 bg-slate-900 text-slate-200 hover:border-cyan-300/20 hover:bg-slate-800'
                                       : 'border-slate-200 bg-white text-slate-700 hover:border-bird-blue/20 hover:bg-slate-50';
                                 return (
                                    <button
                                       key={option.title}
                                       type="button"
                                       onClick={() => handlePresenceChange(option.value)}
                                       className={`flex w-full items-start gap-3 rounded-2xl border px-3.5 py-3 text-left transition ${optionClass}`}
                                    >
                                       <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${option.value ? 'bg-emerald-400' : 'bg-slate-400'}`} />
                                       <div className="min-w-0 flex-1">
                                          <div className="flex items-center justify-between gap-3">
                                             <div className="text-sm font-bold">{option.title}</div>
                                             {selected && (
                                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] ${
                                                   isDark
                                                      ? 'bg-emerald-500/15 text-emerald-300'
                                                      : 'bg-emerald-100 text-emerald-700'
                                                }`}>
                                                   {t('workerDashboard.dashboard.active')}
                                                </span>
                                             )}
                                          </div>
                                       </div>
                                    </button>
                                 );
                              })}
                              </div>
                           </motion.div>
                        )}
                     </AnimatePresence>
                           </>
                        );
                     })()}
                  </motion.div>

                  <div className="flex items-center gap-2 md:gap-3 pl-1.5 md:pl-4 border-l border-gray-200">
                     <span className="text-sm font-bold text-gray-700 hidden 2xl:block truncate max-w-[120px]">
                        {userName || t('workerDashboard.dashboard.user')}
                     </span>
                     {userAvatar ? (
                        <img
                           src={userAvatar}
                           alt={userName}
                           loading="lazy"
                           decoding="async"
                           onError={() => setUserAvatar(null)}
                           className="w-8 h-8 md:w-10 md:h-10 rounded-full object-cover border-2 border-white shadow-sm"
                        />
                     ) : (
                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-bird-blue to-blue-600 border-2 border-white shadow-sm flex items-center justify-center text-white font-bold text-xs md:text-sm tracking-widest shrink-0">
                           {getInitials(userName)}
                        </div>
                     )}
                  </div>
               </div>
            </motion.div>

            {/* Verification Banner */}
            {!isVerified && hasUploadedDocs && (
               <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="relative mx-4 mb-2 mt-4 overflow-hidden md:mx-6"
               >
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm md:p-5 dark:border-amber-900/50 dark:bg-slate-800/80">
                     <div className="flex items-start gap-3 md:gap-4">
                        <motion.div
                           animate={{ 
                              rotate: [0, 10, -10, 10, 0],
                              scale: [1, 1.1, 1]
                           }}
                           transition={{ 
                              duration: 2,
                              repeat: Infinity,
                              repeatDelay: 3
                           }}
                           className="shrink-0"
                        >
                           <div className="w-10 h-10 md:w-12 md:h-12 bg-white/90 dark:bg-slate-700 rounded-full flex items-center justify-center shadow-md">
                              <svg className="h-6 w-6 text-amber-600 md:h-7 md:w-7 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                           </div>
                        </motion.div>
                        
                        <div className="flex-1 min-w-0">
                           <h3 className="mb-1 flex items-center gap-2 text-base font-black text-amber-950 dark:text-amber-200 md:text-lg">
                              {t('workerDashboard.dashboard.accountVerificationPending')}
                              <motion.span
                                 animate={{ opacity: [1, 0.5, 1] }}
                                 transition={{ duration: 2, repeat: Infinity }}
                                 className="inline-block h-2 w-2 rounded-full bg-amber-500"
                              />
                           </h3>
                           <p className="text-sm leading-relaxed text-amber-900/80 dark:text-amber-300/80 md:text-base">
                              {t('workerDashboard.dashboard.verificationBannerText')}
                           </p>
                           <div className="mt-3 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-400 md:text-sm">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span className="font-medium">{t('workerDashboard.dashboard.exploreDashboardNote')}</span>
                           </div>
                        </div>
                     </div>
                  </div>
               </motion.div>
            )}

            {/* Content area */}
            <motion.div
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.3 }}
               className="min-h-0 flex-1 flex flex-col lg:flex-row overflow-hidden relative pb-16 lg:pb-0"
            >
               {!isVerified && !hasUploadedDocs ? (
                  <Suspense fallback={<DashboardPanelFallback label={t('workerDashboard.dashboard.loadingDocuments')} />}>
                     <UploadDocumentsView 
                        token={token} 
                        onSuccess={() => {
                           setHasUploadedDocs(true);
                           if (token) syncWorkerStatus(token);
                        }} 
                     />
                  </Suspense>
               ) : (
                  <>
                     {!isVerified && hasUploadedDocs && (
                        <div className="absolute inset-0 z-[60] bg-white/60 dark:bg-slate-950/70 backdrop-blur-[6px] flex flex-col items-center justify-center p-6 text-center">
                           <motion.div 
                              initial={{ scale: 0.9, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-2xl max-w-sm border border-gray-200 dark:border-slate-700 pointer-events-auto"
                           >
                              <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/40 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                                 <svg className="w-10 h-10 text-amber-500 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                 </svg>
                              </div>
                              <h3 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-3">{t('workerDashboard.dashboard.dashboardLocked')}</h3>
                              <p className="text-gray-600 dark:text-slate-400 leading-relaxed">
                                 {t('workerDashboard.dashboard.dashboardLockedText')}
                              </p>
                           </motion.div>
                        </div>
                     )}
                     <AnimatePresence mode="wait">
                     {activeTab === 'requests' && (
                        <motion.div
                           key="requests"
                           initial={{ opacity: 0, x: 20 }}
                           animate={{ opacity: 1, x: 0 }}
                           exit={{ opacity: 0, x: -20 }}
                           transition={{ duration: 0.3 }}
                           className="w-full h-full flex"
                        >
                           <Suspense fallback={<DashboardPanelFallback label={t('workerDashboard.dashboard.loadingRequests')} />}>
                              <RequestsView
                                 isOnline={isOnline}
                                 mobileView={mobileView}
                                 token={token}
                                 isVerified={isVerified}
                                 focusRequestId={focusRequestId}
                                 openChatRequestId={openChatRequestId}
                                 isDark={isDark}
                                 onOpenHistory={() => setActiveTab('completed-work')}
                              />
                           </Suspense>
                        </motion.div>
                     )}

                     {activeTab === 'earnings' && (
                        <motion.div
                           key="earnings"
                           initial={{ opacity: 0, x: 20 }}
                           animate={{ opacity: 1, x: 0 }}
                           exit={{ opacity: 0, x: -20 }}
                           transition={{ duration: 0.3 }}
                           className="w-full h-full"
                        >
                           <Suspense fallback={<DashboardPanelFallback label={t('workerDashboard.dashboard.loadingEarnings')} />}>
                              <EarningsView />
                           </Suspense>
                        </motion.div>
                     )}

                     {activeTab === 'appointments' && (
                        <motion.div
                           key="appointments"
                           initial={{ opacity: 0, x: 20 }}
                           animate={{ opacity: 1, x: 0 }}
                           exit={{ opacity: 0, x: -20 }}
                           transition={{ duration: 0.3 }}
                           className="w-full h-full"
                        >
                           <Suspense fallback={<DashboardPanelFallback label={t('workerDashboard.dashboard.loadingAppointments')} />}>
                              <AppointmentsView />
                           </Suspense>
                        </motion.div>
                     )}

                     {activeTab === 'schedule' && (
                        <motion.div
                           key="schedule"
                           initial={{ opacity: 0, x: 20 }}
                           animate={{ opacity: 1, x: 0 }}
                           exit={{ opacity: 0, x: -20 }}
                           transition={{ duration: 0.3 }}
                           className="w-full h-full"
                        >
                           <Suspense fallback={<DashboardPanelFallback label={t('workerDashboard.dashboard.loadingSchedule')} />}>
                              <ScheduleView />
                           </Suspense>
                        </motion.div>
                     )}

                     {activeTab === 'completed-work' && (
                        <motion.div
                           key="completed-work"
                           initial={{ opacity: 0, x: 20 }}
                           animate={{ opacity: 1, x: 0 }}
                           exit={{ opacity: 0, x: -20 }}
                           transition={{ duration: 0.3 }}
                           className="w-full h-full"
                        >
                           <Suspense fallback={<DashboardPanelFallback label={t('workerDashboard.dashboard.loadingCompletedWork')} />}>
                              <CompletedWorkView />
                           </Suspense>
                        </motion.div>
                     )}

                     {activeTab === 'settings' && (
                        <motion.div
                           key="settings"
                           initial={{ opacity: 0, x: 20 }}
                           animate={{ opacity: 1, x: 0 }}
                           exit={{ opacity: 0, x: -20 }}
                           transition={{ duration: 0.3 }}
                           className="w-full h-full"
                        >
                           <Suspense fallback={<DashboardPanelFallback label={t('workerDashboard.dashboard.loadingSettings')} />}>
                              <SettingsView />
                           </Suspense>
                        </motion.div>
                     )}

                     {activeTab === 'review' && (
                        <motion.div
                           key="review"
                           initial={{ opacity: 0, x: 20 }}
                           animate={{ opacity: 1, x: 0 }}
                           exit={{ opacity: 0, x: -20 }}
                           transition={{ duration: 0.3 }}
                           className="w-full h-full overflow-y-auto p-6 md:p-8"
                        >
                           <ReviewSubmitSection />
                        </motion.div>
                     )}
                  </AnimatePresence>
                  </>
               )}
            </motion.div>

            {/* Mobile bottom navigation */}
            <motion.div
               initial={{ y: 100, opacity: 0 }}
               animate={{ y: 0, opacity: 1 }}
               transition={{ delay: 0.4, type: "spring" }}
               className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-gray-200 dark:border-slate-700 flex items-center justify-around px-4 pb-safe z-50 shadow-[0_-5px_20px_rgba(0,0,0,0.1)]"
            >
               {[
                  { id: 'requests', label: t('workerDashboard.dashboard.tabRequests'), icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
                  { id: 'review', label: t('workerDashboard.dashboard.navReview'), icon: 'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z' },
                  { id: 'appointments', label: t('workerDashboard.dashboard.tabAppointments'), icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2zm7 6h-4v4' },
                  { id: 'schedule', label: t('workerDashboard.dashboard.tabSchedule'), icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
                  { id: 'earnings', label: t('workerDashboard.dashboard.tabEarnings'), icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
                  { id: 'completed-work', label: t('workerDashboard.dashboard.tabCompletedWork'), icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
                  { id: 'settings', label: t('workerDashboard.dashboard.tabSettings'), icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' }
               ].map((item) => {
                  const isActive = activeTab === item.id || (item.id === 'settings' && activeTab.includes('settings'));
                  return (
                     <motion.button
                        key={item.id}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setActiveTab(item.id)}
                        className={`flex flex-col items-center gap-1 ${isActive ? 'text-bird-blue' : 'text-gray-500'}`}
                     >
                        <motion.div
                           animate={{
                              scale: isActive ? 1.1 : 1,
                              backgroundColor: isActive ? 'rgba(56, 189, 248, 0.1)' : 'transparent'
                           }}
                           className="w-6 h-6 rounded-full flex items-center justify-center"
                        >
                           <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                           </svg>
                        </motion.div>
                        <span className={`text-[10px] font-bold tracking-wide transition-colors ${isActive ? 'text-gray-900' : 'text-gray-500'}`}>
                           {item.label}
                        </span>
                     </motion.button>
                  );
               })}
            </motion.div>

            {/* Map toggle button */}
            <AnimatePresence>
               {activeTab === 'requests' && (
                  <motion.button
                     initial={{ scale: 0, rotate: -180 }}
                     animate={{ scale: 1, rotate: 0 }}
                     exit={{ scale: 0, rotate: 180 }}
                     whileHover={{ scale: 1.1 }}
                     whileTap={{ scale: 0.9 }}
                     onClick={() => setMobileView(mobileView === 'list' ? 'map' : 'list')}
                     className="lg:hidden fixed bottom-20 right-4 z-50 w-14 h-14 bg-gradient-to-br from-bird-blue to-bird-lightBlue rounded-full shadow-xl shadow-bird-blue/30 flex items-center justify-center text-white border-2 border-white"
                  >
                     {mobileView === 'list' ? (
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                     ) : (
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                        </svg>
                     )}
                  </motion.button>
               )}
            </AnimatePresence>
         </div>
         </div>
      </motion.div>
   );
};
