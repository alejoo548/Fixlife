import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_ENDPOINTS } from '../../../config/api';
import { useSSE } from '../../../hooks/useSSE';

type ToastType = 'success' | 'error' | 'info';

export interface ServiceRequestChatMessage {
  id_message: number;
  id_request: number;
  sender_role: 'client' | 'worker';
  message: string | null;
  image_url: string | null;
  created_at: string;
}

export interface ServiceRequestChatRequestLike {
  id_request: number;
  status: string;
  assigned_worker?: unknown | null;
}

interface UseServiceRequestChatOptions<TRequest extends ServiceRequestChatRequestLike> {
  isOpen: boolean;
  requests: TRequest[];
  token: string | null;
  canUseRequestChat: (request: TRequest) => boolean;
  showToast: (type: ToastType, message: string) => void;
}

const CHAT_POLL_FALLBACK_MS = 20000;

const getLatestChatMessageId = (messages: ServiceRequestChatMessage[]) =>
  messages.length > 0 ? Number(messages[messages.length - 1].id_message || 0) : 0;

const mergeChatMessages = (
  current: ServiceRequestChatMessage[],
  incoming: ServiceRequestChatMessage[]
) => {
  const byId = new Map<number, ServiceRequestChatMessage>();

  for (const message of current) {
    byId.set(Number(message.id_message), message);
  }

  for (const message of incoming) {
    byId.set(Number(message.id_message), message);
  }

  return Array.from(byId.values()).sort(
    (left, right) => Number(left.id_message || 0) - Number(right.id_message || 0)
  );
};

export function useServiceRequestChat<TRequest extends ServiceRequestChatRequestLike>({
  isOpen,
  requests,
  token,
  canUseRequestChat,
  showToast,
}: UseServiceRequestChatOptions<TRequest>) {
  const [openChatRequestId, setOpenChatRequestId] = useState<number | null>(null);
  const [chatByRequest, setChatByRequest] = useState<Record<number, ServiceRequestChatMessage[]>>({});
  const [chatMessage, setChatMessage] = useState<Record<number, string>>({});
  const [chatImage, setChatImage] = useState<Record<number, File | null>>({});
  const [chatBusyId, setChatBusyId] = useState<number | null>(null);
  const supportsSSE = typeof window !== 'undefined' && 'EventSource' in window;

  const openChatRequest = useMemo(
    () =>
      openChatRequestId
        ? requests.find((request) => request.id_request === openChatRequestId) || null
        : null,
    [requests, openChatRequestId]
  );
  const canUseOpenChat = !!openChatRequest && canUseRequestChat(openChatRequest);

  const fetchRequestChat = useCallback(
    async (idRequest: number, options: { silent?: boolean; incremental?: boolean } = {}) => {
      if (!token) return;
      const silent = options.silent === true;
      const currentChat = chatByRequest[idRequest] || [];
      const afterId = options.incremental ? getLatestChatMessageId(currentChat) : 0;
      const chatUrl =
        afterId > 0
          ? `${API_ENDPOINTS.services.requestChat(idRequest)}?after_id=${afterId}`
          : API_ENDPOINTS.services.requestChat(idRequest);

      try {
        const res = await fetch(chatUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await res.json();
        if (!res.ok || !payload?.success) {
          if (!silent) {
            showToast('error', payload?.error || 'Could not load chat.');
          }
          return;
        }

        const nextChat = Array.isArray(payload.chat) ? payload.chat : [];
        setChatByRequest((prev) => {
          const currentItems = prev[idRequest] || [];
          const mergedChat = afterId > 0 ? mergeChatMessages(currentItems, nextChat) : nextChat;
          const currentLastId = currentItems[currentItems.length - 1]?.id_message ?? null;
          const nextLastId = mergedChat[mergedChat.length - 1]?.id_message ?? null;

          if (currentItems.length === mergedChat.length && currentLastId === nextLastId) {
            return prev;
          }

          return { ...prev, [idRequest]: mergedChat };
        });
      } catch {
        if (!silent) {
          showToast('error', 'Network error loading chat.');
        }
      }
    },
    [token, chatByRequest, showToast]
  );

  const sendRequestChat = useCallback(
    async (idRequest: number) => {
      if (!token) return;
      const text = (chatMessage[idRequest] || '').trim();
      const image = chatImage[idRequest] || null;

      if (!text && !image) {
        showToast('error', 'Write a message or attach an image.');
        return;
      }

      setChatBusyId(idRequest);
      try {
        const form = new FormData();
        if (text) form.append('message', text);
        if (image) form.append('chat_images', image);

        const res = await fetch(API_ENDPOINTS.services.requestChat(idRequest), {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        const payload = await res.json();
        if (!res.ok || !payload?.success) {
          showToast('error', payload?.error || 'Could not send message.');
          return;
        }

        setChatMessage((prev) => ({ ...prev, [idRequest]: '' }));
        setChatImage((prev) => ({ ...prev, [idRequest]: null }));
        const createdMessages = Array.isArray(payload?.messages) ? payload.messages : [];
        if (createdMessages.length > 0) {
          setChatByRequest((prev) => ({
            ...prev,
            [idRequest]: mergeChatMessages(prev[idRequest] || [], createdMessages),
          }));
        } else {
          await fetchRequestChat(idRequest, { silent: true });
        }
      } catch {
        showToast('error', 'Network error sending message.');
      } finally {
        setChatBusyId(null);
      }
    },
    [token, chatImage, chatMessage, fetchRequestChat, showToast]
  );

  useEffect(() => {
    if (!openChatRequestId) return;

    if (!openChatRequest) {
      setOpenChatRequestId(null);
      return;
    }

    if (!canUseOpenChat) {
      setOpenChatRequestId(null);
    }
  }, [openChatRequest, openChatRequestId, canUseOpenChat]);

  useSSE({
    token,
    events: {
      chat_message: (data: unknown) => {
        const nextData = data as { id_request?: number } | null;
        if (!isOpen || !openChatRequestId || !canUseOpenChat) return;
        if (nextData?.id_request == null || nextData.id_request === openChatRequestId) {
          void fetchRequestChat(openChatRequestId, { silent: true, incremental: true });
        }
      },
    },
    enabled: isOpen && !!openChatRequestId && canUseOpenChat && supportsSSE,
  });

  useEffect(() => {
    if (!isOpen || !openChatRequestId) return;
    if (!canUseOpenChat || supportsSSE) return;

    const interval = window.setInterval(() => {
      void fetchRequestChat(openChatRequestId, { silent: true, incremental: true });
    }, CHAT_POLL_FALLBACK_MS);

    return () => window.clearInterval(interval);
  }, [isOpen, openChatRequestId, canUseOpenChat, supportsSSE, fetchRequestChat]);

  return {
    openChatRequestId,
    setOpenChatRequestId,
    chatByRequest,
    chatMessage,
    setChatMessage,
    chatImage,
    setChatImage,
    chatBusyId,
    fetchRequestChat,
    sendRequestChat,
    openChatRequest,
    canUseOpenChat,
  };
}
