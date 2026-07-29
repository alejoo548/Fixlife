import React, { useRef, useState } from 'react';
import { Send, Paperclip, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { hasUnsafeSupportText, sanitizeSupportTextInput } from '../../utils/supportSecurity';
import { useProfanityGuard } from '../../hooks/useProfanityGuard';

interface SupportMessageInputProps {
  onSend: (message: string, image?: File | null) => void;
  disabled?: boolean;
}

export const SupportMessageInput: React.FC<SupportMessageInputProps> = ({
  onSend,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasUnsafeContent = hasUnsafeSupportText(message);
  const { warning: profanityWarning, guardValue } = useProfanityGuard();

  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

  const handlePickImage = (file: File | null) => {
    setImageError(null);
    if (!file) {
      setImage(null);
      return;
    }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setImage(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setImageError(t('serviceRequest.supportWidget.onlyImages'));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImage(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setImageError(t('serviceRequest.supportWidget.imageTooLarge'));
      return;
    }
    setImage(file);
  };

  const handleSend = () => {
    const trimmed = message.trim();
    if ((!trimmed && !image) || disabled || hasUnsafeContent) return;

    onSend(trimmed, image);
    setMessage('');
    setImage(null);
    setImageError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-white/50 bg-white/70 p-3 backdrop-blur">
      {image && (
        <div className="mb-2 flex items-center justify-between rounded-2xl border border-gray-200/70 bg-white px-3 py-2 text-xs text-gray-600">
          <span className="truncate pr-3">{image.name}</span>
          <button
            type="button"
            onClick={() => {
              setImage(null);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div className="flex items-center gap-2 rounded-3xl border border-gray-200/70 bg-white pl-4 pr-2 py-2 shadow-inner">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => handlePickImage(e.target.files?.[0] || null)}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="text-gray-400 transition hover:text-gray-500"
          disabled={disabled}
        >
          <Paperclip size={18} />
        </button>

        <input
          value={message}
          onChange={(e) => setMessage(guardValue(sanitizeSupportTextInput(e.target.value, 2000)))}
          onKeyDown={handleKeyDown}
          placeholder={t('serviceRequest.supportWidget.typeMessage')}
          maxLength={2000}
          className="flex-1 bg-transparent text-[15px] placeholder:text-gray-400 focus:outline-none"
          disabled={disabled}
        />

        <button
          onClick={handleSend}
          disabled={disabled || hasUnsafeContent || (!message.trim() && !image)}
          className="flex h-9 w-9 items-center justify-center rounded-2xl bg-bird-blue text-white transition active:scale-[0.94] disabled:opacity-50"
        >
          <Send size={17} />
        </button>
      </div>

      <div className={`mt-2 text-center text-[10px] ${imageError || hasUnsafeContent || profanityWarning ? 'text-red-500' : 'text-gray-400'}`}>
        {imageError
          ? imageError
          : hasUnsafeContent
            ? t('serviceRequest.supportWidget.unsafeText')
            : profanityWarning
              ? profanityWarning
              : t('serviceRequest.supportWidget.supportHours')}
      </div>
    </div>
  );
};
