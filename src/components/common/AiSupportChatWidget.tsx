import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, Send, Sparkles, X } from 'lucide-react';
import { API_URL } from '../../config/api';
import { getToken } from '../../utils/session';

// ─── Bird mascot sprite animation ────────────────────────────────────────────
const B_FRAME_W = 524;   // px per frame in the sprite sheet
const B_FRAME_H = 450;
const B_COLS    = 6;
const B_TOTAL   = 36;    // 6 cols × 6 rows
const B_DISP_H  = 96;    // rendered height (px)
const B_SCALE   = B_DISP_H / B_FRAME_H;
const B_DISP_W  = Math.round(B_FRAME_W * B_SCALE);
const B_SHT_W   = Math.round(3144 * B_SCALE);
const B_SHT_H   = Math.round(2700 * B_SCALE);

const BirdMascot: React.FC<{ hovered: boolean }> = ({ hovered }) => {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    // Static when idle — only animate on hover/touch
    if (!hovered) return;
    const id = setInterval(() => setFrame(f => (f + 1) % B_TOTAL), 60);
    return () => clearInterval(id);
  }, [hovered]);

  // Reset to frame 0 when hover ends so it always rests on the same pose
  useEffect(() => {
    if (!hovered) setFrame(0);
  }, [hovered]);

  const col = frame % B_COLS;
  const row = Math.floor(frame / B_COLS);

  return (
    <div
      aria-hidden="true"
      style={{
        width:              B_DISP_W,
        height:             B_DISP_H,
        backgroundImage:    'url(/bird-sprite.png)',
        backgroundSize:     `${B_SHT_W}px ${B_SHT_H}px`,
        backgroundPosition: `${-col * B_FRAME_W * B_SCALE}px ${-row * B_FRAME_H * B_SCALE}px`,
        backgroundRepeat:   'no-repeat',
        imageRendering:     'auto',
        pointerEvents:      'none',
        flexShrink:         0,
        filter:             'drop-shadow(0 6px 14px rgba(0,100,220,0.22))',
      }}
    />
  );
};
// ─────────────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const QUICK_PROMPTS = [
  'I need help booking a service',
  'How do I book a service?',
  'I have a problem with my account',
];

const isSpanishText = (text: string): boolean => {
  const sample = text.toLowerCase();
  return /[áéíóúñ¿¡]/.test(sample) || /\b(hola|necesito|quiero|servicio|pago|cuenta|perfil|ayuda|problema)\b/.test(sample);
};

const buildAssistantFallbackReply = (text: string): string => {
  const normalized = text.toLowerCase();
  const inSpanish = isSpanishText(text);

  if (/\b(book|booking|service|reservar|agendar|servicio)\b/.test(normalized)) {
    return inSpanish
      ? 'Para reservar, toca "Book a service", describe el trabajo y agrega tu ubicacion. Luego revisa profesionales cercanos y acepta la cotizacion que te convenga.'
      : 'To book a service, tap "Book a service", describe the job, and add your location. Then review nearby pros and accept the quote that works best for you.';
  }

  if (/\b(account|profile|login|password|cuenta|perfil|contrasena|contraseña)\b/.test(normalized)) {
    return inSpanish
      ? 'Puedo orientarte con problemas de cuenta o perfil. Si el problema sigue, escribe a fixlifeworks@gmail.com y te ayudaran.'
      : 'I can guide you with account or profile issues. If the problem continues, contact fixlifeworks@gmail.com for help.';
  }

  if (/\b(payment|paypal|pay|pago|reembolso|cobro)\b/.test(normalized)) {
    return inSpanish
      ? 'Los pagos se mantienen seguros durante el servicio y se liberan al confirmar la finalizacion. Si necesitas ayuda humana, escribe a fixlifeworks@gmail.com.'
      : 'Payments are held securely during the service and released when completion is confirmed. If you need human help, contact fixlifeworks@gmail.com.';
  }

  return inSpanish
    ? 'Ahora mismo estoy en modo de ayuda rapida, pero aun puedo orientarte con reservas, pagos y cuenta. Si quieres soporte humano, escribe a fixlifeworks@gmail.com.'
    : 'I am in quick-help mode right now, but I can still guide you with bookings, payments, and account issues. If you need human support, contact fixlifeworks@gmail.com.';
};

