import React from 'react';
import { motion } from 'framer-motion';

interface ServiceRequestDetailsHeaderProps {
    selectedServiceTitle: string | null;
    onBack: () => void;
    onChangeService: () => void;
}

export function ServiceRequestDetailsHeader({
    selectedServiceTitle,
    onBack,
    onChangeService,
}: ServiceRequestDetailsHeaderProps) {
    return (
        <>
            <motion.button
                whileHover={{ x: -5 }}
                onClick={onBack}
                className="text-gray-600 hover:text-gray-900 text-sm font-bold flex items-center gap-2 mb-6 transition-colors"
            >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
            </motion.button>

            <motion.h2
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-2xl font-black text-slate-900 mb-4 tracking-tight"
            >
                Request Details
            </motion.h2>

            {selectedServiceTitle && (
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-gray-100 p-4"
                >
                    <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Selected Service</p>
                        <p className="text-[15px] font-bold text-slate-800">{selectedServiceTitle}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onChangeService}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
                    >
                        Change
                    </button>
                </motion.div>
            )}
        </>
    );
}
