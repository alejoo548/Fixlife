import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ServiceRequestData } from '../types';

interface ServiceRequestWizardProps {
    isOpen: boolean;
    onClose: () => void;
}

const CATEGORIES = [
    { id: 'plumbing', name: 'Plumbing', price: '$40+', time: '5m', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z', color: 'blue' },
    { id: 'electricity', name: 'Electrical', price: '$55+', time: '12m', icon: 'M13 10V3L4 14h7v7l9-11h-7z', color: 'yellow' },
    { id: 'hvac', name: 'HVAC', price: '$80+', time: '20m', icon: 'M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5', color: 'orange' },
    { id: 'cleaning', name: 'Cleaning', price: '$35+', time: 'Now', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z', color: 'green' },
];

const RECENT_LOCATIONS = [
    { id: 1, name: "Home", address: "123 Main Street, Apt 4B", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
    { id: 2, name: "Office", address: "Tech Hub, 5th Floor", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" },
];

export const ServiceRequestWizard: React.FC<ServiceRequestWizardProps> = ({ isOpen, onClose }) => {
    const [step, setStep] = useState(0);
    const [data, setData] = useState<ServiceRequestData>({
        category: '',
        description: '',
        location: '',
        price: '',
        images: []
    });
    const [isSearching, setIsSearching] = useState(false);

    if (!isOpen) return null;

    const getColorClass = (color: string) => {
        const colors: Record<string, string> = {
            blue: 'group-hover:bg-bird-blue',
            yellow: 'group-hover:bg-bird-yellow',
            orange: 'group-hover:bg-bird-orange',
            green: 'group-hover:bg-green-500'
        };
        return colors[color] || colors.blue;
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-gradient-to-br from-sky-50 via-amber-50 to-orange-50 flex flex-col md:flex-row font-sans"
        >
            {/* Sidebar */}
            <motion.div
                initial={{ x: -100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ type: "spring", damping: 20 }}
                className="w-full md:w-[450px] lg:w-[500px] h-full flex flex-col bg-white border-r border-gray-200 relative z-20 shadow-2xl overflow-hidden"
            >
                {/* Header */}
                <div className="h-16 md:h-20 flex items-center justify-between px-4 md:px-6 border-b border-gray-200 bg-white shrink-0">
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
                        <div className="text-right hidden sm:block">
                            <div className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Balance</div>
                            <div className="text-sm font-bold text-bird-orange">$120.50</div>
                        </div>
                        <motion.div
                            whileHover={{ scale: 1.1, rotate: 5 }}
                            className="w-10 h-10 rounded-full bg-gradient-to-br from-bird-blue to-bird-darkBlue border-2 border-white shadow-lg cursor-pointer"
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                    <AnimatePresence mode="wait">
                        {step === 0 && (
                            <motion.div
                                key="step0"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3 }}
                                className="p-6 pb-24"
                            >
                                <motion.h1
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-3xl font-bold text-gray-900 mb-2"
                                >
                                    What do you need?
                                </motion.h1>
                                <motion.p
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.1 }}
                                    className="text-gray-600 mb-8 text-base"
                                >
                                    Choose a service and we'll find the perfect pro
                                </motion.p>

                                {/* Service Categories */}
                                <div className="grid grid-cols-2 gap-4 mb-8">
                                    {CATEGORIES.map((cat, i) => (
                                        <motion.button
                                            key={cat.id}
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: i * 0.1 }}
                                            whileHover={{ scale: 1.05, y: -5 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => {
                                                setData({ ...data, category: cat.id });
                                                setStep(1);
                                            }}
                                            className="group relative bg-gradient-to-br from-gray-50 to-white border-2 border-gray-200 rounded-2xl p-6 hover:border-bird-blue transition-all shadow-sm hover:shadow-xl"
                                        >
                                            <div className={`w-14 h-14 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-600 ${getColorClass(cat.color)} group-hover:text-white transition-all mb-4 shadow-sm`}>
                                                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={cat.icon} />
                                                </svg>
                                            </div>
                                            <h3 className="font-bold text-gray-900 text-lg mb-1">{cat.name}</h3>
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-bird-blue font-bold">{cat.price}</span>
                                                <span className="text-gray-500 text-xs">{cat.time} away</span>
                                            </div>
                                        </motion.button>
                                    ))}
                                </div>

                                {/* Recent Locations */}
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.5 }}
                                >
                                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Quick Access</h3>
                                    <div className="space-y-3">
                                        {RECENT_LOCATIONS.map((loc, i) => (
                                            <motion.button
                                                key={loc.id}
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: 0.6 + i * 0.1 }}
                                                whileHover={{ x: 5 }}
                                                className="w-full flex items-center gap-4 p-4 rounded-xl bg-gray-50 border border-gray-200 hover:border-bird-blue hover:bg-bird-blue/5 transition-all text-left group"
                                            >
                                                <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-600 group-hover:bg-bird-blue group-hover:text-white transition-all shrink-0">
                                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={loc.icon} />
                                                    </svg>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-bold text-gray-900">{loc.name}</div>
                                                    <div className="text-xs text-gray-500 truncate">{loc.address}</div>
                                                </div>
                                                <svg className="w-5 h-5 text-gray-400 group-hover:text-bird-blue transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </motion.button>
                                        ))}
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}

                        {step === 1 && (
                            <motion.div
                                key="step1"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3 }}
                                className="p-6 pb-24 h-full flex flex-col"
                            >
                                <motion.button
                                    whileHover={{ x: -5 }}
                                    onClick={() => setStep(0)}
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
                                    className="text-3xl font-bold text-gray-900 mb-6"
                                >
                                    Tell us more
                                </motion.h2>

                                <div className="flex-1 space-y-6">
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.1 }}
                                    >
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Where?</label>
                                        <input
                                            type="text"
                                            placeholder="Enter your address"
                                            className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:border-bird-blue transition-all placeholder-gray-400"
                                            value={data.location}
                                            onChange={(e) => setData({ ...data, location: e.target.value })}
                                        />
                                    </motion.div>

                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.2 }}
                                    >
                                        <label className="block text-sm font-bold text-gray-700 mb-2">What's the problem?</label>
                                        <textarea
                                            className="w-full h-32 bg-gray-50 border-2 border-gray-200 rounded-xl p-4 text-gray-900 focus:outline-none focus:border-bird-blue transition-all resize-none placeholder-gray-400"
                                            placeholder="Describe what needs fixing..."
                                            value={data.description}
                                            onChange={(e) => setData({ ...data, description: e.target.value })}
                                        />
                                    </motion.div>

                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.3 }}
                                    >
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Your budget</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-900 font-bold text-lg">$</span>
                                            <input
                                                type="number"
                                                placeholder="0"
                                                className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl py-3 pl-10 pr-16 text-gray-900 font-bold text-lg focus:outline-none focus:border-bird-blue transition-all placeholder-gray-400"
                                                value={data.price}
                                                onChange={(e) => setData({ ...data, price: e.target.value })}
                                            />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-medium">USD</span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-2">Suggested: $40 - $80</p>
                                    </motion.div>
                                </div>

                                <motion.button
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.4 }}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => setIsSearching(true)}
                                    disabled={!data.price || !data.location}
                                    className="w-full mt-6 py-4 rounded-xl bg-gradient-to-r from-bird-blue to-bird-lightBlue text-white font-bold text-lg shadow-xl shadow-bird-blue/30 hover:shadow-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
                                >
                                    <span>Find a Pro</span>
                                    <motion.svg
                                        animate={{ x: [0, 5, 0] }}
                                        transition={{ duration: 1.5, repeat: Infinity }}
                                        className="w-5 h-5"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                    </motion.svg>
                                </motion.button>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Searching Overlay */}
                    <AnimatePresence>
                        {isSearching && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 z-30 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center"
                            >
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                    className="w-20 h-20 border-4 border-bird-blue/20 border-t-bird-blue rounded-full mb-6"
                                />
                                <motion.h2
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-2xl font-bold text-gray-900 mb-2"
                                >
                                    Finding the best pro...
                                </motion.h2>
                                <motion.p
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.1 }}
                                    className="text-gray-600 mb-8"
                                >
                                    This will only take a moment
                                </motion.p>
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => setIsSearching(false)}
                                    className="px-6 py-2 rounded-full border-2 border-gray-200 text-gray-600 font-bold hover:border-gray-300 hover:bg-gray-50 transition-all"
                                >
                                    Cancel
                                </motion.button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>

            {/* Map View */}
            <div className="hidden md:block flex-1 relative bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="absolute inset-0"
                    style={{
                        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.05) 1px, transparent 0)',
                        backgroundSize: '40px 40px'
                    }}
                />
                
                {/* Your location marker */}
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.5, type: "spring" }}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                >
                    <div className="relative">
                        <motion.div
                            animate={{ scale: [1, 1.2, 1] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="w-4 h-4 bg-bird-blue rounded-full shadow-lg"
                        />
                        <motion.div
                            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="absolute inset-0 bg-bird-blue rounded-full"
                        />
                    </div>
                </motion.div>

                {/* Nearby pros */}
                {!isSearching && [
                    { top: '35%', left: '60%', name: 'Mike', delay: 0.7 },
                    { top: '60%', left: '40%', name: 'Sarah', delay: 0.9 }
                ].map((pro, i) => (
                    <motion.div
                        key={i}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: pro.delay, type: "spring" }}
                        className="absolute"
                        style={{ top: pro.top, left: pro.left }}
                    >
                        <motion.div
                            whileHover={{ scale: 1.2 }}
                            className="w-3 h-3 bg-green-500 rounded-full shadow-lg cursor-pointer"
                        />
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
};
