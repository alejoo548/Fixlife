import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface CounterOfferModalProps {
  open: boolean;
  amount: string;
  note: string;
  onAmountChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

const sanitizeCounterAmount = (value: string) => {
  if (!value) return '';
  const cleaned = value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
  const [whole, decimals = ''] = cleaned.split('.');
  const limited = cleaned.includes('.')
    ? `${whole.slice(0, 4) || '0'}.${decimals.slice(0, 2)}`
    : whole.slice(0, 4);
  if (!limited) return '';
  return Number(limited) > 1000 ? '1000' : limited;
};

export const CounterOfferModal: React.FC<CounterOfferModalProps> = ({
  open,
  amount,
  note,
  onAmountChange,
  onNoteChange,
  onClose,
  onConfirm,
}) => (
  <AnimatePresence>
    {open && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-gray-200"
        >
          <h3 className="text-xl font-black text-gray-900 mb-2">Counter Offer</h3>
          <p className="text-sm text-gray-500 mb-6">
            Propose a new price for this job. The client will review it.
          </p>

          <label className="block text-xs uppercase tracking-wider font-bold text-gray-500 mb-2">
            New Budget (USD)
          </label>
          <div className="relative mb-4">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-900 font-bold text-lg">$</span>
            <input
              type="text"
              inputMode="decimal"
              maxLength={7}
              value={amount}
              onChange={(event) => onAmountChange(sanitizeCounterAmount(event.target.value))}
              className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl py-3 pl-10 pr-4 text-gray-900 font-bold focus:outline-none focus:border-amber-500 transition-colors"
            />
            <p className="mt-2 text-xs font-semibold text-gray-500">Maximum: $1,000.00</p>
          </div>

          <label className="block text-xs uppercase tracking-wider font-bold text-gray-500 mb-2">
            Note (Optional)
          </label>
          <textarea
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            maxLength={255}
            placeholder="Explain why the price changed..."
            className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl py-3 px-4 resize-none h-24 text-sm focus:outline-none focus:border-amber-500 transition-colors mb-6"
          />

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onClose}
              className="py-3 rounded-xl border-2 border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="py-3 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-white font-bold shadow-lg shadow-amber-500/30 hover:shadow-xl transition-all"
            >
              Send Offer
            </button>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);
