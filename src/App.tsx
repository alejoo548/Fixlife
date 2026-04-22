import React, { useState, useEffect, Suspense, lazy } from 'react';
import { motion } from 'framer-motion';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Navbar } from './components/layout/Navbar';
import { NavItemType, AuthMode } from './types';
import { AuthModal } from './components/modals/AuthModal';
import { WorkerAuthModal } from './components/modals/WorkerAuthModal';
import { HeroSlider } from './components/sections/HeroSlider';
import { ProBento } from './components/sections/ProBento';
import { StepsSection } from './components/sections/StepsSection';
import { Footer } from './components/layout/Footer';
import { ScrollReveal } from './components/common/ScrollReveal';
import { TestimonialsCarousel } from './components/sections/TestimonialsCarousel';
import { FAQSection } from './components/sections/FAQSection';
import { Button } from './components/common/Button';
import { ThreeDCard } from './components/common/ThreeDCard';
import ForgotPassword from './pages/ForgotPassword';
import UserProfile from './pages/UserProfile';
import { hasRole, isAuthenticated, logoutAuthSession } from './utils/session';
import { API_ENDPOINTS } from './config/api';
import { ProtectedRoute } from './routes/ProtectedRoute';

const ServiceRequestWizard = lazy(() =>
  import('./components/modals/ServiceRequestWizard').then((module) => ({
    default: module.ServiceRequestWizard,
  }))
);
const AiSupportChatWidget = lazy(() => import('./components/common/AiSupportChatWidget').then((module) => ({
  default: module.AiSupportChatWidget,
})));
const ProDashboard = lazy(() =>
  import('./components/modals/ProDashboard').then((module) => ({
    default: module.ProDashboard,
  }))
);
const AdminDashboard = lazy(() =>
  import('./components/modals/AdminDashboard').then((module) => ({
    default: module.AdminDashboard,
  }))
);
const PaymentCheckoutPage = lazy(() => import('./pages/PaymentCheckoutPage'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));

const navItems: NavItemType[] = [
  { name: "Services" },
  { name: "Professionals" },
  {
    name: "Categories",
    items: ["Plumbing", "Electrical", "Cleaning", "Landscaping", "Mechanics"]
  },
  {
    name: "Help",
    items: ["Support", "How it works"]
  }
];

interface HomeServiceCard {
  id_card: number;
  id_service: number;
  image_url: string | null;
  badge: string;
  headline: string;
  summary: string;
  cta_label: string;
  service_name: string;
  service_icon: string | null;
}

const LANDING_SECTION_IDS = {
  services: 'services-section',
  steps: 'steps-section',
  testimonials: 'testimonials-section',
  faq: 'faq-section',
  professionals: 'professionals-section',
} as const;

type LandingSectionTarget = keyof typeof LANDING_SECTION_IDS;

const AppRouteFallback: React.FC<{ title?: string; subtitle?: string }> = ({
  title = 'Loading experience...',
  subtitle = 'Preparing this view for you.',
}) => (
  <div className="pointer-events-none fixed right-4 top-4 z-[120]">
    <div className="flex items-center gap-2 rounded-full border border-white/70 bg-white/82 px-3 py-2 shadow-[0_14px_34px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="h-3.5 w-3.5 rounded-full border-2 border-bird-blue/20 border-t-bird-blue animate-spin" />
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-bird-blue">{title}</p>
        <p className="text-[11px] text-slate-500">{subtitle}</p>
      </div>
    </div>
  </div>
);

const CheckoutRoute: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const params = useParams();
  const requestId = Number(params.requestId);

  return (
    <PaymentCheckoutPage
      requestId={Number.isFinite(requestId) && requestId > 0 ? requestId : null}
      onBack={onBack}
    />
  );
};

const ServiceRequestRoute: React.FC<{
  onClose: () => void;
  onOpenCheckout: (requestId: number) => void;
}> = ({ onClose, onOpenCheckout }) => {
  const [searchParams] = useSearchParams();
  const serviceId = Number(searchParams.get('serviceId') || 0);
  const serviceName = searchParams.get('serviceName')?.trim() || undefined;

  return (
    <ServiceRequestWizard
      isOpen={true}
      onClose={onClose}
      initialServiceId={Number.isFinite(serviceId) && serviceId > 0 ? serviceId : undefined}
      initialServiceName={serviceName}
      onOpenCheckout={onOpenCheckout}
    />
  );
};

