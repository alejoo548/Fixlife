import React from 'react';
import { motion } from 'framer-motion';

interface ServiceRequestPanelShellProps {
    isDesktopSheet: boolean;
    step: number;
    hasActiveTrackedRequest: boolean;
    onClose: () => void;
    notificationCenter: React.ReactNode;
    children: React.ReactNode;
}

export function ServiceRequestPanelShell({
    isDesktopSheet,
    step,
    hasActiveTrackedRequest,
    onClose,
    notificationCenter,
    children,
}: ServiceRequestPanelShellProps) {
    return (
        <motion.div
            initial={isDesktopSheet ? { opacity: 0, x: -16 } : { y: '100%', opacity: 0 }}
            animate={isDesktopSheet ? { opacity: 1, x: 0 } : { y: 0, opacity: 1 }}
            exit={isDesktopSheet ? { opacity: 0, x: -16 } : { y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={`pointer-events-auto flex flex-col bg-white/96 relative z-20 overflow-hidden border-white/70 backdrop-blur-xl ${
                isDesktopSheet
                    ? `h-full w-[430px] lg:w-[500px] border-r border-slate-200/80 shadow-[2px_0_24px_rgba(15,23,42,0.10)]`
                    : `${step === 1 && !hasActiveTrackedRequest ? 'h-[72vh]' : 'h-[72vh]'} w-full rounded-t-[2rem] border border-b-0 shadow-[0_-12px_40px_rgba(15,23,42,0.12)] mt-auto`
            }`}
        >
            {/* Mobile drag handle */}
            <div className="w-full flex justify-center pt-4 pb-0 md:hidden bg-white">
                <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="h-16 flex items-center justify-between px-5 border-b border-slate-200/80 bg-white/95 shrink-0 backdrop-blur">
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-2 group"
                    onClick={onClose}
                >
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 group-hover:bg-bird-blue group-hover:text-white transition-all">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </div>
                    <span className="font-bold text-gray-900 text-lg">Fixlife</span>
                </motion.button>

                <div className="flex items-center gap-3">
                    {notificationCenter}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar relative bg-gradient-to-b from-white to-slate-50/40">
                {children}
            </div>
        </motion.div>
    );
}
