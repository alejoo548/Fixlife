
import React from 'react';

export const EarningsView: React.FC = () => {
    return (
        <div className="w-full h-full overflow-y-auto custom-scrollbar p-3 md:p-6 lg:p-8 pb-20 md:pb-8 flex flex-col gap-4 md:gap-6 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                <div className="bg-white rounded-xl md:rounded-2xl p-4 md:p-6 border border-gray-200 relative overflow-hidden group shadow-sm">
                    <div className="absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 bg-bird-blue/5 rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
                    <h3 className="text-gray-600 text-xs md:text-sm font-medium mb-1">Total Earnings</h3>
                    <div className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 mb-1.5 md:mb-2">$1,240.50</div>
                    <div className="flex items-center text-green-600 text-[10px] md:text-xs font-bold bg-green-50 w-max px-2 py-1 rounded-lg border border-green-200">
                        <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                        +12.5% this week
                    </div>
                </div>
                <div className="bg-white rounded-xl md:rounded-2xl p-4 md:p-6 border border-gray-200 relative overflow-hidden group shadow-sm">
                    <div className="absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 bg-bird-orange/5 rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
                    <h3 className="text-gray-600 text-xs md:text-sm font-medium mb-1">Pending Payout</h3>
                    <div className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 mb-1.5 md:mb-2">$320.00</div>
                    <div className="text-gray-500 text-[10px] md:text-xs">Processing via PayPal</div>
                </div>
                <div className="bg-white rounded-xl md:rounded-2xl p-4 md:p-6 border border-gray-200 relative overflow-hidden group shadow-sm">
                    <div className="absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 bg-bird-yellow/5 rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
                    <h3 className="text-gray-600 text-xs md:text-sm font-medium mb-1">Tips Earned</h3>
                    <div className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 mb-1.5 md:mb-2">$85.00</div>
                    <div className="text-bird-orange text-[10px] md:text-xs font-bold">Great service! 🌟</div>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 md:gap-6 flex-1 min-h-[300px] md:min-h-[400px]">
                <div className="flex-1 bg-white rounded-xl md:rounded-2xl border border-gray-200 p-4 md:p-6 flex flex-col shadow-sm">
                    <h3 className="text-gray-900 font-bold text-base md:text-lg mb-4 md:mb-6 flex items-center gap-2">
                        <svg className="w-4 h-4 md:w-5 md:h-5 text-bird-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                        Weekly Overview
                    </h3>
                    <div className="flex-1 flex items-end justify-between gap-1.5 md:gap-2 pt-6 md:pt-8 border-b border-gray-200 pb-2">
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => {
                            const height = [40, 60, 35, 80, 55, 90, 20][i];
                            return (
                                <div key={day} className="flex-1 flex flex-col items-center gap-1.5 md:gap-2 group cursor-pointer h-full justify-end">
                                    <div className="w-full relative flex items-end justify-center rounded-t-lg bg-gray-100 overflow-hidden transition-all duration-300 hover:bg-gray-200 h-full">
                                        <div
                                            className={`w-full absolute bottom-0 transition-all duration-500 group-hover:bg-bird-blue ${i === 5 ? 'bg-bird-blue' : 'bg-bird-blue/50'}`}
                                            style={{ height: `${height}%` }}
                                        ></div>
                                    </div>
                                    <span className="text-[9px] md:text-[10px] text-gray-500 font-bold uppercase">{day}</span>
                                </div>
                            )
                        })}
                    </div>
                </div>

                <div className="w-full md:w-[350px] lg:w-[400px] bg-white rounded-xl md:rounded-2xl border border-gray-200 p-4 md:p-6 flex flex-col shadow-sm">
                    <h3 className="text-gray-900 font-bold text-base md:text-lg mb-3 md:mb-4">Recent Payouts</h3>
                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 md:space-y-4 pr-1 md:pr-2">
                        {[1, 2, 3, 4, 5].map((item) => (
                            <div key={item} className="flex items-center justify-between p-2.5 md:p-3 rounded-lg md:rounded-xl bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors cursor-pointer">
                                <div className="flex items-center gap-2 md:gap-3 min-w-0">
                                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-bird-blue/10 flex items-center justify-center text-bird-blue shrink-0">
                                        <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-xs md:text-sm font-bold text-gray-900 truncate">Plumbing Job</div>
                                        <div className="text-[10px] md:text-xs text-gray-500 truncate">Today, 2:30 PM</div>
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="text-xs md:text-sm font-bold text-green-600">+$85.00</div>
                                    <div className="text-[9px] md:text-[10px] text-gray-500 uppercase tracking-wider">Completed</div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button className="mt-3 md:mt-4 w-full py-2.5 md:py-3 rounded-lg md:rounded-xl bg-gray-100 text-xs md:text-sm font-bold text-gray-600 hover:text-gray-900 hover:bg-gray-200 transition-colors border border-gray-200">View All History</button>
                </div>
            </div>
        </div>
    );
};
