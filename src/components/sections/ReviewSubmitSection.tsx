import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { API_ENDPOINTS } from '../../config/api';
import { getToken, isAuthenticated, hasRole } from '../../utils/session';
import { useProfanityGuard, assertNoProfanity } from '../../hooks/useProfanityGuard';

// Blacklist: block HTML-injection and special-format chars
const BLOCKED_CHARS_RE = /[<>{}[\]|`\\^~]/g;

const MAX = 500;
const MIN = 10;

const STAR_LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

interface StarRatingProps {
  value: number;
  onChange: (v: number) => void;
}

const StarRating: React.FC<StarRatingProps> = ({ value, onChange }) => {
  const [hovered, setHovered] = useState(0);
  const active = hovered || value;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2" onMouseLeave={() => setHovered(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <motion.button
            key={n}
            type="button"
            whileHover={{ scale: 1.25 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHovered(n)}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            className="focus:outline-none"
          >
            <svg
              className="w-10 h-10 drop-shadow-sm transition-all duration-100"
              viewBox="0 0 20 20"
              fill={n <= active ? '#f59e0b' : 'none'}
              stroke={n <= active ? '#d97706' : '#cbd5e1'}
              strokeWidth={1.2}
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </motion.button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        {active > 0 && (
          <motion.span
            key={active}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-sm font-bold text-amber-500"
          >
            {STAR_LABELS[active]}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
};

interface ReviewSubmitSectionProps {
  onLoginRequired?: () => void;
}

export const ReviewSubmitSection: React.FC<ReviewSubmitSectionProps> = ({ onLoginRequired }) => {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [apiError, setApiError] = useState('');
  const [submittedRating, setSubmittedRating] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { warning: profanityWarning, guardValue } = useProfanityGuard();

  const isWorkerSession = isAuthenticated('worker') && hasRole('worker', 'worker');
  const isClientSession = isAuthenticated('client');
  const isLoggedIn = isWorkerSession || isClientSession;
  const scope = isWorkerSession ? 'worker' : 'client';

  const validateText = (val: string): string => {
    const trimmed = val.trim();
    if (trimmed.length === 0) return `Review is required.`;
    if (trimmed.length < MIN) return `At least ${MIN} characters required (${trimmed.length}/${MIN}).`;
    if (trimmed.length > MAX) return `Maximum ${MAX} characters.`;
    return '';
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = guardValue(e.target.value.replace(BLOCKED_CHARS_RE, ''));
    if (val.length > MAX) return;
    setText(val);
    const err = validateText(val);
    setErrors((prev) => ({ ...prev, text: err }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError('');

    if (!isLoggedIn) {
      onLoginRequired?.();
      return;
    }

    const errs: Record<string, string> = {};
    if (!rating) errs.rating = 'Please select a star rating.';
    const textErr = validateText(text);
    if (textErr) errs.text = textErr;
    else if (!assertNoProfanity(text)) errs.text = "Offensive language isn't allowed here.";

    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      if (errs.rating) return;
      if (errs.text) textareaRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const token = getToken(scope);
      const res = await fetch(API_ENDPOINTS.reviews.submit, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          rating,
          review_text: text.trim(),
        }),
      });
      const data = await res.json() as { success: boolean; message?: string };
      if (!data.success) {
        setApiError(data.message ?? 'Something went wrong. Please try again.');
      } else {
        setSubmittedRating(rating);
        setSuccess(true);
      }
    } catch {
      setApiError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-lg mx-auto bg-white dark:bg-slate-900/70 border border-slate-100 dark:border-white/5 rounded-3xl p-12 shadow-sm flex flex-col items-center text-center gap-6"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 220, delay: 0.1 }}
          className="w-24 h-24 rounded-full bg-emerald-50 dark:bg-emerald-900/40 border-4 border-emerald-100 dark:border-emerald-900/50 flex items-center justify-center"
        >
          <svg className="w-12 h-12 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </motion.div>
        <div>
          <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 mb-2">Review published!</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed max-w-xs mx-auto">
            Thank you for sharing your experience. Your review may appear in our testimonials carousel.
          </p>
        </div>
        <div className="flex gap-1">
          {[...Array(submittedRating)].map((_, i) => (
            <svg key={i} className="w-7 h-7 text-amber-400 fill-current" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
      {/* Left info panel */}
      <div className="flex flex-col gap-6">
        <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 rounded-3xl p-8 text-white relative overflow-hidden shadow-xl shadow-slate-900/20 ring-1 ring-white/5">
          <div className="absolute top-0 right-0 w-56 h-56 bg-bird-blue/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-40 h-40 bg-bird-yellow/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-bird-blue/20 ring-1 ring-bird-blue/30 flex items-center justify-center mb-6">
              <svg className="w-6 h-6 text-bird-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
            </div>
            <h4 className="text-xl font-bold mb-2">Your voice matters</h4>
            <p className="text-slate-400 dark:text-slate-500 text-sm leading-relaxed mb-6">
              Real reviews from real customers power our community. Help others make better decisions and help professionals grow.
            </p>
            <div className="flex flex-col gap-3">
              {[
                'Reviews appear in our testimonials carousel',
                'One review per user every 24 hours',
                'Clients and professionals can both share',
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-xl bg-white/5 px-3 py-2.5 ring-1 ring-white/5">
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-slate-300 text-sm">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Not logged in CTA */}
        {!isLoggedIn && (
          <div className="bg-amber-50 dark:bg-amber-900/40 border border-amber-100 dark:border-amber-900/50 rounded-2xl p-5 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-amber-900 dark:text-amber-200 text-sm mb-1">Sign in to leave a review</p>
              <p className="text-amber-700 dark:text-amber-400 text-xs leading-relaxed">You need an account to submit reviews.</p>
              <button
                type="button"
                onClick={onLoginRequired}
                className="mt-3 px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-colors"
              >
                Sign In
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right form */}
      <form
        onSubmit={handleSubmit}
        noValidate
        className="bg-white dark:bg-slate-900/70 border border-slate-100 dark:border-white/5 rounded-3xl p-8 shadow-sm flex flex-col gap-7"
      >
        {/* Star rating */}
        <div>
          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">
            Overall Rating <span className="text-red-500">*</span>
          </label>
          <StarRating value={rating} onChange={(v) => {
            setRating(v);
            if (errors.rating) setErrors((p) => { const n = { ...p }; delete n.rating; return n; });
          }} />
          {errors.rating && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-xs font-medium text-red-500 flex items-center gap-1">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
              {errors.rating}
            </motion.p>
          )}
        </div>

        {/* Service category (workers only) — assigned automatically server-side from their registered services */}
        {isWorkerSession && (
          <div className="rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 px-4 py-3 flex items-start gap-3">
            <svg className="w-4 h-4 text-bird-blue shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Your service category is set automatically from your registered services — no need to type it in.
            </p>
          </div>
        )}

        {/* Review text */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Your Review <span className="text-red-500">*</span>
            </label>
            <span className={`text-xs font-medium tabular-nums ${text.length > MAX * 0.9 ? 'text-red-400' : 'text-slate-400 dark:text-slate-500'}`}>
              {text.length}/{MAX}
            </span>
          </div>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            placeholder="Share your experience with Fixlife — what went well, what you appreciated, and how we helped you…"
            rows={5}
            maxLength={MAX}
            className={`w-full rounded-xl border px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none transition-all focus:ring-2 focus:ring-bird-blue/25 focus:border-bird-blue resize-none ${
              errors.text ? 'border-red-300 bg-red-50 dark:bg-red-900/40 focus:ring-red-200' : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] hover:border-slate-300'
            }`}
          />
          {errors.text || profanityWarning ? (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-1.5 text-xs font-medium text-red-500 flex items-center gap-1">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
              {errors.text || profanityWarning}
            </motion.p>
          ) : (
            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
              Minimum {MIN} characters. Characters like &lt; &gt; {'{'} {'}'} [ ] | are not allowed.
            </p>
          )}
        </div>

        {/* API error */}
        <AnimatePresence>
          {apiError && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-xl bg-red-50 dark:bg-red-900/40 border border-red-100 dark:border-red-900/50 px-4 py-3 text-sm text-red-600 dark:text-red-400 font-medium flex items-start gap-2"
            >
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
              {apiError}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Submit */}
        <motion.button
          type="submit"
          disabled={submitting}
          whileHover={!submitting ? { scale: 1.01 } : {}}
          whileTap={!submitting ? { scale: 0.99 } : {}}
          className="w-full py-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-sm hover:bg-bird-blue dark:hover:bg-bird-blue dark:hover:text-white transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Submitting…
            </>
          ) : !isLoggedIn ? (
            'Sign In to Leave a Review'
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Publish Review
            </>
          )}
        </motion.button>
      </form>
    </div>
  );
};
