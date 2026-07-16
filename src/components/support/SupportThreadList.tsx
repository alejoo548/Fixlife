import React from 'react';
import { Clock, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SupportThread } from '../../types/support';

interface SupportThreadListProps {
  threads: SupportThread[];
  isLoading: boolean;
  onOpenThread: (threadId: number) => void;
  onNewThread: () => void;
}

export const SupportThreadList: React.FC<SupportThreadListProps> = ({
  threads,
  isLoading,
  onOpenThread,
  onNewThread,
}) => {
  const { i18n } = useTranslation();
  const docLanguage = typeof document !== 'undefined' ? document.documentElement.lang : '';
  const currentLanguage = docLanguage || i18n.resolvedLanguage || i18n.language || 'en';
  const isSpanish = currentLanguage.startsWith('es');
  const locale = isSpanish ? 'es-ES' : 'en-US';

  const statusLabel = (status: SupportThread['status']) => {
    if (status === 'open') return isSpanish ? 'abierto' : 'open';
    if (status === 'waiting_for_user') return isSpanish ? 'esperando respuesta' : 'waiting for user';
    if (status === 'resolved') return isSpanish ? 'resuelto' : 'resolved';
    return isSpanish ? 'cerrado' : 'closed';
  };

  const localizeSubject = (subject: string) => {
    const normalized = String(subject || '').trim().toLowerCase();
    if (!isSpanish) return subject;
    if (normalized === 'i have a problem') return 'Tengo un problema';
    if (normalized === 'support request') return 'Solicitud de soporte';
    return subject;
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm font-medium text-gray-500">
          {isSpanish ? 'Cargando tus casos...' : 'Loading your cases...'}
        </div>
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 rounded-2xl bg-gray-100 p-4">
          <MessageCircle size={32} className="text-gray-400" />
        </div>
        <div className="text-lg font-black text-gray-900">
          {isSpanish ? 'No tienes casos abiertos' : 'You have no open cases'}
        </div>
        <p className="mt-2 max-w-[240px] text-sm text-gray-500">
          {isSpanish
            ? 'Tienes una duda o un problema? Abre un nuevo caso de soporte.'
            : 'Have a question or problem? Open a new support case.'}
        </p>
        <button
          onClick={onNewThread}
          className="mt-6 rounded-2xl bg-bird-blue px-6 py-3 text-sm font-bold text-white transition hover:bg-bird-darkBlue"
        >
          {isSpanish ? 'Abrir nuevo caso' : 'Open new case'}
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar px-2 py-2">
      {threads.map((thread) => {
        const lastDate = new Date(thread.lastMessageAt);
        const isRecent = Date.now() - lastDate.getTime() < 1000 * 60 * 60 * 3;

        return (
          <button
            key={thread.id}
            onClick={() => onOpenThread(thread.id)}
            className="group mb-2 flex w-full items-start gap-3 rounded-3xl border border-transparent bg-white p-4 text-left transition-all hover:border-gray-200/70 hover:shadow-sm active:scale-[0.985]"
          >
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-bird-blue/10 to-bird-lightBlue/10 text-bird-blue">
              <MessageCircle size={18} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-[15px] font-bold text-gray-900 group-hover:text-bird-blue">
                  {localizeSubject(thread.subject)}
                </div>
                {thread.unreadCount > 0 && (
                  <div className="shrink-0 rounded-full bg-red-500 px-2 py-px text-[10px] font-bold text-white">
                    {thread.unreadCount}
                  </div>
                )}
              </div>

              <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                <Clock size={13} />
                <span>
                  {isRecent
                    ? lastDate.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
                    : lastDate.toLocaleDateString(locale)}
                </span>
                <span className="text-gray-300">•</span>
                <span className="capitalize">
                  {statusLabel(thread.status)}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};
