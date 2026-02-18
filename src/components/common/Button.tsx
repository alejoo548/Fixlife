import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { LoadingSpinner } from './SkeletonLoader';

interface ButtonProps extends Omit<HTMLMotionProps<"button">, 'children'> {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles = 'font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 relative overflow-hidden group';
  
  const variants = {
    primary: 'bg-gradient-to-r from-bird-blue to-bird-lightBlue text-white shadow-lg shadow-bird-blue/30 hover:shadow-xl hover:shadow-bird-blue/40 hover:scale-[1.02] active:scale-[0.98]',
    secondary: 'bg-gradient-to-r from-bird-yellow to-bird-orange text-gray-900 shadow-lg shadow-bird-yellow/30 hover:shadow-xl hover:shadow-bird-yellow/40 hover:scale-[1.02] active:scale-[0.98]',
    outline: 'bg-white border-2 border-gray-200 text-gray-900 hover:border-bird-blue hover:text-bird-blue hover:bg-bird-blue/5 hover:scale-[1.02] active:scale-[0.98]',
    ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 hover:text-bird-blue active:scale-[0.98]'
  };

  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg'
  };

  const isDisabled = disabled || isLoading;

  return (
    <motion.button
      whileHover={!isDisabled ? { y: -2 } : {}}
      whileTap={!isDisabled ? { scale: 0.98 } : {}}
      className={`
        ${baseStyles}
        ${variants[variant]}
        ${sizes[size]}
        ${fullWidth ? 'w-full' : ''}
        ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `}
      disabled={isDisabled}
      {...props}
    >
      {/* Ripple effect on hover */}
      <motion.div
        className="absolute inset-0 bg-white/20"
        initial={{ scale: 0, opacity: 0 }}
        whileHover={{ scale: 2, opacity: [0, 0.3, 0] }}
        transition={{ duration: 0.6 }}
      />

      {/* Content */}
      <span className="relative z-10 flex items-center gap-2">
        {isLoading ? (
          <LoadingSpinner size="sm" />
        ) : (
          <>
            {leftIcon && (
              <motion.span
                initial={{ x: 0 }}
                whileHover={{ x: -3 }}
                transition={{ duration: 0.2 }}
              >
                {leftIcon}
              </motion.span>
            )}
            {children}
            {rightIcon && (
              <motion.span
                initial={{ x: 0 }}
                whileHover={{ x: 3 }}
                transition={{ duration: 0.2 }}
              >
                {rightIcon}
              </motion.span>
            )}
          </>
        )}
      </span>

      {/* Shine effect */}
      {!isDisabled && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
          initial={{ x: '-100%' }}
          whileHover={{ x: '100%' }}
          transition={{ duration: 0.6 }}
        />
      )}
    </motion.button>
  );
};
