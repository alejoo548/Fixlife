import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { NavItemType, AuthMode } from '../types';
import { ReviewSubmitSection } from '../components/sections/ReviewSubmitSection';

const navItems: NavItemType[] = [
  { name: 'Services' },
  { name: 'Professionals' },
  {
    name: 'Help',
    items: ['Support', 'How it works'],
  },
  { name: 'Reviews' },
];

interface LeaveReviewProps {
  onOpenAuth?: (mode: AuthMode) => void;
}

const LeaveReview: React.FC<LeaveReviewProps> = ({ onOpenAuth }) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col">
      <Navbar
        navItems={navItems}
        onOpenAuth={(mode) => onOpenAuth?.(mode)}
        onStartBooking={() => navigate('/')}
        onOpenProfile={() => navigate('/profile')}
        onGoHome={() => navigate('/')}
        onNavigateSection={() => navigate('/')}
        onSelectCategory={() => navigate('/')}
      />

      <main className="flex-1 relative z-10 pt-24 lg:pt-36 px-4 lg:px-8 max-w-[1400px] mx-auto pb-32 w-full">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-10"
        >
          <p className="text-xs font-semibold tracking-[0.2em] uppercase text-bird-blue mb-3">
            Share Your Experience
          </p>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-slate-100 leading-tight mb-3">
            How was your experience<br />
            <span className="text-slate-400 dark:text-slate-500 font-light">with Fixlife?</span>
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-base max-w-xl">
            Your honest review helps others find great professionals and helps our community grow. Reviews may appear in our testimonials carousel.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
        >
          <ReviewSubmitSection onLoginRequired={() => onOpenAuth?.('signin')} />
        </motion.div>
      </main>

      <Footer onGoHome={() => navigate('/')} onBookService={() => navigate('/')} />
    </div>
  );
};

export default LeaveReview;
