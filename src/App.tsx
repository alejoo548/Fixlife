import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Navbar } from './components/layout/Navbar';
import { NavItemType, AuthMode } from './types';
import { AuthModal } from './components/modals/AuthModal';
import { WorkerAuthModal } from './components/modals/WorkerAuthModal';
import { HeroSlider } from './components/sections/HeroSlider';
import { ProBento } from './components/sections/ProBento';
import { StepsSection } from './components/sections/StepsSection';
import { Footer } from './components/layout/Footer';
import { ScrollReveal } from './components/common/ScrollReveal';
import { ServiceRequestWizard } from './components/modals/ServiceRequestWizard';
import { ProDashboard } from './components/modals/ProDashboard';
import { ParticlesBackground } from './components/effects/ParticlesBackground';
import { TestimonialsCarousel } from './components/sections/TestimonialsCarousel';
import { FAQSection } from './components/sections/FAQSection';
import { SafetySection } from './components/sections/SafetySection';
import { Button } from './components/common/Button';

const navItems: NavItemType[] = [
  { name: "Services" },
  { name: "Professionals" },
  {
    name: "Categories",
    items: ["Plumbing", "Electrical", "Cleaning", "Landscaping", "Mechanics"]
  },
  {
    name: "Help",
    items: ["Support", "How it works", "Safety"]
  }
];

