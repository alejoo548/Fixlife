import React, { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

interface ThreeDCardProps {
  children: React.ReactNode;
  className?: string;
}

export const ThreeDCard: React.FC<ThreeDCardProps> = ({ children, className = '' }) => {
  const cardRef = useRef<HTMLDivElement>(null);

  const rawX = useMotionValue(0.5);
  const rawY = useMotionValue(0.5);
  const glareRawOpacity = useMotionValue(0);

  const rotateX = useSpring(useTransform(rawY, [0, 1], [10, -10]), { stiffness: 220, damping: 28 });
  const rotateY = useSpring(useTransform(rawX, [0, 1], [-10, 10]), { stiffness: 220, damping: 28 });
  const glareOpacity = useSpring(glareRawOpacity, { stiffness: 200, damping: 30 });

  const glareLeft = useTransform(rawX, [0, 1], ['10%', '90%']);
  const glareTop = useTransform(rawY, [0, 1], ['10%', '90%']);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const { left, top, width, height } = cardRef.current.getBoundingClientRect();
    rawX.set((e.clientX - left) / width);
    rawY.set((e.clientY - top) / height);
    glareRawOpacity.set(1);
  };

  const handleMouseLeave = () => {
    rawX.set(0.5);
    rawY.set(0.5);
    glareRawOpacity.set(0);
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={className}
      style={{ perspective: '900px' }}
    >
      <motion.div
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
        className="relative h-full w-full"
      >
        {children}

        {/* Glare highlight that follows the mouse */}
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-3xl overflow-hidden"
          style={{ opacity: glareOpacity }}
        >
          <motion.div
            className="absolute w-[180px] h-[180px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: glareLeft,
              top: glareTop,
              background: 'radial-gradient(circle, rgba(255,255,255,0.28) 0%, transparent 65%)',
            }}
          />
        </motion.div>
      </motion.div>
    </div>
  );
};
