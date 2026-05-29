import React, { useState, useEffect, useCallback, useRef } from 'react';
import { API_ENDPOINTS } from '../../config/api';
import { SupportThread, SupportMessage } from '../../types/support';
import { MessageCircle, RefreshCw, Send, ArrowLeft } from 'lucide-react';
import {
  connectSupportSocket,
  disconnectSupportSocket,
  joinSupportThread,
  leaveSupportThread,
  isSupportSocketConnected,
} from '../../services/supportSocket';
import { useDashboardTheme } from '../../hooks/useDashboardTheme';

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

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const selectedThreadRef = useRef<SupportThread | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchThreads = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.support.allThreads, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setThreads(data.threads || []);
    } catch {
      // silent
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
      const data = await res.json();
      if (data.success) setMessages(data.messages || []);
    } catch {
      // silent
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
    if (!token || !selectedThread || !newMessage.trim() || isSending) return;
    setIsSending(true);
    try {
      const res = await fetch(API_ENDPOINTS.support.messages(selectedThread.id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: newMessage.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.message && !isSocketConnected) {
          setMessages((prev) => [...prev, data.message]);
        }
        setNewMessage('');
      }
    } catch {
      // silent
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
      if (res.ok) {
        setThreads((prev) => prev.map((t) => t.id === threadId ? { ...t, status: status as any } : t));
        if (selectedThread?.id === threadId) setSelectedThread((t) => t ? { ...t, status: status as any } : t);
      }
    } catch {
      // silent
    }
  };

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  useEffect(() => { selectedThreadRef.current = selectedThread; }, [selectedThread]);

  useEffect(() => {
    if (!token) { disconnectSupportSocket(); setIsSocketConnected(false); return; }

    connectSupportSocket({
      token,
      onNewMessage: (message) => {
        setMessages((prev) => {
          if (selectedThreadRef.current?.id !== message.threadId) return prev;
          if (prev.some((m) => m.id === message.id)) return prev;
          return [...prev, message];
        });
        fetchThreads();
      },
      onConnect: () => {
        setIsSocketConnected(true);
        if (selectedThreadRef.current) joinSupportThread(selectedThreadRef.current.id);
      },
      onDisconnect: () => setIsSocketConnected(false),
    });

    return () => { disconnectSupportSocket(); };
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
                        <div className="whitespace-pre-wrap">{msg.message}</div>
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
              <div className={`flex items-center gap-2 ${inputWrapBg} rounded-2xl px-4 py-2`}>
                <input
                  ref={inputRef}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !isSending) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Write a response..."
                  maxLength={2000}
                  disabled={isSending}
                  className={`flex-1 bg-transparent text-sm ${d ? 'text-gray-100 placeholder:text-gray-500' : 'text-gray-800 placeholder:text-gray-400'} focus:outline-none`}
                />
                <button
                  onClick={sendMessage}
                  disabled={!newMessage.trim() || isSending}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-bird-blue text-white disabled:opacity-40 transition active:scale-90 flex-shrink-0"
                >
                  <Send size={15} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
