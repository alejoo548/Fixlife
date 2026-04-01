const fs = require('fs');
const file = 'src/components/modals/ServiceRequestWizard.tsx';
let code = fs.readFileSync(file, 'utf8');

const startIndex = code.indexOf('{/* Content */}');
const step1Index = code.indexOf('{step === 1 && (');

if (startIndex === -1 || step1Index === -1) {
    console.log("Could not find markers.");
    process.exit(1);
}

const prefix = code.substring(0, startIndex);
const suffix = code.substring(step1Index);

const replace0 = `{/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar relative bg-gray-50/30">
                    <AnimatePresence mode="wait">
                        {step === 0 && (
                            <motion.div
                                key="step0"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="p-6 pb-24"
                            >
                                <h1 className="text-3xl font-black text-slate-900 mb-1 tracking-tight">What do you need?</h1>
                                <p className="text-slate-500 font-medium mb-6">Choose a service to continue</p>
                                
                                {servicesLoading ? (
                                    <div className="flex justify-center py-8">
                                        <div className="h-6 w-6 rounded-full border-2 border-bird-blue/20 border-t-bird-blue animate-spin" />
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {services.map((cat) => (
                                            <motion.button
                                                key={cat.id_service}
                                                whileHover={{ scale: 1.01 }}
                                                whileTap={{ scale: 0.98 }}
                                                onClick={() => {
                                                    setData({ ...data, category: cat.name });
                                                    setStep(1);
                                                }}
                                                className="w-full flex items-center p-4 bg-white hover:bg-gray-50 rounded-2xl border border-gray-100 shadow-sm transition-all gap-4 text-left"
                                            >
                                                <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center shrink-0 border border-gray-100">
                                                    {cat.icon ? <img src={cat.icon} alt={cat.name} className="w-6 h-6 object-contain" /> : <div className="w-6 h-6 bg-gray-200 rounded-full" />}
                                                </div>
                                                <div className="flex flex-col flex-1">
                                                    <span className="font-bold text-gray-900 text-[15px]">{cat.name}</span>
                                                    {cat.description && <span className="text-xs font-medium text-slate-500 line-clamp-1">{cat.description}</span>}
                                                </div>
                                                <div className="text-gray-300">
                                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                                </div>
                                            </motion.button>
                                        ))}
                                    </div>
                                )}
                            </motion.div>
                        )}
                        `;

fs.writeFileSync(file, prefix + replace0 + suffix);
console.log("Replaced step 0 successfully.");
