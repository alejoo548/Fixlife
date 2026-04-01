const fs = require('fs');
const file = 'src/components/modals/ServiceRequestWizard.tsx';
let code = fs.readFileSync(file, 'utf8');

const s1Start = code.indexOf('{step === 1 && (');
const s2Start = code.indexOf('{step === 2 && (');

if (s1Start === -1 || s2Start === -1) {
    console.log("Marks not found");
    process.exit(1);
}

const prefix = code.substring(0, s1Start);
const suffix = code.substring(s2Start);

const replace1 = `{step === 1 && (
                            <motion.div
                                key="step1"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="p-6 pb-32 flex flex-col h-full"
                            >
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    onClick={() => setStep(0)}
                                    className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 mb-4 hover:bg-gray-200"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                </motion.button>
                                
                                <h1 className="text-3xl font-black text-slate-900 mb-1 tracking-tight">Where to?</h1>
                                <p className="text-slate-500 font-medium mb-6">Enter service address</p>
                                
                                <div className="space-y-4">
                                    <div className="relative">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-bird-blue" />
                                        <div className="absolute left-4.5 top-1/2 translate-y-2 w-0.5 h-6 bg-gray-200" />
                                        <input
                                            type="text"
                                            value={data.location}
                                            onChange={(e) => handleLocationInput(e.target.value)}
                                            onFocus={() => setShowLocationSuggestions(true)}
                                            placeholder="Search address or move map"
                                            className="w-full pl-10 pr-12 py-4 bg-gray-50 border-none rounded-2xl text-[15px] font-bold text-gray-900 focus:ring-2 focus:ring-bird-blue/50 transition-shadow shadow-sm"
                                        />
                                        <button
                                            onClick={detectLocation}
                                            disabled={geoLoading}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-bird-blue hover:bg-bird-blue/10 rounded-full transition-colors"
                                        >
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                        </button>
                                        
                                        <AnimatePresence>
                                            {showLocationSuggestions && locationSuggestions.length > 0 && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: 5 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: 5 }}
                                                    className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50"
                                                >
                                                    {locationSuggestions.map((place, i) => (
                                                        <button
                                                            key={i}
                                                            onClick={() => selectSuggestion(place)}
                                                            className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 flex items-center gap-3"
                                                        >
                                                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
                                                            </div>
                                                            <div className="flex-1 truncate">
                                                                <div className="font-bold text-gray-900 text-sm truncate">{place.label.split(',')[0]}</div>
                                                                <div className="text-xs text-gray-500 truncate">{place.label.split(',').slice(1).join(',')}</div>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                    
                                    {/* Saved Places Quick Access */}
                                    <div className="pt-4 border-t border-gray-100">
                                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Saved Places</h3>
                                        <div className="space-y-1">
                                            {savedHome && (
                                                <button onClick={() => applySavedLocation(savedHome)} className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl transition-colors">
                                                    <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg></div>
                                                    <div className="text-left"><p className="font-bold text-gray-900 text-[15px]">Home</p><p className="text-[11px] text-gray-500 truncate w-48">{savedHome.label}</p></div>
                                                </button>
                                            )}
                                            {savedWork && (
                                                <button onClick={() => applySavedLocation(savedWork)} className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl transition-colors">
                                                    <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-500 flex items-center justify-center"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg></div>
                                                    <div className="text-left"><p className="font-bold text-gray-900 text-[15px]">Work</p><p className="text-[11px] text-gray-500 truncate w-48">{savedWork.label}</p></div>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-auto pt-6">
                                    <button
                                        onClick={() => setStep(2)}
                                        disabled={!currentCoords || !data.location}
                                        className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl text-[15px] hover:bg-black transition-colors disabled:opacity-50 disabled:bg-gray-300"
                                    >
                                        Confirm Location
                                    </button>
                                </div>
                            </motion.div>
                        )}
                        `;

fs.writeFileSync(file, prefix + replace1 + suffix);
console.log('Replaced Step 1');
