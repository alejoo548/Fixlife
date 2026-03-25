import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, SendHorizonal, Sparkles, X } from 'lucide-react';

const quickPrompts = [
  'Necesito ayuda para reservar un servicio',
  '¿Cómo funciona Fixlife paso a paso?',
  'Tengo un problema con mi cuenta',
];

const BirdMascot: React.FC<{ active: boolean }> = ({ active }) => (
  <motion.svg
    viewBox="0 0 120 120"
    className="h-16 w-16 drop-shadow-[0_8px_24px_rgba(2,6,23,0.2)]"
    animate={active ? { y: [0, -4, 0], rotate: [0, -2, 2, 0] } : { y: 0, rotate: 0 }}
    transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="birdBody" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#38BDF8" />
        <stop offset="100%" stopColor="#0090FF" />
      </linearGradient>
      <linearGradient id="birdWing" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFC20E" />
        <stop offset="100%" stopColor="#FF8000" />
      </linearGradient>
    </defs>

    <circle cx="60" cy="62" r="34" fill="url(#birdBody)" />
    <ellipse cx="61" cy="65" rx="19" ry="15" fill="#E0F2FE" opacity="0.9" />
    <path d="M50 42c3-9 17-13 25-3" fill="none" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" />
    <path d="M77 62c9-2 16 4 14 10-2 7-10 10-17 6" fill="url(#birdWing)" />
    <path d="M43 64c-11-1-18 8-12 16 5 7 16 6 22-1" fill="#7DD3FC" />
    <circle cx="52" cy="57" r="5" fill="#0F172A" />
    <circle cx="71" cy="57" r="5" fill="#0F172A" />
    <circle cx="70" cy="55" r="1.4" fill="#FFFFFF" />
    <circle cx="51" cy="55" r="1.4" fill="#FFFFFF" />
    <path d="M58 61l4 3 4-3-4-2-4 2z" fill="#F97316" />
    <path d="M52 72c5 5 11 5 16 0" stroke="#0F172A" strokeWidth="3" strokeLinecap="round" fill="none" />
  </motion.svg>
);

export const AiSupportChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, []);

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[80]">
      <AnimatePresence>
        {isOpen ? (
          <>
            <motion.button
              type="button"
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-0 bg-slate-950/35 backdrop-blur-[1px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              aria-label="Cerrar chat de soporte"
            />

            <motion.section
              initial={{ opacity: 0, y: 18, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.95 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 w-[calc(100vw-2rem)] max-w-sm rounded-3xl border border-white/60 bg-white/92 shadow-[0_24px_60px_rgba(2,6,23,0.24)] backdrop-blur-xl overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Asistente IA de soporte"
            >
              <div className="relative p-4 sm:p-5 bg-gradient-to-r from-bird-blue/90 via-sky-500 to-bird-orange text-white">
                <div className="absolute -top-10 -right-6 h-24 w-24 rounded-full bg-white/20 blur-2xl" />
                <div className="flex items-start justify-between gap-3 relative">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-2xl bg-white/20 border border-white/30 backdrop-blur-md grid place-items-center">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/80">AI support</p>
                      <h3 className="text-base sm:text-lg font-black leading-none mt-1">Pajarito Assistant</h3>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="h-9 w-9 rounded-xl grid place-items-center bg-white/20 border border-white/30 hover:bg-white/30 transition-colors"
                    aria-label="Cerrar"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-sm text-white/90 mt-3 leading-relaxed">
                  Hola, soy tu soporte IA. Te ayudo con reservas, pagos y cualquier duda de Fixlife.
                </p>
              </div>

              <div className="p-4 sm:p-5 space-y-3 bg-gradient-to-b from-white to-sky-50/40">
                <div className="rounded-2xl border border-sky-100 bg-white px-3 py-2 text-sm text-slate-600">
                  ¿Qué necesitas hoy? Puedes comenzar con una sugerencia rápida.
                </div>

                <div className="flex flex-wrap gap-2">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setInputValue(prompt)}
                      className="rounded-full border border-bird-blue/20 bg-bird-blue/10 px-3 py-1.5 text-xs font-semibold text-bird-darkBlue hover:bg-bird-blue/20 transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-2 flex items-end gap-2">
                  <textarea
                    rows={2}
                    value={inputValue}
                    onChange={(event) => setInputValue(event.target.value)}
                    placeholder="Escribe tu mensaje..."
                    className="w-full resize-none bg-transparent px-2 py-1 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-r from-bird-blue to-sky-500 text-white grid place-items-center shadow-md hover:shadow-lg transition-all"
                    aria-label="Enviar mensaje"
                  >
                    <SendHorizonal className="h-4 w-4" />
                  </button>
                </div>

                <p className="text-[11px] leading-relaxed text-slate-500">
                  Vista previa del chat IA. La conexión inteligente se habilitará en la siguiente fase.
                </p>
              </div>
            </motion.section>
          </>
        ) : null}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => setIsOpen(true)}
        whileHover={{ y: -5, scale: 1.04 }}
        whileTap={{ scale: 0.95 }}
        className="relative group flex items-center gap-3 rounded-[1.75rem] border border-white/70 bg-white/90 px-2 pr-4 py-2 shadow-[0_14px_34px_rgba(2,6,23,0.18)] backdrop-blur-xl"
        aria-label="Abrir chat de soporte IA"
      >
        <motion.span
          className="absolute inset-0 rounded-[1.75rem]"
          animate={{ boxShadow: ['0 0 0 0 rgba(56,189,248,0.35)', '0 0 0 14px rgba(56,189,248,0)', '0 0 0 0 rgba(56,189,248,0)'] }}
          transition={{ duration: 2.2, repeat: Infinity }}
        />

        <div className="relative h-16 w-16 rounded-2xl bg-gradient-to-br from-sky-100 to-amber-100 border border-sky-200 grid place-items-center">
          <BirdMascot active={!isOpen} />
          <motion.span
            className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-white"
            animate={{ scale: [1, 1.25, 1], opacity: [1, 0.7, 1] }}
            transition={{ duration: 1.8, repeat: Infinity }}
          />
        </div>

        <div className="text-left pr-1">
          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 font-extrabold">Soporte IA</p>
          <p className="text-sm sm:text-base font-black text-slate-800 leading-tight">Habla con Pajarito</p>
          <p className="text-xs text-slate-500">Rápido, amigable y en vivo</p>
        </div>

        <div className="h-10 w-10 rounded-xl bg-gradient-to-r from-bird-blue to-bird-orange text-white grid place-items-center shadow-md">
          <MessageCircle className="h-4 w-4" />
        </div>
      </motion.button>
    </div>
  );
};
