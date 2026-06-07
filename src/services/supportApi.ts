import { API_ENDPOINTS } from '../config/api';
import { getToken } from '../utils/session';
import { SupportThread, SupportMessage, CreateThreadInput, SendMessageInput } from '../types/support';

const getAuthHeaders = () => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export async function fetchSupportThreads(): Promise<SupportThread[]> {
  const res = await fetch(API_ENDPOINTS.support.threads, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });

  if (!res.ok) {
    throw new Error('Failed to fetch support threads');
  }

  const data = await res.json();
  return data.threads || [];
}

export async function fetchSupportMessages(threadId: number): Promise<SupportMessage[]> {
  const res = await fetch(API_ENDPOINTS.support.messages(threadId), {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });

  if (!res.ok) {
    throw new Error('Failed to fetch messages');
  }

  const data = await res.json();
  return data.messages || [];
}

export async function createSupportThread(input: CreateThreadInput): Promise<SupportThread> {
  const res = await fetch(API_ENDPOINTS.support.threads, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      subject: input.subject,
      priority: input.priority || 'normal',
      initialMessage: input.message,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create support thread');
  }

  const data = await res.json();
  return data.thread;
}

export async function sendSupportMessage(
  input: SendMessageInput
): Promise<SupportMessage> {
  const headers = getAuthHeaders();
  const body = input.image
    ? (() => {
        const form = new FormData();
        if (input.message.trim()) form.append('message', input.message.trim());
        form.append('image', input.image);
        return form;
      })()
    : JSON.stringify({
        message: input.message,
      });

  const res = await fetch(API_ENDPOINTS.support.messages(input.threadId), {
    method: 'POST',
    headers: input.image
      ? headers
      : {
          'Content-Type': 'application/json',
          ...headers,
        },
    body,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to send message');
  }

  const data = await res.json();
  return data.message;
}
