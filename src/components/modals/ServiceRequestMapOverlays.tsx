import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface ServiceRequestMapOverlaysProps {
    leafletReady: boolean;
    activeTrackedRequest: { id_request: number } | null;
    currentCoords: { lat: number; lng: number } | null;
    locationLabel: string;
    nearbyWorkersCount: number;
    radiusKm: number;
    trackerContent?: React.ReactNode;
}

export function ServiceRequestMapOverlays({
    leafletReady,
    activeTrackedRequest,
    currentCoords,
    locationLabel,
    nearbyWorkersCount,
    radiusKm,
    trackerContent,
}: ServiceRequestMapOverlaysProps) {
    const { t } = useTranslation();

    return (
        <>
            {!leafletReady && (
                <div className="absolute right-4 top-4 z-[500] flex h-7 w-7 items-center justify-center">
                    <span className="absolute h-full w-full animate-ping rounded-full bg-bird-blue/30" />
                    <span className="h-2.5 w-2.5 rounded-full bg-bird-blue" />
                </div>
            )}
            {!activeTrackedRequest && (
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="absolute left-4 right-4 top-4 z-[400] flex items-center gap-3 rounded-2xl bg-white/92 border border-white/70 shadow-[0_18px_40px_rgba(15,23,42,0.14)] px-4 py-3 backdrop-blur-xl pointer-events-auto dark:bg-slate-900/85 dark:border-white/10 dark:shadow-[0_18px_40px_rgba(0,0,0,0.45)] sm:left-auto sm:right-6 sm:top-6 sm:max-w-xs"
                >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bird-blue/10 text-bird-blue dark:bg-bird-blue/15">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                        </svg>
                    </span>
                    <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider font-black text-slate-400 dark:text-slate-500">{t('serviceRequest.location.liveMap')}</p>
                        <p className="text-[14px] font-bold text-slate-800 dark:text-slate-100 truncate">
                            {currentCoords
                                ? (locationLabel.trim() || `Lat ${currentCoords.lat.toFixed(4)}, Lng ${currentCoords.lng.toFixed(4)}`)
                                : t('serviceRequest.location.confirmAddressToCenter')}
                        </p>
                        <p className="text-xs text-bird-blue font-bold mt-0.5">
                            {t('serviceRequest.location.nearbyPros', { count: nearbyWorkersCount, radius: radiusKm })}
                        </p>
                    </div>
                </motion.div>
            )}
            {activeTrackedRequest && (
                <div className="absolute inset-0 z-[420]">
                    {trackerContent}
                </div>
            )}
        </>
    );
}
