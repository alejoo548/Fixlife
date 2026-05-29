export type SupportThreadStatus = 'open' | 'waiting_for_user' | 'resolved' | 'closed';
export type SupportPriority = 'low' | 'normal' | 'high';
export type SupportSenderRole = 'client' | 'worker' | 'admin';

export interface SupportThread {
  id: number;
  userId: number;
  userName: string;
  userRole: 'client' | 'worker';
  subject: string;
  status: SupportThreadStatus;
  priority: SupportPriority;
  lastMessageAt: string;
  unreadCount: number;
  createdAt: string;
}

export interface SupportMessage {
  id: number;
  threadId: number;
  senderUserId: number;
  senderRole: SupportSenderRole;
  senderName: string;
  message: string;
  imageUrl?: string | null;
  createdAt: string;
}

export interface CreateThreadInput {
  subject: string;
  message: string;
  priority?: SupportPriority;
}

export interface SendMessageInput {
  threadId: number;
  message: string;
  image?: File | null;
}
