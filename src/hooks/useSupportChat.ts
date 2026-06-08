import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SupportThread,
  SupportMessage,
  CreateThreadInput,
  SendMessageInput,
} from '../types/support';
import {
  fetchSupportThreads,
  fetchSupportMessages,
  createSupportThread,
  sendSupportMessage,
} from '../services/supportApi';
import {
  connectSupportSocket,
  disconnectSupportSocket,
  joinSupportThread,
  leaveSupportThread,
  emitSupportMessage,
  isSupportSocketConnected,
} from '../services/supportSocket';

interface UseSupportChatOptions {
  token: string | null;
  isOpen: boolean;
}

export function useSupportChat({ token, isOpen }: UseSupportChatOptions) {
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [messagesByThread, setMessagesByThread] = useState<Record<number, SupportMessage[]>>({});
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  const activeThread = threads.find((t) => t.id === activeThreadId) || null;
  const messages = activeThreadId ? messagesByThread[activeThreadId] || [] : [];

  useEffect(() => {
    if (!token || !isOpen) {
      disconnectSupportSocket();
      setIsSocketConnected(false);
      return;
    }

    connectSupportSocket({
      token,
      onNewMessage: (message) => {
        setMessagesByThread((prev) => {
          const current = prev[message.threadId] || [];
          if (current.some((m) => m.id === message.id)) {
            return prev;
          }
          return {
            ...prev,
            [message.threadId]: [...current, message],
          };
        });

        setThreads((prev) =>
          prev.map((t) =>
            t.id === message.threadId
              ? { ...t, lastMessageAt: message.createdAt }
              : t
          )
        );
      },
      onConnect: () => setIsSocketConnected(true),
      onDisconnect: () => setIsSocketConnected(false),
    });

    return () => {
      disconnectSupportSocket();
    };
  }, [token, isOpen]);

  useEffect(() => {
    if (!token || !isOpen) return;

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await fetchSupportThreads();
        if (!cancelled) {
          setThreads(data);
        }
      } catch (e) {
        if (!cancelled) {
          setError('We could not load your support cases.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [token, isOpen]);

  const openThread = useCallback(async (threadId: number) => {
    setActiveThreadId(threadId);

    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, unreadCount: 0 } : t))
    );

    if (isSupportSocketConnected()) {
      joinSupportThread(threadId);
    }

    if (!messagesByThread[threadId]) {
      try {
        const msgs = await fetchSupportMessages(threadId);
        setMessagesByThread((prev) => ({ ...prev, [threadId]: msgs }));
      } catch {
        setError('Could not load messages.');
      }
    }
  }, [messagesByThread]);

  const createThread = useCallback(async (input: CreateThreadInput) => {
    if (!token) return null;

    setIsSending(true);
    setError(null);

    try {
      const newThread = await createSupportThread(input);

      const firstMessage: SupportMessage = {
        id: Date.now(),
        threadId: newThread.id,
        senderUserId: newThread.userId,
        senderRole: newThread.userRole as any,
        senderName: 'You',
        message: input.message,
        createdAt: new Date().toISOString(),
      };

      setThreads((prev) => [newThread, ...prev]);
      setMessagesByThread((prev) => ({
        ...prev,
        [newThread.id]: [firstMessage],
      }));
      setActiveThreadId(newThread.id);

      if (isSupportSocketConnected()) {
        joinSupportThread(newThread.id);
      }

      return newThread;
    } catch (e: any) {
      setError(e.message || 'We could not open the support case.');
      return null;
    } finally {
      setIsSending(false);
    }
  }, [token]);

  const sendMessage = useCallback(async (input: SendMessageInput) => {
    if (!token || !activeThreadId) return;

    const trimmed = input.message.trim();
    if (!trimmed && !input.image) return;

    setIsSending(true);

    try {
      if (isSupportSocketConnected() && !input.image) {
        emitSupportMessage({
          threadId: activeThreadId,
          message: trimmed,
        });
      } else {
        const newMessage = await sendSupportMessage({
          threadId: activeThreadId,
          message: trimmed,
          image: input.image,
        });

        setMessagesByThread((prev) => ({
          ...prev,
          [activeThreadId]: [...(prev[activeThreadId] || []), newMessage],
        }));
      }

      setThreads((prev) =>
        prev.map((t) =>
          t.id === activeThreadId
            ? { ...t, lastMessageAt: new Date().toISOString() }
            : t
        )
      );
    } catch (e: any) {
      setError(e.message || 'We could not send the message.');
    } finally {
      setIsSending(false);
    }
  }, [token, activeThreadId]);

  const closeThread = useCallback(() => {
    if (activeThreadId && isSupportSocketConnected()) {
      leaveSupportThread(activeThreadId);
    }
    setActiveThreadId(null);
  }, [activeThreadId]);

  return {
    threads,
    activeThreadId,
    activeThread,
    messages,
    isLoading,
    isSending,
    error,
    isSocketConnected,
    openThread,
    closeThread,
    createThread,
    sendMessage,
  };
}