const buildBookingPath = (service?: { id: number; name: string } | null) => {
  const params = new URLSearchParams();
  if (service?.id && service.id > 0) params.set('serviceId', String(service.id));
  if (service?.name?.trim()) params.set('serviceName', service.name.trim());
  const query = params.toString();
  return query ? `/app?${query}` : '/app';
};

const App: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [isWorkerAuthOpen, setIsWorkerAuthOpen] = useState(false);
  const [workerAuthMode, setWorkerAuthMode] = useState<'signin' | 'signup'>('signup');
  const [serviceCards, setServiceCards] = useState<HomeServiceCard[]>([]);
  const [pendingSection, setPendingSection] = useState<LandingSectionTarget | null>(null);
  const [pendingBookingPath, setPendingBookingPath] = useState<string | null>(null);
  const isLandingRoute = location.pathname === '/';

  useEffect(() => {
    const fetchServiceCards = async () => {
      try {
        const res = await fetch(API_ENDPOINTS.services.cards);
        const data = await res.json();
        if (data?.success && Array.isArray(data.cards)) {
          setServiceCards(data.cards);
        }
      } catch (error) {
        console.error('Could not fetch service cards:', error);
      }
    };

    fetchServiceCards();
  }, []);

  const scrollToLandingSectionByTarget = (target: LandingSectionTarget) => {
    const section = document.getElementById(LANDING_SECTION_IDS[target]);
    if (!section) {
      return false;
    }

    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  };

  useEffect(() => {
    if (!isLandingRoute || !pendingSection) {
      return;
    }

    const timer = window.setTimeout(() => {
      scrollToLandingSectionByTarget(pendingSection);
      setPendingSection(null);
    }, 120);

    return () => window.clearTimeout(timer);
  }, [isLandingRoute, pendingSection]);

  const handleOpenAuth = (mode: AuthMode) => {
    setAuthMode(mode);
    setIsAuthOpen(true);
  };

  const handleStartBooking = (service?: { id: number; name: string } | null) => {
    const bookingPath = buildBookingPath(service);

    if (!isAuthenticated()) {
      setPendingBookingPath(bookingPath);
      handleOpenAuth('signin');
      return;
    }

    navigate(bookingPath);
    window.scrollTo(0, 0);
  };

  const handleClientLogin = () => {
    if (!pendingBookingPath) return;
    navigate(pendingBookingPath);
    setPendingBookingPath(null);
    window.scrollTo(0, 0);
  };

  const handleOpenProDashboard = () => {
    if (!isAuthenticated('worker') || !hasRole('worker', 'worker')) {
      navigate('/', { replace: true });
      return;
    }
    navigate('/pro-dashboard', { replace: true });
    window.scrollTo(0, 0);
  }

  const handleOpenAdminDashboard = () => {
    if (!isAuthenticated('admin') || !hasRole('admin', 'admin')) {
      navigate('/', { replace: true });
      return;
    }
    navigate('/admin-dashboard', { replace: true });
    window.scrollTo(0, 0);
  }

  const handleOpenWorkerAuth = (mode: 'signin' | 'signup') => {
    setWorkerAuthMode(mode);
    setIsWorkerAuthOpen(true);
  }

  const handleOpenProfile = () => {
    if (!isAuthenticated()) {
      handleOpenAuth('signin');
      return;
    }
    navigate('/profile', { replace: true });
    window.scrollTo(0, 0);
  }

  const handleBackToLanding = () => {
    setPendingSection(null);
    const leavingProtectedView =
      location.pathname === '/admin-dashboard' ||
      location.pathname === '/pro-dashboard' ||
      location.pathname === '/profile' ||
      location.pathname.startsWith('/checkout/');

    navigate('/', { replace: leavingProtectedView });
    window.scrollTo(0, 0);
  };

  const handleWorkerSignOut = () => {
    logoutAuthSession('worker');
    navigate('/', { replace: true });
    window.scrollTo(0, 0);
  };

  const handleBackToRequests = () => {
    navigate('/app', { replace: true });
    window.scrollTo(0, 0);
  };

  const handleOpenCheckout = (requestId: number) => {
    if (!requestId) return;
    navigate(`/checkout/${requestId}`);
    window.scrollTo(0, 0);
  };

  const fallbackCards: HomeServiceCard[] = [
    {
      id_card: 0,
      id_service: 0,
      image_url: 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?q=80&w=800&auto=format&fit=crop',
      badge: 'POPULAR',
      headline: 'Expert Plumbing',
      summary: 'Leak repairs, pipe installation, and sanitary maintenance.',
      cta_label: 'Learn More',
      service_name: 'Plumbing',
      service_icon: 'PL',
    },
    {
      id_card: 0,
      id_service: 0,
      image_url: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?q=80&w=800&auto=format&fit=crop',
      badge: 'POPULAR',
      headline: 'Electrical',
      summary: 'Safe installations, wiring, panels, and short circuit repairs.',
      cta_label: 'Learn More',
      service_name: 'Electrical Services',
      service_icon: 'EL',
    },
    {
      id_card: 0,
      id_service: 0,
      image_url: 'https://images.unsplash.com/photo-1530046339160-71153320c072?q=80&w=800&auto=format&fit=crop',
      badge: 'POPULAR',
      headline: 'Auto Mechanics',
      summary: 'Vehicle diagnostics, oil changes, and mobile repairs.',
      cta_label: 'Learn More',
      service_name: 'Auto Mechanic',
      service_icon: 'AU',
    },
    {
      id_card: 0,
      id_service: 0,
      image_url: 'https://images.unsplash.com/photo-1610557892470-55d9e80c0bce?q=80&w=800&auto=format&fit=crop',
      badge: 'POPULAR',
      headline: 'Carpentry',
      summary: 'Furniture design, door repair, and structure assembly.',
      cta_label: 'Learn More',
      service_name: 'Carpentry',
      service_icon: 'CA',
    },
  ];

  const cardsToRender = serviceCards.length > 0 ? serviceCards.slice(0, 8) : fallbackCards;
  const showAiSupportWidget =
    location.pathname === '/app' ||
    location.pathname === '/profile' ||
    location.pathname.startsWith('/checkout/');

  const normalizeLabel = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

  const handleNavigateSection = (target: string) => {
    if (!(target in LANDING_SECTION_IDS)) {
      return;
    }

    const typedTarget = target as LandingSectionTarget;

    if (!isLandingRoute) {
      setPendingSection(typedTarget);
      navigate('/');
      window.scrollTo(0, 0);
      return;
    }

    setPendingSection(null);
    scrollToLandingSectionByTarget(typedTarget);
  };

  const handleSelectCategory = (category: string) => {
    const normalizedCategory = normalizeLabel(category);
    const matchedCard = cardsToRender.find((card) => {
      const fields = [card.service_name, card.headline, card.badge];

      return fields.some((field) => {
        const normalizedField = normalizeLabel(field);
        return normalizedField.includes(normalizedCategory) || normalizedCategory.includes(normalizedField);
      });
    });

    if (matchedCard?.id_service) {
      handleStartBooking({ id: matchedCard.id_service, name: matchedCard.service_name });
      return;
    }

    handleNavigateSection('services');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-amber-50 to-orange-50 text-gray-900 selection:bg-bird-blue selection:text-white overflow-x-hidden font-sans flex flex-col relative transition-colors duration-500">
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => {
          setIsAuthOpen(false);
          if (!isAuthenticated()) setPendingBookingPath(null);
        }}
        initialMode={authMode}
        onAdminLogin={handleOpenAdminDashboard}
        onClientLogin={handleClientLogin}
        onWorkerLogin={handleOpenProDashboard}
      />

      <WorkerAuthModal
        isOpen={isWorkerAuthOpen}
        onClose={() => setIsWorkerAuthOpen(false)}
        mode={workerAuthMode}
        onSuccess={handleOpenProDashboard}
      />

      <Routes>
        <Route
          path="/app"
          element={(
            <ProtectedRoute>
              <Suspense fallback={<AppRouteFallback title="Loading booking flow..." subtitle="Getting the service wizard ready." />}>
                <ServiceRequestRoute
                  onClose={handleBackToLanding}
                  onOpenCheckout={handleOpenCheckout}
                />
              </Suspense>
            </ProtectedRoute>
          )}
        />
        <Route
          path="/checkout/:requestId"
          element={(
            <ProtectedRoute>
              <Suspense fallback={<AppRouteFallback title="Loading checkout..." subtitle="Preparing secure payment." />}>
                <CheckoutRoute onBack={handleBackToRequests} />
              </Suspense>
            </ProtectedRoute>
          )}
        />
        <Route
          path="/pro-dashboard"
          element={(
            <ProtectedRoute scope="worker" role="worker">
              <Suspense fallback={<AppRouteFallback title="Loading worker dashboard..." subtitle="Preparing requests, maps and tools." />}>
                <ProDashboard
                  isOpen={true}
                  onClose={handleBackToLanding}
                  onSignOut={handleWorkerSignOut}
                />
              </Suspense>
            </ProtectedRoute>
          )}
        />
        <Route
          path="/admin-dashboard"
          element={(
            <ProtectedRoute scope="admin" role="admin">
              <Suspense fallback={<AppRouteFallback title="Loading admin dashboard..." subtitle="Preparing management tools." />}>
                <AdminDashboard
                  isOpen={true}
                  onClose={handleBackToLanding}
                />
              </Suspense>
            </ProtectedRoute>
          )}
        />
        <Route
          path="/profile"
          element={(
            <ProtectedRoute>
              <Navbar
                navItems={navItems}
                onOpenAuth={handleOpenAuth}
                onStartBooking={handleStartBooking}
                onOpenProfile={handleOpenProfile}
                onGoHome={handleBackToLanding}
                onNavigateSection={handleNavigateSection}
                onSelectCategory={handleSelectCategory}
              />
              <UserProfile onBack={handleBackToLanding} />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/forgot-password"
          element={(
            <Suspense fallback={<AppRouteFallback title="Loading recovery..." subtitle="Opening password reset." />}>
              <ForgotPassword />
            </Suspense>
          )}
        />
        <Route
          path="/reset-password"
          element={(
            <Suspense fallback={<AppRouteFallback title="Loading recovery..." subtitle="Opening password reset." />}>
              <ResetPassword />
            </Suspense>
          )}
        />
        <Route
          path="/"
          element={(
        <>

          <Navbar
            navItems={navItems}
            onOpenAuth={handleOpenAuth}
            onStartBooking={handleStartBooking}
            onOpenProfile={handleOpenProfile}
            onGoHome={handleBackToLanding}
            onNavigateSection={handleNavigateSection}
            onSelectCategory={handleSelectCategory}
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
                className="lg:col-span-4 flex flex-col justify-center p-6 md:p-10 rounded-3xl bg-white/80 backdrop-blur-xl border border-gray-200/50 shadow-2xl relative overflow-hidden group hover:border-bird-blue/30 transition-all duration-500"
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

                <div className="relative z-10 flex flex-col justify-center h-full">
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
                      <span className="text-xs font-bold text-green-700 tracking-wider uppercase">Verified local pros</span>
                    </motion.div>

                    <motion.h1
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5, duration: 0.6 }}
                      className="text-3xl md:text-4xl xl:text-5xl font-black mb-4 md:mb-6 leading-tight tracking-tight text-gray-900"
                    >
                      Book trusted home help <br />
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
                        with Fixlife
                      </motion.span>
                    </motion.h1>

                    <motion.p
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.6, duration: 0.6 }}
                      className="text-gray-600 text-base md:text-lg leading-relaxed mb-6 md:mb-8 max-w-md font-medium"
                    >
                      Describe the problem, review nearby professionals, and chat before accepting a quote. <span className="text-gray-900 font-bold">Cleaner booking, less guesswork.</span>
                    </motion.p>
                  </div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7, duration: 0.6 }}
                    className="flex flex-col gap-3 md:gap-4"
                  >
                    <Button
                      onClick={() => handleStartBooking()}
                      variant="primary"
                      size="lg"
                      fullWidth
                      rightIcon={
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                        </svg>
                      }
                    >
                      Book a service
                    </Button>

                    <Button
                      onClick={() => handleNavigateSection('steps')}
                      variant="outline"
                      size="lg"
                      fullWidth
                    >
                      See how it works
                    </Button>

                    <p className="pt-2 text-sm leading-relaxed text-gray-500">
                      Share the problem, add photos, and we help you connect with nearby pros.
                    </p>
                  </motion.div>
                </div>
              </motion.div>
            </section>


            <section id={LANDING_SECTION_IDS.services} className="mb-24">
              <ScrollReveal>
                <div className="flex items-center justify-between mb-10 px-2">
                  <div>
                    <h3 className="text-3xl md:text-4xl font-black text-gray-900 flex items-center gap-4">
                      <span className="w-1.5 h-8 rounded-full bg-bird-blue shadow-[0_0_15px_rgba(0,144,255,0.4)] origin-bottom" />
                      Professional Services
                    </h3>
                    <p className="text-gray-600 mt-2 ml-6 text-sm font-medium">
                      Expert solutions for every home need
                    </p>
                  </div>
                  <Button
                    onClick={() => handleStartBooking()}
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
                {cardsToRender.map((item, i) => (
                  <ScrollReveal key={i} delay={i * 100} className="h-full">
                    <ThreeDCard className="h-full">
                    <div
                      onClick={() => handleStartBooking({ id: item.id_service, name: item.service_name })}
                      className="group h-full cursor-pointer bg-white/80 border border-gray-200/50 rounded-3xl overflow-hidden hover:border-bird-blue/50 transition-all duration-500 hover:shadow-2xl hover:shadow-bird-blue/10 flex flex-col backdrop-blur-sm"
                    >
                      <div className="relative h-48 overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/50 to-transparent z-10" />
                        <motion.img
                          whileHover={{ scale: 1.15 }}
                          transition={{ duration: 0.6 }}
                          src={item.image_url || fallbackCards[0].image_url || ''}
                          alt={item.headline}
                          className="w-full h-full object-cover grayscale-[30%] group-hover:grayscale-0 transition-all duration-700"
                        />
                        <motion.div
                          whileHover={{ scale: 1.1, rotate: 5 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartBooking({ id: item.id_service, name: item.service_name });
                          }}
                          className="absolute top-4 right-4 z-20 w-12 h-12 bg-white/95 backdrop-blur-md rounded-xl border border-gray-200 flex items-center justify-center shadow-lg group-hover:bg-bird-blue group-hover:border-bird-blue group-hover:text-white transition-all duration-300 text-gray-700"
                        >
                          <span className="text-xl">{item.service_icon && item.service_icon.length <= 2 ? item.service_icon : 'FX'}</span>
                        </motion.div>
                      </div>
                      <div className="p-6 flex-1 flex flex-col relative z-20">
                        <div className="flex-1">
                          <h4 className="text-xl font-bold text-gray-900 group-hover:text-bird-blue transition-colors mb-2">{item.headline}</h4>
                          <p className="text-gray-600 text-sm leading-relaxed mb-4 line-clamp-3 font-medium">{item.summary}</p>
                        </div>
                        <motion.div
                          initial={{ x: 0 }}
                          whileHover={{ x: 5 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartBooking({ id: item.id_service, name: item.service_name });
                          }}
                          className="flex items-center gap-2 text-bird-blue font-bold text-sm mt-2 group-hover:gap-3 transition-all"
                        >
                          <span>{item.cta_label || 'Learn More'}</span>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                          </svg>
                        </motion.div>
                      </div>
                    </div>
                    </ThreeDCard>
                  </ScrollReveal>
                ))}
              </div>
            </section>

            <ScrollReveal>
              <section id={LANDING_SECTION_IDS.steps} className="mb-14"><StepsSection onStartBooking={() => handleStartBooking()} /></section>
            </ScrollReveal>

            <ScrollReveal>
              <section id={LANDING_SECTION_IDS.testimonials} className="mb-14">
                <TestimonialsCarousel />
              </section>
            </ScrollReveal>

            <ScrollReveal>
              <section id={LANDING_SECTION_IDS.faq} className="mb-14">
                <FAQSection
                  onBookService={() => handleStartBooking()}
                  onNavigateSection={(target) => handleNavigateSection(target)}
                />
              </section>
            </ScrollReveal>

            <section id={LANDING_SECTION_IDS.professionals} className="mb-24 md:mb-32">
              <ScrollReveal><ProBento onOpenPro={handleOpenProDashboard} onOpenWorkerAuth={handleOpenWorkerAuth} /></ScrollReveal>
            </section>
          </main>
          <Footer
            onOpenPro={handleOpenProDashboard}
            onOpenAdmin={handleOpenAdminDashboard}
            onBookService={() => handleStartBooking()}
            onGoHome={handleBackToLanding}
            onNavigateSection={handleNavigateSection}
          />
        </>
          )}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {showAiSupportWidget ? (
        <Suspense fallback={null}>
          <AiSupportChatWidget />
        </Suspense>
      ) : null}

    </div>
  );
};

export default App;






