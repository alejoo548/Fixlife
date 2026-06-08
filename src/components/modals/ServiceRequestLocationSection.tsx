import React from 'react';

type SaveLocationKind = 'home' | 'work' | 'favorite';
type PreviewLocationKind = 'home' | 'work' | 'favorite' | 'recent';

type SavedPreviewLocation = {
    kind: PreviewLocationKind;
    title: string;
    label: string;
};

interface ServiceRequestLocationSectionProps {
    location: string;
    currentCoords: { lat: number; lng: number } | null;
    resolvingLocation: boolean;
    geoLoading: boolean;
    locationInputContext: 'main' | 'save-panel' | null;
    showSaveLocationPanel: boolean;
    saveLocationKind: SaveLocationKind;
    saveLocationTitle: string;
    geoError: string | null;
    quickAccessLocationsCount: number;
    savedPlacesPreview: SavedPreviewLocation[];
    radiusKm: number;
    mainSuggestionsDropdown: React.ReactNode;
    saveSuggestionsDropdown: React.ReactNode;
    renderLocationBadge: (kind: PreviewLocationKind | 'current', size: 'sm' | 'md' | 'lg') => React.ReactNode;
    getLocationChipClass: (kind: PreviewLocationKind) => string;
    onOpenSaveLocationPanel: () => void;
    onResolveLocationInput: () => void;
    onDetectCurrentLocation: () => void;
    onMainInputFocus: () => void;
    onSavePanelInputFocus: () => void;
    onInputBlur: () => void;
    onLocationKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
    onLocationChange: (value: string) => void;
    onCloseSaveLocationPanel: () => void;
    onSelectSaveLocationKind: (kind: SaveLocationKind) => void;
    onSaveLocationTitleChange: (value: string) => void;
    onSaveLocation: () => void;
    onOpenSavedPlacesModal: () => void;
    onUseSavedLocation: (location: SavedPreviewLocation) => void;
    onRadiusChange: (radiusKm: number) => void;
}

