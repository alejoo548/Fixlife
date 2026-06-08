import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { showSweetToast } from '../../../utils/sweetAlert';
import type { ChatMessage, WorkerRequest } from './workerRequestTypes';

const CHAT_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

interface WorkerRequestChatPanelProps {
  open: boolean;
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
}

export const WorkerRequestChatPanel: React.FC<WorkerRequestChatPanelProps> = ({
  open,
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
}) => (
  <AnimatePresence>
    {open && request && (
      <motion.div
        initial={{ opacity: 0, x: 22, scale: 0.98 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 22, scale: 0.98 }}
        className="absolute bottom-5 right-4 z-[520] w-[340px] max-w-[calc(100%-2rem)] pointer-events-auto"
      >
        <div className="rounded-[1.8rem] border border-white/75 bg-white/95 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.18)] backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-bird-blue">Client chat</p>
              <h4 className="mt-1 text-sm font-black text-slate-950">{request.service_name}</h4>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600 transition hover:bg-slate-200"
            >
              Close
            </button>
          </div>

          <div className="mt-4 max-h-52 space-y-2 overflow-y-auto pr-1">
            {messages.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-[11px] font-semibold text-slate-500">
                Chat ready. Send the first update to your client.
              </div>
            ) : (
              messages.slice(-30).map((message) => (
                <div
                  key={message.id_message}
                  className={`rounded-2xl px-3 py-2 text-[11px] ${
                    message.sender_role === 'worker' ? 'bg-bird-blue/10' : 'bg-emerald-100/70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold">{message.sender_role === 'worker' ? 'You' : 'Client'}</span>
                    <span className="text-[10px] font-medium text-slate-400">
                      {new Date(message.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  {message.message ? <p className="mt-1 leading-relaxed">{message.message}</p> : null}
                  {message.image_url && (
                    <a
                      href={message.image_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 block overflow-hidden rounded-xl border border-white/70 shadow-sm"
                    >
                      <img
                        src={message.image_url}
                        alt="Chat attachment"
                        className="max-h-40 w-full object-cover"
                      />
                    </a>
                  )}
                </div>
              ))
            )}
            <div ref={endRef} />
          </div>

          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <input
              id={`worker-chat-input-${request.id_request}`}
              value={text}
              onChange={(event) => onTextChange(event.target.value)}
              maxLength={500}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  onSend();
                }
              }}
              placeholder="Message..."
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-bird-blue/30"
            />
            <button
              type="button"
              onClick={onSend}
              disabled={busy}
              className="rounded-xl bg-bird-blue px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
            >
              Send
            </button>
          </div>

          {image && (
            <div className="mt-2 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
              <span className="truncate">{image.name}</span>
              <button
                type="button"
                onClick={() => onImageChange(null)}
                className="ml-auto rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-slate-500 transition hover:bg-slate-100"
              >
                Remove
              </button>
            </div>
          )}

          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              event.target.value = '';
              if (!file) return;
              if (!CHAT_IMAGE_TYPES.has(file.type)) {
                void showSweetToast({ tone: 'error', message: 'Use a PNG, JPG or WEBP image. GIF is not allowed.' });
                return;
              }
              if (file.size > CHAT_IMAGE_MAX_BYTES) {
                void showSweetToast({ tone: 'error', message: 'Chat images must be 5MB or smaller.' });
                return;
              }
              onImageChange(file);
            }}
            className="mt-2 text-[10px]"
          />
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);
