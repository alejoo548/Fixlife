import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { API_ENDPOINTS } from '../../config/api';
import { getToken, isAuthenticated, hasRole } from '../../utils/session';
import { useProfanityGuard, assertNoProfanity } from '../../hooks/useProfanityGuard';

const BLOCKED_CHARS_RE = /[<>{}[\]|`\\^~]/g;
const MAX = 500;
const MIN = 10;

interface StarRatingProps {
  value: number;
  onChange: (value: number) => void;
}

const StarRating: React.FC<StarRatingProps> = ({ value, onChange }) => {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(0);
  const active = hovered || value;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2" onMouseLeave={() => setHovered(0)}>
        {[1, 2, 3, 4, 5].map((ratingValue) => (
          <motion.button
            key={ratingValue}
            type="button"
            whileHover={{ scale: 1.25 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onChange(ratingValue)}
            onMouseEnter={() => setHovered(ratingValue)}
            aria-label={`${ratingValue} star${ratingValue > 1 ? 's' : ''}`}
            className="focus:outline-none"
          >
            <svg
              className="h-10 w-10 drop-shadow-sm transition-all duration-100"
              viewBox="0 0 20 20"
              fill={ratingValue <= active ? '#f59e0b' : 'none'}
              stroke={ratingValue <= active ? '#d97706' : '#cbd5e1'}
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
            {t(`common.reviewPage.stars.${active}`)}
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
  const { t } = useTranslation();
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

  const validateText = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return t('common.reviewPage.validation.reviewRequired');
    if (trimmed.length < MIN) return t('common.reviewPage.validation.minChars', { min: MIN, current: trimmed.length });
    if (trimmed.length > MAX) return t('common.reviewPage.validation.maxChars', { max: MAX });
    return '';
  };

  const handleTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = guardValue(event.target.value.replace(BLOCKED_CHARS_RE, ''));
    if (nextValue.length > MAX) return;
    setText(nextValue);
    setErrors((previous) => ({ ...previous, text: validateText(nextValue) }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setApiError('');

    if (!isLoggedIn) {
      onLoginRequired?.();
      return;
    }

    const nextErrors: Record<string, string> = {};
    if (!rating) nextErrors.rating = t('common.reviewPage.validation.selectRating');

    const textError = validateText(text);
    if (textError) {
      nextErrors.text = textError;
    } else if (!assertNoProfanity(text)) {
      nextErrors.text = t('common.reviewPage.validation.noOffensiveLanguage');
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      if (nextErrors.text) textareaRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const token = getToken(scope);
      const response = await fetch(API_ENDPOINTS.reviews.submit, {
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

      const data = await response.json() as { success: boolean; message?: string };
      if (!data.success) {
        setApiError(data.message ?? t('common.reviewPage.validation.submitError'));
      } else {
        setSubmittedRating(rating);
        setSuccess(true);
      }
    } catch {
      setApiError(t('common.reviewPage.validation.networkError'));
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mx-auto flex max-w-lg flex-col items-center gap-6 rounded-3xl border border-slate-100 bg-white p-12 text-center shadow-sm dark:border-white/5 dark:bg-slate-900/70"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 220, delay: 0.1 }}
          className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-emerald-100 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-900/40"
        >
          <svg className="h-12 w-12 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </motion.div>
        <div>
          <h3 className="mb-2 text-2xl font-black text-slate-900 dark:text-slate-100">{t('common.reviewPage.form.successTitle')}</h3>
          <p className="mx-auto max-w-xs text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            {t('common.reviewPage.form.successDescription')}
          </p>
        </div>
        <div className="flex gap-1">
          {[...Array(submittedRating)].map((_, index) => (
            <svg key={index} className="h-7 w-7 fill-current text-amber-400" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-8 text-white shadow-xl shadow-slate-900/20 ring-1 ring-white/5">
          <div className="pointer-events-none absolute right-0 top-0 h-56 w-56 rounded-full bg-bird-blue/20 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-0 h-40 w-40 rounded-full bg-bird-yellow/10 blur-3xl" />
          <div className="relative z-10">
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-bird-blue/20 ring-1 ring-bird-blue/30">
              <svg className="h-6 w-6 text-bird-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
            </div>
            <h4 className="mb-2 text-xl font-bold">{t('common.reviewPage.cardTitle')}</h4>
            <p className="mb-6 text-sm leading-relaxed text-slate-400 dark:text-slate-500">
              {t('common.reviewPage.cardDescription')}
            </p>
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((index) => (
                <div key={index} className="flex items-start gap-3 rounded-xl bg-white/5 px-3 py-2.5 ring-1 ring-white/5">
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
                    <svg className="h-3 w-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-sm text-slate-300">{t(`common.reviewPage.highlights.${index}`)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {!isLoggedIn && (
          <div className="flex items-start gap-4 rounded-2xl border border-amber-100 bg-amber-50 p-5 dark:border-amber-900/50 dark:bg-amber-900/40">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/50">
              <svg className="h-5 w-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <div>
              <p className="mb-1 text-sm font-semibold text-amber-900 dark:text-amber-200">{t('common.reviewPage.signInTitle')}</p>
              <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">{t('common.reviewPage.signInDescription')}</p>
              <button
                type="button"
                onClick={onLoginRequired}
                className="mt-3 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-amber-700"
              >
                {t('common.reviewPage.signInAction')}
              </button>
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-7 rounded-3xl border border-slate-100 bg-white p-8 shadow-sm dark:border-white/5 dark:bg-slate-900/70"
      >
        <div>
          <label className="mb-3 block text-sm font-semibold text-slate-800 dark:text-slate-100">
            {t('common.reviewPage.form.overallRating')} <span className="text-red-500">*</span>
          </label>
          <StarRating
            value={rating}
            onChange={(value) => {
              setRating(value);
              if (errors.rating) {
                setErrors((previous) => {
                  const next = { ...previous };
                  delete next.rating;
                  return next;
                });
              }
            }}
          />
          {errors.rating && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 flex items-center gap-1 text-xs font-medium text-red-500">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              {errors.rating}
            </motion.p>
          )}
        </div>

        {isWorkerSession && (
          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-bird-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {t('common.reviewPage.form.workerCategoryHint')}
            </p>
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {t('common.reviewPage.form.yourReview')} <span className="text-red-500">*</span>
            </label>
            <span className={`text-xs font-medium tabular-nums ${text.length > MAX * 0.9 ? 'text-red-400' : 'text-slate-400 dark:text-slate-500'}`}>
              {text.length}/{MAX}
            </span>
          </div>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            placeholder={t('common.reviewPage.form.placeholder')}
            rows={5}
            maxLength={MAX}
            className={`w-full resize-none rounded-xl border px-4 py-3 text-sm text-slate-900 outline-none transition-all focus:border-bird-blue focus:ring-2 focus:ring-bird-blue/25 dark:text-slate-100 ${
              errors.text
                ? 'border-red-300 bg-red-50 focus:ring-red-200 dark:bg-red-900/40'
                : 'border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.04]'
            }`}
          />
          {errors.text || profanityWarning ? (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-500">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              {errors.text || profanityWarning}
            </motion.p>
          ) : (
            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
              {t('common.reviewPage.form.helper', { min: MIN })}
            </p>
          )}
        </div>

        <AnimatePresence>
          {apiError && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600 dark:border-red-900/50 dark:bg-red-900/40 dark:text-red-400"
            >
              <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              {apiError}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          type="submit"
          disabled={submitting}
          whileHover={!submitting ? { scale: 1.01 } : {}}
          whileTap={!submitting ? { scale: 0.99 } : {}}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-4 text-sm font-bold text-white transition-colors duration-200 hover:bg-bird-blue disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-bird-blue dark:hover:text-white"
        >
          {submitting ? (
            <>
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {t('common.reviewPage.form.submitting')}
            </>
          ) : !isLoggedIn ? (
            t('common.reviewPage.form.signInToReview')
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              {t('common.reviewPage.form.publish')}
            </>
          )}
        </motion.button>
      </form>
    </div>
  );
};
