import { useCallback, useEffect, useRef } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import '../styles/driver-tour.css';
import i18n from '../i18n';

const TOUR_VERSION = 'v1';

const storageKey = (userId: string | number) => `fixlife_tour_seen_${TOUR_VERSION}_${userId}`;

const buildSteps = (isLoggedIn: boolean): DriveStep[] => [
  {
    popover: {
      title: i18n.t('onboardingTour.welcomeTitle'),
      description:
        '<div class="fixlife-tour-welcome-video">' +
        '<video autoplay loop muted playsinline preload="auto" disablepictureinpicture disableremoteplayback>' +
        '<source src="/los_ojos_que_le_pusiste_no_son.mp4" type="video/mp4" />' +
        '</video>' +
        '</div>' +
        `<p class="fixlife-tour-welcome-text">${i18n.t('onboardingTour.welcomeSubtext')}</p>`,
      popoverClass: 'fixlife-tour-popover fixlife-tour-welcome',
    },
  },
  {
    element: '[data-tour="nav-services"]',
    popover: {
      title: i18n.t('onboardingTour.services.title'),
      description: i18n.t('onboardingTour.services.description'),
      side: 'bottom',
    },
  },
  {
    element: '[data-tour="nav-professionals"]',
    popover: {
      title: i18n.t('onboardingTour.professionals.title'),
      description: i18n.t('onboardingTour.professionals.description'),
      side: 'bottom',
    },
  },
  {
    element: '[data-tour="nav-help"]',
    popover: {
      title: i18n.t('onboardingTour.help.title'),
      description: i18n.t('onboardingTour.help.description'),
      side: 'bottom',
    },
  },
  {
    element: '[data-tour="nav-reviews"]',
    popover: {
      title: i18n.t('onboardingTour.reviews.title'),
      description: i18n.t('onboardingTour.reviews.description'),
      side: 'bottom',
    },
  },
  {
    element: '[data-tour="nav-book-service"]',
    popover: {
      title: i18n.t('onboardingTour.bookService.title'),
      description: i18n.t('onboardingTour.bookService.description'),
      side: 'bottom',
    },
  },
  {
    element: '[data-tour="nav-account"]',
    popover: {
      title: isLoggedIn ? i18n.t('onboardingTour.accountLoggedIn.title') : i18n.t('onboardingTour.accountLoggedOut.title'),
      description: isLoggedIn
        ? i18n.t('onboardingTour.accountLoggedIn.description')
        : i18n.t('onboardingTour.accountLoggedOut.description'),
      side: 'bottom',
    },
  },
  {
    element: '[data-tour="help-tour-button"]',
    popover: {
      title: i18n.t('onboardingTour.replay.title'),
      description: i18n.t('onboardingTour.replay.description'),
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
      nextBtnText: i18n.t('onboardingTour.next'),
      prevBtnText: i18n.t('onboardingTour.back'),
      doneBtnText: i18n.t('onboardingTour.gotIt'),
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
