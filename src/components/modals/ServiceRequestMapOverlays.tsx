import React from 'react';

interface ServiceRequestMapOverlaysProps {
    leafletReady: boolean;
    activeTrackedRequest: { id_request: number } | null;
    currentCoords: { lat: number; lng: number } | null;
    locationLabel: string;
    nearbyWorkersCount: number;
    radiusKm: number;
    shouldShowCollapsedBookingCard: boolean;
    selectedServiceTitle: string | null;
    compactLocationLabel: string;
    onOpenBookingDetails: () => void;
    trackerContent?: React.ReactNode;
}

export function ServiceRequestMapOverlays({
    leafletReady,
    activeTrackedRequest,
    currentCoords,
    locationLabel,
    nearbyWorkersCount,
    radiusKm,
    shouldShowCollapsedBookingCard,
    selectedServiceTitle,
    compactLocationLabel,
    onOpenBookingDetails,
    trackerContent,
}: ServiceRequestMapOverlaysProps) {
    return (
        <>
            {!leafletReady && <div className="absolute right-4 top-4 z-[500] h-2.5 w-2.5 rounded-full bg-bird-blue/40 animate-pulse" />}
            {!activeTrackedRequest && (
                <div className="absolute top-4 right-4 md:left-[450px] md:top-4 z-[400] rounded-xl bg-white/95 border border-gray-200 shadow-xl px-4 py-3 pointer-events-auto hidden sm:block">
                    <p className="text-[11px] uppercase tracking-wider font-bold text-gray-500">Live Map</p>
                    <p className="text-[15px] font-bold text-slate-800">
                        {currentCoords
                            ? (locationLabel.trim() || `Lat ${currentCoords.lat.toFixed(4)}, Lng ${currentCoords.lng.toFixed(4)}`)
                            : 'Detect location to center'}
                    </p>
                    <p className="text-xs text-slate-900 font-bold mt-1">
                        {nearbyWorkersCount} nearby pro(s) in {radiusKm} km
                    </p>
                </div>
            )}
            {shouldShowCollapsedBookingCard && (
                <div className="absolute left-4 right-4 top-4 z-[410] md:left-[450px] md:top-6 md:right-auto md:w-[360px] pointer-events-auto">
                    <div className="rounded-[28px] border border-white/70 bg-white/95 p-4 shadow-[0_20px_50px_rgba(15,23,42,0.18)] backdrop-blur-xl">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Booking summary</p>
                                <p className="mt-1 truncate text-lg font-black text-slate-900">{selectedServiceTitle || 'Choose a service'}</p>
                            </div>
                            <button
                                type="button"
                                onClick={onOpenBookingDetails}
                                className="shrink-0 rounded-full border border-bird-blue/20 bg-bird-blue/10 px-3 py-1.5 text-[11px] font-black text-slate-900 transition hover:bg-bird-blue hover:text-white"
                            >
                                Expand
                            </button>
                        </div>

                        <div className="mt-4 space-y-3">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Current address</p>
                                        <p className="mt-1 truncate text-sm font-bold text-slate-900">{compactLocationLabel}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={onOpenBookingDetails}
                                        className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700 transition hover:border-bird-blue hover:text-slate-900"
                                    >
                                        Edit
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3">
                                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Pros nearby</p>
                                    <p className="mt-1 text-sm font-black text-slate-900">{nearbyWorkersCount} pros in {radiusKm} km</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={onOpenBookingDetails}
                                    className="shrink-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-700 transition hover:border-bird-blue hover:text-slate-900"
                                >
                                    Radius
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {activeTrackedRequest && (
                <div className="absolute inset-0 z-[420] hidden md:block md:left-[430px] lg:left-[504px]">
                    {trackerContent}
                </div>
            )}
        </>
    );
}
