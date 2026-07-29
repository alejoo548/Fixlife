import React, { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SupportThread, SupportMessage } from '../../types/support';
import { ArrowLeft } from 'lucide-react';
import { SupportMessageInput } from './SupportMessageInput';
import { SupportProtectedImage } from './SupportProtectedImage';
import { getSafeSupportDisplayText } from '../../utils/supportSecurity';

interface SupportChatWindowProps {
  thread: SupportThread;
  messages: SupportMessage[];
  onSendMessage: (input: { threadId: number; message: string; image?: File | null }) => void;
  onBack: () => void;
  isSending: boolean;
}

export const SupportChatWindow: React.FC<SupportChatWindowProps> = ({
  thread,
  messages,
  onSendMessage,
  onBack,
  isSending,
}) => {
  const { t, i18n } = useTranslation();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = (msg: string, image?: File | null) => {
    onSendMessage({
      threadId: thread.id,
      message: msg,
      image,
    });
  };

  return (
    <div className="flex h-full flex-col bg-[#f8f9fb]">
      {/* Chat Header */}
      <div className="flex items-center gap-3 border-b bg-white px-4 py-3">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-gray-900">{thread.subject}</div>
          <div className="text-xs text-gray-500">{t('serviceRequest.supportWidget.chatHeader')}</div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 custom-scrollbar">
        {messages.length === 0 && (
          <div className="py-8 text-center text-sm text-gray-500">
            {t('serviceRequest.supportWidget.conversationStart')}
          </div>
        )}

        {messages.map((msg) => {
          const isMine = msg.senderRole !== 'admin';
          const safeMessage = getSafeSupportDisplayText(msg.message);

          return (
            <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[83%] rounded-3xl px-4 py-[13px] text-[14.8px] leading-snug tracking-[-0.1px] shadow-sm ${
                  isMine
                    ? 'bg-bird-blue text-white rounded-br-[14px]'
                    : 'bg-white text-gray-900 border border-gray-100/70 rounded-bl-[14px]'
                }`}
              >
                {!isMine && (
                  <div className="mb-1 text-[10.5px] font-semibold tracking-wide text-bird-blue/90">{msg.senderName}</div>
                )}
                {msg.imageUrl && (
                  <SupportProtectedImage
                    imageUrl={msg.imageUrl}
                    className={msg.message ? 'mb-2' : ''}
                  />
                )}
                {safeMessage && <div>{safeMessage}</div>}
                <div className={`mt-2 text-right text-[9.5px] ${isMine ? 'text-white/50' : 'text-gray-400'}`}>
                  {new Date(msg.createdAt).toLocaleTimeString(i18n.language === 'es' ? 'es-SV' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <SupportMessageInput
        onSend={handleSend}
        disabled={isSending}
      />
    </div>
  );
};
