import React, { useRef, useEffect, useState } from 'react';

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
}

export const ScrollReveal: React.FC<ScrollRevealProps> = ({ 
  children, 
  className = "", 
  delay = 0,
  direction = 'up'
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (ref.current) observer.unobserve(ref.current);
        }
      },
      {
        threshold: 0.05,
        rootMargin: "0px 0px -80px 0px"
      }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) observer.unobserve(ref.current);
    };
  }, []);

  const getTransform = () => {
    const transforms = {
      up: 'translate-y-16',
      down: '-translate-y-16',
      left: 'translate-x-16',
      right: '-translate-x-16'
    };
    return transforms[direction];
  };

  const transitionStyle = {
    transitionDuration: '800ms',
    transitionDelay: `${delay}ms`,
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