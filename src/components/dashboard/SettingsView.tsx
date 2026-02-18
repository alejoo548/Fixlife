
import React, { useState } from 'react';

export const SettingsView: React.FC = () => {
    const [isOnline, setIsOnline] = useState(false);

    return (
        <div className="w-full h-full overflow-y-auto custom-scrollbar p-3 md:p-6 lg:p-8 pb-20 md:pb-8 flex flex-col gap-4 md:gap-6 animate-fade-in">

            <div className="bg-white rounded-2xl md:rounded-3xl border border-gray-200 p-6 md:p-8 relative overflow-hidden shadow-sm">
                <div className="absolute top-0 left-0 w-full h-24 md:h-32 bg-gradient-to-r from-bird-blue/10 to-bird-yellow/10"></div>
                <div className="relative flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-6">
                    <div className="w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-white bg-gray-100 relative shadow-xl">
                        <img src="https://images.unsplash.com/photo-1599566150163-29194dcaad36?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80" alt="Profile" className="w-full h-full object-cover rounded-full" />
                        <button className="absolute bottom-1 right-1 md:bottom-2 md:right-2 w-7 h-7 md:w-8 md:h-8 rounded-full bg-bird-blue text-white flex items-center justify-center hover:bg-bird-darkBlue transition-colors shadow-lg">
                            <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        </button>
                    </div>
                    <div className="flex-1 text-center md:text-left mb-2">
                        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">Alex Johnson</h2>
                        <div className="flex items-center justify-center md:justify-start gap-2 text-gray-600 text-sm">
                            <svg className="w-4 h-4 text-bird-blue" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                            <span className="font-medium">Verified Professional</span>
                            <span className="hidden sm:inline w-1 h-1 rounded-full bg-gray-400"></span>
                            <span className="hidden sm:inline">Plumbing & Repairs</span>
                        </div>
                    </div>
                    <button className="px-4 md:px-6 py-2 rounded-lg md:rounded-xl bg-gray-100 border border-gray-200 text-gray-900 text-sm font-bold hover:bg-gray-200 transition-colors">
                        Edit Public Profile
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div className="bg-white rounded-2xl md:rounded-3xl border border-gray-200 p-6 md:p-8 shadow-sm">
                    <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-4 md:mb-6 flex items-center gap-2">
                        <svg className="w-4 h-4 md:w-5 md:h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        Personal Information
                    </h3>
                    <div className="space-y-3 md:space-y-4">
                        <div className="grid grid-cols-2 gap-3 md:gap-4">
                            <div>
                                <label className="block text-[10px] md:text-xs font-bold text-gray-500 uppercase mb-1 ml-1">First Name</label>
                                <input type="text" defaultValue="Alex" className="w-full bg-gray-50 border border-gray-200 rounded-lg md:rounded-xl px-3 md:px-4 py-2.5 md:py-3 text-gray-900 text-sm focus:outline-none focus:border-bird-blue transition-colors" />
                            </div>
                            <div>
                                <label className="block text-[10px] md:text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Last Name</label>
                                <input type="text" defaultValue="Johnson" className="w-full bg-gray-50 border border-gray-200 rounded-lg md:rounded-xl px-3 md:px-4 py-2.5 md:py-3 text-gray-900 text-sm focus:outline-none focus:border-bird-blue transition-colors" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-[10px] md:text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Email Address</label>
                            <input type="email" defaultValue="alex.johnson@example.com" className="w-full bg-gray-50 border border-gray-200 rounded-lg md:rounded-xl px-3 md:px-4 py-2.5 md:py-3 text-gray-900 text-sm focus:outline-none focus:border-bird-blue transition-colors" />
                        </div>
                        <div>
                            <label className="block text-[10px] md:text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Phone Number</label>
                            <input type="tel" defaultValue="+1 (555) 012-3456" className="w-full bg-gray-50 border border-gray-200 rounded-lg md:rounded-xl px-3 md:px-4 py-2.5 md:py-3 text-gray-900 text-sm focus:outline-none focus:border-bird-blue transition-colors" />
                        </div>
                    </div>
                    <div className="mt-4 md:mt-6 flex justify-end">
                        <button className="px-4 md:px-6 py-2 rounded-lg md:rounded-xl bg-bird-blue text-white font-bold text-sm shadow-lg shadow-bird-blue/20 hover:bg-bird-darkBlue transition-colors">
                            Save Changes
                        </button>
                    </div>
                </div>

                <div className="flex flex-col gap-4 md:gap-6">
                    <div className="bg-white rounded-2xl md:rounded-3xl border border-gray-200 p-6 md:p-8 flex items-center justify-between shadow-sm">
                        <div>
                            <h3 className="text-base md:text-lg font-bold text-gray-900 mb-1">Available for Jobs</h3>
                            <p className="text-gray-600 text-xs md:text-sm">Turn off to stop receiving new requests</p>
                        </div>
                        <div
                            onClick={() => setIsOnline(!isOnline)}
                            className={`w-12 h-7 md:w-14 md:h-8 rounded-full p-1 transition-colors duration-300 cursor-pointer ${isOnline ? 'bg-green-500' : 'bg-gray-300'}`}
                        >
                            <div className={`w-5 h-5 md:w-6 md:h-6 rounded-full bg-white shadow-md transform transition-transform duration-300 ${isOnline ? 'translate-x-5 md:translate-x-6' : 'translate-x-0'}`} />
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl md:rounded-3xl border border-gray-200 p-5 md:p-6 flex-1 shadow-sm">
                        <h3 className="text-gray-600 font-bold text-xs md:text-sm uppercase tracking-wider mb-3 md:mb-4">App Settings</h3>
                        <div className="space-y-1">
                            {['Notifications', 'Dark Mode', 'Sound Effects', 'Location Services'].map((setting, i) => (
                                <div key={setting} className="flex items-center justify-between p-2.5 md:p-3 rounded-lg md:rounded-xl hover:bg-gray-50 transition-colors cursor-pointer group">
                                    <span className="text-gray-900 font-medium text-sm">{setting}</span>
                                    {i === 1 ? (
                                        <span className="text-[10px] md:text-xs font-bold text-bird-blue bg-bird-blue/10 px-2 py-1 rounded border border-bird-blue/20">Always On</span>
                                    ) : (
                                        <div className="w-9 h-5 md:w-10 md:h-6 rounded-full bg-gray-200 p-1 relative flex items-center">
                                            <div className={`w-3 h-3 md:w-4 md:h-4 rounded-full shadow-sm transition-transform ${i === 0 || i === 3 ? 'translate-x-4 md:translate-x-4 bg-green-500' : 'translate-x-0 bg-gray-400'}`}></div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            <div className="pt-3 md:pt-4 mt-3 md:mt-4 border-t border-gray-200">
                                <button className="w-full py-2.5 md:py-3 rounded-lg md:rounded-xl bg-red-50 text-red-600 font-bold text-sm hover:bg-red-100 transition-colors flex items-center justify-center gap-2 border border-red-200">
                                    <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                                    Sign Out
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
