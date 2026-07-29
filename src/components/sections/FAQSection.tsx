import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { API_ENDPOINTS } from '../../config/api';

interface FAQItem {
  id_faq?: number;
  question: string;
  answer: string;
  icon?: string | null;
}

interface FAQSectionProps {
  onBookService?: () => void;
  onNavigateSection?: (target: 'services' | 'steps') => void;
}

const DEFAULT_FAQ_ICON =
  'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';

const DEFAULT_FAQS: Array<{ question: string; answer: string }> = [
  {
    question: 'How does Fixlife work?',
    answer:
      'Describe the issue, confirm your location and share your budget. Fixlife matches you with nearby verified professionals who can accept your request.',
  },
  {
    question: 'Are all professionals verified?',
    answer:
      'Yes. Every professional goes through identity and document review before being allowed to accept jobs on the platform.',
  },
  {
    question: 'What payment methods do you accept?',
    answer:
      'You can pay securely through the platform with the available payment methods shown during checkout.',
  },
];

const normalizeFaqText = (value: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const FAQSection: React.FC<FAQSectionProps> = ({ onBookService, onNavigateSection }) => {
  const { t, i18n } = useTranslation();
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [dynamicFaqs, setDynamicFaqs] = useState<FAQItem[]>([]);
  const translatedFaqs = t('faq.items', { returnObjects: true });
  const localizedFaqs = Array.isArray(translatedFaqs) ? translatedFaqs as Array<{ question: string; answer: string }> : DEFAULT_FAQS;
  const defaultFaqs: FAQItem[] = localizedFaqs.map((item) => ({
    ...item,
    icon: DEFAULT_FAQ_ICON,
  }));

  useEffect(() => {
    let cancelled = false;
    const loadFaqs = async () => {
      try {
        const response = await fetch(API_ENDPOINTS.services.faqItems);
        const payload = await response.json();
        const next = Array.isArray(payload?.faqs)
          ? payload.faqs
              .map((item: FAQItem) => ({
                id_faq: Number(item.id_faq || 0) || undefined,
                question: String(item.question || '').trim(),
                answer: String(item.answer || '').trim(),
                icon: String(item.icon || '').trim() || null,
              }))
              .filter((item: FAQItem) => item.question.length > 0 && item.answer.length > 0)
          : [];
        if (!cancelled) setDynamicFaqs(next);
      } catch {
        if (!cancelled) setDynamicFaqs([]);
      }
    };

    void loadFaqs();
    return () => {
      cancelled = true;
    };
  }, []);

  const faqs = useMemo(
    () => {
      if (dynamicFaqs.length === 0) return defaultFaqs;

      return dynamicFaqs.map((faq) => {
        const defaultIndex = DEFAULT_FAQS.findIndex(
          (item) => normalizeFaqText(item.question) === normalizeFaqText(faq.question)
        );
        const localized = defaultIndex >= 0 ? localizedFaqs[defaultIndex] : null;

        return localized
          ? { ...faq, question: localized.question, answer: localized.answer }
          : faq;
      });
    },
    [defaultFaqs, dynamicFaqs, i18n.language, localizedFaqs]
  );

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="relative">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 px-2 gap-3">
        <div>
          <h3 className="text-2xl font-black text-gray-900 flex items-center gap-4 dark:text-slate-100">
            <span className="w-1.5 h-8 rounded-full bg-bird-orange shadow-[0_0_15px_rgba(255,128,0,0.4)]"></span>
            {t('faq.title')}
          </h3>
          <p className="text-gray-600 mt-2 ml-6 text-sm font-medium dark:text-slate-400">{t('faq.subtitle')}</p>
        </div>
        <div className="ml-6 md:ml-0">
          <button
            type="button"
            onClick={() => onNavigateSection?.('steps')}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gray-100 border border-gray-200 text-gray-900 font-bold text-sm hover:bg-gray-200 transition-all group dark:bg-white/[0.06] dark:border-white/10 dark:text-slate-100 dark:hover:bg-white/[0.1]"
          >
            <span>{t('faq.cta')}</span>
            <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {faqs.map((faq, index) => (
          <div
            key={faq.id_faq || index}
            className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 dark:bg-slate-900/70 dark:border-white/10"
          >
            <button
              onClick={() => toggleFAQ(index)}
              className="w-full p-4 flex items-start gap-3 text-left hover:bg-gray-50/50 transition-colors group dark:hover:bg-white/[0.04]"
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 ${
                openIndex === index
                  ? 'bg-bird-blue text-white shadow-lg shadow-bird-blue/20'
                  : 'bg-gray-100 text-gray-600 group-hover:bg-gray-200 dark:bg-white/[0.06] dark:text-slate-400 dark:group-hover:bg-white/[0.1]'
              }`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={faq.icon || DEFAULT_FAQ_ICON} />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <h4 className={`text-sm md:text-base font-bold mb-1 transition-colors ${
                  openIndex === index ? 'text-bird-blue' : 'text-gray-900 group-hover:text-bird-blue dark:text-slate-100'
                }`}>
                  {faq.question}
                </h4>
                <AnimatePresence>
                  {openIndex === index && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <p className="text-gray-600 text-xs md:text-sm leading-relaxed mt-2 font-medium dark:text-slate-400">
                        {faq.answer}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <motion.div
                animate={{ rotate: openIndex === index ? 180 : 0 }}
                transition={{ duration: 0.3 }}
                className="shrink-0"
              >
                <svg className={`w-5 h-5 transition-colors ${
                  openIndex === index ? 'text-bird-blue' : 'text-gray-400 dark:text-slate-500'
                }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </motion.div>
            </button>
          </div>
        ))}
      </div>

    </div>
  );
};
