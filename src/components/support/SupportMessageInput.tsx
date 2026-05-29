import React, { useState } from 'react';
import { Send, Paperclip } from 'lucide-react';

interface SupportMessageInputProps {
  onSend: (message: string, image?: File | null) => void;
  disabled?: boolean;
}

export const SupportMessageInput: React.FC<SupportMessageInputProps> = ({
  onSend,
  disabled = false,
}) => {
  const [message, setMessage] = useState('');

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed || disabled) return;

    onSend(trimmed);
    setMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-white/50 bg-white/70 p-3 backdrop-blur">
      <div className="flex items-center gap-2 rounded-3xl border border-gray-200/70 bg-white pl-4 pr-2 py-2 shadow-inner">
        <button
          type="button"
          className="text-gray-400 transition hover:text-gray-500"
          disabled={disabled}
        >
          <Paperclip size={18} />
        </button>

        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe tu mensaje..."
          maxLength={2000}
          className="flex-1 bg-transparent text-[15px] placeholder:text-gray-400 focus:outline-none"
          disabled={disabled}
        />

        <button
          onClick={handleSend}
          disabled={disabled || !message.trim()}
          className="flex h-9 w-9 items-center justify-center rounded-2xl bg-bird-blue text-white transition active:scale-[0.94] disabled:opacity-50"
        >
          <Send size={17} />
        </button>
      </div>

      <div className="mt-2 text-center text-[10px] text-gray-400">
        Soporte disponible de 8am a 8pm
      </div>
    </div>
  );
};
