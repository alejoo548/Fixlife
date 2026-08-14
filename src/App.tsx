import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApplyScopedLanguage } from './hooks/useScopedLanguage';
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
import { getRememberedProtectedRoute, clearRememberedProtectedRoute, consumeLogoutNotice, hasRole, isAuthenticated, logoutAndReload, getToken, getActiveAuthToken } from './utils/session';
import { SupportChatWidget } from './components/support/SupportChatWidget';
import { showSweetToast } from './utils/sweetAlert';
import { API_ENDPOINTS } from './config/api';
import { isExternalStockImage, normalizeImageUrl } from './utils/imageUrls';
import { getHeroSlides, fetchHeroSlides, HeroSlideContent } from './utils/heroSlides';
import { ProtectedRoute } from './routes/ProtectedRoute';
import UserAmbientBackground from './components/common/UserAmbientBackground';
import { localizeClientLearnMore, localizeClientServiceDescription, localizeClientServiceName } from './utils/clientTranslations';

const ServiceRequestWizard = lazy(() =>
  import('./components/modals/ServiceRequestWizard').then((module) => ({
    default: module.ServiceRequestWizard,
  }))
);
const ProDashboard = lazy(() =>
  import('./components/modals/ProDashboard').then((module) => ({
    default: module.ProDashboard,
  }))
);
const AdminApp = lazy(() =>
  import('./features/admin/AdminApp').then((module) => ({
    default: module.AdminApp,
  }))
);
const PaymentCheckoutPage = lazy(() => import('./pages/PaymentCheckoutPage'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const LeaveReview = lazy(() => import('./pages/LeaveReview'));
const MyServicesHistory = lazy(() => import('./pages/MyServicesHistory'));

const navItems: NavItemType[] = [
  { name: "Services" },
  { name: "Professionals" },
  {
    name: "Help",
    items: ["Support", "How it works"]
  },
  { name: "Reviews" }
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

const localServiceImageByName: Record<string, string> = {
  plumbing: '/landing-home-repair.jpg',
  plumber: '/landing-home-repair.jpg',
  electrical: '/landing-home-repair.jpg',
  electrician: '/landing-home-repair.jpg',
  mechanic: '/landing-home-repair.jpg',
  auto: '/landing-home-repair.jpg',
  carpentry: '/landing-carpentry.jpg',
  carpenter: '/landing-carpentry.jpg',
  gardening: '/landing-gardening.jpg',
  landscaping: '/landing-gardening.jpg',
  painting: '/landing-renovation.jpg',
  renovation: '/landing-renovation.jpg',
  cleaning: '/landing-renovation.jpg',
  home: '/landing-home-repair.jpg',
};

const getLocalServiceImage = (serviceName?: string | null) => {
  const normalized = (serviceName || '').toLowerCase();
  const match = Object.entries(localServiceImageByName).find(([key]) => normalized.includes(key));
  return match?.[1] || '/landing-home-repair.jpg';
};

const normalizeServiceCardImage = (card: HomeServiceCard): HomeServiceCard => {
  const imageUrl = normalizeImageUrl(card.image_url);

  if (!imageUrl || isExternalStockImage(imageUrl)) {
    return {
      ...card,
      image_url: getLocalServiceImage(card.service_name),
    };
  }

  return card;
};

const LANDING_SECTION_IDS = {
  services: 'services-section',
  steps: 'steps-section',
  testimonials: 'testimonials-section',
  faq: 'faq-section',
  professionals: 'professionals-section',
} as const;

type LandingSectionTarget = keyof typeof LANDING_SECTION_IDS;

const AppRouteFallback: React.FC<{ title?: string; subtitle?: string }> = ({
  title,
  subtitle,
}) => {
  const { t } = useTranslation();
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[120]">
      <div className="flex items-center gap-2 rounded-full border border-white/70 bg-white/82 px-3 py-2 shadow-[0_14px_34px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        <div className="h-3.5 w-3.5 rounded-full border-2 border-bird-blue/20 border-t-bird-blue animate-spin" />
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-bird-blue">{title ?? t('landing.routeFallback.default.title')}</p>
          <p className="text-[11px] text-slate-500">{subtitle ?? t('landing.routeFallback.default.subtitle')}</p>
        </div>
      </div>
    </div>
  );
};

const SessionAwareRouteFallback: React.FC = () => {
  const location = useLocation();

  const isAdminSession = isAuthenticated('admin') && hasRole('admin', 'admin');
  const isWorkerSession = isAuthenticated('worker') && hasRole('worker', 'worker');
  const isClientSession = isAuthenticated();
  const { pathname, search } = location;

  const normalizedPath = pathname.toLowerCase();
  const clientFlowPrefixes = ['/app', '/checkout', '/profile'];
  const adminFlowPrefixes = ['/admin', '/dashboard/admin'];
  const workerFlowPrefixes = ['/pro', '/worker', '/dashboard/pro'];

  if (adminFlowPrefixes.some((prefix) => normalizedPath.startsWith(prefix))) {
    return <Navigate to={isAdminSession ? '/admin-dashboard' : '/'} replace />;
  }

  if (workerFlowPrefixes.some((prefix) => normalizedPath.startsWith(prefix))) {
    return <Navigate to={isWorkerSession ? '/pro-dashboard' : '/'} replace />;
  }

  if (clientFlowPrefixes.some((prefix) => normalizedPath.startsWith(prefix))) {
    if (!isClientSession) {
      return <Navigate to="/" replace />;
    }

    if (normalizedPath.startsWith('/checkout')) {
      return <Navigate to="/app" replace />;
    }

    if (normalizedPath.startsWith('/profile')) {
      return <Navigate to="/profile" replace />;
    }

    return <Navigate to={`/app${search || ''}`} replace />;
  }

  if (isAdminSession) {
    return <Navigate to="/admin-dashboard" replace />;
  }

  if (isWorkerSession) {
    return <Navigate to="/pro-dashboard" replace />;
  }

  return <Navigate to="/" replace />;
};

const RootRouteGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const adminRoute = getRememberedProtectedRoute('admin') || '/admin-dashboard';
  const workerRoute = getRememberedProtectedRoute('worker') || '/pro-dashboard';
  const clientRoute = getRememberedProtectedRoute('client');

  if (isAuthenticated('admin') && hasRole('admin', 'admin')) {
    return <Navigate to={adminRoute} replace />;
  }

  if (isAuthenticated('worker') && hasRole('worker', 'worker')) {
    return <Navigate to={workerRoute} replace />;
  }

  if (isAuthenticated() && clientRoute && clientRoute !== '/') {
    return <Navigate to={clientRoute} replace />;
  }

  return <>{children}</>;
};

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
  const openHistory = searchParams.get('openHistory') === 'true';

  return (
    <ServiceRequestWizard
      isOpen={true}
      onClose={onClose}
      initialServiceId={Number.isFinite(serviceId) && serviceId > 0 ? serviceId : undefined}
      initialServiceName={serviceName}
      onOpenCheckout={onOpenCheckout}
      openOnHistory={openHistory}
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


const DEFAULT_HERO_TEXT = {
  headline_prefix: 'Meet Fixlife, your',
  description: 'Fixlife is a personal assistant that helps you stay organized, find trusted home professionals, and get chores done. All through messages.',
  roles: ['personal assistant.', 'trusted plumber.', 'expert electrician.', 'reliable cleaner.', 'local handyman.'],
};

const DEFAULT_HERO_TEXT_ES = {
  headline_prefix: 'Conoce a Fixlife, tu',
  description: 'Fixlife es un asistente personal que te ayuda a mantenerte organizado, encontrar profesionales de confianza para tu hogar y completar tareas. Todo a través de mensajes.',
  roles: ['asistente personal.', 'plomero de confianza.', 'electricista experto.', 'limpiador confiable.', 'manitas local.'],
};

const defaultHeroTextForLang = (lang: string) => (lang === 'es' ? DEFAULT_HERO_TEXT_ES : DEFAULT_HERO_TEXT);

const HERO_TEXT_CACHE_KEY = 'fixlife_hero_text_v1';
const heroTextCacheKeyForLang = (lang: string) => `${HERO_TEXT_CACHE_KEY}_${lang === 'es' ? 'es' : 'en'}`;

const getHeroText = (lang: string) => {
  try {
    const cached = localStorage.getItem(heroTextCacheKeyForLang(lang));
    if (cached) return JSON.parse(cached) as typeof DEFAULT_HERO_TEXT;
  } catch { /* noop */ }
  return defaultHeroTextForLang(lang);
};

const fetchHeroText = async (lang: string): Promise<typeof DEFAULT_HERO_TEXT> => {
  const fallback = defaultHeroTextForLang(lang);
  try {
    const res = await fetch(`${API_ENDPOINTS.admin.heroTextPublic}?lang=${lang === 'es' ? 'es' : 'en'}`);
    const data = await res.json();
    if (res.ok && data.success && data.roles && data.headline_prefix) {
      const result = { headline_prefix: String(data.headline_prefix), description: String(data.description || fallback.description), roles: Array.isArray(data.roles) ? data.roles.map(String) : fallback.roles };
      try { localStorage.setItem(heroTextCacheKeyForLang(lang), JSON.stringify(result)); } catch { /* noop */ }
      return result;
    }
  } catch { /* noop */ }
  return getHeroText(lang);
};

const App: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  useApplyScopedLanguage();
  const [roleIndex, setRoleIndex] = useState(0);
  const [heroText, setHeroText] = useState<typeof DEFAULT_HERO_TEXT>(() => getHeroText(i18n.language));

  useEffect(() => {
    setRoleIndex(0);
    fetchHeroText(i18n.language).then((data) => setHeroText(data));
  }, [i18n.language]);

  useEffect(() => {
    if (!heroText.roles.length) return;
    const interval = setInterval(() => {
      setRoleIndex((prev) => (prev + 1) % heroText.roles.length);
    }, 2800);
    return () => clearInterval(interval);
  }, [heroText.roles.length]);

  const [heroSlides, setHeroSlides] = useState<HeroSlideContent[]>(() => getHeroSlides(i18n.language === 'es' ? 'es' : 'en'));
  const [currentHeroSlide, setCurrentHeroSlide] = useState(0);

  useEffect(() => {
    const lang = i18n.language === 'es' ? 'es' : 'en';
    fetchHeroSlides(lang).then((fetched) => {
      if (Array.isArray(fetched) && fetched.length > 0) {
        setHeroSlides(fetched);
        setCurrentHeroSlide(0);
      }
    });
  }, [i18n.language]);

  useEffect(() => {
    if (heroSlides.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentHeroSlide((prev) => (prev + 1) % heroSlides.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [heroSlides.length]);

  useEffect(() => {
    heroSlides.forEach((slide) => {
      if (!slide.image) return;
      const img = new Image();
      img.src = slide.image;
    });
  }, [heroSlides]);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [isWorkerAuthOpen, setIsWorkerAuthOpen] = useState(false);
  const [workerAuthMode, setWorkerAuthMode] = useState<'signin' | 'signup'>('signup');
  const [serviceCards, setServiceCards] = useState<HomeServiceCard[]>([]);
  const [pendingSection, setPendingSection] = useState<LandingSectionTarget | null>(null);
  const [pendingBookingPath, setPendingBookingPath] = useState<string | null>(null);
  const isLandingRoute = location.pathname === '/';

  useEffect(() => {
    if (consumeLogoutNotice()) {
      void showSweetToast({ tone: 'success', message: t('userProfile.messages.logoutSuccess') });
    }
  }, []);

  useEffect(() => {
    const fetchServiceCards = async () => {
      try {
        const res = await fetch(API_ENDPOINTS.services.cards);
        const data = await res.json();
        if (data?.success && Array.isArray(data.cards)) {
          setServiceCards(data.cards.map(normalizeServiceCardImage));
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

  const handleCloseAuth = () => {
    setIsAuthOpen(false);
  };

  const handleStartBooking = (service?: { id: number; name: string } | null) => {
    const bookingPath = buildBookingPath(service);

    if (!isAuthenticated()) {
      setPendingBookingPath(bookingPath);
      handleOpenAuth('signin');
      return;
    }

    navigate(bookingPath, { replace: true });
    window.scrollTo(0, 0);
  };

  const handleClientLogin = () => {
    if (!pendingBookingPath) return;
    navigate(pendingBookingPath, { replace: true });
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
    navigate('/admin-dashboard/overview', { replace: true });
    window.scrollTo(0, 0);
  }

  const handleOpenWorkerAuth = (mode: 'signin' | 'signup') => {
    setWorkerAuthMode(mode);
    setIsWorkerAuthOpen(true);
  }

  const handleCloseWorkerAuth = () => {
    setIsWorkerAuthOpen(false);
  }

  const handleOpenProfile = () => {
    if (!isAuthenticated()) {
      handleOpenAuth('signin');
      return;
    }
    navigate('/profile', { replace: true });
    window.scrollTo(0, 0);
  }

  // Memoized: passed as onClose to lazy-loaded dashboards (ProDashboard,
  // AdminApp) whose mount effects key off this reference. An unmemoized
  // function here would get recreated on every App render — including the
  // hero-rotation interval ticks that fire regardless of route — and retrigger
  // those effects (and their status-sync fetches) every couple seconds.
  const handleBackToLanding = useCallback(() => {
    setPendingSection(null);
    clearRememberedProtectedRoute('client');
    const leavingProtectedView =
      location.pathname.startsWith('/admin-dashboard') ||
      location.pathname === '/pro-dashboard' ||
      location.pathname === '/profile' ||
      location.pathname.startsWith('/checkout/');

    navigate('/', { replace: leavingProtectedView });
    window.scrollTo(0, 0);
  }, [location.pathname, navigate]);

  const handleWorkerSignOut = () => {
    logoutAndReload('worker');
  };

  const handleBackToRequests = () => {
    navigate('/app', { replace: true });
    window.scrollTo(0, 0);
  };

  const handleOpenCheckout = (requestId: number) => {
    if (!requestId) return;
    navigate(`/checkout/${requestId}`, { replace: true });
    window.scrollTo(0, 0);
  };

  const fallbackCards: HomeServiceCard[] = [
    {
      id_card: 0,
      id_service: 0,
      image_url: '/landing-home-repair.jpg',
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
      image_url: '/landing-home-repair.jpg',
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
      image_url: '/landing-home-repair.jpg',
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
      image_url: '/landing-carpentry.jpg',
      badge: 'POPULAR',
      headline: 'Carpentry',
      summary: 'Furniture design, door repair, and structure assembly.',
      cta_label: 'Learn More',
      service_name: 'Carpentry',
      service_icon: 'CA',
    },
  ];

  const cardsToRender = serviceCards.length > 0 ? serviceCards.slice(0, 8) : fallbackCards;

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
    <div className="min-h-screen bg-white text-gray-900 selection:bg-bird-blue selection:text-white overflow-x-hidden font-sans flex flex-col relative transition-colors duration-500 dark:bg-slate-950 dark:text-slate-100">
      <UserAmbientBackground />
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
              <Suspense fallback={<AppRouteFallback title={t('landing.routeFallback.bookingFlow.title')} subtitle={t('landing.routeFallback.bookingFlow.subtitle')} />}>
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
            <ProtectedRoute lockHistory>
              <Suspense fallback={<AppRouteFallback title={t('landing.routeFallback.checkout.title')} subtitle={t('landing.routeFallback.checkout.subtitle')} />}>
                <CheckoutRoute onBack={handleBackToRequests} />
              </Suspense>
            </ProtectedRoute>
          )}
        />
        <Route
          path="/pro-dashboard"
          element={(
            <ProtectedRoute scope="worker" role="worker" lockHistory>
              <Suspense fallback={<AppRouteFallback title={t('landing.routeFallback.workerDashboard.title')} subtitle={t('landing.routeFallback.workerDashboard.subtitle')} />}>
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
          path="/admin-dashboard/*"
          element={(
            <ProtectedRoute scope="admin" role="admin" lockHistory>
              <Suspense fallback={<AppRouteFallback title={t('landing.routeFallback.adminDashboard.title')} subtitle={t('landing.routeFallback.adminDashboard.subtitle')} />}>
                <AdminApp
                  isOpen={true}
                  onClose={handleBackToLanding}
                />
              </Suspense>
            </ProtectedRoute>
          )}
        />
        <Route
          path="/mis-servicios"
          element={(
            <ProtectedRoute>
              <Navbar
                navItems={navItems}
                onOpenAuth={handleOpenAuth}
                onCloseAuth={handleCloseAuth}
                onOpenWorkerAuth={handleOpenWorkerAuth}
                onCloseWorkerAuth={handleCloseWorkerAuth}
                onStartBooking={handleStartBooking}
                onOpenProfile={handleOpenProfile}
                onGoHome={handleBackToLanding}
                onNavigateSection={handleNavigateSection}
                onSelectCategory={handleSelectCategory}
              />
              <Suspense fallback={<AppRouteFallback title={t('landing.routeFallback.myServices.title')} subtitle={t('landing.routeFallback.myServices.subtitle')} />}>
                <MyServicesHistory onGoHome={handleBackToLanding} />
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
                onCloseAuth={handleCloseAuth}
                onOpenWorkerAuth={handleOpenWorkerAuth}
                onCloseWorkerAuth={handleCloseWorkerAuth}
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
            <Suspense fallback={<AppRouteFallback title={t('landing.routeFallback.recovery.title')} subtitle={t('landing.routeFallback.recovery.subtitle')} />}>
              <ForgotPassword />
            </Suspense>
          )}
        />
        <Route
          path="/reset-password"
          element={(
            <Suspense fallback={<AppRouteFallback title={t('landing.routeFallback.recovery.title')} subtitle={t('landing.routeFallback.recovery.subtitle')} />}>
              <ResetPassword />
            </Suspense>
          )}
        />
        <Route
          path="/leave-review"
          element={(
            <Suspense fallback={<AppRouteFallback title={t('landing.routeFallback.reviewForm.title')} subtitle={t('landing.routeFallback.reviewForm.subtitle')} />}>
              <LeaveReview onOpenAuth={handleOpenAuth} />
            </Suspense>
          )}
        />
        <Route
          path="/"
          element={(
        <RootRouteGuard>
        <>

          <Navbar
            navItems={navItems}
            onOpenAuth={handleOpenAuth}
            onCloseAuth={handleCloseAuth}
            onOpenWorkerAuth={handleOpenWorkerAuth}
            onCloseWorkerAuth={handleCloseWorkerAuth}
            onStartBooking={handleStartBooking}
            onOpenProfile={handleOpenProfile}
            onGoHome={handleBackToLanding}
            onNavigateSection={handleNavigateSection}
            onSelectCategory={handleSelectCategory}
          />


          {/* Full-width Hero Section with Background Image Carousel */}
          <section className="relative w-full overflow-hidden min-h-[580px] md:min-h-[680px] flex items-center justify-center pt-28 pb-16 px-4 md:px-8 border-b border-slate-200/50 dark:border-white/10 shadow-sm bg-slate-950">
            {/* Background Carousel */}
            <div className="absolute inset-0 z-0 select-none pointer-events-none">
              <AnimatePresence mode="wait">
                {heroSlides.map((slide, index) => {
                  if (index !== currentHeroSlide) return null;
                  return (
                    <motion.div
                      key={slide.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 1.2, ease: "easeInOut" }}
                      className="absolute inset-0"
                    >
                      <motion.img
                        initial={{ scale: 1 }}
                        animate={{ scale: 1.05 }}
                        transition={{ duration: 6, ease: "easeOut" }}
                        src={slide.image}
                        alt={slide.title}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              {/* Visual overlay for contrast and premium feel - Adaptive for light/dark mode */}
              <div className="absolute inset-0 bg-slate-950/45 dark:bg-slate-950/75 backdrop-blur-[2px] z-10" />
            </div>

            {/* Centered Hero Content */}
            <div className="relative z-20 w-full max-w-[1400px] mx-auto px-4 lg:px-8 flex flex-col items-center">
              <div className="max-w-4xl text-center flex flex-col items-center w-full">
                <motion.h1
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.1 }}
                  className="text-4xl sm:text-5xl md:text-7xl font-sans font-black tracking-tight text-white leading-[1.08] mb-6 flex flex-col items-center justify-center drop-shadow-md text-center w-full"
                >
                  <span className="w-full break-words">{heroText.headline_prefix}</span>
                  <span className="relative flex items-center justify-center w-full min-h-[1.25em] mt-1 px-2 overflow-hidden">
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={roleIndex}
                        initial={{ opacity: 0, y: 25, filter: "blur(6px)" }}
                        animate={{
                          opacity: 1,
                          y: 0,
                          filter: "blur(0px)",
                          backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"]
                        }}
                        exit={{ opacity: 0, y: -25, filter: "blur(6px)" }}
                        transition={{
                          duration: 0.5,
                          ease: [0.22, 1, 0.36, 1],
                          backgroundPosition: {
                            duration: 5,
                            repeat: Infinity,
                            ease: "linear"
                          }
                        }}
                        className="block w-full max-w-full text-center font-sans font-black text-transparent bg-clip-text bg-gradient-to-r from-bird-blue via-bird-yellow to-bird-orange leading-[1.08] text-[clamp(1.6rem,6vw,4.5rem)]"
                        style={{ backgroundSize: "200% 200%" }}
                      >
                        {heroText.roles[roleIndex % heroText.roles.length]}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="text-slate-200 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mb-8 font-medium drop-shadow-md text-center"
                >
                   {heroText.description}
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                >
                  <button
                    onClick={() => handleStartBooking()}
                    className="relative inline-flex items-center gap-3.5 px-10 py-5 rounded-full bg-gradient-to-r from-bird-blue via-indigo-600 to-bird-orange text-white font-black text-sm tracking-wider uppercase active:scale-95 duration-300 group overflow-hidden shadow-[0_12px_30px_rgba(0,144,255,0.35)] hover:shadow-[0_15px_40px_rgba(99,102,241,0.55)] transition-all"
                  >
                    {/* Inner dark glass mask to create the liquid border effect */}
                    <span className="absolute inset-[1.5px] rounded-full bg-slate-950/90 group-hover:bg-slate-950/80 transition-colors duration-300 backdrop-blur-2xl z-0" />
                    
                    {/* Liquid glass light sheen */}
                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out z-10 pointer-events-none" />
                    
                    {/* Pulsing glow background in hover */}
                    <span className="absolute inset-0 bg-gradient-to-r from-bird-blue/20 via-indigo-600/20 to-bird-orange/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-0" />
                    
                    <svg className="relative z-20 w-5 h-5 text-bird-yellow shrink-0 fill-current drop-shadow-[0_2px_5px_rgba(0,0,0,0.3)] group-hover:scale-110 group-hover:rotate-6 transition-all duration-300" viewBox="0 0 24 24">
                      <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z" />
                    </svg>
                    <span className="relative z-20 text-white tracking-widest text-xs font-black drop-shadow-[0_2px_5px_rgba(0,0,0,0.3)]">{t('landing.getStarted')}</span>
                  </button>
                </motion.div>
              </div>
            </div>

            {/* Slide Text Caption (Bottom Left) — hidden on small mobile: the centered
                headline/description/CTA above can grow taller than the section on narrow
                screens (especially longer translations), and this absolutely-positioned
                card would then overlap the CTA button instead of sitting below it. */}
            <div className="hidden sm:block absolute bottom-6 left-6 md:bottom-8 md:left-8 z-20 max-w-[280px] sm:max-w-md pointer-events-none select-none">
              <AnimatePresence mode="wait">
                {heroSlides.map((slide, index) => {
                  if (index !== currentHeroSlide) return null;
                  return (
                    <motion.div
                      key={slide.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.6 }}
                      className="p-4 md:p-5 rounded-2xl bg-slate-950/60 border border-white/10 backdrop-blur-md text-white shadow-xl"
                    >
                      <span className="inline-block px-2.5 py-0.5 mb-2 text-[10px] font-black tracking-wider text-black bg-bird-yellow rounded-full uppercase">
                        {slide.tag || "FIXLIFE"}
                      </span>
                      <h3 className="text-sm md:text-base font-bold text-white mb-1">
                        {slide.title}
                      </h3>
                      <p className="text-xs text-slate-300 line-clamp-2">
                        {slide.description}
                      </p>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </section>

          <main className="relative z-10 pt-16 px-4 lg:px-8 max-w-[1400px] mx-auto pb-32 flex-grow w-full">

            <section id={LANDING_SECTION_IDS.services} className="mb-28 md:mb-36">
              <ScrollReveal>
                <div className="flex items-center justify-between mb-10 px-2">
                  <div>
                    <h3 className="text-3xl md:text-4xl font-black text-slate-900 flex items-center gap-4 dark:text-slate-100">
                      <span className="w-1.5 h-8 rounded-full bg-bird-blue shadow-[0_0_15px_rgba(0,144,255,0.4)] origin-bottom" />
                      {t('landing.servicesTitle')}
                    </h3>
                    <p className="text-slate-600 mt-2 ml-6 text-sm font-medium dark:text-slate-400">
                      {t('landing.servicesSubtitle')}
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
                    {t('landing.servicesViewAll')}
                  </Button>
                </div>
              </ScrollReveal>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {cardsToRender.map((item, i) => {
                  const localizedHeadline = localizeClientServiceName(item.headline || item.service_name, i18n.language);
                  const localizedSummary = localizeClientServiceDescription(item.summary, i18n.language);
                  const localizedCta = item.cta_label === 'Learn More'
                    ? localizeClientLearnMore(t)
                    : item.cta_label || localizeClientLearnMore(t);

                  return (
                  <ScrollReveal key={i} delay={i * 100} className="h-full">
                    <ThreeDCard className="h-full">
                    <div
                      onClick={() => handleStartBooking({ id: item.id_service, name: item.service_name })}
                      className="group h-full cursor-pointer bg-white/80 border border-gray-200/50 rounded-3xl overflow-hidden hover:border-bird-blue/50 transition-all duration-500 hover:shadow-2xl hover:shadow-bird-blue/10 flex flex-col backdrop-blur-sm dark:bg-slate-900/70 dark:border-white/10"
                    >
                      <div className="relative h-48 overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/50 to-transparent z-10 dark:from-slate-900 dark:via-slate-900/50" />
                        <motion.img
                          whileHover={{ scale: 1.15 }}
                          transition={{ duration: 0.6 }}
                          src={item.image_url || fallbackCards[0].image_url || ''}
                          alt={localizedHeadline}
                          loading="lazy"
                          decoding="async"
                          onError={(e) => {
                            const fallback = getLocalServiceImage(item.service_name);
                            if (!e.currentTarget.src.endsWith(fallback)) {
                              e.currentTarget.src = fallback;
                            }
                          }}
                          className="w-full h-full object-cover grayscale-[30%] group-hover:grayscale-0 transition-all duration-700"
                        />
                        <motion.div
                          whileHover={{ scale: 1.1, rotate: 5 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartBooking({ id: item.id_service, name: item.service_name });
                          }}
                          className="absolute top-4 right-4 z-20 w-12 h-12 bg-white/95 backdrop-blur-md rounded-xl border border-gray-200 flex items-center justify-center shadow-lg group-hover:bg-bird-blue group-hover:border-bird-blue group-hover:text-white transition-all duration-300 text-slate-700 dark:bg-slate-900/80 dark:border-white/10 dark:text-slate-300"
                        >
                          <span className="text-xl">{item.service_icon && item.service_icon.length <= 2 ? item.service_icon : 'FX'}</span>
                        </motion.div>
                      </div>
                      <div className="p-6 flex-1 flex flex-col relative z-20">
                        <div className="flex-1">
                          <h4 className="text-xl font-bold text-slate-900 group-hover:text-bird-blue transition-colors mb-2 dark:text-slate-100">{localizedHeadline}</h4>
                          <p className="text-slate-600 text-sm leading-relaxed mb-4 line-clamp-3 font-medium dark:text-slate-400">{localizedSummary}</p>
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
                          <span>{localizedCta}</span>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                          </svg>
                        </motion.div>
                      </div>
                    </div>
                    </ThreeDCard>
                  </ScrollReveal>
                  );
                })}
              </div>
            </section>

            <ScrollReveal>
              <section id={LANDING_SECTION_IDS.testimonials} className="mb-28 md:mb-36">
                <TestimonialsCarousel />
              </section>
            </ScrollReveal>

            <ScrollReveal>
              <section id={LANDING_SECTION_IDS.steps} className="mb-28 md:mb-36"><StepsSection /></section>
            </ScrollReveal>

            <ScrollReveal>
              <section id={LANDING_SECTION_IDS.faq} className="mb-28 md:mb-36">
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
        </RootRouteGuard>
          )}
        />
        <Route path="*" element={<SessionAwareRouteFallback />} />
      </Routes>

      {}
      {(() => {
        const { token, scope } = getActiveAuthToken();
        if (!token || scope === 'admin') return null;
        return <SupportChatWidget token={token} scope={scope || undefined} />;
      })()}

    </div>
  );
};

export default App;
