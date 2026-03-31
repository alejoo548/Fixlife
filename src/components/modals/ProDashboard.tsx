import React, { useState, useEffect, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ProSidebar } from './ProSidebar';
import { API_URL } from '../../config/api';
import { clearAuthSession, getAuthUser, getToken as getSessionToken, isAuthenticated, updateStoredAuthUser } from '../../utils/session';
import { NotificationCenter } from '../common/NotificationCenter';

const RequestsView = lazy(() =>
   import('../dashboard/RequestsView').then((module) => ({
      default: module.RequestsView,
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

const DashboardPanelFallback: React.FC<{ label?: string }> = ({ label = 'Loading panel...' }) => (
   <div className="w-full h-full min-h-[220px] p-4">
      <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/82 px-3 py-2 shadow-[0_14px_34px_rgba(15,23,42,0.08)] backdrop-blur-xl">
         <div className="h-3.5 w-3.5 rounded-full border-2 border-bird-blue/20 border-t-bird-blue animate-spin" />
         <p className="text-[11px] font-black uppercase tracking-[0.16em] text-bird-blue">{label}</p>
      </div>
   </div>
);

export const ProDashboard: React.FC<ProDashboardProps> = ({ isOpen, onClose, onSignOut }) => {
   const [isOnline, setIsOnline] = useState(false);
   const [activeTab, setActiveTab] = useState('requests');
   const [mobileView, setMobileView] = useState<'list' | 'map'>('list');
   const [isVerified, setIsVerified] = useState(false); // Por defecto falso
   const [hasUploadedDocs, setHasUploadedDocs] = useState(false); // Por defecto falso
   const [userName, setUserName] = useState('');
   const [userAvatar, setUserAvatar] = useState<string | null>(null);
   const [token, setToken] = useState<string | null>(null);

   const getInitials = (name: string) => {
      if (!name) return 'U';
      const parts = name.split(' ').filter(p => p.trim() !== '');
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return name.slice(0, 2).toUpperCase();
   };

   const handleSignOut = () => {
      clearAuthSession('worker');
      if (onSignOut) {
         onSignOut();
         return;
      }
      onClose();
   };

   const normalizeBool = (value: any) => {
      if (value === true || value === 1) return true;
      if (typeof value === 'string') {
         const v = value.trim().toLowerCase();
         return v === '1' || v === 'true' || v === 'yes';
      }
      return false;
   };

   const syncWorkerStatus = async (jwtToken: string) => {
      try {
         const response = await fetch(`${API_URL}/api/worker/me`, {
            headers: { Authorization: `Bearer ${jwtToken}` },
         });
         if (!response.ok) return;

         const data = await response.json();
         const wp = data?.worker_profile || {};
         const verified = normalizeBool(wp.is_verified);
         const uploaded = Boolean(wp.dui_document) || Boolean(wp.cert_document);

         setIsVerified(verified);
         setHasUploadedDocs(uploaded);

         const user = getAuthUser('worker');
         if (user) {
            user.worker_profile = {
               ...(user.worker_profile || {}),
               ...wp,
               is_verified: verified,
            };
            updateStoredAuthUser(user, 'worker');
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
         setIsVerified(normalizeBool(user.worker_profile?.is_verified));
         setHasUploadedDocs(!!user.worker_profile?.dui_document || !!user.worker_profile?.cert_document);
         setUserName(typeof user.name === 'string' ? user.name : '');
         setUserAvatar(typeof user.profile_image === 'string' ? user.profile_image : null);
      }
   }, [onClose]);

   useEffect(() => {
      if (!isOpen || !token) return;

      syncWorkerStatus(token);
      const intervalId = window.setInterval(() => {
         syncWorkerStatus(token);
      }, 3000);

      return () => window.clearInterval(intervalId);
   }, [isOpen, token]);

   if (!isOpen) return null;

   return (
      <motion.div
         initial={{ opacity: 0 }}
         animate={{ opacity: 1 }}
         exit={{ opacity: 0 }}
         className="fixed inset-0 z-40 bg-gradient-to-br from-sky-50 via-amber-50 to-orange-50 font-sans overflow-hidden"
      >
         {/* Background decorations */}
         <motion.div
            animate={{
               scale: [1, 1.2, 1],
               opacity: [0.3, 0.5, 0.3],
            }}
            transition={{
               duration: 8,
               repeat: Infinity,
               ease: "easeInOut"
            }}
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-bird-blue/10 via-transparent to-transparent pointer-events-none"
         />
         <motion.div
            animate={{
               scale: [1.2, 1, 1.2],
               opacity: [0.2, 0.4, 0.2],
            }}
            transition={{
               duration: 10,
               repeat: Infinity,
               ease: "easeInOut"
            }}
            className="absolute top-20 right-20 w-32 h-32 bg-bird-orange/15 rounded-full blur-3xl pointer-events-none"
         />

         {/* Sidebar */}
         <motion.div
            initial={{ x: -100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ type: "spring", damping: 20 }}
            className="hidden md:block"
         >
            <ProSidebar
               activeItem={activeTab}
               setActiveItem={setActiveTab}
               onClose={onClose}
               onSignOut={handleSignOut}
            />
         </motion.div>

         {/* Main content */}
         <div className="relative h-full flex flex-col md:ml-[130px] transition-all duration-300">
            {/* Header */}
            <motion.div
               initial={{ y: -20, opacity: 0 }}
               animate={{ y: 0, opacity: 1 }}
               transition={{ delay: 0.2 }}
               className="h-16 md:h-20 flex items-center justify-between px-4 md:px-8 shrink-0 relative z-20"
            >
               <div className="flex-1 min-w-0 flex items-center gap-3">
                  <motion.div
                     whileHover={{ scale: 1.05 }}
                     whileTap={{ scale: 0.95 }}
                     className="md:hidden flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 cursor-pointer shrink-0"
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
                        className="text-lg md:text-2xl font-bold text-gray-900 capitalize flex items-center gap-2 md:gap-3 truncate"
                     >
                        <span className="truncate">{activeTab.replace('-', ' ')}</span>
                        {activeTab === 'requests' && (
                           <motion.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="bg-bird-orange text-white text-[10px] md:text-xs px-1.5 md:px-2 py-0.5 rounded-md shrink-0 flex items-center gap-1"
                           >
                              <motion.span
                                 animate={{ scale: [1, 1.3, 1] }}
                                 transition={{ duration: 2, repeat: Infinity }}
                                 className="w-1.5 h-1.5 rounded-full bg-white"
                              />
                              Live
                           </motion.span>
                        )}
                     </motion.h2>
                     <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="text-gray-600 text-xs md:text-sm hidden sm:block truncate"
                     >
                        {userName ? `Welcome back, ${userName}.` : 'Welcome back.'}
                     </motion.p>
                  </div>
               </div>

               <div className="flex items-center gap-3">
                  <NotificationCenter token={token} variant="panel" />
                  <motion.div
                     initial={{ scale: 0, opacity: 0 }}
                     animate={{ scale: 1, opacity: 1 }}
                     transition={{ delay: 0.4, type: "spring" }}
                     className="flex items-center gap-2 cursor-pointer"
                     onClick={() => setIsOnline(!isOnline)}
                  >
                     <span className={`text-[10px] md:text-sm font-bold tracking-wider transition-colors ${isOnline ? 'text-emerald-500' : 'text-gray-400'}`}>
                        {isOnline ? 'ONLINE' : 'OFFLINE'}
                     </span>
                     <div className={`w-10 md:w-12 h-6 md:h-7 rounded-full p-1 transition-colors duration-300 relative ${isOnline ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                        <motion.div
                           animate={{ x: isOnline ? (window.innerWidth < 768 ? 16 : 20) : 0 }}
                           transition={{ type: "spring", stiffness: 500, damping: 30 }}
                           className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-white shadow-sm"
                        />
                     </div>
                  </motion.div>

                  <div className="flex items-center gap-2 md:gap-3 pl-2 md:pl-4 border-l border-gray-200">
                     <span className="text-sm font-bold text-gray-700 hidden sm:block truncate max-w-[100px] md:max-w-none">
                        {userName || 'User'}
                     </span>
                     {userAvatar ? (
                        <img 
                           src={userAvatar} 
                           alt={userName}
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
                  className="mx-4 md:mx-8 mt-4 mb-2 relative overflow-hidden"
               >
                  <div className="bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 rounded-2xl p-4 md:p-5 shadow-lg border border-amber-300">
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
                           <div className="w-10 h-10 md:w-12 md:h-12 bg-white/90 rounded-full flex items-center justify-center shadow-md">
                              <svg className="w-6 h-6 md:w-7 md:h-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                           </div>
                        </motion.div>
                        
                        <div className="flex-1 min-w-0">
                           <h3 className="text-white font-bold text-base md:text-lg mb-1 flex items-center gap-2">
                              Account Verification Pending
                              <motion.span
                                 animate={{ opacity: [1, 0.5, 1] }}
                                 transition={{ duration: 2, repeat: Infinity }}
                                 className="inline-block w-2 h-2 bg-white rounded-full"
                              />
                           </h3>
                           <p className="text-white/95 text-sm md:text-base leading-relaxed">
                              Your account is currently under review. Our team will verify your profile within 24-48 hours. 
                              You'll receive an email notification once approved and can start accepting requests.
                           </p>
                           <div className="mt-3 flex items-center gap-2 text-white/90 text-xs md:text-sm">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span className="font-medium">You can explore the dashboard, but requests are disabled until verification.</span>
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
               className="flex-1 flex flex-col md:flex-row overflow-hidden relative pb-16 md:pb-0"
            >
               {!isVerified && !hasUploadedDocs ? (
                  <Suspense fallback={<DashboardPanelFallback label="Loading documents..." />}>
                     <UploadDocumentsView 
                        token={token} 
                        onSuccess={() => {
                           setHasUploadedDocs(true);
                           setIsVerified(true);
                           if (token) syncWorkerStatus(token);
                        }} 
                     />
                  </Suspense>
               ) : (
                  <>
                     {!isVerified && hasUploadedDocs && (
                        <div className="absolute inset-0 z-[60] bg-white/50 backdrop-blur-[6px] flex flex-col items-center justify-center p-6 text-center">
                           <motion.div 
                              initial={{ scale: 0.9, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              className="bg-white/95 p-8 rounded-3xl shadow-2xl max-w-sm border border-gray-200 pointer-events-auto"
                           >
                              <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                                 <svg className="w-10 h-10 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                 </svg>
                              </div>
                              <h3 className="text-2xl font-bold text-gray-900 mb-3">Dashboard Locked</h3>
                              <p className="text-gray-600 leading-relaxed">
                                 Your documents have been submitted and are currently under review. 
                                 You will gain full access to the dashboard once your account is verified.
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
                           <Suspense fallback={<DashboardPanelFallback label="Loading requests..." />}>
                              <RequestsView isOnline={isOnline} mobileView={mobileView} token={token} />
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
                           <Suspense fallback={<DashboardPanelFallback label="Loading earnings..." />}>
                              <EarningsView />
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
                           <Suspense fallback={<DashboardPanelFallback label="Loading schedule..." />}>
                              <ScheduleView />
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
                           <Suspense fallback={<DashboardPanelFallback label="Loading settings..." />}>
                              <SettingsView />
                           </Suspense>
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
               className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/95 backdrop-blur-xl border-t border-gray-200 flex items-center justify-around px-4 pb-safe z-50 shadow-[0_-5px_20px_rgba(0,0,0,0.1)]"
            >
               {[
                  { id: 'requests', label: 'Requests', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
                  { id: 'schedule', label: 'Schedule', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
                  { id: 'earnings', label: 'Earnings', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
                  { id: 'settings', label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' }
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
                     className="md:hidden fixed bottom-20 right-4 z-50 w-14 h-14 bg-gradient-to-br from-bird-blue to-bird-lightBlue rounded-full shadow-xl shadow-bird-blue/30 flex items-center justify-center text-white border-2 border-white"
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
      </motion.div>
   );
};