const App: React.FC = () => {
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [isWorkerAuthOpen, setIsWorkerAuthOpen] = useState(false);
  const [workerAuthMode, setWorkerAuthMode] = useState<'signin' | 'signup'>('signup');
  const [currentView, setCurrentView] = useState<'landing' | 'app' | 'pro-dashboard'>('landing');

  useEffect(() => {
    const path = window.location.pathname;
    console.log('[App] Initial path:', path);

    if (path === '/pro-dashboard') {
      setCurrentView('pro-dashboard');
    }
    else if (path === '/app') {
      setCurrentView('app');
    }

  }, []);

  useEffect(() => {
    console.log('[App] Current view changed to:', currentView);
  }, [currentView]);

  const handleOpenAuth = (mode: AuthMode) => {
    setAuthMode(mode);
    setIsAuthOpen(true);
  };

  const handleStartBooking = () => {
    console.log('[App] handleStartBooking called');
    window.history.pushState({}, '', '/app');
    setCurrentView('app');
    window.scrollTo(0, 0);
  };

  const handleOpenProDashboard = () => {
    console.log('[App] handleOpenProDashboard called');
    window.history.pushState({}, '', '/pro-dashboard');
    setCurrentView('pro-dashboard');
    window.scrollTo(0, 0);
  }

  const handleOpenWorkerAuth = (mode: 'signin' | 'signup') => {
    setWorkerAuthMode(mode);
    setIsWorkerAuthOpen(true);
  }

  const handleBackToLanding = () => {
    console.log('[App] handleBackToLanding called');
    window.history.pushState({}, '', '/');
    setCurrentView('landing');
    window.scrollTo(0, 0);
  }

  const services = [
    {
      title: "Expert Plumbing",
      desc: "Leak repairs, pipe installation, and sanitary maintenance.",
      img: "1585704032915-c3400ca199e7",
      icon: "M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
    },
    {
      title: "Electrical",
      desc: "Safe installations, wiring, panels, and short circuit repairs.",
      img: "1621905251189-08b45d6a269e",
      icon: "M13 10V3L4 14h7v7l9-11h-7z"
    },
    {
      title: "Auto Mechanics",
      desc: "Vehicle diagnostics, oil changes, and mobile repairs.",
      img: "1530046339160-71153320c072",
      icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z"
    },
    {
      title: "Carpentry",
      desc: "Furniture design, door repair, and structure assembly.",
      img: "1610557892470-55d9e80c0bce",
      icon: "M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-amber-50 to-orange-50 text-gray-900 selection:bg-bird-blue selection:text-white overflow-x-hidden font-sans flex flex-col relative transition-colors duration-500">

      <div className="fixed inset-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <ParticlesBackground />

        <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] bg-bird-lightBlue/20 rounded-full blur-[100px] animate-blob" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-bird-yellow/20 rounded-full blur-[120px] animate-blob animation-delay-2000" />

        <div className="absolute top-[20%] right-[20%] w-[40vw] h-[40vw] bg-bird-orange/15 rounded-full blur-[90px] animate-blob animation-delay-4000" />
        <div className="absolute bottom-[20%] left-[20%] w-[30vw] h-[30vw] bg-white/40 rounded-full blur-[80px] animate-blob" />
      </div>

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        initialMode={authMode}
      />

      <WorkerAuthModal
        isOpen={isWorkerAuthOpen}
        onClose={() => setIsWorkerAuthOpen(false)}
        mode={workerAuthMode}
        onSuccess={handleOpenProDashboard}
      />



      {(() => {
        console.log('[App] Rendering with currentView:', currentView);
        return null;
      })()}

      {currentView === 'app' ? (
        <ServiceRequestWizard
          isOpen={true}
          onClose={handleBackToLanding}
        />
      ) : currentView === 'pro-dashboard' ? (
        <ProDashboard
          isOpen={true}
          onClose={handleBackToLanding}
        />
      ) : (
        <>

          <Navbar
            navItems={navItems}
            onOpenAuth={handleOpenAuth}
            onStartBooking={handleStartBooking}
          />


          <main className="relative z-10 pt-24 lg:pt-36 px-4 lg:px-8 max-w-[1400px] mx-auto pb-32 flex-grow w-full">


            <section className="mb-16 md:mb-24 grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-10">
              <motion.div
                initial={{ opacity: 0, x: -50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6 }}
                className="lg:col-span-8 w-full h-full min-h-[400px] md:min-h-[450px] lg:h-[580px]"
              >
                <HeroSlider onStartBooking={handleStartBooking} />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="lg:col-span-4 flex flex-col justify-between p-6 md:p-10 rounded-3xl bg-white/80 backdrop-blur-xl border border-gray-200/50 shadow-2xl relative overflow-hidden group hover:border-bird-blue/30 transition-all duration-500"
              >
                <motion.div
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.3, 0.5, 0.3],
                  }}
                  transition={{
                    duration: 8,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  className="absolute top-0 right-0 w-80 h-80 bg-bird-yellow/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"
                />

                <div className="relative z-10 flex flex-col h-full">
                  <div>
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.4, type: "spring" }}
                      className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-green-50 border border-green-200 w-fit mb-8 shadow-sm"
                    >
                      <motion.span
                        animate={{ scale: [1, 1.3, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="w-2 h-2 rounded-full bg-green-500"
                      />
                      <span className="text-xs font-bold text-green-700 tracking-wider uppercase">Available Now</span>
                    </motion.div>

                    <motion.h1
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5, duration: 0.6 }}
                      className="text-3xl md:text-4xl xl:text-5xl font-black mb-4 md:mb-6 leading-tight tracking-tight text-gray-900"
                    >
                      Welcome to <br />
                      <motion.span
                        animate={{
                          backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
                        }}
                        transition={{
                          duration: 5,
                          repeat: Infinity,
                          ease: "linear"
                        }}
                        className="text-transparent bg-clip-text bg-gradient-to-r from-bird-blue via-bird-yellow to-bird-orange"
                        style={{ backgroundSize: "200% 200%" }}
                      >
                        Fixlife
                      </motion.span>
                    </motion.h1>

                    <motion.p
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.6, duration: 0.6 }}
                      className="text-gray-600 text-base md:text-lg leading-relaxed mb-6 md:mb-8 max-w-sm font-medium"
                    >
                      Connecting top-rated professionals with your repair and maintenance projects. <span className="text-gray-900 font-bold">Fast, safe, and guaranteed.</span>
                    </motion.p>
                  </div>

                  <div className="mt-auto">
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.7, duration: 0.6 }}
                      className="flex flex-col gap-3 md:gap-4 mb-6 md:mb-8"
                    >
                      <Button
                        onClick={handleStartBooking}
                        variant="primary"
                        size="lg"
                        fullWidth
                        rightIcon={
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                          </svg>
                        }
                      >
                        Get Started
                      </Button>

                      <Button
                        variant="outline"
                        size="lg"
                        fullWidth
                      >
                        How it Works
                      </Button>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.8, duration: 0.6 }}
                      className="pt-4 md:pt-6 border-t border-gray-200 flex items-center gap-3 md:gap-4 text-xs md:text-sm text-gray-600"
                    >
                      <div className="flex -space-x-3">
                        {[1, 2, 3, 4].map(i => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.9 + i * 0.1, type: "spring" }}
                            whileHover={{ scale: 1.2, zIndex: 10 }}
                            className="w-10 h-10 rounded-full border-2 border-white bg-gray-200 overflow-hidden shadow-sm cursor-pointer"
                          >
                            <img src={`https://randomuser.me/api/portraits/${i % 2 === 0 ? 'women' : 'men'}/${40 + i}.jpg`} alt="User" className="w-full h-full object-cover" />
                          </motion.div>
                        ))}
                      </div>
                      <div>
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 1.3 }}
                          className="text-gray-900 font-bold"
                        >
                          2.4k+
                        </motion.p>
                        <p className="text-xs">Active Experts</p>
                      </div>
                    </motion.div>
                  </div>
                </div>
              </motion.div>
            </section>


            <section className="mb-24">
              <ScrollReveal>
                <div className="flex items-center justify-between mb-10 px-2">
                  <div>
                    <motion.h3
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      className="text-3xl md:text-4xl font-black text-gray-900 flex items-center gap-4"
                    >
                      <motion.span
                        initial={{ scaleY: 0 }}
                        whileInView={{ scaleY: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2, type: "spring" }}
                        className="w-1.5 h-8 rounded-full bg-bird-blue shadow-[0_0_15px_rgba(0,144,255,0.4)] origin-bottom"
                      />
                      Professional Services
                    </motion.h3>
                    <motion.p
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.3 }}
                      className="text-gray-600 mt-2 ml-6 text-sm font-medium"
                    >
                      Expert solutions for every home need
                    </motion.p>
                  </div>
                  <Button
                    onClick={handleStartBooking}
                    variant="ghost"
                    size="md"
                    className="hidden sm:flex"
                    rightIcon={
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    }
                  >
                    View All
                  </Button>
                </div>
              </ScrollReveal>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {services.map((item, i) => (
                  <ScrollReveal key={i} delay={i * 100} className="h-full">
                    <motion.div
                      whileHover={{ y: -8, scale: 1.02 }}
                      transition={{ type: "spring", stiffness: 300 }}
                      onClick={handleStartBooking}
                      className="group h-full cursor-pointer bg-white/80 border border-gray-200/50 rounded-3xl overflow-hidden hover:border-bird-blue/50 transition-all duration-500 hover:shadow-2xl hover:shadow-bird-blue/10 flex flex-col backdrop-blur-sm"
                    >
                      <div className="relative h-48 overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/50 to-transparent z-10" />
                        <motion.img
                          whileHover={{ scale: 1.15 }}
                          transition={{ duration: 0.6 }}
                          src={`https://images.unsplash.com/photo-${item.img}?q=80&w=800&auto=format&fit=crop`}
                          alt={item.title}
                          className="w-full h-full object-cover grayscale-[30%] group-hover:grayscale-0 transition-all duration-700"
                        />
                        <motion.div
                          whileHover={{ scale: 1.1, rotate: 5 }}
                          className="absolute top-4 right-4 z-20 w-12 h-12 bg-white/95 backdrop-blur-md rounded-xl border border-gray-200 flex items-center justify-center shadow-lg group-hover:bg-bird-blue group-hover:border-bird-blue group-hover:text-white transition-all duration-300 text-gray-700"
                        >
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
                          </svg>
                        </motion.div>
                      </div>
                      <div className="p-6 flex-1 flex flex-col relative z-20">
                        <div className="flex-1">
                          <h4 className="text-xl font-bold text-gray-900 group-hover:text-bird-blue transition-colors mb-2">{item.title}</h4>
                          <p className="text-gray-600 text-sm leading-relaxed mb-4 line-clamp-3 font-medium">{item.desc}</p>
                        </div>
                        <motion.div
                          initial={{ x: 0 }}
                          whileHover={{ x: 5 }}
                          className="flex items-center gap-2 text-bird-blue font-bold text-sm mt-2 group-hover:gap-3 transition-all"
                        >
                          <span>Learn More</span>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                          </svg>
                        </motion.div>
                      </div>
                    </motion.div>
                  </ScrollReveal>
                ))}
              </div>
            </section>

            <ScrollReveal>
              <section className="mb-24"><StepsSection /></section>
            </ScrollReveal>

            <ScrollReveal>
              <section className="mb-24">
                <TestimonialsCarousel />
              </section>
            </ScrollReveal>

            <ScrollReveal>
              <section className="mb-24">
                <SafetySection />
              </section>
            </ScrollReveal>

            <ScrollReveal>
              <section className="mb-24">
                <FAQSection />
              </section>
            </ScrollReveal>

            <section className="mb-24 md:mb-32">
              <ScrollReveal><ProBento onOpenPro={handleOpenProDashboard} onOpenWorkerAuth={handleOpenWorkerAuth} /></ScrollReveal>
            </section>
          </main>
          <Footer onOpenPro={handleOpenProDashboard} />
        </>
      )}

    </div>
  );
};

export default App;