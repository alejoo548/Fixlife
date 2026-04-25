import React, { useEffect, useRef, useState } from 'react';

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
}

const revealCallbacks = new WeakMap<Element, () => void>();
let sharedRevealObserver: IntersectionObserver | null = null;

const getSharedRevealObserver = () => {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
    return null;
  }

  if (!sharedRevealObserver) {
    sharedRevealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          revealCallbacks.get(entry.target)?.();
        });
      },
      {
        threshold: 0.05,
        rootMargin: '0px 0px -80px 0px',
      }
    );
  }

  return sharedRevealObserver;
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const ScrollReveal: React.FC<ScrollRevealProps> = ({
  children,
  className = '',
  delay = 0,
  direction = 'up',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || prefersReducedMotion()) {
      setIsVisible(true);
      return;
    }

    const observer = getSharedRevealObserver();
    if (!observer) {
      setIsVisible(true);
      return;
    }

    let mounted = true;
    const reveal = () => {
      if (!mounted) return;
      setIsVisible(true);
      observer.unobserve(element);
      revealCallbacks.delete(element);
    };

    revealCallbacks.set(element, reveal);
    observer.observe(element);

    return () => {
      mounted = false;
      observer.unobserve(element);
      revealCallbacks.delete(element);
    };
  }, []);

  const getTransform = () => {
    const transforms = {
      up: 'translate-y-16',
      down: '-translate-y-16',
      left: 'translate-x-16',
      right: '-translate-x-16',
    };
    return transforms[direction];
  };

  const transitionStyle = {
    transitionDuration: prefersReducedMotion() ? '0ms' : '800ms',
    transitionDelay: isVisible ? `${delay}ms` : '0ms',
    transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
  };

  return (
    <div
      ref={ref}
      style={transitionStyle}
      className={`transform transition-all ${className} ${
        isVisible
          ? 'opacity-100 translate-y-0 translate-x-0 scale-100 filter-none'
          : `opacity-0 ${getTransform()} scale-95 blur-[2px]`
      }`}
    >
      {children}
    </div>
  );
};
