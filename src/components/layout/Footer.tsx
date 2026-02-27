import React from 'react';
import { Logo } from '../common/Logo';

interface FooterProps {
  onOpenPro?: () => void;
  onOpenAdmin?: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenPro, onOpenAdmin }) => {
  return (
    <footer className="relative bg-gradient-to-b from-transparent via-orange-50/30 to-gray-50 pt-32 pb-10 border-t border-gray-200">

      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute bottom-0 left-[10%] w-[500px] h-[500px] bg-bird-blue/10 rounded-full blur-[100px]" />
        <div className="absolute top-20 right-[10%] w-[400px] h-[400px] bg-bird-yellow/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-[15%] right-[5%] w-[300px] h-[300px] bg-bird-orange/10 rounded-full blur-[80px]" />
      </div>

      <div className="max-w-[1400px] mx-auto px-4 md:px-8 relative z-10">
        <div className="relative -mt-32 md:-mt-48 mb-20 rounded-3xl p-8 md:p-12 overflow-hidden shadow-2xl shadow-bird-blue/20 border border-bird-blue/20 group bg-gradient-to-r from-bird-blue to-bird-darkBlue">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay" />

          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8 text-center md:text-left">
            <div>
              <h2 className="text-2xl md:text-4xl font-bold text-white mb-3">Ready to get started?</h2>
              <p className="text-blue-100 text-base md:text-lg max-w-lg mx-auto md:mx-0">Join the Fixlife community today. Book a service or register as a professional.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
              <button className="px-8 py-4 rounded-xl bg-white text-bird-blue font-bold shadow-lg hover:bg-gray-50 transition-all transform hover:-translate-y-1 w-full sm:w-auto">
                Book a Service
              </button>
              <button
                onClick={onOpenPro}
                className="px-8 py-4 rounded-xl bg-bird-darkBlue/30 border border-white/20 text-white font-bold backdrop-blur-md hover:bg-bird-darkBlue/50 transition-all w-full sm:w-auto"
              >
                I'm a Pro
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-12 gap-8 lg:gap-8 mb-16 text-gray-900">

          <div className="col-span-2 lg:col-span-4 flex flex-col items-start gap-6 mb-8 lg:mb-0">
            <div className="flex items-center gap-3 group">
              <div className="relative">
                <img 
                  src="/mascot.png" 
                  alt="Fixlife Mascot" 
                  className="w-16 h-16 object-contain drop-shadow-lg group-hover:scale-110 transition-transform duration-300"
                />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white shadow-lg" />
              </div>
              <div>
                <span className="font-bold text-2xl tracking-tight text-gray-900 block">Fixlife</span>
                <span className="text-xs text-bird-blue font-semibold">Your Home Hero</span>
              </div>
            </div>

            <p className="text-gray-600 text-sm leading-relaxed max-w-sm">
              The leading platform connecting local talent with real needs. Safety, trust, and speed in every service.
            </p>

            <div className="flex items-center gap-3 mt-2">
              {[
                { name: 'twitter', icon: 'M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z' },
                { name: 'facebook', icon: 'M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z' },
                { name: 'instagram', icon: 'M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37zm1.5-4.87h.01M7.5 2h9A5.5 5.5 0 0122 7.5v9a5.5 5.5 0 01-5.5 5.5h-9A5.5 5.5 0 012 16.5v-9A5.5 5.5 0 017.5 2z' },
                { name: 'linkedin', icon: 'M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z M4 6a2 2 0 100-4 2 2 0 000 4z' }
              ].map((social) => (
                <a
                  key={social.name}
                  href="#"
                  className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:text-white hover:bg-bird-blue hover:border-bird-blue hover:shadow-lg hover:shadow-bird-blue/30 hover:-translate-y-1 transition-all duration-300"
                >
                  <span className="sr-only">{social.name}</span>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={social.icon} />
                  </svg>
                </a>
              ))}
            </div>
          </div>

          <div className="col-span-1 lg:col-span-2">
            <h4 className="text-gray-900 font-bold text-base mb-5 flex items-center gap-2">
              <div className="w-1 h-5 bg-bird-blue rounded-full" />
              Platform
            </h4>
            <ul className="flex flex-col gap-3">
              {['Explore Services', 'How it Works', 'Pricing', 'Fixlife Guarantee', 'Safety'].map(item => (
                <li key={item}>
                  <a href="#" className="text-gray-600 hover:text-bird-blue hover:translate-x-1 transition-all text-sm font-medium inline-flex items-center gap-2 group">
                    <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="col-span-1 lg:col-span-2">
            <h4 className="text-gray-900 font-bold text-base mb-5 flex items-center gap-2">
              <div className="w-1 h-5 bg-bird-yellow rounded-full" />
              Company
            </h4>
            <ul className="flex flex-col gap-3">
              {['About Us', 'Careers', 'Blog', 'Press', 'Partners'].map(item => (
                <li key={item}>
                  <a href="#" className="text-gray-600 hover:text-bird-blue hover:translate-x-1 transition-all text-sm font-medium inline-flex items-center gap-2 group">
                    <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="col-span-2 lg:col-span-4 mt-8 lg:mt-0">
            <h4 className="text-gray-900 font-bold text-base mb-5 flex items-center gap-2">
              <div className="w-1 h-5 bg-bird-orange rounded-full" />
              Stay updated
            </h4>
            <div className="p-6 rounded-2xl bg-gradient-to-br from-white to-gray-50 border border-gray-200 backdrop-blur-sm shadow-lg hover:shadow-xl transition-shadow">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-bird-blue/10 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-bird-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-gray-900 font-semibold text-sm mb-1">Get exclusive offers</p>
                  <p className="text-gray-600 text-xs">Maintenance tips and special deals.</p>
                </div>
              </div>
              <form className="flex flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
                <div className="relative">
                  <input
                    type="email"
                    placeholder="Your email address"
                    className="w-full bg-white border-2 border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm focus:outline-none focus:border-bird-blue focus:ring-2 focus:ring-bird-blue/20 transition-all"
                  />
                </div>
                <button className="w-full py-3 rounded-xl bg-gradient-to-r from-bird-yellow to-bird-orange text-gray-900 font-bold text-sm hover:shadow-lg hover:shadow-bird-yellow/30 hover:-translate-y-0.5 transition-all">
                  Subscribe Now
                </button>
              </form>
            </div>
          </div>

        </div>

        <div className="pt-8 border-t border-gray-200 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-gray-500 text-center md:text-left">
          <div className="flex items-center gap-2 text-gray-400">
            <p>© 2024 Fixlife Inc. All rights reserved.</p>
            <span className="hidden md:inline">•</span>
            <p className="hidden md:inline">Made with ❤️ for your home</p>
          </div>
          <div className="flex flex-wrap justify-center gap-6 md:gap-8 items-center">
            <button onClick={onOpenAdmin} className="text-gray-400 hover:text-bird-blue transition-colors font-bold text-xs">
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" /></svg>
                Admin Area
              </span>
            </button>
            <span className="text-gray-300 hidden md:inline">|</span>
            <a href="#" className="hover:text-bird-blue transition-colors font-medium">Privacy Policy</a>
            <a href="#" className="hover:text-bird-blue transition-colors font-medium">Terms of Service</a>
            <a href="#" className="hover:text-bird-blue transition-colors font-medium">Sitemap</a>
          </div>
        </div>

      </div>
    </footer>
  );
};