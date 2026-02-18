import React, { useState } from 'react';

interface ProSidebarProps {
    activeItem: string;
    setActiveItem: (id: string) => void;
    onClose?: () => void;
}

const NAV_ITEMS = [
    { id: 'requests', label: 'Requests', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 001-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
    { id: 'schedule', label: 'Schedule', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { id: 'earnings', label: 'Earnings', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { id: 'settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z' },
];

export const ProSidebar: React.FC<ProSidebarProps> = ({ activeItem, setActiveItem, onClose }) => {
    const [isOpen, setIsOpen] = useState(false); // Collapsed by default
    const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);

    const toggleSidebar = () => setIsOpen(!isOpen);

    const handleItemClick = (id: string) => {
        setActiveItem(id);
    };

    return (
        <aside
            className={`fixed top-6 left-6 bottom-6 z-[60] rounded-[35px] bg-white border border-gray-200 shadow-2xl transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] flex flex-col items-center py-6 overflow-hidden ${isOpen ? 'w-[260px] px-4 items-stretch' : 'w-[84px]'
                }`}
        >
            <div className={`h-16 flex items-center shrink-0 mb-6 transition-all duration-300 ${isOpen ? 'justify-between' : 'justify-center'}`}>
                {isOpen ? (
                    <div className="flex items-center gap-3 animate-fade-in pl-2">
                        <img src="/Fixilogo.png" alt="Fixlife" className="h-8 w-auto object-contain" />
                        <span className="font-bold text-gray-900 tracking-tight text-lg">Fixlife</span>
                    </div>
                ) : (
                    <button
                        onClick={toggleSidebar}
                        className="w-12 h-12 rounded-2xl flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-all"
                    >
                        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                )}

                {isOpen && (
                    <button
                        onClick={toggleSidebar}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-all"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                )}
            </div>

            <nav className="flex-1 w-full gap-2 flex flex-col overflow-y-auto custom-scrollbar px-1">
                {NAV_ITEMS.map(item => {
                    const isActive = activeItem === item.id;

                    return (
                        <div key={item.id}>
                            <button
                                onClick={() => handleItemClick(item.id)}
                                className={`group relative flex items-center w-full transition-all duration-200 outline-none
                           ${isOpen
                                        ? 'px-4 py-3.5 rounded-2xl gap-3 justify-start'
                                        : 'h-12 w-12 rounded-2xl mx-auto justify-center mb-2'
                                    }
                           ${isActive
                                        ? 'bg-bird-blue/10 text-bird-blue shadow-[0_0_20px_rgba(0,144,255,0.05)]'
                                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                    }
                        `}
                            >
                                {isActive && !isOpen && (
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-bird-blue rounded-r-full shadow-[0_0_10px_rgba(0,144,255,0.5)]" />
                                )}

                                <div className={`w-6 h-6 flex items-center justify-center shrink-0 ${isActive ? 'text-bird-blue' : 'text-current'}`}>
                                    <svg className="w-full h-full" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                                    </svg>
                                </div>

                                <span
                                    className={`text-sm font-semibold whitespace-nowrap transition-all duration-300 overflow-hidden text-left
                                ${isOpen ? 'opacity-100 flex-1' : 'opacity-0 w-0 hidden'}
                                ${isActive ? 'text-bird-blue' : 'text-gray-700 group-hover:text-gray-900'}
                            `}
                                >
                                    {item.label}
                                </span>
                            </button>
                        </div>
                    );
                })}
            </nav>

            <div className="mt-auto w-full pt-4 border-t border-gray-200 shrink-0 px-1">
                <button
                    onClick={onClose}
                    className={`flex items-center transition-all duration-200 group bg-gray-50 border border-gray-200 hover:border-bird-orange/30 hover:bg-bird-orange/10
                    ${isOpen ? 'w-full gap-3 px-4 py-4 rounded-2xl justify-start' : 'w-12 h-12 rounded-2xl mx-auto justify-center'}
                `}
                >
                    <div className="w-5 h-5 flex items-center justify-center shrink-0">
                        <svg
                            className="w-full h-full text-bird-orange group-hover:translate-x-0.5 transition-transform duration-300"
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                    </div>

                    <span
                        className={`text-sm font-bold text-gray-900 transition-all duration-300 overflow-hidden whitespace-nowrap
                        ${isOpen ? 'opacity-100 flex-1' : 'opacity-0 w-0 hidden'}
                    `}
                    >
                        Sign Out
                    </span>
                </button>
            </div>

        </aside>
    );
};