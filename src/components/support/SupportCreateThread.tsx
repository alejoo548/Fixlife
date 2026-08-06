import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { hasUnsafeSupportText, sanitizeSupportTextInput } from '../../utils/supportSecurity';
import { useProfanityGuard } from '../../hooks/useProfanityGuard';

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
  const { t } = useTranslation();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const hasUnsafeContent = hasUnsafeSupportText(subject) || hasUnsafeSupportText(message);
  const subjectGuard = useProfanityGuard();
  const messageGuard = useProfanityGuard();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim() || isSending || hasUnsafeContent) return;
    onSubmit(subject.trim(), message.trim());
  };

  return (
    <div className="h-full overflow-y-auto px-5 py-6">
      <div className="mb-6">
        <div className="text-xl font-black text-gray-900 dark:text-slate-100">{t('serviceRequest.supportWidget.newSupportCase')}</div>
        <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
          {t('serviceRequest.supportWidget.newSupportCaseHelp')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-1.5 block text-[10px] font-bold tracking-[0.8px] text-gray-500 dark:text-slate-400">
            {t('serviceRequest.supportWidget.subjectLabel')}
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(subjectGuard.guardValue(sanitizeSupportTextInput(e.target.value, 120, true)))}
            placeholder={t('serviceRequest.supportWidget.subjectPlaceholder')}
            className="w-full rounded-3xl border border-gray-200/70 bg-white px-4 py-3.5 text-[15px] font-medium placeholder:text-gray-400 focus:border-bird-blue focus:outline-none dark:bg-slate-900 dark:border-white/10"
            maxLength={80}
            required
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[10px] font-bold tracking-[0.8px] text-gray-500 dark:text-slate-400">
            {t('serviceRequest.supportWidget.issueLabel')}
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(messageGuard.guardValue(sanitizeSupportTextInput(e.target.value, 2000)))}
            placeholder={t('serviceRequest.supportWidget.issuePlaceholder')}
            rows={6}
            className="w-full resize-none rounded-3xl border border-gray-200/70 bg-white px-4 py-3.5 text-[15px] font-medium placeholder:text-gray-400 focus:border-bird-blue focus:outline-none dark:bg-slate-900 dark:border-white/10"
            required
          />
          <div className={`mt-1 text-right text-[10px] ${hasUnsafeContent || messageGuard.warning ? 'text-red-500' : 'text-gray-400'}`}>
            {hasUnsafeContent
              ? t('serviceRequest.supportWidget.unsafeText')
              : messageGuard.warning || `${message.length}/2000`}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSending}
            className="flex-1 rounded-3xl border border-gray-200/70 py-3.5 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:text-slate-300 dark:border-white/10"
          >
            {t('serviceRequest.supportWidget.cancel')}
          </button>
          <button
            type="submit"
            disabled={isSending || hasUnsafeContent || !subject.trim() || !message.trim()}
            className="flex-1 rounded-3xl bg-bird-blue py-3.5 text-sm font-bold text-white shadow-sm transition active:scale-[0.985] hover:bg-bird-darkBlue disabled:opacity-60"
          >
            {isSending ? t('serviceRequest.supportWidget.openingCase') : t('serviceRequest.supportWidget.openCase')}
          </button>
        </div>
      </form>
    </div>
  );
};
