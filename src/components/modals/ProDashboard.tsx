
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ProSidebar } from './ProSidebar';
import { RequestsView } from '../dashboard/RequestsView';
import { EarningsView } from '../dashboard/EarningsView';
import { ScheduleView } from '../dashboard/ScheduleView';
import { SettingsView } from '../dashboard/SettingsView';

interface ProDashboardProps {
   isOpen: boolean;
   onClose: () => void;
}

export const ProDashboard: React.FC<ProDashboardProps> = ({ isOpen, onClose }) => {
   const [isOnline, setIsOnline] = useState(false);
   const [activeTab, setActiveTab] = useState('requests');
   const [mobileView, setMobileView] = useState<'list' | 'map'>('list');

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
               <div className="flex-1 min-w-0">
                  <motion.h2
                     key={activeTab}
                     initial={{ opacity: 0, x: -20 }}
                     animate={{ opacity: 1, x: 0 }}
                     className="text-xl md:text-2xl font-bold text-gray-900 capitalize flex items-center gap-2 md:gap-3 truncate"
                  >
                     <span className="truncate">{activeTab.replace('-', ' ')}</span>
                     {activeTab === 'requests' && (
                        <motion.span
                           initial={{ scale: 0 }}
                           animate={{ scale: 1 }}
                           className="bg-bird-orange text-white text-xs px-2 py-0.5 rounded-md shrink-0 flex items-center gap-1"
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
                     className="text-gray-600 text-xs md:text-sm hidden sm:block"
                  >
                     Welcome back, Alex.
                  </motion.p>
               </div>

               <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="md:hidden flex items-center gap-2 ml-2 cursor-pointer"
                  onClick={onClose}
               >
                  <span className="font-bold text-gray-900 text-sm">Back</span>
               </motion.div>

               <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.4, type: "spring" }}
                  className="hidden md:flex items-center gap-4 bg-white border border-gray-200 p-2 rounded-2xl shadow-lg ml-4"
               >
                  <span className={`text-xs font-bold tracking-wider px-2 transition-colors ${isOnline ? 'text-green-500' : 'text-gray-500'}`}>
                     {isOnline ? 'ONLINE' : 'OFFLINE'}
                  </span>
                  <motion.button
                     whileTap={{ scale: 0.9 }}
                     onClick={() => setIsOnline(!isOnline)}
                     className={`w-12 h-7 rounded-full p-1 transition-colors duration-300 relative ${isOnline ? 'bg-green-500' : 'bg-gray-300'}`}
                  >
                     <motion.div
                        animate={{ x: isOnline ? 20 : 0 }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        className="w-5 h-5 rounded-full bg-white shadow-md"
                     />
                  </motion.button>
               </motion.div>
            </motion.div>

            {/* Content area */}
            <motion.div
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.3 }}
               className="flex-1 flex flex-col md:flex-row overflow-hidden rounded-tl-3xl border-t border-l border-gray-200 bg-white/50 backdrop-blur-sm relative"
            >
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
                        <RequestsView isOnline={isOnline} mobileView={mobileView} />
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
                        <EarningsView />
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
                        <ScheduleView />
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
                        <SettingsView />
                     </motion.div>
                  )}
               </AnimatePresence>
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