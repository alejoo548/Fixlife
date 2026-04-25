import React from 'react';

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
    return (
        <>
            {!leafletReady && <div className="absolute right-4 top-4 z-[500] h-2.5 w-2.5 rounded-full bg-bird-blue/40 animate-pulse" />}
            {!activeTrackedRequest && (
                <div className="absolute left-4 right-4 top-4 z-[400] rounded-2xl bg-white/92 border border-white/70 shadow-[0_18px_40px_rgba(15,23,42,0.14)] px-4 py-3 backdrop-blur-xl pointer-events-auto sm:left-auto sm:right-6 sm:top-6 sm:max-w-xs">
                    <p className="text-[11px] uppercase tracking-wider font-bold text-gray-500">Live Map</p>
                    <p className="text-[15px] font-bold text-slate-800 truncate">
                        {currentCoords
                            ? (locationLabel.trim() || `Lat ${currentCoords.lat.toFixed(4)}, Lng ${currentCoords.lng.toFixed(4)}`)
                            : 'Detect location to center'}
                    </p>
                    <p className="text-xs text-slate-900 font-bold mt-1">
                        {nearbyWorkersCount} nearby pro(s) in {radiusKm} km
                    </p>
                </div>
            )}
            {activeTrackedRequest && (
                <div className="absolute inset-0 z-[420]">
                    {trackerContent}
                </div>
            )}
        </>
    );
}
