import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { hasUnsafeSupportText, sanitizeSupportTextInput } from '../../utils/supportSecurity';

interface SupportCreateThreadProps {
  onSubmit: (subject: string, message: string) => void;
  onCancel: () => void;
  isSending: boolean;
}

export const SupportCreateThread: React.FC<SupportCreateThreadProps> = ({
  onSubmit,
  onCancel,
  isSending,
}) => {
  const { i18n } = useTranslation();
  const docLanguage = typeof document !== 'undefined' ? document.documentElement.lang : '';
  const currentLanguage = docLanguage || i18n.resolvedLanguage || i18n.language || 'en';
  const isSpanish = currentLanguage.startsWith('es');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const hasUnsafeContent = hasUnsafeSupportText(subject) || hasUnsafeSupportText(message);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim() || isSending || hasUnsafeContent) return;
    onSubmit(subject.trim(), message.trim());
  };

  return (
    <div className="h-full overflow-y-auto px-5 py-6">
      <div className="mb-6">
        <div className="text-xl font-black text-gray-900">
          {isSpanish ? 'Nuevo caso de soporte' : 'New support case'}
        </div>
        <p className="mt-1 text-sm text-gray-600">
          {isSpanish
            ? 'Cuentanos tu problema o duda. Te responderemos lo antes posible.'
            : "Tell us your problem or question. We'll get back to you as soon as possible."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-1.5 block text-[10px] font-bold tracking-[0.8px] text-gray-500">
            {isSpanish ? 'ASUNTO' : 'SUBJECT'}
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(sanitizeSupportTextInput(e.target.value, 120, true))}
            placeholder={isSpanish ? 'Ej.: No puedo ver mis pagos' : "E.g.: I can't see my payments"}
            className="w-full rounded-3xl border border-gray-200/70 bg-white px-4 py-3.5 text-[15px] font-medium placeholder:text-gray-400 focus:border-bird-blue focus:outline-none"
            maxLength={80}
            required
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[10px] font-bold tracking-[0.8px] text-gray-500">
            {isSpanish ? 'DESCRIBE TU PROBLEMA' : 'DESCRIBE YOUR ISSUE'}
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(sanitizeSupportTextInput(e.target.value, 2000))}
            placeholder={isSpanish ? 'Cuentanos que esta pasando...' : "Tell us what's going on..."}
            rows={6}
            className="w-full resize-none rounded-3xl border border-gray-200/70 bg-white px-4 py-3.5 text-[15px] font-medium placeholder:text-gray-400 focus:border-bird-blue focus:outline-none"
            required
          />
          <div className={`mt-1 text-right text-[10px] ${hasUnsafeContent ? 'text-red-500' : 'text-gray-400'}`}>
            {hasUnsafeContent
              ? (isSpanish ? 'No se permiten caracteres o patrones maliciosos.' : 'Malicious characters or patterns are not allowed.')
              : `${message.length}/2000`}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSending}
            className="flex-1 rounded-3xl border border-gray-200/70 py-3.5 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
          >
            {isSpanish ? 'Cancelar' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={isSending || hasUnsafeContent || !subject.trim() || !message.trim()}
            className="flex-1 rounded-3xl bg-bird-blue py-3.5 text-sm font-bold text-white shadow-sm transition active:scale-[0.985] hover:bg-bird-darkBlue disabled:opacity-60"
          >
            {isSending
              ? (isSpanish ? 'Abriendo caso...' : 'Opening case...')
              : (isSpanish ? 'Abrir caso' : 'Open case')}
          </button>
        </div>
      </form>
    </div>
  );
};
