import React, { useState, useEffect, useCallback, useRef } from 'react';
import { API_ENDPOINTS } from '../../config/api';
import { SupportThread, SupportMessage } from '../../types/support';
import { MessageCircle, RefreshCw, Send, ArrowLeft, Paperclip, X } from 'lucide-react';
import {
  connectSupportSocket,
  disconnectSupportSocket,
  joinSupportThread,
  leaveSupportThread,
  isSupportSocketConnected,
} from '../../services/supportSocket';
import { useDashboardTheme } from '../../hooks/useDashboardTheme';
import { SupportProtectedImage } from '../support/SupportProtectedImage';
import { getSafeSupportDisplayText, hasUnsafeSupportText, sanitizeSupportTextInput } from '../../utils/supportSecurity';

interface SupportAdminProps {
  token: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  waiting_for_user: 'Waiting for user',
  resolved: 'Resolved',
  closed: 'Closed',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-emerald-500/15 text-emerald-500',
  waiting_for_user: 'bg-amber-500/15 text-amber-500',
  resolved: 'bg-blue-500/15 text-blue-400',
  closed: 'bg-gray-500/15 text-gray-400',
};

const sortThreadsByLastMessage = (items: SupportThread[]) =>
  [...items].sort(
    (left, right) =>
      new Date(right.lastMessageAt || right.createdAt).getTime() -
      new Date(left.lastMessageAt || left.createdAt).getTime()
  );

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const colors = ['bg-violet-500', 'bg-sky-500', 'bg-rose-500', 'bg-amber-500', 'bg-teal-500'];
  const color = colors[name.charCodeAt(0) % colors.length];
  const cls = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  return (
    <div className={`${cls} ${color} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}>
      {initials || '?'}
    </div>
  );
}

export const SupportAdmin: React.FC<SupportAdminProps> = ({ token }) => {
  const { isDark } = useDashboardTheme('admin');
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<SupportThread | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'waiting_for_user' | 'resolved' | 'closed'>('all');
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyImage, setReplyImage] = useState<File | null>(null);
  const hasUnsafeReply = hasUnsafeSupportText(newMessage);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const selectedThreadRef = useRef<SupportThread | null>(null);
  const threadsRef = useRef<SupportThread[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

  const handlePickReplyImage = (file: File | null) => {
    setError(null);
    if (!file) {
      setReplyImage(null);
      return;
    }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setReplyImage(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setError('Only JPG, PNG or WEBP images are allowed.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setReplyImage(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setError('Image must be 5 MB or smaller.');
      return;
    }
    setReplyImage(file);
  };

  const fetchThreads = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(API_ENDPOINTS.support.allThreads, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Could not load support cases.');
      const data = await res.json();
      if (data.success) setThreads(sortThreadsByLastMessage(data.threads || []));
    } catch {
      setError('Could not load support cases.');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const fetchMessages = useCallback(async (threadId: number) => {
    if (!token) return;
    try {
      const res = await fetch(API_ENDPOINTS.support.messages(threadId), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Could not load messages.');
      const data = await res.json();
      if (data.success) setMessages(data.messages || []);
    } catch {
      setError('Could not load messages.');
    }
  }, [token]);

  const openThread = async (thread: SupportThread) => {
    if (selectedThread && isSupportSocketConnected()) leaveSupportThread(selectedThread.id);
    setSelectedThread(thread);
    setMessages([]);
    await fetchMessages(thread.id);
    if (isSupportSocketConnected()) joinSupportThread(thread.id);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const sendMessage = async () => {
    if (!token || !selectedThread || isSending) return;
    const trimmed = newMessage.trim();
    if (!trimmed && !replyImage) return;
    if (hasUnsafeReply) {
      setError('Malicious characters or patterns are not allowed.');
      return;
    }
    setIsSending(true);
    setError(null);
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      let body: BodyInit;
      if (replyImage) {
        const form = new FormData();
        if (trimmed) form.append('message', trimmed);
        form.append('image', replyImage);
        body = form;
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({ message: trimmed });
      }

      const res = await fetch(API_ENDPOINTS.support.messages(selectedThread.id), {
        method: 'POST',
        headers,
        body,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Could not send message.');
      }
      const data = await res.json();
      if (data.message && !isSocketConnected) {
        setMessages((prev) => [...prev, data.message]);
      }
      setNewMessage('');
      setReplyImage(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send message.');
    } finally {
      setIsSending(false);
    }
  };

  const updateStatus = async (threadId: number, status: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_ENDPOINTS.support.threads}/${threadId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Could not update status.');
      if (res.ok) {
        setThreads((prev) => prev.map((t) => t.id === threadId ? { ...t, status: status as any } : t));
        if (selectedThread?.id === threadId) setSelectedThread((t) => t ? { ...t, status: status as any } : t);
      }
    } catch {
      setError('Could not update status.');
    }
  };

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  useEffect(() => { selectedThreadRef.current = selectedThread; }, [selectedThread]);
  useEffect(() => { threadsRef.current = threads; }, [threads]);

  useEffect(() => {
    if (!token) { disconnectSupportSocket(); setIsSocketConnected(false); return; }

    let cancelled = false;
    const connectTimer = window.setTimeout(() => {
      if (cancelled) return;
      connectSupportSocket({
        token,
        onNewMessage: (message) => {
          setMessages((prev) => {
            if (selectedThreadRef.current?.id !== message.threadId) return prev;
            if (prev.some((m) => m.id === message.id)) return prev;
            return [...prev, message];
          });
          const shouldRefreshThreads = !threadsRef.current.some((thread) => thread.id === message.threadId);
          setThreads((prev) => {
            if (!prev.some((thread) => thread.id === message.threadId)) {
              return prev;
            }

            return sortThreadsByLastMessage(prev.map((thread) =>
              thread.id === message.threadId
                ? { ...thread, lastMessageAt: message.createdAt }
                : thread
            ));
          });
          if (shouldRefreshThreads) fetchThreads();
        },
        onThreadCreated: ({ thread, message }) => {
          setThreads((prev) => {
            const withoutDuplicate = prev.filter((item) => item.id !== thread.id);
            return sortThreadsByLastMessage([thread, ...withoutDuplicate]);
          });
          if (selectedThreadRef.current?.id === thread.id && message) {
            setMessages((prev) => (prev.some((item) => item.id === message.id) ? prev : [...prev, message]));
          }
        },
        onConnect: () => {
          setIsSocketConnected(true);
          if (selectedThreadRef.current) joinSupportThread(selectedThreadRef.current.id);
        },
        onDisconnect: () => setIsSocketConnected(false),
      });
    }, 50);

    return () => {
      cancelled = true;
      window.clearTimeout(connectTimer);
      disconnectSupportSocket();
    };
  }, [token]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const filteredThreads = statusFilter === 'all' ? threads : threads.filter((t) => t.status === statusFilter);

  const d = isDark;
  const border = d ? 'border-gray-700' : 'border-gray-200';
  const sidebarBg = d ? 'bg-[#1a2236]' : 'bg-white';
  const headerBg = d ? 'bg-[#1a2236]' : 'bg-white';
  const chatBg = d ? 'bg-[#0f172a]' : 'bg-gray-50';
  const inputBarBg = d ? 'bg-[#1a2236]' : 'bg-white';
  const inputWrapBg = d ? 'bg-[#0f172a]' : 'bg-gray-100';
  const textPrimary = d ? 'text-white' : 'text-gray-900';
  const textSub = d ? 'text-gray-400' : 'text-gray-500';
  const textMuted = d ? 'text-gray-500' : 'text-gray-400';
  const selectCls = `rounded-xl border ${border} ${d ? 'bg-[#0f172a] text-gray-300' : 'bg-gray-50 text-gray-700'} px-3 py-1.5 text-xs font-medium focus:outline-none`;

  return (
    <div className={`flex h-[calc(100vh-140px)] overflow-hidden rounded-2xl border ${border}`}>

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <div className={`w-80 flex-shrink-0 flex flex-col ${sidebarBg} border-r ${border}`}>

        {/* Sidebar header */}
        <div className={`px-4 py-3 flex items-center justify-between border-b ${border}`}>
          <div className="flex items-center gap-2">
            <span className={`font-bold ${textPrimary} text-base`}>Support</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              isSocketConnected ? 'bg-emerald-500/15 text-emerald-500' : 'bg-red-500/15 text-red-500'
            }`}>
              {isSocketConnected ? '● Live' : '○ Offline'}
            </span>
          </div>
          <button
            onClick={fetchThreads}
            disabled={isLoading}
            className={`p-1.5 rounded-lg ${textMuted} hover:${textSub} ${d ? 'hover:bg-gray-800' : 'hover:bg-gray-100'} transition`}
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Filter */}
        <div className={`px-3 py-2 border-b ${border}`}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className={`w-full ${selectCls} py-2`}
          >
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="waiting_for_user">Waiting for user</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          {error && (
            <div className="mt-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-500">
              {error}
            </div>
          )}
        </div>

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <div className={`p-8 text-center text-sm ${textMuted}`}>Loading...</div>
          ) : filteredThreads.length === 0 ? (
            <div className={`p-8 text-center text-sm ${textMuted}`}>No cases</div>
          ) : (
            filteredThreads.map((thread) => {
              const active = selectedThread?.id === thread.id;
              return (
                <button
                  key={thread.id}
                  onClick={() => openThread(thread)}
                  className={`w-full text-left px-3 py-3 flex gap-3 items-start transition-colors border-l-2 ${
                    active
                      ? `${d ? 'bg-bird-blue/20' : 'bg-bird-blue/10'} border-bird-blue`
                      : `${d ? 'hover:bg-gray-800/60' : 'hover:bg-gray-50'} border-transparent`
                  }`}
                >
                  <Avatar name={thread.userName} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className={`font-semibold text-sm ${textPrimary} truncate`}>
                        {thread.userName}
                      </span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[thread.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {STATUS_LABELS[thread.status] ?? thread.status}
                      </span>
                    </div>
                    <div className={`text-xs ${textSub} truncate leading-snug`}>
                      {thread.subject}
                    </div>
                    {thread.priority === 'high' && (
                      <span className={`text-[9px] mt-1 inline-block px-1.5 py-0.5 rounded-full text-red-500 font-medium ${d ? 'bg-red-900/30' : 'bg-red-100'}`}>
                        High priority
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Chat panel ──────────────────────────────────────── */}
      <div className={`flex-1 flex flex-col ${chatBg} overflow-hidden`}>
        {!selectedThread ? (
          <div className={`flex-1 flex flex-col items-center justify-center gap-3 ${textMuted}`}>
            <div className={`w-16 h-16 rounded-2xl ${d ? 'bg-gray-700' : 'bg-gray-200'} flex items-center justify-center`}>
              <MessageCircle size={28} />
            </div>
            <div className={`text-sm font-medium ${textSub}`}>Select a case</div>
            <p className={`text-xs ${textMuted} max-w-[200px] text-center`}>
              Messages will appear here
            </p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className={`px-4 py-3 flex items-center justify-between ${headerBg} border-b ${border} flex-shrink-0`}>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { if (isSupportSocketConnected()) leaveSupportThread(selectedThread.id); setSelectedThread(null); setMessages([]); }}
                  className={`p-1.5 ${d ? 'hover:bg-gray-800' : 'hover:bg-gray-100'} rounded-lg ${textSub} lg:hidden`}
                >
                  <ArrowLeft size={18} />
                </button>
                <Avatar name={selectedThread.userName} size="sm" />
                <div>
                  <div className={`font-semibold text-sm ${textPrimary} leading-tight`}>
                    {selectedThread.userName}
                    <span className={`ml-1.5 text-xs font-normal ${textMuted}`}>
                      ({selectedThread.userRole})
                    </span>
                  </div>
                  <div className={`text-xs ${textMuted} leading-tight truncate max-w-[300px]`}>
                    {selectedThread.subject}
                  </div>
                </div>
              </div>

              <select
                value={selectedThread.status}
                onChange={(e) => updateStatus(selectedThread.id, e.target.value)}
                className={selectCls}
              >
                <option value="open">Open</option>
                <option value="waiting_for_user">Waiting for user</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            {/* Messages */}
            <div
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto custom-scrollbar px-6 py-5 space-y-3"
            >
              {messages.length === 0 && (
                <div className={`text-center text-xs ${textMuted} py-10`}>
                  No messages yet
                </div>
              )}
              {messages.map((msg) => {
                const isAdmin = msg.senderRole === 'admin';
                const safeMessage = getSafeSupportDisplayText(msg.message);
                return (
                  <div key={msg.id} className={`flex items-end gap-2 ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                    {!isAdmin && <Avatar name={msg.senderName} size="sm" />}
                    <div className={`max-w-[65%] ${isAdmin ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                      {!isAdmin && (
                        <span className={`text-[11px] font-semibold ${textSub} ml-1`}>
                          {msg.senderName}
                        </span>
                      )}
                      <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${
                        isAdmin
                          ? 'bg-bird-blue text-white rounded-br-sm'
                          : `${d ? 'bg-gray-700 text-gray-100' : 'bg-white text-gray-800'} rounded-bl-sm shadow-sm`
                      }`}>
                        {msg.imageUrl && (
                          <SupportProtectedImage
                            imageUrl={msg.imageUrl}
                            token={token}
                            className={safeMessage ? 'mb-2' : ''}
                          />
                        )}
                        {safeMessage && <div className="whitespace-pre-wrap">{safeMessage}</div>}
                        <div className={`text-[10px] mt-1 text-right ${isAdmin ? 'text-white/60' : textMuted}`}>
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                    {isAdmin && <Avatar name="Admin" size="sm" />}
                  </div>
                );
              })}
            </div>

            {/* Input bar */}
            <div className={`px-4 py-3 ${inputBarBg} border-t ${border} flex-shrink-0`}>
              {replyImage && (
                <div className={`mb-2 flex items-center justify-between rounded-xl border ${border} ${inputWrapBg} px-3 py-2 text-xs ${textSub}`}>
                  <span className="truncate pr-3">{replyImage.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setReplyImage(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className={`flex h-6 w-6 items-center justify-center rounded-lg ${textMuted} ${d ? 'hover:bg-gray-800' : 'hover:bg-gray-200'}`}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              <div className={`flex items-center gap-2 ${inputWrapBg} rounded-2xl px-4 py-2`}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => handlePickReplyImage(e.target.files?.[0] || null)}
                  disabled={isSending}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSending}
                  className={`${textMuted} transition hover:${textSub} flex-shrink-0`}
                >
                  <Paperclip size={18} />
                </button>
                <input
                  ref={inputRef}
                  value={newMessage}
                  onChange={(e) => setNewMessage(sanitizeSupportTextInput(e.target.value, 2000))}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !isSending) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Write a response..."
                  maxLength={2000}
                  disabled={isSending}
                  className={`flex-1 bg-transparent text-sm ${d ? 'text-gray-100 placeholder:text-gray-500' : 'text-gray-800 placeholder:text-gray-400'} focus:outline-none`}
                />
                <button
                  onClick={sendMessage}
                  disabled={(!newMessage.trim() && !replyImage) || isSending || hasUnsafeReply}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-bird-blue text-white disabled:opacity-40 transition active:scale-90 flex-shrink-0"
                >
                  <Send size={15} />
                </button>
              </div>
              {hasUnsafeReply && (
                <div className="mt-2 text-center text-[10px] font-medium text-red-500">
                  Malicious characters or patterns are not allowed.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
