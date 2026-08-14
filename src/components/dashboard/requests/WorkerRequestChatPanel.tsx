import React, { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { localizeClientServiceName } from '../../../utils/clientTranslations';
import {
  CheckCheck,
  ImagePlus,
  MessageCircle,
  Send,
  ShieldCheck,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { showSweetToast } from '../../../utils/sweetAlert';
import { normalizeImageUrl } from '../../../utils/imageUrls';
import i18n from '../../../i18n';
import type { ChatMessage, WorkerRequest } from './workerRequestTypes';

const CHAT_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

interface WorkerRequestChatPanelProps {
  open: boolean;
  connected: boolean;
  request: WorkerRequest | null;
  messages: ChatMessage[];
  text: string;
  image: File | null;
  busy: boolean;
  endRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onTextChange: (value: string) => void;
  onImageChange: (file: File | null) => void;
  onSend: () => void;
  dockBesideRequestsPanel?: boolean;
}

export const WorkerRequestChatPanel: React.FC<WorkerRequestChatPanelProps> = ({
  open,
  connected,
  request,
  messages,
  text,
  image,
  busy,
  endRef,
  onClose,
  onTextChange,
  onImageChange,
  onSend,
  dockBesideRequestsPanel = false,
}) => {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'es' ? 'es-SV' : 'en-US';
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imagePreview = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  const canSend = !busy && Boolean(text.trim() || image);
  const visibleMessages = messages.slice(-60);
  const desktopDockedStyle = dockBesideRequestsPanel
    ? {
        left: 'calc(0.75rem + min(460px, calc(100% - 1.5rem)) + 1rem)',
        right: '1rem',
        width: 'auto',
      }
    : undefined;

  useEffect(
    () => () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    },
    [imagePreview]
  );

  const selectImage = (file: File | null) => {
    if (!file) return;
    if (!CHAT_IMAGE_TYPES.has(file.type)) {
      void showSweetToast({
        tone: 'error',
        message: t('workerDashboard.chatPanel.imageTypeError'),
      });
      return;
    }
    if (file.size > CHAT_IMAGE_MAX_BYTES) {
      void showSweetToast({
        tone: 'error',
        message: t('workerDashboard.chatPanel.imageSizeError'),
      });
      return;
    }
    onImageChange(file);
  };

  return (
    <AnimatePresence>
      {open && request && (
        <>
          <motion.button
            type="button"
            aria-label={t('workerDashboard.chatPanel.closeChat')}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 z-[60] bg-slate-950/25 backdrop-blur-[2px] lg:hidden"
          />
          <motion.aside
            initial={{ opacity: 0, x: 36, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 36, scale: 0.98 }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className={`absolute inset-0 z-[70] flex min-h-0 flex-col overflow-hidden bg-slate-50 pointer-events-auto sm:inset-x-3 sm:bottom-3 sm:top-3 sm:rounded-[28px] sm:border sm:border-white/80 sm:shadow-[0_28px_80px_rgba(15,23,42,0.24)] lg:inset-y-4 ${
              dockBesideRequestsPanel ? 'lg:left-4 lg:right-4' : 'lg:left-auto lg:right-4 lg:w-[410px]'
            }`}
            style={desktopDockedStyle}
            aria-label={t('workerDashboard.chatPanel.chatWith', { name: request.client?.name || t('workerDashboard.chatPanel.clientFallback') })}
          >
            <header className="shrink-0 border-b border-slate-200/80 bg-white px-4 py-3.5 dark:bg-slate-900 dark:border-white/10">
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  {request.client?.profile_image_url ? (
                    <img
                      src={normalizeImageUrl(request.client.profile_image_url)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      onError={(event) => {
                        (event.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                      className="h-11 w-11 rounded-full border border-slate-200 object-cover dark:border-white/10"
                    />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-100 text-sm font-black text-bird-blue">
                      {getInitials(request.client?.name || t('workerDashboard.chatPanel.clientNameFallback'))}
                    </div>
                  )}
                  <span
                    className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white ${
                      connected ? 'bg-emerald-500' : 'bg-amber-400'
                    }`}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-black text-slate-950">
                      {request.client?.name || t('workerDashboard.chatPanel.clientNameFallback')}
                    </h3>
                    <ShieldCheck className="h-4 w-4 shrink-0 text-bird-blue" />
                  </div>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                    {connected ? (
                      <Wifi className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <WifiOff className="h-3.5 w-3.5 text-amber-500" />
                    )}
                    {connected ? t('workerDashboard.chatPanel.liveChat') : t('workerDashboard.chatPanel.reconnecting')}
                    <span className="text-slate-300">•</span>
                    <span className="truncate">{localizeClientServiceName(request.service_name, i18n.language)} #{request.id_request}</span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  title={t('workerDashboard.chatPanel.closeChatTitle')}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:bg-slate-900 dark:border-white/10"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </header>

            <div className="flex items-center gap-2 border-b border-slate-200/70 bg-sky-50/80 px-4 py-2.5 text-[10px] font-bold text-sky-800 dark:border-white/10">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              {t('workerDashboard.chatPanel.keepDetailsInside')}
            </div>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5">
              {messages.length === 0 ? (
                <div className="flex h-full min-h-[260px] flex-col items-center justify-center text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-bird-blue shadow-sm dark:bg-slate-900">
                    <MessageCircle className="h-6 w-6" />
                  </div>
                  <h4 className="mt-4 text-sm font-black text-slate-900 dark:text-slate-100">{t('workerDashboard.chatPanel.startConversation')}</h4>
                  <p className="mt-1 max-w-[250px] text-xs font-semibold leading-5 text-slate-500">
                    {t('workerDashboard.chatPanel.confirmArrivalDetails')}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleMessages.map((message, index) => {
                    const mine = message.sender_role === 'worker';
                    const previous = visibleMessages[index - 1];
                    const showDate =
                      !previous ||
                      new Date(previous.created_at).toDateString() !==
                        new Date(message.created_at).toDateString();
                    return (
                      <React.Fragment key={message.id_message}>
                        {showDate && <ChatDate date={message.created_at} />}
                        <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[84%] overflow-hidden px-3.5 py-2.5 text-[13px] leading-5 shadow-sm ${
                              mine
                                ? 'rounded-[20px] rounded-br-md bg-bird-blue text-white'
                                : 'rounded-[20px] rounded-bl-md border border-slate-200/80 bg-white text-slate-800'
                            }`}
                          >
                            {message.image_url && (
                              <a
                                href={normalizeImageUrl(message.image_url)}
                                target="_blank"
                                rel="noreferrer"
                                className={`block overflow-hidden rounded-xl ${
                                  message.message ? 'mb-2' : ''
                                }`}
                              >
                                <img
                                  src={normalizeImageUrl(message.image_url)}
                                  alt={t('workerDashboard.chatPanel.chatAttachment')}
                                  loading="lazy"
                                  decoding="async"
                                  onError={(event) => {
                                    const img = event.currentTarget as HTMLImageElement;
                                    img.style.display = 'none';
                                  }}
                                  className="max-h-64 w-full object-cover"
                                />
                              </a>
                            )}
                            {message.message && (
                              <p className="whitespace-pre-wrap break-words">{message.message}</p>
                            )}
                            <div
                              className={`mt-1 flex items-center justify-end gap-1 text-[9px] font-semibold ${
                                mine ? 'text-white/65' : 'text-slate-400'
                              }`}
                            >
                              {new Date(message.created_at).toLocaleTimeString(dateLocale, {
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                              {mine && <CheckCheck className="h-3 w-3" />}
                            </div>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                  <div ref={endRef} />
                </div>
              )}
            </div>

            <footer className="shrink-0 border-t border-slate-200 bg-white p-3 dark:bg-slate-900 dark:border-white/10">
              {imagePreview && image && (
                <div className="mb-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2 dark:bg-slate-800 dark:border-white/10">
                  <img
                    src={imagePreview}
                    alt={t('workerDashboard.chatPanel.selectedAttachment')}
                    className="h-12 w-12 rounded-xl object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-black text-slate-700 dark:text-slate-300">{image.name}</p>
                    <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                      {(image.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onImageChange(null)}
                    title={t('workerDashboard.chatPanel.removeAttachment')}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-400 shadow-sm hover:text-red-500 dark:bg-slate-900"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={busy}
                onChange={(event) => {
                  selectImage(event.target.files?.[0] || null);
                  event.target.value = '';
                }}
              />

              <div className="flex items-end gap-2 rounded-[22px] border border-slate-200 bg-slate-50 p-2 shadow-inner focus-within:border-sky-300 focus-within:ring-2 focus-within:ring-sky-100 dark:bg-slate-800 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                  title={t('workerDashboard.chatPanel.attachImage')}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white hover:text-bird-blue disabled:opacity-40"
                >
                  <ImagePlus className="h-[18px] w-[18px]" />
                </button>
                <textarea
                  id={`worker-chat-input-${request.id_request}`}
                  value={text}
                  onChange={(event) => onTextChange(event.target.value.slice(0, 500))}
                  onInput={(event) => {
                    const target = event.currentTarget;
                    target.style.height = '36px';
                    target.style.height = `${Math.min(target.scrollHeight, 112)}px`;
                  }}
                  maxLength={500}
                  rows={1}
                  disabled={busy}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      if (canSend) onSend();
                    }
                  }}
                  placeholder={t('workerDashboard.chatPanel.writeMessage')}
                  className="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-sm leading-5 text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-200"
                />
                <button
                  type="button"
                  onClick={onSend}
                  disabled={!canSend}
                  title={t('workerDashboard.chatPanel.sendMessage')}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bird-blue text-white shadow-[0_8px_18px_rgba(0,144,255,0.25)] transition hover:bg-bird-darkBlue active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                >
                  <Send className={`h-4 w-4 ${busy ? 'animate-pulse' : ''}`} />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between px-1 text-[9px] font-semibold text-slate-400">
                <span>{t('workerDashboard.chatPanel.enterToSend')}</span>
                <span>{text.length}/500</span>
              </div>
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};

const getInitials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'CL';

const ChatDate = ({ date }: { date: string }) => {
  const value = new Date(date);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const dateLocale = i18n.language === 'es' ? 'es-SV' : 'en-US';
  const label =
    value.toDateString() === today.toDateString()
      ? i18n.t('workerDashboard.chatPanel.today')
      : value.toDateString() === yesterday.toDateString()
        ? i18n.t('workerDashboard.chatPanel.yesterday')
        : value.toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' });

  return (
    <div className="flex items-center gap-3 py-1">
      <span className="h-px flex-1 bg-slate-200" />
      <span className="text-[9px] font-black uppercase text-slate-400">{label}</span>
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  );
};
