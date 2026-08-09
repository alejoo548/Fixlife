import { useCallback, useEffect, useRef } from 'react';
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import '../styles/driver-tour.css';
import i18n from '../i18n';

const TOUR_VERSION = 'v2';

const storageKey = (userId: string | number) => `fixlife_tour_seen_${TOUR_VERSION}_${userId}`;

interface BuildStepsOptions {
  isLoggedIn: boolean;
  onOpenAuth?: () => void;
  onCloseAuth?: () => void;
}

const buildSteps = ({ isLoggedIn, onOpenAuth, onCloseAuth }: BuildStepsOptions): DriveStep[] => {
  const baseSteps: DriveStep[] = [
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
  ];

  // Logged-out visitors get a real, live walkthrough of the actual sign-in
  // and sign-up forms — not just a "click here" pointer — since that's the
  // one flow every new user has to get through before anything else works.
  // Signed-in users skip straight to the account-menu step: the auth modal
  // isn't reachable once logged in, so demoing it would show nothing.
  const authSteps: DriveStep[] = isLoggedIn
    ? []
    : [
        {
          element: '[data-tour="nav-account"]',
          popover: {
            title: i18n.t('onboardingTour.accountLoggedOut.title'),
            description: i18n.t('onboardingTour.accountLoggedOut.description'),
            side: 'bottom',
            onNextClick: (_element, _step, opts) => {
              onOpenAuth?.();
              window.setTimeout(() => opts.driver.moveNext(), 250);
            },
          },
        },
        {
          element: '[data-tour="auth-signin-email"]',
          waitForElement: 2000,
          popover: {
            title: i18n.t('onboardingTour.authSignIn.title'),
            description: i18n.t('onboardingTour.authSignIn.description'),
            side: 'right',
          },
        },
        {
          element: '[data-tour="auth-signin-submit"]',
          waitForElement: 2000,
          popover: {
            title: i18n.t('onboardingTour.authSignInSubmit.title'),
            description: i18n.t('onboardingTour.authSignInSubmit.description'),
            side: 'top',
            onNextClick: (_element, _step, opts) => {
              const toggle = document.querySelector<HTMLElement>('[data-tour="auth-toggle-signup"]');
              toggle?.click();
              window.setTimeout(() => opts.driver.moveNext(), 350);
            },
          },
        },
        {
          element: '[data-tour="auth-signup-form"]',
          waitForElement: 2000,
          popover: {
            title: i18n.t('onboardingTour.authSignUp.title'),
            description: i18n.t('onboardingTour.authSignUp.description'),
            side: 'left',
            onNextClick: (_element, _step, opts) => {
              onCloseAuth?.();
              window.setTimeout(() => opts.driver.moveNext(), 200);
            },
          },
        },
      ];

  const loggedInAccountStep: DriveStep[] = isLoggedIn
    ? [
        {
          element: '[data-tour="nav-account"]',
          popover: {
            title: i18n.t('onboardingTour.accountLoggedIn.title'),
            description: i18n.t('onboardingTour.accountLoggedIn.description'),
            side: 'bottom',
          },
        },
      ]
    : [];

  const replayStep: DriveStep[] = [
    {
      element: '[data-tour="help-tour-button"]',
      popover: {
        title: i18n.t('onboardingTour.replay.title'),
        description: i18n.t('onboardingTour.replay.description'),
        side: 'left',
      },
    },
  ];

  return [...baseSteps, ...loggedInAccountStep, ...authSteps, ...replayStep];
};

interface UseOnboardingTourOptions {
  userId?: string | number | null;
  isLoggedIn: boolean;
  autoStart?: boolean;
  onOpenAuth?: () => void;
  onCloseAuth?: () => void;
}

export function useOnboardingTour({
  userId,
  isLoggedIn,
  autoStart = true,
  onOpenAuth,
  onCloseAuth,
}: UseOnboardingTourOptions) {
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
      onCloseClick: (_element, _step, opts) => {
        // Leaving mid-tour shouldn't strand the user with the auth modal
        // pinned open if we were in the middle of the sign-in/sign-up demo.
        onCloseAuth?.();
        opts.driver.destroy();
      },
      steps: buildSteps({ isLoggedIn, onOpenAuth, onCloseAuth }),
    });
    tourDriver.drive();
  }, [isLoggedIn, onOpenAuth, onCloseAuth]);

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
