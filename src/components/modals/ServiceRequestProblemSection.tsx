import React from 'react';
import { motion } from 'framer-motion';

type NearbyWorkerPreview = {
    id_worker_profile: number;
    name: string;
    bio: string;
    distance_km: number | null;
};

interface ServiceRequestProblemSectionProps {
    description: string;
    price: string;
    problemFilesCount: number;
    problemPreviewUrls: string[];
    nearbyWorkers: NearbyWorkerPreview[];
    noNearbyProsNotice: string;
    canSearchPros: boolean;
    canSubmitRequest: boolean;
    isSubmittingRequest: boolean;
    isAuthenticated: boolean;
    showBudget?: boolean;
    showResults?: boolean;
    showActions?: boolean;
    onDescriptionChange: (value: string) => void;
    onPriceChange: (value: string) => void;
    onPricePaste: (value: string) => void;
    onProblemFilesChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onRemoveProblemImage: (index: number) => void;
    onFindPro: () => void;
    onSubmitRequest: () => void;
}

export function ServiceRequestProblemSection({
    description,
    price,
    problemFilesCount,
    problemPreviewUrls,
    nearbyWorkers,
    noNearbyProsNotice,
    canSearchPros,
    canSubmitRequest,
    isSubmittingRequest,
    isAuthenticated,
    showBudget = true,
    showResults = true,
    showActions = true,
    onDescriptionChange,
    onPriceChange,
    onPricePaste,
    onProblemFilesChange,
    onRemoveProblemImage,
    onFindPro,
    onSubmitRequest,
}: ServiceRequestProblemSectionProps) {
    return (
        <>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <label className="block text-sm font-bold text-gray-700 mb-2">What's the problem?</label>
                <textarea
                    className="w-full h-32 bg-gray-100 border-none rounded-xl p-4 text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-all resize-none placeholder-gray-400"
                    placeholder="Describe what needs fixing..."
                    value={description}
                    maxLength={1000}
                    onChange={(e) => onDescriptionChange(e.target.value)}
                />
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
                <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-bold text-slate-900">Problem Images (max 5)</label>
                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{problemFilesCount}/5</span>
                </div>
                <label className="block cursor-pointer">
                    <div className="w-full rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 transition-all duration-200 p-6 text-center group">
                        <div className="w-12 h-12 rounded-full bg-white shadow-sm border border-slate-100 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                        </div>
                        <div className="text-slate-900 font-bold text-[15px]">Upload Photos</div>
                        <div className="text-[13px] text-slate-500 mt-1">PNG, JPG, WEBP</div>
                    </div>
                    <input
                        type="file"
                        multiple
                        accept="image/png,image/jpeg,image/jpg,image/webp"
                        onChange={onProblemFilesChange}
                        className="hidden"
                    />
                </label>

                {problemPreviewUrls.length > 0 && (
                    <div className="grid grid-cols-3 gap-3 mt-4">
                        {problemPreviewUrls.map((url, index) => (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                key={url}
                                className="relative rounded-xl overflow-hidden border border-slate-200 shadow-sm group aspect-square"
                            >
                                <img src={url} alt={`Problem ${index + 1}`} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            onRemoveProblemImage(index);
                                        }}
                                        className="w-8 h-8 rounded-full bg-white/20 hover:bg-red-500 text-white flex items-center justify-center backdrop-blur-sm transition-colors"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </motion.div>

            {showBudget && <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                <label className="block text-sm font-bold text-slate-900 mb-2">Your budget</label>
                <div className="relative group">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg group-focus-within:text-slate-900 transition-colors">$</span>
                    <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        maxLength={7}
                        aria-describedby="request-budget-help"
                        className="w-full bg-slate-50 border-2 border-transparent focus:bg-white rounded-xl py-4 pl-10 pr-16 text-slate-900 font-bold text-lg outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder-slate-300 shadow-sm"
                        value={price}
                        onChange={(e) => onPriceChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (['-', '+', 'e', 'E'].includes(e.key)) e.preventDefault();
                        }}
                        onPaste={(e) => {
                            e.preventDefault();
                            onPricePaste(e.clipboardData.getData('text'));
                        }}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold bg-white px-2 py-1 rounded-md shadow-sm border border-slate-100">USD</span>
                </div>
                <div className="flex items-center gap-2 mt-3">
                    <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p id="request-budget-help" className="text-xs font-semibold text-slate-500">
                        Suggested: <span className="text-slate-700">$40 - $80</span> · Maximum: $1,000.00
                    </p>
                </div>
            </motion.div>}

            {showResults && nearbyWorkers.length > 0 && (
                <div className="mt-4 rounded-xl border border-gray-100 bg-white p-3">
                    <p className="text-xs uppercase tracking-wider font-bold text-emerald-700 mb-2">
                        Nearby workers in range
                    </p>
                    <div className="space-y-2">
                        {nearbyWorkers.slice(0, 5).map((worker) => (
                            <div key={worker.id_worker_profile} className="flex items-center justify-between rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                                <div className="min-w-0">
                                    <p className="text-[15px] font-bold text-slate-800 truncate">{worker.name}</p>
                                    <p className="text-xs text-gray-500 truncate">{worker.bio || 'Available now'}</p>
                                </div>
                                <span className="text-xs font-bold text-emerald-700">
                                    {worker.distance_km != null ? `${worker.distance_km.toFixed(1)} km` : '--'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {showResults && noNearbyProsNotice && nearbyWorkers.length === 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm"
                >
                    <p className="text-sm font-black text-amber-900">No nearby pros available right now</p>
                    <p className="mt-1 text-sm font-semibold text-amber-800">{noNearbyProsNotice}</p>
                </motion.div>
            )}

            {showActions && <div className="mt-6 space-y-3 sticky bottom-0 bg-gradient-to-t from-white via-white to-transparent pt-4 pb-2 z-10">
                <motion.button
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={onFindPro}
                    disabled={!canSearchPros}
                    className="w-full py-4 rounded-xl bg-slate-900 text-white font-bold text-[15px] hover:bg-black transition-all disabled:opacity-50 disabled:hover:bg-slate-900 flex items-center justify-center gap-3 shadow-lg shadow-slate-900/20"
                >
                    <span>Find a Pro</span>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                </motion.button>

                <motion.button
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.45 }}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={onSubmitRequest}
                    disabled={!canSubmitRequest}
                    className="w-full py-4 rounded-xl bg-white border-2 border-slate-200 text-slate-700 font-bold text-[15px] hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-all disabled:opacity-50 disabled:bg-white"
                >
                    {!isAuthenticated ? 'Login Required' : isSubmittingRequest ? 'Submitting...' : 'Submit Request'}
                </motion.button>
            </div>}
        </>
    );
}
