import React from 'react';
import { motion } from 'framer-motion';

interface SkeletonLoaderProps {
  variant?: 'card' | 'text' | 'avatar' | 'button';
  count?: number;
  className?: string;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({ 
  variant = 'card', 
  count = 1,
  className = '' 
}) => {
  const shimmer = {
    animate: {
      backgroundPosition: ['200% 0', '-200% 0'],
    },
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'linear' as const,
    },
  };

  const renderSkeleton = () => {
    switch (variant) {
      case 'card':
        return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`bg-white/80 border border-gray-200 rounded-3xl overflow-hidden ${className}`}
          >
            <motion.div
              {...shimmer}
              className="h-48 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200"
              style={{ backgroundSize: '200% 100%' }}
            />
            <div className="p-6 space-y-3">
              <motion.div
                {...shimmer}
                className="h-6 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 rounded-lg w-3/4"
                style={{ backgroundSize: '200% 100%' }}
              />
              <motion.div
                {...shimmer}
                className="h-4 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 rounded-lg w-full"
                style={{ backgroundSize: '200% 100%' }}
              />
              <motion.div
                {...shimmer}
                className="h-4 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 rounded-lg w-5/6"
                style={{ backgroundSize: '200% 100%' }}
              />
            </div>
          </motion.div>
        );

      case 'text':
        return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`space-y-2 ${className}`}
          >
            {Array.from({ length: count }).map((_, i) => (
              <motion.div
                key={i}
                {...shimmer}
                className="h-4 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 rounded-lg"
                style={{ 
                  backgroundSize: '200% 100%',
                  width: `${Math.random() * 30 + 70}%`
                }}
              />
            ))}
          </motion.div>
        );

      case 'avatar':
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            {...shimmer}
            className={`w-12 h-12 rounded-full bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 ${className}`}
            style={{ backgroundSize: '200% 100%' }}
          />
        );

      case 'button':
        return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            {...shimmer}
            className={`h-12 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 rounded-xl ${className}`}
            style={{ backgroundSize: '200% 100%' }}
          />
        );

      default:
        return null;
    }
  };

  return <>{renderSkeleton()}</>;
};

// Loading spinner component
export const LoadingSpinner: React.FC<{ size?: 'sm' | 'md' | 'lg'; className?: string }> = ({ 
  size = 'md',
  className = '' 
}) => {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  };

  return (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      className={`${sizes[size]} border-3 border-bird-blue/20 border-t-bird-blue rounded-full ${className}`}
    />
  );
};

// Pulse loader for inline loading states
export const PulseLoader: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
            delay: i * 0.15,
          }}
          className="w-2 h-2 bg-bird-blue rounded-full"
        />
      ))}
    </div>
  );
};
