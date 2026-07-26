import { useCallback, useEffect, useRef } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import '../styles/driver-tour.css';

const TOUR_VERSION = 'v1';

const storageKey = (userId: string | number) => `fixlife_tour_seen_${TOUR_VERSION}_${userId}`;

const buildSteps = (isLoggedIn: boolean): DriveStep[] => [
  {
    popover: {
      title: '👋 Welcome to Fixlife!',
      description:
        '<div class="fixlife-tour-welcome-video">' +
        '<video autoplay loop muted playsinline preload="auto" disablepictureinpicture disableremoteplayback>' +
        '<source src="/los_ojos_que_le_pusiste_no_son.mp4" type="video/mp4" />' +
        '</video>' +
        '</div>' +
        '<p class="fixlife-tour-welcome-text">Quick tour — just a few seconds.</p>',
      popoverClass: 'fixlife-tour-popover fixlife-tour-welcome',
    },
  },
  {
    element: '[data-tour="nav-services"]',
    popover: {
      title: 'Browse services',
      description: 'See every service category — plumbing, electrical, cleaning, and more.',
      side: 'bottom',
    },
  },
  {
    element: '[data-tour="nav-professionals"]',
    popover: {
      title: 'Meet the pros',
      description: 'Check verified local professionals before you book.',
      side: 'bottom',
    },
  },
  {
    element: '[data-tour="nav-help"]',
    popover: {
      title: 'Need a hand?',
      description: 'Find answers or contact support anytime here.',
      side: 'bottom',
    },
  },
  {
    element: '[data-tour="nav-reviews"]',
    popover: {
      title: 'Real feedback',
      description: 'See what other customers say about our pros.',
      side: 'bottom',
    },
  },
  {
    element: '[data-tour="nav-book-service"]',
    popover: {
      title: 'Book in seconds',
      description: 'Ready to fix something? Start your request right here.',
      side: 'bottom',
    },
  },
  {
    element: '[data-tour="nav-account"]',
    popover: {
      title: isLoggedIn ? 'Your account' : 'Sign up or sign in',
      description: isLoggedIn
        ? 'Manage your profile and track your requests here.'
        : 'Create an account or sign in to track your requests.',
      side: 'bottom',
    },
  },
  {
    element: '[data-tour="help-tour-button"]',
    popover: {
      title: 'Need this again?',
      description: 'You can replay this tour anytime — just tap the question mark icon.',
      side: 'left',
    },
  },
];

interface UseOnboardingTourOptions {
  userId?: string | number | null;
  isLoggedIn: boolean;
  autoStart?: boolean;
}

export function useOnboardingTour({ userId, isLoggedIn, autoStart = true }: UseOnboardingTourOptions) {
  const autoStartedRef = useRef(false);

  const startTour = useCallback(() => {
    const tourDriver = driver({
      showProgress: true,
      allowClose: true,
      overlayOpacity: 0.6,
      stagePadding: 6,
      stageRadius: 12,
      popoverClass: 'fixlife-tour-popover',
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Got it',
      steps: buildSteps(isLoggedIn),
    });
    tourDriver.drive();
  }, [isLoggedIn]);

  useEffect(() => {
    if (!autoStart || autoStartedRef.current || !isLoggedIn || !userId) return;
    const key = storageKey(userId);

    if (typeof window === 'undefined' || window.localStorage.getItem(key)) return;

    autoStartedRef.current = true;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(key, '1');
      startTour();
    }, 600);

    return () => window.clearTimeout(timer);
  }, [autoStart, userId, startTour]);

  return { startTour };
}
