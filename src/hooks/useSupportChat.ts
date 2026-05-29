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

/**
 * useSupportChat - Real implementation (Fase 1)
 * 
 * Uses real REST API + Socket.IO for the support chat.
 */
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

  // Socket.IO setup
  useEffect(() => {
    if (!token || !isOpen) {
      disconnectSupportSocket();
      setIsSocketConnected(false);
      return;
    }

    const s = connectSupportSocket({
      token,
      onNewMessage: (message) => {
        // Real-time message received
        setMessagesByThread((prev) => {
          const current = prev[message.threadId] || [];
          // Avoid duplicates
          if (current.some((m) => m.id === message.id)) {
            return prev;
          }
          return {
            ...prev,
            [message.threadId]: [...current, message],
          };
        });

        // Update last activity in thread list
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

  // Load threads when the widget opens
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
          setError('No pudimos cargar tus casos de soporte.');
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

    // Mark as read locally
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, unreadCount: 0 } : t))
    );

    // Join socket room for real-time updates
    if (isSupportSocketConnected()) {
      joinSupportThread(threadId);
    }

    // Load messages if we don't have them yet
    if (!messagesByThread[threadId]) {
      try {
        const msgs = await fetchSupportMessages(threadId);
        setMessagesByThread((prev) => ({ ...prev, [threadId]: msgs }));
      } catch {
        // silent fail for now
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
        senderName: 'Tú',
        message: input.message,
        createdAt: new Date().toISOString(),
      };

      setThreads((prev) => [newThread, ...prev]);
      setMessagesByThread((prev) => ({
        ...prev,
        [newThread.id]: [firstMessage],
      }));
      setActiveThreadId(newThread.id);

      // Join the new thread room
      if (isSupportSocketConnected()) {
        joinSupportThread(newThread.id);
      }

      return newThread;
    } catch (e: any) {
      setError(e.message || 'No pudimos abrir el caso de soporte.');
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
      if (isSupportSocketConnected()) {
        emitSupportMessage({
          threadId: activeThreadId,
          message: trimmed,
        });
      } else {
        // Fallback to REST when offline
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

      // Update thread list
      setThreads((prev) =>
        prev.map((t) =>
          t.id === activeThreadId
            ? { ...t, lastMessageAt: new Date().toISOString() }
            : t
        )
      );
    } catch (e: any) {
      setError(e.message || 'No pudimos enviar el mensaje.');
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
