import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface FAQItem {
  question: string;
  answer: string;
  icon: string;
}

const faqs: FAQItem[] = [
  {
    question: "How does Fixlife work?",
    answer: "Simply describe your problem, set your location, and offer a price. Our platform instantly connects you with verified professionals nearby who can accept your request. Once matched, the pro arrives at your location to complete the job.",
    icon: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
  },
  {
    question: "Are all professionals verified?",
    answer: "Yes! Every professional on Fixlife goes through a rigorous verification process including background checks, license verification, insurance validation, and skill assessments. We also monitor ratings and reviews to maintain quality standards.",
    icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
  },
  {
    question: "What payment methods do you accept?",
    answer: "We accept all major credit cards (Visa, Mastercard, American Express), debit cards, PayPal, Apple Pay, and Google Pay. Payment is securely processed through our platform only after the job is completed to your satisfaction.",
    icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
  },
  {
    question: "What if I'm not satisfied with the service?",
    answer: "Your satisfaction is our priority. If you're not happy with the service, contact our support team within 24 hours. We offer a satisfaction guarantee and will work to resolve the issue, which may include sending another professional or providing a full refund.",
    icon: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
  },
  {
    question: "How quickly can I get a professional?",
    answer: "Response times vary by service type and location. For urgent requests, professionals can often arrive within 30-60 minutes. For scheduled services, you can book appointments at your convenience, typically within 24-48 hours.",
    icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
  },
  {
    question: "Is there a service fee?",
    answer: "Fixlife charges a small platform fee (typically 10-15%) to maintain our service, verify professionals, and provide customer support. This fee is included in the final price you see before confirming. No hidden charges!",
    icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
  },
  {
    question: "Can I cancel or reschedule a booking?",
    answer: "Yes, you can cancel or reschedule up to 2 hours before the scheduled time without any penalty. Cancellations within 2 hours may incur a small cancellation fee to compensate the professional for their time.",
    icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
  },
  {
    question: "Do I need to provide tools or materials?",
    answer: "Most professionals bring their own tools and basic materials. However, for larger jobs requiring specific materials (like tiles, fixtures, or paint), you may need to purchase them separately or the professional can source them for an additional cost.",
    icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
  }
];

export const FAQSection: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="relative">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-10 px-2 gap-4">
        <div>
          <h3 className="text-3xl font-black text-gray-900 flex items-center gap-4">
            <span className="w-1.5 h-8 rounded-full bg-bird-orange shadow-[0_0_15px_rgba(255,128,0,0.4)]"></span>
            Frequently Asked Questions
          </h3>
          <p className="text-gray-600 mt-2 ml-6 text-sm font-medium">Everything you need to know about Fixlife</p>
        </div>
        <div className="ml-6 md:ml-0">
          <a href="#" className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gray-100 border border-gray-200 text-gray-900 font-bold text-sm hover:bg-gray-200 transition-all group">
            <span>Still have questions?</span>
            <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {faqs.map((faq, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.05 }}
            className="bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300"
          >
            <button
              onClick={() => toggleFAQ(index)}
              className="w-full p-5 md:p-6 flex items-start gap-4 text-left hover:bg-gray-50/50 transition-colors group"
            >
              <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 ${
                openIndex === index
                  ? 'bg-bird-blue text-white shadow-lg shadow-bird-blue/20'
                  : 'bg-gray-100 text-gray-600 group-hover:bg-gray-200'
              }`}>
                <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={faq.icon} />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <h4 className={`text-base md:text-lg font-bold mb-1 transition-colors ${
                  openIndex === index ? 'text-bird-blue' : 'text-gray-900 group-hover:text-bird-blue'
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
                      <p className="text-gray-600 text-sm md:text-base leading-relaxed mt-3 font-medium">
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
                  openIndex === index ? 'text-bird-blue' : 'text-gray-400'
                }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </motion.div>
            </button>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.4 }}
        className="mt-8 bg-gradient-to-r from-bird-blue to-bird-darkBlue rounded-2xl p-6 md:p-8 text-center relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10" />
        <div className="relative z-10">
          <h4 className="text-xl md:text-2xl font-bold text-white mb-2">Can't find what you're looking for?</h4>
          <p className="text-blue-100 mb-6 text-sm md:text-base">Our support team is here to help 24/7</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="#" className="px-6 py-3 rounded-xl bg-white text-bird-blue font-bold hover:bg-gray-100 transition-all shadow-lg inline-flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Email Support
            </a>
            <a href="#" className="px-6 py-3 rounded-xl bg-bird-darkBlue/50 border border-white/20 text-white font-bold hover:bg-bird-darkBlue/70 transition-all inline-flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.013 8.013 0 01-4.949-1.728c-.297-.184-.526-.239-.848-.152l-2.07.564a1 1 0 01-1.218-1.22l.564-2.068c.088-.322.032-.551-.152-.848A7.996 7.996 0 013 12c0-4.418 3.582-8 8-8s8 3.582 8 8z" />
              </svg>
              Live Chat
            </a>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
