import React, { useState } from 'react';
import { NavItemType, NavbarProps, AuthMode } from '../../types';
import { Logo } from '../common/Logo';

export const Navbar: React.FC<NavbarProps> = ({ navItems, onOpenAuth, onStartBooking }) => {
  const [activeItem, setActiveItem] = useState<number | null>(null);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleMouseEnter = (index: number) => {
    setActiveItem(index);
  };

  const handleMouseLeave = () => {
    setActiveItem(null);
  };

  const handleAuthClick = (e: React.MouseEvent, mode: AuthMode) => {
    e.preventDefault();
    setIsAccountOpen(false);
    setIsMobileMenuOpen(false);
    onOpenAuth(mode);
  };

  const handleBookingClick = () => {
    setIsMobileMenuOpen(false);
    onStartBooking();
  }

  const ITEM_WIDTH = '140px';

  const BOOKING_INDEX = navItems.length;
  const ACCOUNT_INDEX = navItems.length + 1;

  return (
    <>
      <header className="fixed top-4 lg:top-6 left-4 right-4 lg:left-0 lg:right-0 h-16 lg:h-20 flex items-center justify-between px-4 lg:px-8 bg-white/90 backdrop-blur-xl border border-gray-200/50 lg:mx-auto max-w-7xl rounded-2xl z-50 shadow-xl shadow-bird-blue/10 animate-slide-down group/header hover:shadow-2xl hover:shadow-bird-blue/15 transition-shadow duration-300">
        <div className="w-auto lg:w-32 flex-shrink-0 transform hover:scale-105 transition-transform duration-300">
          <Logo />
        </div>

        <nav
          className="hidden lg:flex relative items-center h-full ml-auto"
          onMouseLeave={handleMouseLeave}
        >
          <div className="flex relative z-10">
            {navItems.map((item, index) => (
              <div
                key={item.name}
                className="group relative flex items-center justify-center h-16 cursor-pointer text-gray-700 hover:text-bird-blue transition-all duration-300"
                style={{ width: ITEM_WIDTH }}
                onMouseEnter={() => handleMouseEnter(index)}
              >
                <span className="font-bold text-sm tracking-wide z-20 transform group-hover:scale-105 transition-transform duration-200">{item.name}</span>

                {item.items && (
                  <div className="absolute top-14 left-0 w-full pt-4 opacity-0 translate-y-[-10px] pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto transition-all duration-300 ease-out z-30">
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-xl p-1 flex flex-col gap-1">
                      {item.items.map((subItem) => (
                        <a
                          key={subItem}
                          href="#"
                          className="block px-4 py-2 text-sm text-gray-600 hover:bg-bird-blue/5 hover:text-bird-blue rounded-lg transition-colors font-medium"
                        >
                          {subItem}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}

            <div
              className="group relative flex items-center justify-center h-16 cursor-pointer text-gray-700 hover:text-bird-blue transition-all duration-300"
              style={{ width: ITEM_WIDTH }}
              onMouseEnter={() => handleMouseEnter(BOOKING_INDEX)}
              onClick={handleBookingClick}
            >
              <span className="font-bold text-sm tracking-wide z-20 transform group-hover:scale-105 transition-transform duration-200">Book Service</span>
            </div>

            <div
              className="group relative flex items-center justify-center h-16 cursor-pointer text-gray-700 hover:text-bird-blue transition-all duration-300"
              style={{ width: ITEM_WIDTH }}
              onMouseEnter={() => handleMouseEnter(ACCOUNT_INDEX)}
              onClick={() => setIsAccountOpen(!isAccountOpen)}
            >
              <div className="flex items-center gap-2 z-20 transform group-hover:scale-105 transition-transform duration-200">
                <span className="font-bold text-sm tracking-wide">Account</span>
                <svg
                  className={`w-4 h-4 transition-transform duration-300 ${isAccountOpen ? 'rotate-180 text-bird-blue' : 'group-hover:text-bird-blue'}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              <div
                className={`absolute top-14 right-0 w-48 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden transition-all duration-300 origin-top-right z-50 cursor-default
                    ${isAccountOpen ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'}`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-1">
                  <button
                    onClick={(e) => handleAuthClick(e, 'signin')}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-600 hover:bg-bird-blue/5 hover:text-bird-blue rounded-lg transition-colors text-left font-medium"
                  >
                    <svg className="w-4 h-4 text-bird-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                    </svg>
                    Login
                  </button>
                  <button
                    onClick={(e) => handleAuthClick(e, 'signup')}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-600 hover:bg-bird-blue/5 hover:text-bird-blue rounded-lg transition-colors text-left font-medium"
                  >
                    <svg className="w-4 h-4 text-bird-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    Register
                  </button>
                </div>
                <div className="border-t border-gray-200 p-2 bg-gray-50 text-center">
                  <span className="text-xs text-gray-500">v1.0.2</span>
                </div>
              </div>
            </div>

          </div>

          <div
            className="absolute bottom-0 h-[4px] rounded-t-full bg-bird-blue transition-all duration-300 ease-out shadow-[0_0_15px_rgba(0,144,255,0.6)]"
            style={{
              width: ITEM_WIDTH,
              left: 0,
              transform: `translateX(${activeItem !== null ? activeItem * 100 : 0}%)`,
              opacity: activeItem !== null ? 1 : 0,
            }}
          />
        </nav>

        <div className="lg:hidden flex items-center">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 text-gray-700 hover:text-bird-blue focus:outline-none"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
            </svg>
          </button>
        </div>
      </header>

      <div
        className={`fixed inset-0 z-[60] bg-white/95 backdrop-blur-xl lg:hidden transition-all duration-300 ease-in-out ${isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
      >
        <div className="flex flex-col h-full p-6">
          <div className="flex justify-between items-center mb-8">
            <Logo />
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="p-2 text-gray-500 hover:text-gray-900"
            >
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex flex-col gap-6 overflow-y-auto">
            {navItems.map((item) => (
              <div key={item.name} className="flex flex-col gap-3">
                <span className="text-xl font-bold text-gray-900">{item.name}</span>
                {item.items && (
                  <div className="flex flex-col gap-2 pl-4 border-l-2 border-bird-blue/30">
                    {item.items.map((subItem) => (
                      <a key={subItem} href="#" className="text-gray-600 hover:text-bird-blue text-sm py-1 font-medium">
                        {subItem}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="flex flex-col gap-3">
              <button onClick={handleBookingClick} className="text-xl font-bold text-gray-900 text-left">
                Book Service
              </button>
            </div>
          </div>

          <div className="mt-auto pt-8 border-t border-gray-200 flex flex-col gap-4">
            <button
              onClick={(e) => handleAuthClick(e, 'signin')}
              className="w-full py-4 rounded-xl bg-gray-100 border border-gray-200 text-gray-900 font-bold active:scale-95 transition-transform shadow-sm"
            >
              Sign In
            </button>
            <button
              onClick={(e) => handleAuthClick(e, 'signup')}
              className="w-full py-4 rounded-xl bg-bird-blue text-white font-bold shadow-lg shadow-bird-blue/20 active:scale-95 transition-transform"
            >
              Create Account
            </button>
          </div>
        </div>
      </div>
    </>
  );
};