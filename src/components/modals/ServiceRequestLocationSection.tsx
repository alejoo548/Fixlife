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
        <div>
            <div className="flex items-center justify-between gap-2 mb-2">
                <label className="block text-sm font-bold text-gray-700">Where?</label>
                <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={onOpenSaveLocationPanel}
                        disabled={!currentCoords || resolvingLocation || geoLoading}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg border border-bird-blue/20 bg-bird-blue text-white hover:bg-bird-darkBlue disabled:opacity-60"
                    >
                        Add location
                    </button>
                    <button
                        type="button"
                        onClick={onResolveLocationInput}
                        disabled={resolvingLocation || !location.trim()}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                    >
                        {resolvingLocation ? 'Resolving...' : 'Use typed address'}
                    </button>
                    <button
                        type="button"
                        onClick={onDetectCurrentLocation}
                        disabled={geoLoading}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg border border-bird-blue/30 bg-bird-blue/10 text-slate-900 hover:bg-bird-blue/20 disabled:opacity-60"
                    >
                        {geoLoading ? 'Detecting...' : 'Detect my location'}
                    </button>
                </div>
            </div>
            <input
                type="text"
                placeholder="Ej: Residencial Santa Monica, Santa Tecla o 13.6841, -89.2872"
                autoComplete="off"
                className="w-full bg-gray-100 border-none rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-all placeholder-gray-400"
                value={location}
                onFocus={onMainInputFocus}
                onBlur={onInputBlur}
                onKeyDown={onLocationKeyDown}
                onChange={(e) => onLocationChange(e.target.value)}
            />
            {locationInputContext === 'main' && mainSuggestionsDropdown}
            <p className="mt-2 text-xs font-medium text-gray-500">
                Write a colonia, residencial, mall, or landmark in El Salvador and click <span className="font-bold text-emerald-700">Use typed address</span>,
                or paste coordinates like <span className="font-bold text-gray-700">13.6841, -89.2872</span>.
            </p>
            <p className="mt-1 text-[11px] font-semibold text-gray-400">
                Keyboard: use ↑ ↓ to move through suggestions and Enter to confirm.
            </p>
            {currentCoords && (
                <p className="mt-2 text-xs font-semibold text-emerald-700">
                    Location ready: {currentCoords.lat.toFixed(4)}, {currentCoords.lng.toFixed(4)}
                </p>
            )}
            {showSaveLocationPanel && currentCoords && (
                <div className="mt-3 rounded-2xl border border-bird-blue/20 bg-bird-blue/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[15px] font-bold text-slate-800">Save this location</p>
                            <p className="mt-1 text-xs text-gray-500">
                                Register it once and reuse it in future requests.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onCloseSaveLocationPanel}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-bold text-gray-500 hover:text-gray-700"
                        >
                            Cancel
                        </button>
                    </div>
                    <div className="mt-4">
                        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">
                            Search address
                        </label>
                        <input
                            type="text"
                            placeholder="Ej: Jardines de Guadalupe, Antiguo Cuscatlan"
                            autoComplete="off"
                            value={location}
                            onFocus={onSavePanelInputFocus}
                            onBlur={onInputBlur}
                            onKeyDown={onLocationKeyDown}
                            onChange={(e) => onLocationChange(e.target.value)}
                            className="w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 focus:border-bird-blue focus:outline-none"
                        />
                        {locationInputContext === 'save-panel' && saveSuggestionsDropdown}
                        <p className="mt-2 text-[11px] font-semibold text-gray-400">
                            Use the same El Salvador autocomplete here to fine-tune the pin before saving.
                        </p>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                        {(['home', 'work', 'favorite'] as const).map((kind) => (
                            <button
                                key={kind}
                                type="button"
                                onClick={() => onSelectSaveLocationKind(kind)}
                                className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                                    saveLocationKind === kind
                                        ? 'border-bird-blue bg-white text-slate-900 shadow-sm'
                                        : 'border-gray-200 bg-white text-gray-600 hover:border-bird-blue/40'
                                }`}
                            >
                                <span className="inline-flex items-center gap-2">
                                    {renderLocationBadge(kind, 'sm')}
                                    {kind === 'home' ? 'Home' : kind === 'work' ? 'Work' : 'Favorite'}
                                </span>
                            </button>
                        ))}
                    </div>
                    <div className="mt-3">
                        <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">
                            {saveLocationKind === 'favorite' ? 'Location name' : 'Saved label'}
                        </label>
                        <input
                            type="text"
                            value={saveLocationKind === 'favorite' ? saveLocationTitle : saveLocationKind === 'home' ? 'Home' : 'Work'}
                            onChange={(e) => onSaveLocationTitleChange(e.target.value)}
                            disabled={saveLocationKind !== 'favorite'}
                            className="w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 focus:border-bird-blue focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={onSaveLocation}
                        className="mt-4 w-full rounded-xl bg-bird-blue px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-bird-darkBlue"
                    >
                        Save location
                    </button>
                </div>
            )}
            {geoError && <p className="text-xs text-red-600 mt-2 font-semibold">{geoError}</p>}
            <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-sm font-bold uppercase tracking-wider text-gray-500">Saved places</p>
                        <p className="mt-1 text-xs text-gray-500">
                            Open your saved locations in a cleaner view.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onOpenSavedPlacesModal}
                        className="rounded-2xl border-none bg-gray-50/80 hover:bg-gray-100 transition-colors px-3 py-2 text-xs font-bold text-slate-900 hover:border-bird-blue/40 hover:bg-bird-blue/5"
                    >
                        <span className="inline-flex items-center gap-2">
                            {renderLocationBadge('current', 'sm')}
                            Open saved places
                        </span>
                    </button>
                </div>
                {quickAccessLocationsCount === 0 ? (
                    <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-4 text-sm text-gray-500">
                        Resolve a location first, then use <span className="font-bold text-gray-700">Add location</span> to save it here.
                    </div>
                ) : (
                    <div className="mt-4 flex flex-wrap gap-2">
                        {savedPlacesPreview.map((savedLocation, index) => (
                            <button
                                key={`${savedLocation.kind}-preview-${index}-${savedLocation.label}`}
                                type="button"
                                onClick={() => onUseSavedLocation(savedLocation)}
                                className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold transition hover:shadow-sm ${getLocationChipClass(savedLocation.kind)}`}
                            >
                                {renderLocationBadge(savedLocation.kind, 'sm')}
                                {savedLocation.title}
                            </button>
                        ))}
                        {quickAccessLocationsCount > savedPlacesPreview.length && (
                            <button
                                type="button"
                                onClick={onOpenSavedPlacesModal}
                                className="inline-flex items-center rounded-full border border-dashed border-gray-300 px-3 py-2 text-xs font-bold text-gray-500 hover:border-bird-blue hover:text-slate-900"
                            >
                                +{quickAccessLocationsCount - savedPlacesPreview.length} more
                            </button>
                        )}
                    </div>
                )}
            </div>
            <div className="mt-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Search radius
                </label>
                <select
                    value={radiusKm}
                    onChange={(e) => onRadiusChange(Number(e.target.value))}
                    className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 focus:outline-none focus:border-bird-blue transition-all"
                >
                    <option value={3}>3 km</option>
                    <option value={5}>5 km</option>
                    <option value={8}>8 km</option>
                    <option value={12}>12 km</option>
                    <option value={15}>15 km</option>
                </select>
            </div>
        </div>
    );
}
