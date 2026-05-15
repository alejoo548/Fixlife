import React, { useState, useEffect } from 'react';

const PRO_SLIDES = [
  {
    id: 1,
    role: "Technicians & Experts",
    headline: "Your talent, your income.",
    subhead: "Join the largest network of professionals. Manage your schedule and receive secure payments for every completed job.",
    colorAccent: "from-bird-blue",
    buttonColor: "bg-bird-blue hover:bg-bird-darkBlue",
    image: "/landing-home-repair.jpg",
    stats: "Avg earnings: $800/wk"
  },
  {
    id: 2,
    role: "Construction & Finishes",
    headline: "Be your own boss.",
    subhead: "No fixed hours. You decide when to work and which projects to accept. We get you the clients.",
    colorAccent: "from-bird-orange",
    buttonColor: "bg-bird-orange hover:bg-white hover:text-bird-orange",
    image: "/landing-carpentry.jpg",
    stats: "+50 Daily requests"
  },
  {
    id: 3,
    role: "Home Specialists",
    headline: "Grow your business.",
    subhead: "Forget marketing. Fixlife puts your profile in front of thousands of people who need your services today.",
    colorAccent: "from-purple-600",
    buttonColor: "bg-purple-600 hover:bg-purple-700",
    image: "/landing-renovation.jpg",
    stats: "Guaranteed payments"
  }
];

export const JoinProSlider: React.FC = () => {
  const [current, setCurrent] = useState(0);

  // Auto-rotate
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % PRO_SLIDES.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const slide = PRO_SLIDES[current];

  return (
    <div className="w-full relative rounded-3xl overflow-hidden bg-bird-surface border border-white/5 shadow-2xl h-[500px] md:h-[450px]">

      <div
        className={`absolute top-0 right-0 w-[600px] h-[600px] rounded-full blur-[120px] bg-gradient-to-b ${slide.colorAccent} to-transparent opacity-20 transition-all duration-1000 ease-in-out -translate-y-1/2 translate-x-1/4`}
      />

      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 h-full">

        <div className="p-8 md:p-12 flex flex-col justify-center h-full order-2 md:order-1">
          <div key={slide.id} className="flex flex-col items-start">

            <div className="animate-fade-in-up" style={{ animationDelay: '0ms' }}>
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-bold tracking-wider uppercase mb-6 text-gray-300">
                <span className={`w-2 h-2 rounded-full ${slide.buttonColor}`}></span>
                {slide.role}
              </span>
            </div>

            <h2
              className="text-4xl md:text-5xl font-black text-white mb-4 leading-tight animate-fade-in-up"
              style={{ animationDelay: '100ms' }}
            >
              {slide.headline}
            </h2>

            <p
              className="text-gray-400 text-lg mb-8 max-w-md leading-relaxed animate-fade-in-up"
              style={{ animationDelay: '200ms' }}
            >
              {slide.subhead}
            </p>

            <div
              className="flex flex-col sm:flex-row items-center gap-6 animate-fade-in-up"
              style={{ animationDelay: '300ms' }}
            >
              <button className={`px-8 py-4 rounded-xl ${slide.buttonColor} text-white font-bold text-base shadow-lg hover:scale-105 active:scale-95 transition-all duration-300 flex items-center gap-2 w-full sm:w-auto justify-center`}>
                Register as Pro
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>

              <div className="flex items-center gap-3 bg-black/20 px-4 py-2 rounded-lg border border-white/5 backdrop-blur-sm">
                <div className="p-1.5 rounded-full bg-green-500/20 text-green-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <span className="text-sm font-semibold text-gray-300">{slide.stats}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative h-full order-1 md:order-2 overflow-hidden">
          <div key={slide.id + '-img'} className="absolute inset-0 animate-slide-in-right">
            <div className="absolute inset-0 z-10 bg-gradient-to-r from-bird-surface via-bird-surface/20 to-transparent md:bg-gradient-to-r md:from-bird-surface md:via-transparent md:to-transparent" />
            <div className="absolute inset-0 z-10 bg-gradient-to-t from-bird-surface via-transparent to-transparent opacity-80 md:hidden" />

            <img
              src={slide.image}
              alt={slide.role}
              onError={(e) => {
                const fallback = '/landing-home-repair.jpg';
                if (e.currentTarget.dataset.fallbackApplied === 'true') {
                  e.currentTarget.removeAttribute('src');
                  return;
                }
                e.currentTarget.dataset.fallbackApplied = 'true';
                e.currentTarget.src = fallback;
              }}
              className="w-full h-full object-cover object-top md:object-center transform scale-100 hover:scale-105 transition-transform duration-[10000ms]"
              style={{
                filter: "brightness(0.9) contrast(1.1)"
              }}
            />
          </div>
        </div>
      </div>

      <div className="absolute bottom-6 left-1/2 md:left-12 transform -translate-x-1/2 md:translate-x-0 flex gap-2 z-20">
        {PRO_SLIDES.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrent(idx)}
            className={`h-1.5 rounded-full transition-all duration-500 ${idx === current ? 'w-8 bg-white' : 'w-2 bg-white/20 hover:bg-white/40'
              }`}
          />
        ))}
      </div>
    </div>
  );
};