export function ServiceRequestLocationSection({
    location,
    currentCoords,
    resolvingLocation,
    geoLoading,
    locationInputContext,
    showSaveLocationPanel,
    saveLocationKind,
    saveLocationTitle,
    geoError,
    quickAccessLocationsCount,
    savedPlacesPreview,
    radiusKm,
    mainSuggestionsDropdown,
    saveSuggestionsDropdown,
    renderLocationBadge,
    getLocationChipClass,
    onOpenSaveLocationPanel,
    onResolveLocationInput,
    onDetectCurrentLocation,
    onMainInputFocus,
    onSavePanelInputFocus,
    onInputBlur,
    onLocationKeyDown,
    onLocationChange,
    onCloseSaveLocationPanel,
    onSelectSaveLocationKind,
    onSaveLocationTitleChange,
    onSaveLocation,
    onOpenSavedPlacesModal,
    onUseSavedLocation,
    onRadiusChange,
}: ServiceRequestLocationSectionProps) {
    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <label className="block text-sm font-black text-slate-900">Service address</label>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                    Search an address, landmark or use your current location.
                </p>

                <div className="relative mt-3">
                    <svg className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21s7-5.2 7-12a7 7 0 10-14 0c0 6.8 7 12 7 12z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11a2 2 0 100-4 2 2 0 000 4z" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Search your address"
                        autoComplete="off"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-bold text-slate-900 outline-none transition focus:border-bird-blue focus:bg-white focus:ring-4 focus:ring-bird-blue/10"
                        value={location}
                        onFocus={onMainInputFocus}
                        onBlur={onInputBlur}
                        onKeyDown={onLocationKeyDown}
                        onChange={(event) => onLocationChange(event.target.value)}
                    />
                </div>
                {locationInputContext === 'main' && mainSuggestionsDropdown}

                <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={onDetectCurrentLocation}
                        disabled={geoLoading}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-700 transition hover:border-bird-blue hover:text-bird-blue disabled:opacity-50"
                    >
                        {geoLoading ? 'Detecting...' : 'Use my location'}
                    </button>
                    <button
                        type="button"
                        onClick={onResolveLocationInput}
                        disabled={resolvingLocation || !location.trim()}
                        className="rounded-xl bg-bird-blue px-3 py-3 text-xs font-black text-white transition hover:bg-blue-600 disabled:opacity-50"
                    >
                        {resolvingLocation ? 'Locating...' : 'Confirm address'}
                    </button>
                </div>
            </div>

            {currentCoords ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="min-w-0">
                        <p className="text-sm font-black text-emerald-900">Pin confirmed on the map</p>
                        <p className="mt-1 truncate text-xs font-semibold text-emerald-700">{location}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onOpenSaveLocationPanel}
                        disabled={resolvingLocation || geoLoading}
                        className="shrink-0 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-700"
                    >
                        Save place
                    </button>
                </div>
            ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-xs font-semibold text-slate-500">
                    Confirm an address to place the pin and see nearby professionals on the map.
                </div>
            )}

            {showSaveLocationPanel && currentCoords && (
                <div className="rounded-2xl border border-bird-blue/20 bg-sky-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-black text-slate-900">Save this place</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">Reuse it on your next request.</p>
                        </div>
                        <button type="button" onClick={onCloseSaveLocationPanel} className="text-xs font-black text-slate-500">
                            Close
                        </button>
                    </div>

                    <input
                        type="text"
                        value={location}
                        onFocus={onSavePanelInputFocus}
                        onBlur={onInputBlur}
                        onKeyDown={onLocationKeyDown}
                        onChange={(event) => onLocationChange(event.target.value)}
                        className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-bird-blue"
                    />
                    {locationInputContext === 'save-panel' && saveSuggestionsDropdown}

                    <div className="mt-3 grid grid-cols-3 gap-2">
                        {(['home', 'work', 'favorite'] as const).map((kind) => (
                            <button
                                key={kind}
                                type="button"
                                onClick={() => onSelectSaveLocationKind(kind)}
                                className={`rounded-xl border px-2 py-2 text-xs font-black ${
                                    saveLocationKind === kind
                                        ? 'border-bird-blue bg-white text-bird-blue'
                                        : 'border-slate-200 bg-white text-slate-600'
                                }`}
                            >
                                {kind === 'home' ? 'Home' : kind === 'work' ? 'Work' : 'Favorite'}
                            </button>
                        ))}
                    </div>

                    {saveLocationKind === 'favorite' && (
                        <input
                            type="text"
                            value={saveLocationTitle}
                            onChange={(event) => onSaveLocationTitleChange(event.target.value)}
                            placeholder="Place name"
                            className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-bird-blue"
                        />
                    )}

                    <button type="button" onClick={onSaveLocation} className="mt-3 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white">
                        Save place
                    </button>
                </div>
            )}

            {geoError && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600">{geoError}</p>}

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-sm font-black text-slate-900">Saved places</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">Choose one without typing again.</p>
                    </div>
                    <button type="button" onClick={onOpenSavedPlacesModal} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">
                        View all
                    </button>
                </div>

                {quickAccessLocationsCount > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                        {savedPlacesPreview.map((savedLocation, index) => (
                            <button
                                key={`${savedLocation.kind}-${index}-${savedLocation.label}`}
                                type="button"
                                onClick={() => onUseSavedLocation(savedLocation)}
                                className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black ${getLocationChipClass(savedLocation.kind)}`}
                            >
                                {renderLocationBadge(savedLocation.kind, 'sm')}
                                {savedLocation.title}
                            </button>
                        ))}
                    </div>
                ) : (
                    <p className="mt-3 text-xs font-semibold text-slate-400">You do not have saved places yet.</p>
                )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-black text-slate-900">Search distance</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">A wider radius may find more professionals.</p>
                <div className="mt-3 grid grid-cols-5 gap-2">
                    {[3, 5, 8, 12, 15].map((value) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => onRadiusChange(value)}
                            className={`rounded-xl border px-2 py-2.5 text-xs font-black transition ${
                                radiusKm === value
                                    ? 'border-bird-blue bg-sky-50 text-bird-blue'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-bird-blue/40'
                            }`}
                        >
                            {value} km
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
