import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, X, Plus } from 'lucide-react';
import { useSupportChat } from '../../hooks/useSupportChat';
import { SupportThreadList } from './SupportThreadList';
import { SupportChatWindow } from './SupportChatWindow';
import { SupportCreateThread } from './SupportCreateThread';

interface SupportChatWidgetProps {
  token: string | null;
  userName?: string;
}

export const SupportChatWidget: React.FC<SupportChatWidgetProps> = ({ token, userName }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const {
    threads,
    activeThreadId,
    activeThread,
    messages,
    isLoading,
    isSending,
    isSocketConnected,
    openThread,
    closeThread,
    createThread,
    sendMessage,
  } = useSupportChat({ token, isOpen });

  const hasUnread = threads.some((t) => t.unreadCount > 0);
  const isLoggedIn = !!token;

  const handleToggle = () => {
    if (!isLoggedIn) {
      // TODO: trigger login modal if needed
      return;
    }
    setIsOpen(!isOpen);
    if (!isOpen) {
      setShowCreateForm(false);
    }
  };

  const handleCreateThread = async (subject: string, message: string) => {
    const thread = await createThread({ subject, message });
    if (thread) {
      setShowCreateForm(false);
    }
  };

  const handleBackToList = () => {
    closeThread();
    setShowCreateForm(false);
  };

  if (!isLoggedIn) return null;

  return (
    <>
      {/* Floating Action Button - softer, more human */}
      <button
        onClick={handleToggle}
        className="fixed bottom-6 right-6 z-[200] flex h-14 w-14 items-center justify-center rounded-2xl border border-white/40 bg-bird-blue/95 text-white shadow-[0_10px_30px_rgba(0,0,0,0.18)] backdrop-blur-xl transition-all duration-200 hover:bg-bird-blue hover:shadow-[0_14px_36px_rgba(0,0,0,0.22)] active:scale-[0.96]"
        aria-label="Open support"
      >
        {isOpen ? (
          <X size={23} />
        ) : (
          <div className="relative">
            <MessageCircle size={23} />
            {hasUnread && (
              <div className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-[2px] border-white bg-red-500" />
            )}
          </div>
        )}
      </button>

      {/* Support Drawer / Panel */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[210] flex items-end justify-center lg:items-center">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Main Panel - Liquid glass / more human & premium */}
            <motion.div
              initial={{ y: 80, opacity: 0, scale: 0.985 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 60, opacity: 0, scale: 0.985 }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="relative z-10 flex h-[94vh] w-full max-w-[440px] flex-col overflow-hidden rounded-t-[26px] border border-white/60 bg-white/95 shadow-[0_25px_70px_-15px_rgba(15,23,42,0.18),0_10px_20px_-5px_rgba(15,23,42,0.1)] backdrop-blur-2xl lg:h-[640px] lg:rounded-[26px]"
            >
              {/* Header - softer */}
              <div className="flex items-center justify-between border-b border-white/50 bg-white/70 px-5 py-4 backdrop-blur-xl">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-[17px] font-black tracking-[-0.2px] text-gray-900">Support</div>
                    {isOpen && (
                      <div
                        className={`h-2 w-2 rounded-full ${isSocketConnected ? 'bg-emerald-500' : 'bg-gray-300'}`}
                        title={isSocketConnected ? 'Connected in real time' : 'Offline mode'}
                      />
                    )}
                  </div>
                  <div className="truncate text-xs font-medium text-gray-500">
                    {activeThread ? activeThread.subject : "We're here to help"}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!activeThreadId && !showCreateForm && (
                    <button
                      onClick={() => setShowCreateForm(true)}
                      className="flex items-center gap-1.5 rounded-2xl border border-bird-blue/10 bg-bird-blue px-3.5 py-2 text-sm font-bold text-white shadow-sm transition active:scale-[0.985] hover:bg-bird-darkBlue"
                    >
                      <Plus size={15} /> New case
                    </button>
                  )}

                  <button
                    onClick={() => setIsOpen(false)}
                    className="flex h-9 w-9 items-center justify-center rounded-2xl text-gray-400 transition hover:bg-white/70 hover:text-gray-600"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Content Area */}
              <div className="flex-1 overflow-hidden">
                {showCreateForm ? (
                  <SupportCreateThread
                    onSubmit={handleCreateThread}
                    onCancel={() => setShowCreateForm(false)}
                    isSending={isSending}
                  />
                ) : activeThreadId && activeThread ? (
                  <SupportChatWindow
                    thread={activeThread}
                    messages={messages}
                    onSendMessage={sendMessage}
                    onBack={handleBackToList}
                    isSending={isSending}
                  />
                ) : (
                  <SupportThreadList
                    threads={threads}
                    isLoading={isLoading}
                    onOpenThread={openThread}
                    onNewThread={() => setShowCreateForm(true)}
                  />
                )}
              </div>

              {/* Footer - more subtle */}
              <div className="border-t border-white/50 bg-white/60 px-5 py-3 text-center text-[11px] font-medium text-gray-500 backdrop-blur">
                We usually reply within 2 hours
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
