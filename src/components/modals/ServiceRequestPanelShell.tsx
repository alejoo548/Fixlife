import React from 'react';
import { motion } from 'framer-motion';

interface ServiceRequestPanelShellProps {
    isDesktopSheet: boolean;
    step: number;
    hasActiveTrackedRequest: boolean;
    isRequestPanelExpanded: boolean;
    selectedServiceTitle: string | null;
    compactLocationLabel: string;
    nearbyWorkersCount: number;
    radiusKm: number;
    onClose: () => void;
    onToggleExpanded: () => void;
    onOpenBookingDetails: () => void;
    notificationCenter: React.ReactNode;
    children: React.ReactNode;
}

export function ServiceRequestPanelShell({
    isDesktopSheet,
    step,
    hasActiveTrackedRequest,
    isRequestPanelExpanded,
    selectedServiceTitle,
    compactLocationLabel,
    nearbyWorkersCount,
    radiusKm,
    onClose,
    onToggleExpanded,
    onOpenBookingDetails,
    notificationCenter,
    children,
}: ServiceRequestPanelShellProps) {
    return (
        <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={`pointer-events-auto mt-auto flex flex-col bg-white/98 relative z-20 overflow-hidden border border-white/60 shadow-[0_-16px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl transition-[width,height,max-height] duration-300 ${
                isDesktopSheet
                    ? `ml-4 mb-4 mt-4 h-[calc(100%-2rem)] ${step === 1 && !hasActiveTrackedRequest ? (isRequestPanelExpanded ? 'w-[430px] lg:w-[500px]' : 'w-[340px]') : 'w-[430px] lg:w-[500px]'} rounded-[2rem]`
                    : `${step === 1 && !hasActiveTrackedRequest ? (isRequestPanelExpanded ? 'h-[78vh]' : 'h-[176px]') : 'h-[72vh]'} w-full rounded-t-[2rem] border-b-0`
            }`}
        >
            <div className="w-full flex justify-center pt-4 pb-0 md:hidden bg-white">
                <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
            </div>

            <div className="h-14 flex items-center justify-between px-5 border-b border-gray-200 bg-white shrink-0">
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
                    {step === 1 && !hasActiveTrackedRequest && (
                        <button
                            type="button"
                            onClick={onToggleExpanded}
                            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-700 transition hover:border-bird-blue hover:bg-white"
                        >
                            {isRequestPanelExpanded ? 'Collapse' : 'Expand'}
                        </button>
                    )}
                    {notificationCenter}
                </div>
            </div>

            {step === 1 && !hasActiveTrackedRequest && !isRequestPanelExpanded && (
                <div className="border-b border-gray-200 bg-white px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Selected service</p>
                            <p className="mt-1 truncate text-base font-black text-slate-900">{selectedServiceTitle || 'Choose a service'}</p>
                        </div>
                        <button
                            type="button"
                            onClick={onOpenBookingDetails}
                            className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-700 transition hover:border-bird-blue hover:bg-white"
                        >
                            Add details
                        </button>
                    </div>
                    <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Address</p>
                                <p className="mt-1 truncate text-sm font-bold text-slate-900">{compactLocationLabel}</p>
                            </div>
                            <button
                                type="button"
                                onClick={onOpenBookingDetails}
                                className="shrink-0 text-[11px] font-black text-bird-blue"
                            >
                                Edit
                            </button>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Coverage</p>
                                <p className="mt-1 text-sm font-black text-slate-900">{nearbyWorkersCount} pros in {radiusKm} km</p>
                            </div>
                            <button
                                type="button"
                                onClick={onOpenBookingDetails}
                                className="shrink-0 text-[11px] font-black text-bird-blue"
                            >
                                Radius
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className={`relative bg-gray-50/30 ${step === 1 && !hasActiveTrackedRequest && !isRequestPanelExpanded ? 'hidden' : 'flex-1 overflow-y-auto custom-scrollbar'}`}>
                {children}
            </div>
        </motion.div>
    );
}