const TypingDots: React.FC = () => (
  <div className="flex items-center gap-1 px-1 py-0.5">
    {[0, 1, 2].map((i) => (
      <motion.span
        key={i}
        className="h-1.5 w-1.5 rounded-full bg-sky-400/70"
        animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.2 }}
      />
    ))}
  </div>
);

export const AiSupportChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [buttonHovered, setButtonHovered] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, []);

  useEffect(() => {
    if (isOpen) setTimeout(() => textareaRef.current?.focus(), 100);
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    setError(null);
    setInputValue('');

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: trimmed };
    const assistantId = crypto.randomUUID();

    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '' }]);
    setIsLoading(true);

    const history = messages.map(({ role, content }) => ({ role, content }));
    history.push({ role: 'user', content: trimmed });

    abortControllerRef.current = new AbortController();

    try {
      const token = getToken();
      const response = await fetch(`${API_URL}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ messages: history }),
        signal: abortControllerRef.current.signal,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || `Error ${response.status}`);

      const fullText: string = data.text ?? '';

      for (let i = 0; i <= fullText.length; i++) {
        if (abortControllerRef.current?.signal.aborted) break;
        setMessages((prev) =>
          prev.map((msg) => msg.id === assistantId ? { ...msg, content: fullText.slice(0, i) } : msg),
        );
        if (i < fullText.length) await new Promise((r) => setTimeout(r, 10));
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setError(null);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: buildAssistantFallbackReply(trimmed) }
            : msg
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => { abortControllerRef.current?.abort(); setIsOpen(false); };
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); sendMessage(inputValue); };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(inputValue); }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="fixed bottom-5 right-5 sm:bottom-7 sm:right-7 z-[80] flex flex-col items-end gap-3">

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              className="fixed inset-0 z-0"
              style={{ background: 'rgba(2,6,23,0.25)', backdropFilter: 'blur(3px)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClose}
            />

            {/* Chat modal — liquid glass */}
            <motion.section
              key="modal"
              role="dialog"
              aria-modal="true"
              aria-label="Fixly AI Assistant"
              initial={{ opacity: 0, y: 24, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.93 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="relative z-10 flex flex-col overflow-hidden rounded-3xl"
              style={{
                width: 'min(calc(100vw - 2.5rem), 380px)',
                maxHeight: 'min(580px, calc(100dvh - 7rem))',
                background: 'linear-gradient(145deg, rgba(255,255,255,0.62) 0%, rgba(240,249,255,0.48) 50%, rgba(255,245,235,0.45) 100%)',
                backdropFilter: 'blur(48px) saturate(200%)',
                WebkitBackdropFilter: 'blur(48px) saturate(200%)',
                border: '1px solid rgba(255,255,255,0.7)',
                boxShadow: '0 32px 72px rgba(2,6,23,0.22), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(255,255,255,0.3)',
              }}
            >
              {/* Background color blobs for glass refraction */}
              <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl">
                <div className="absolute -top-12 -left-12 h-48 w-48 rounded-full bg-sky-400/25 blur-3xl" />
                <div className="absolute -bottom-12 -right-12 h-48 w-48 rounded-full bg-orange-400/20 blur-3xl" />
                <div className="absolute top-1/3 right-0 h-32 w-32 rounded-full bg-sky-300/15 blur-2xl" />
              </div>

              {/* Header */}
              <div
                className="relative shrink-0 px-4 py-3.5 sm:px-5 sm:py-4"
                style={{
                  background: 'linear-gradient(135deg, rgba(0,144,255,0.88) 0%, rgba(255,194,14,0.85) 50%, rgba(255,128,0,0.88) 100%)',
                  backdropFilter: 'blur(12px)',
                  borderBottom: '1px solid rgba(255,255,255,0.25)',
                }}
              >
                <div className="absolute inset-0 overflow-hidden rounded-t-3xl">
                  <div className="absolute -top-6 -right-6 h-24 w-24 rounded-full bg-white/15 blur-2xl" />
                  <div className="absolute -bottom-4 -left-4 h-16 w-16 rounded-full bg-white/10 blur-xl" />
                </div>
                <div className="relative flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl grid place-items-center"
                      style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.35)', backdropFilter: 'blur(8px)' }}>
                      <Sparkles className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/75">AI Support</p>
                      <h3 className="text-sm font-black text-white leading-tight">Fixly Assistant</h3>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <motion.span
                      className="h-2 w-2 rounded-full bg-emerald-400"
                      animate={{ opacity: [1, 0.4, 1] }}
                      transition={{ duration: 1.6, repeat: Infinity }}
                    />
                    <span className="text-[10px] text-white/70 font-semibold">Online</span>
                    <button
                      type="button"
                      onClick={handleClose}
                      className="ml-1 h-8 w-8 rounded-xl grid place-items-center transition-colors hover:bg-white/20"
                      style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}
                      aria-label="Close"
                    >
                      <X className="h-3.5 w-3.5 text-white" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-3"
                style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(14,165,233,0.3) transparent' }}>
                {isEmpty ? (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                    <div className="rounded-2xl px-4 py-3 text-sm text-slate-700 mb-3"
                      style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.8)', backdropFilter: 'blur(8px)', boxShadow: '0 2px 12px rgba(2,6,23,0.06)' }}>
                      Hi, I'm <span className="font-bold text-sky-600">Fixly</span> 👋 your AI assistant from Fixlife. How can I help you?
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {QUICK_PROMPTS.map((p, i) => (
                        <motion.button
                          key={p}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.15 + i * 0.07 }}
                          type="button"
                          onClick={() => sendMessage(p)}
                          className="rounded-full px-3 py-1.5 text-xs font-semibold text-sky-700 transition-all hover:scale-105"
                          style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.25)', backdropFilter: 'blur(4px)' }}
                        >
                          {p}
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  <>
                    {messages.map((msg) => (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.2 }}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                            msg.role === 'user' ? 'text-white rounded-br-sm' : 'text-slate-700 rounded-bl-sm'
                          }`}
                          style={msg.role === 'user' ? {
                            background: 'linear-gradient(135deg, #38BDF8 0%, #0284C7 100%)',
                            boxShadow: '0 4px 14px rgba(56,189,248,0.35)',
                          } : {
                            background: 'rgba(255,255,255,0.75)',
                            border: '1px solid rgba(255,255,255,0.85)',
                            backdropFilter: 'blur(8px)',
                            boxShadow: '0 2px 10px rgba(2,6,23,0.07)',
                          }}
                        >
                          {msg.role === 'assistant' && msg.content === '' && isLoading
                            ? <TypingDots />
                            : msg.content}
                        </div>
                      </motion.div>
                    ))}
                    {error && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="rounded-2xl px-3.5 py-2.5 text-xs text-red-600"
                        style={{ background: 'rgba(254,226,226,0.8)', border: '1px solid rgba(252,165,165,0.5)' }}>
                        ⚠️ {error}
                      </motion.div>
                    )}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick prompts (after first message) */}
              {!isEmpty && (
                <div className="shrink-0 px-4 pt-2 flex flex-wrap gap-1.5"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.5)' }}>
                  {QUICK_PROMPTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => sendMessage(p)}
                      disabled={isLoading}
                      className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-sky-700 transition-all hover:scale-105 disabled:opacity-40"
                      style={{ background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.22)' }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}

              {/* Input */}
              <div className="shrink-0 p-3 sm:p-4">
                <form
                  onSubmit={handleSubmit}
                  className="flex items-end gap-2 rounded-2xl p-2"
                  style={{
                    background: 'rgba(255,255,255,0.6)',
                    border: '1px solid rgba(255,255,255,0.8)',
                    backdropFilter: 'blur(12px)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)',
                  }}
                >
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    disabled={isLoading}
                    className="w-full resize-none bg-transparent px-2 py-1.5 text-sm text-slate-700 placeholder:text-slate-400/80 focus:outline-none disabled:opacity-50"
                    style={{ maxHeight: '80px' }}
                  />
                  <motion.button
                    type="submit"
                    disabled={isLoading || !inputValue.trim()}
                    whileTap={{ scale: 0.9 }}
                    className="h-9 w-9 shrink-0 rounded-xl grid place-items-center text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: 'linear-gradient(135deg, #38BDF8 0%, #FB7300 100%)', boxShadow: '0 4px 12px rgba(56,189,248,0.4)' }}
                    aria-label="Send"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </motion.button>
                </form>
              </div>
            </motion.section>
          </>
        )}
      </AnimatePresence>

      {/* Button wrapper — bird is absolutely positioned to its left */}
      <div
        className="relative"
        onMouseEnter={() => setButtonHovered(true)}
        onMouseLeave={() => setButtonHovered(false)}
        onTouchStart={() => setButtonHovered(true)}
        onTouchEnd={() => setButtonHovered(false)}
      >
        {/* Bird mascot — absolute, left of button, always visible when chat closed */}
        <AnimatePresence>
          {!isOpen && (
            <motion.div
              key="bird-mascot"
              className="absolute"
              style={{ right: 'calc(100% + 10px)', bottom: -4, overflow: 'visible' }}
              initial={{ opacity: 0, scale: 0.4, x: 14 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.4, x: 14 }}
              whileHover={{ scale: 1.15, y: -10, rotate: -4 }}
              whileTap={{ scale: 0.9, rotate: 4 }}
              transition={{ type: 'spring', stiffness: 350, damping: 18 }}
            >
              <BirdMascot hovered={buttonHovered} />
            </motion.div>
          )}
        </AnimatePresence>

      {/* Floating button — Aceternity hover-border-gradient style */}
      <motion.div
        whileHover={{ scale: 1.06, y: -3 }}
        whileTap={{ scale: 0.94 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        className="relative"
        style={{ filter: !isOpen ? 'drop-shadow(0 8px 28px rgba(0,144,255,0.5))' : 'none' }}
      >
        {/* Pulse ring */}
        {!isOpen && (
          <motion.span
            className="absolute inset-0 rounded-2xl pointer-events-none"
            animate={{ boxShadow: ['0 0 0 0 rgba(56,189,248,0.55)', '0 0 0 16px rgba(56,189,248,0)', '0 0 0 0 rgba(56,189,248,0)'] }}
            transition={{ duration: 2.4, repeat: Infinity }}
          />
        )}

        {/* Animated gradient border container */}
        <div className="relative overflow-hidden rounded-2xl p-[2px]">
          {/* Rotating conic gradient that forms the border */}
          <motion.div
            className="absolute inset-[-100%] pointer-events-none"
            style={{
              background: 'conic-gradient(from 0deg, #0090FF 0%, #FFC20E 35%, #FF8000 55%, #0090FF 100%)',
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          />

          {/* Actual button — sits on top, leaving 2px gradient border visible */}
          <button
            type="button"
            onClick={() => setIsOpen((v) => !v)}
            aria-label="Open Fixly AI assistant"
            className="relative flex items-center gap-2.5 rounded-[14px] px-5 py-3.5 text-white font-bold text-sm tracking-wide select-none cursor-pointer"
            style={{
              background: 'linear-gradient(135deg, #0090FF 0%, #FFC20E 50%, #FF8000 100%)',
            }}
          >
            {/* Icon */}
            <AnimatePresence mode="wait">
              {isOpen ? (
                <motion.span key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.18 }}>
                  <X className="h-4 w-4 text-white" />
                </motion.span>
              ) : (
                <motion.span key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.18 }}>
                  <Sparkles className="h-4 w-4 text-white" />
                </motion.span>
              )}
            </AnimatePresence>

            {/* Label */}
            <AnimatePresence mode="wait">
              {isOpen ? (
                <motion.span key="close-label" initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden whitespace-nowrap">
                  Close
                </motion.span>
              ) : (
                <motion.span key="open-label" initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden whitespace-nowrap">
                  Ask Fixly
                </motion.span>
              )}
            </AnimatePresence>

            {/* Online dot */}
            {!isOpen && (
              <motion.span
                className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 rounded-full bg-emerald-400 border-2 border-white"
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}
          </button>
        </div>
      </motion.div>
      </div>{/* end button wrapper */}
    </div>
  );
};
