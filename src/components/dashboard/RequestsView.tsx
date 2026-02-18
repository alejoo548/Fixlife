
import React from 'react';

const INCOMING_JOBS = [
    {
        id: 1,
        type: 'Plumbing',
        title: 'Leaking Pipe Under Sink',
        distance: '2.5 km',
        price: '$65.00',
        address: 'Av. Reforma 220, Apt 4B',
        urgent: true,
        time: '15 min'
    },
    {
        id: 2,
        type: 'Installation',
        title: 'Install Bathroom Faucet',
        distance: '4.1 km',
        price: '$45.00',
        address: 'Calle 10, Zona Rosa',
        urgent: false,
        time: '45 min'
    }
];

interface RequestsViewProps {
    isOnline: boolean;
    mobileView: 'list' | 'map';
}

export const RequestsView: React.FC<RequestsViewProps> = ({ isOnline, mobileView }) => {
    return (
        <>
            <div className={`w-full md:w-[380px] lg:w-[420px] flex flex-col border-r border-gray-200 bg-white relative z-10 h-full ${mobileView === 'map' ? 'hidden md:flex' : 'flex'}`}>

                <div className="grid grid-cols-2 gap-2.5 md:gap-3 p-4 md:p-6 border-b border-gray-200">
                    <div className="bg-gray-50 rounded-xl md:rounded-2xl p-3 md:p-4 border border-gray-200 hover:border-bird-yellow/30 transition-colors shadow-sm">
                        <div className="flex items-center gap-1.5 md:gap-2 mb-1.5 md:mb-2">
                            <div className="p-1 md:p-1.5 rounded-lg bg-bird-yellow/20 text-bird-yellow">
                                <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <span className="text-[10px] md:text-xs text-gray-600">Daily</span>
                        </div>
                        <div className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">$145.00</div>
                    </div>
                    <div className="bg-gray-50 rounded-xl md:rounded-2xl p-3 md:p-4 border border-gray-200 hover:border-bird-blue/30 transition-colors shadow-sm">
                        <div className="flex items-center gap-1.5 md:gap-2 mb-1.5 md:mb-2">
                            <div className="p-1 md:p-1.5 rounded-lg bg-bird-blue/20 text-bird-blue">
                                <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                            </div>
                            <span className="text-[10px] md:text-xs text-gray-600">Jobs</span>
                        </div>
                        <div className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">3 <span className="text-xs md:text-sm font-normal text-gray-500">/ 5 goal</span></div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 md:p-4 space-y-3 md:space-y-4 pb-20 md:pb-4">
                    {isOnline ? (
                        INCOMING_JOBS.map(job => (
                            <div key={job.id} className="bg-white rounded-xl md:rounded-2xl p-4 md:p-5 border border-gray-200 hover:border-bird-orange/50 transition-all shadow-sm group relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-16 h-16 md:w-20 md:h-20 bg-bird-orange/5 rounded-bl-full -mr-8 md:-mr-10 -mt-8 md:-mt-10 transition-transform group-hover:scale-150 group-hover:bg-bird-orange/10"></div>

                                <div className="relative z-10">
                                    <div className="flex justify-between items-start mb-3 md:mb-4">
                                        <div className="flex items-center gap-2 md:gap-3 min-w-0">
                                            <div className="w-9 h-9 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-gray-100 flex items-center justify-center border border-gray-200 shrink-0">
                                                <svg className="w-4 h-4 md:w-5 md:h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="font-bold text-gray-900 text-base md:text-lg truncate">{job.type}</h3>
                                                <span className="text-[10px] md:text-xs text-gray-600 font-medium bg-gray-100 px-2 py-0.5 rounded">{job.distance} away</span>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className="text-[9px] md:text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-0.5">Client Offer</div>
                                            <div className="font-bold text-bird-orange text-xl md:text-2xl">{job.price}</div>
                                            {job.urgent && <span className="text-red-600 text-[9px] md:text-[10px] font-bold tracking-wider uppercase flex items-center justify-end gap-1 mt-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span> Urgent
                                            </span>}
                                        </div>
                                    </div>

                                    <p className="text-gray-700 text-xs md:text-sm mb-3 md:mb-4 font-medium leading-relaxed">{job.title}</p>
                                    <p className="text-gray-500 text-[10px] md:text-xs flex items-center gap-2 mb-4 md:mb-6 border-t border-gray-200 pt-2.5 md:pt-3 truncate">
                                        <svg className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                        <span className="truncate">{job.address}</span>
                                    </p>

                                    <div className="grid grid-cols-3 gap-1.5 md:gap-2">
                                        <button className="py-2 md:py-3 rounded-lg md:rounded-xl bg-gray-100 text-gray-600 font-bold text-[10px] md:text-xs hover:bg-gray-200 hover:text-gray-900 transition-colors border border-transparent hover:border-gray-300">Decline</button>
                                        <button className="py-2 md:py-3 rounded-lg md:rounded-xl bg-bird-blue/10 text-bird-blue font-bold text-[10px] md:text-xs hover:bg-bird-blue/20 transition-colors border border-bird-blue/20">Counter Offer</button>
                                        <button className="py-2 md:py-3 rounded-lg md:rounded-xl bg-bird-blue text-white font-bold text-[10px] md:text-xs shadow-lg shadow-bird-blue/20 hover:bg-bird-darkBlue transition-colors active:scale-95">Accept</button>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center p-6 md:p-8 opacity-60">
                            <img src="/tranquilo.png" alt="Relaxed" className="w-24 h-24 md:w-32 md:h-32 object-contain mb-4 md:mb-6 animate-pulse opacity-80" />
                            <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-2">Everything is quiet for now</h3>
                            <p className="text-xs md:text-sm text-gray-600 max-w-xs mx-auto">Toggle your status to <span className="text-green-600 font-bold">Online</span> in the top bar to start receiving nearby job requests.</p>
                        </div>
                    )}
                </div>
            </div>

            <div className={`flex-1 relative bg-[#1e2025] overflow-hidden ${mobileView === 'map' ? 'block' : 'hidden md:block'}`}>
                <div
                    className="absolute inset-0 bg-cover bg-center opacity-40 transition-opacity duration-1000"
                    style={{
                        backgroundImage: 'url("https://images.unsplash.com/photo-1524661135-423995f22d0b?ixlib=rb-4.0.3&auto=format&fit=crop&w=2074&q=80")'
                    }}
                >

                    <div className="absolute inset-0 bg-gradient-to-t from-[#0a0f1c] via-transparent to-[#0a0f1c]/50"></div>

                    {isOnline && (
                        <div className="absolute inset-0 overflow-hidden pointer-events-none">
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-bird-blue/5 rounded-full animate-ping duration-[3s]"></div>
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] border border-bird-blue/10 rounded-full"></div>
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] border border-bird-blue/20 rounded-full"></div>
                        </div>
                    )}
                </div>

                <div className="absolute inset-0 bg-gradient-to-t from-bird-navy via-transparent to-transparent pointer-events-none" />

                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                    <div className="relative">
                        <div className="w-8 h-8 bg-bird-yellow rounded-full shadow-[0_0_30px_rgba(255,193,7,0.6)] border-[4px] border-bird-navy z-20 relative flex items-center justify-center">
                            <div className="w-2 h-2 bg-black rounded-full"></div>
                        </div>
                        <div className="absolute -inset-8 bg-bird-yellow/10 rounded-full animate-pulse z-0"></div>
                    </div>
                </div>

                {isOnline && INCOMING_JOBS.map((job, i) => (
                    <div
                        key={job.id}
                        className="absolute animate-pop-in cursor-pointer group"
                        style={{
                            top: i === 0 ? '40%' : '60%',
                            left: i === 0 ? '60%' : '35%',
                            animationDelay: `${i * 200}ms`
                        }}
                    >
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-max opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0">
                            <div className="bg-bird-surface border border-white/10 text-white p-3 rounded-xl shadow-2xl flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-bird-blue/20 flex items-center justify-center text-bird-blue font-bold text-xs">
                                    ${job.price.replace('$', '')}
                                </div>
                                <div>
                                    <div className="text-[10px] font-bold text-gray-400 uppercase">{job.type}</div>
                                    <div className="text-xs font-bold whitespace-nowrap">{job.time} drive</div>
                                </div>
                            </div>
                            <div className="w-3 h-3 bg-bird-surface border-r border-b border-white/10 transform rotate-45 absolute left-1/2 -translate-x-1/2 -bottom-1.5"></div>
                        </div>

                        <div className="w-4 h-4 bg-white rounded-full mx-auto shadow-[0_0_15px_rgba(255,255,255,0.8)] border-2 border-bird-navy relative z-10 transition-transform group-hover:scale-125"></div>
                        <div className="w-0.5 h-8 bg-gradient-to-b from-white/50 to-transparent mx-auto"></div>
                    </div>
                ))}

            </div>
        </>
    );
};
