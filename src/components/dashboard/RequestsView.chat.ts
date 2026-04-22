import type { ChatMessage } from './RequestsView.types';

export const getLatestChatMessageId = (messages: ChatMessage[]) =>
  messages.length > 0 ? Number(messages[messages.length - 1].id_message || 0) : 0;

export const mergeChatMessages = (current: ChatMessage[], incoming: ChatMessage[]) => {
  const byId = new Map<number, ChatMessage>();

  for (const message of current) {
    byId.set(Number(message.id_message), message);
  }

  for (const message of incoming) {
    byId.set(Number(message.id_message), message);
  }

  return Array.from(byId.values()).sort((left, right) => {
    const leftId = Number(left.id_message || 0);
    const rightId = Number(right.id_message || 0);
    return leftId - rightId;
  });
};

export const getRealtimeChatMessages = (payload: unknown, idRequest: number): ChatMessage[] => {
  const messages = (payload as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(messages)) return [];

  return messages.filter((message): message is ChatMessage => {
    const item = message as Partial<ChatMessage>;
    return Number(item.id_request) === idRequest && Number.isFinite(Number(item.id_message));
  });
};
