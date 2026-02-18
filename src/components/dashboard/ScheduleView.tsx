
import React from 'react';

export const ScheduleView: React.FC = () => {
    return (
        <div className="w-full h-full overflow-y-auto custom-scrollbar p-3 md:p-6 lg:p-8 pb-20 md:pb-8 flex flex-col gap-4 md:gap-6 animate-fade-in">

            <div className="bg-white rounded-2xl md:rounded-3xl border border-gray-200 p-4 md:p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4 md:mb-6">
                    <h2 className="text-xl md:text-2xl font-bold text-gray-900">February 2026</h2>
                    <div className="flex gap-1.5 md:gap-2">
                        <button className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors">
                            <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <button className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors">
                            <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-7 gap-1.5 md:gap-2 lg:gap-4">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => {
                        const date = 23 + i;
                        const isToday = i === 1;
                        return (
                            <button key={day} className={`flex flex-col items-center gap-1 md:gap-2 p-2 md:p-3 rounded-xl md:rounded-2xl transition-all border ${isToday ? 'bg-bird-blue border-bird-blue shadow-lg shadow-bird-blue/20 transform scale-105' : 'bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-gray-300'}`}>
                                <span className={`text-[9px] md:text-xs font-bold uppercase ${isToday ? 'text-white' : 'text-gray-500'}`}>{day}</span>
                                <span className={`text-base md:text-xl font-bold ${isToday ? 'text-white' : 'text-gray-700'}`}>{date}</span>
                                {i === 1 || i === 3 ? (
                                    <div className={`w-1 h-1 md:w-1.5 md:h-1.5 rounded-full ${isToday ? 'bg-white' : 'bg-bird-orange'}`}></div>
                                ) : <div className="w-1 h-1 md:w-1.5 md:h-1.5 opacity-0"></div>}
                            </button>
                        )
                    })}
                </div>
            </div>

            <div className="flex-1 bg-white rounded-2xl md:rounded-3xl border border-gray-200 p-4 md:p-6 lg:p-8 shadow-sm">
                <h3 className="text-gray-600 font-bold text-xs md:text-sm uppercase tracking-wider mb-4 md:mb-6">Today's Schedule</h3>
                <div className="relative border-l-2 border-gray-200 ml-2 md:ml-3 lg:ml-6 space-y-6 md:space-y-8 pb-10">

                    <div className="relative pl-6 md:pl-8 lg:pl-12 group">
                        <div className="absolute -left-[9px] top-0 w-3.5 h-3.5 md:w-4 md:h-4 rounded-full bg-white border-2 border-bird-blue shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>

                        <div className="flex flex-col gap-3 md:gap-4 md:flex-row md:items-center bg-gray-50 p-3 md:p-4 rounded-xl md:rounded-2xl border border-gray-200 hover:border-bird-blue/50 transition-colors group-hover:bg-gray-100">
                            <div className="w-14 h-14 md:w-16 md:h-16 rounded-lg md:rounded-xl bg-bird-blue/10 flex flex-col items-center justify-center text-bird-blue border border-bird-blue/20 shrink-0">
                                <span className="text-lg md:text-xl font-bold">09</span>
                                <span className="text-[9px] md:text-[10px] font-bold uppercase">AM</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-base md:text-lg font-bold text-gray-900 mb-1 group-hover:text-bird-blue transition-colors truncate">Residential Cleaning</h4>
                                <p className="text-gray-600 text-xs md:text-sm flex items-center gap-2 truncate">
                                    <svg className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
                                    <span className="truncate">123 Maple Avenue, Downtown</span>
                                </p>
                            </div>
                            <div className="flex items-center gap-2 md:gap-3">
                                <span className="px-2.5 md:px-3 py-1 rounded-lg bg-green-50 text-green-600 text-[10px] md:text-xs font-bold border border-green-200">Confirmed</span>
                                <button className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-700 hover:bg-bird-blue hover:text-white transition-all shrink-0">
                                    <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="relative pl-6 md:pl-8 lg:pl-12 group">
                        <div className="absolute -left-[9px] top-0 w-3.5 h-3.5 md:w-4 md:h-4 rounded-full bg-white border-2 border-bird-orange shadow-[0_0_10px_rgba(249,115,22,0.5)]"></div>

                        <div className="flex flex-col gap-3 md:gap-4 md:flex-row md:items-center bg-gray-50 p-3 md:p-4 rounded-xl md:rounded-2xl border border-gray-200 hover:border-bird-orange/50 transition-colors group-hover:bg-gray-100">
                            <div className="w-14 h-14 md:w-16 md:h-16 rounded-lg md:rounded-xl bg-bird-orange/10 flex flex-col items-center justify-center text-bird-orange border border-bird-orange/20 shrink-0">
                                <span className="text-lg md:text-xl font-bold">02</span>
                                <span className="text-[9px] md:text-[10px] font-bold uppercase">PM</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-base md:text-lg font-bold text-gray-900 mb-1 group-hover:text-bird-orange transition-colors truncate">Plumbing Repair</h4>
                                <p className="text-gray-600 text-xs md:text-sm flex items-center gap-2 truncate">
                                    <svg className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
                                    <span className="truncate">450 Highland Drive, Westside</span>
                                </p>
                            </div>
                            <div className="flex items-center gap-2 md:gap-3">
                                <span className="px-2.5 md:px-3 py-1 rounded-lg bg-bird-orange/10 text-bird-orange text-[10px] md:text-xs font-bold border border-bird-orange/20">Pending</span>
                                <button className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-700 hover:bg-bird-orange hover:text-white transition-all shrink-0">
                                    <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.013 8.013 0 01-4.949-1.728c-.297-.184-.526-.239-.848-.152l-2.07.564a1 1 0 01-1.218-1.22l.564-2.068c.088-.322.032-.551-.152-.848A7.996 7.996 0 013 12c0-4.418 3.582-8 8-8s8 3.582 8 8z" /></svg>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="relative pl-6 md:pl-8 lg:pl-12 opacity-50 hover:opacity-100 transition-opacity">
                        <div className="absolute -left-[6px] md:-left-[7px] top-2 w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-gray-300"></div>
                        <div className="h-14 md:h-16 rounded-lg md:rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-500 font-medium text-xs md:text-sm px-2">
                            Available from 4:00 PM - 7:00 PM
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};
