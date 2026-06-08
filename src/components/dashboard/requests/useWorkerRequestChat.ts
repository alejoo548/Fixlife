import { useEffect, useRef, useState } from 'react';
import { API_ENDPOINTS } from '../../../config/api';
import { showSweetToast } from '../../../utils/sweetAlert';
import type { ChatMessage } from './workerRequestTypes';
import { getLatestChatMessageId, mergeChatMessages } from './workerRequestUtils';

interface UseWorkerRequestChatOptions {
  token: string | null;
  requestId: number | null;
  enabled: boolean;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
}

export const useWorkerRequestChat = ({
  token,
  requestId,
  enabled,
  panelOpen,
  setPanelOpen,
}: UseWorkerRequestChatOptions) => {
  const [chatByRequest, setChatByRequest] = useState<Record<number, ChatMessage[]>>({});
  const [chatTextByRequest, setChatTextByRequest] = useState<Record<number, string>>({});
  const [chatImageByRequest, setChatImageByRequest] = useState<Record<number, File | null>>({});
  const [chatBusyId, setChatBusyId] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const fetchRequestChat = async (
    idRequest: number,
    options: { silent?: boolean; incremental?: boolean } = {}
  ) => {
    if (!token) return;
    const current = chatByRequest[idRequest] || [];
    const afterId = options.incremental ? getLatestChatMessageId(current) : 0;
    const url =
      afterId > 0
        ? `${API_ENDPOINTS.services.requestChat(idRequest)}?after_id=${afterId}`
        : API_ENDPOINTS.services.requestChat(idRequest);
    try {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        if (!options.silent) {
          void showSweetToast({ tone: 'error', message: payload?.error || 'Could not load chat.' });
        }
        return;
      }
      const incoming = Array.isArray(payload.chat) ? payload.chat : [];
      setChatByRequest((previous) => {
        const existing = previous[idRequest] || [];
        const merged = afterId > 0 ? mergeChatMessages(existing, incoming) : incoming;
        const unchanged =
          existing.length === merged.length &&
          existing[existing.length - 1]?.id_message === merged[merged.length - 1]?.id_message;
        return unchanged ? previous : { ...previous, [idRequest]: merged };
      });
    } catch {
      if (!options.silent) {
        void showSweetToast({ tone: 'error', message: 'Network error loading chat.' });
      }
    }
  };

  const sendChat = async (idRequest: number) => {
    if (!token) return;
    const text = (chatTextByRequest[idRequest] || '').trim();
    const image = chatImageByRequest[idRequest] || null;
    if (!text && !image) return;

    setChatBusyId(idRequest);
    try {
      const form = new FormData();
      if (text) form.append('message', text);
      if (image) form.append('chat_images', image);
      const response = await fetch(API_ENDPOINTS.services.requestChat(idRequest), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        void showSweetToast({ tone: 'error', message: payload?.error || 'Could not send message.' });
        return;
      }
      setChatTextByRequest((previous) => ({ ...previous, [idRequest]: '' }));
      setChatImageByRequest((previous) => ({ ...previous, [idRequest]: null }));
      const created = Array.isArray(payload?.messages) ? payload.messages : [];
      if (created.length > 0) {
        setChatByRequest((previous) => ({
          ...previous,
          [idRequest]: mergeChatMessages(previous[idRequest] || [], created),
        }));
      } else {
        await fetchRequestChat(idRequest, { silent: true });
      }
    } catch {
      void showSweetToast({ tone: 'error', message: 'Network error sending chat message.' });
    } finally {
      setChatBusyId(null);
    }
  };

  useEffect(() => {
    if (requestId && enabled && panelOpen) void fetchRequestChat(requestId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId, token, enabled, panelOpen]);

  useEffect(() => {
    if (!requestId || !enabled) setPanelOpen(false);
  }, [enabled, requestId, setPanelOpen]);

  useEffect(() => {
    if (panelOpen) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chatByRequest, panelOpen, requestId]);

  return {
    chatBusyId,
    chatByRequest,
    chatImageByRequest,
    chatTextByRequest,
    endRef,
    fetchRequestChat,
    sendChat,
    setChatByRequest,
    setChatImageByRequest,
    setChatTextByRequest,
  };
};
