import { useEffect, useMemo, useRef, useState } from 'react';
import { LiveKitRoom, RoomAudioRenderer, ControlBar } from '@livekit/components-react';
import '@livekit/components-styles';
import {
  Activity,
  BarChart2,
  ChevronRight,
  Clock,
  DollarSign,
  ExternalLink,
  Lightbulb,
  Loader2,
  Lock,
  MessageSquare,
  Mic,
  PhoneOff,
  Play,
  Radio,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Volume2,
  Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Orb, type AgentState } from '../../../components/ui/orb';
import { EmptyState } from '../components/AdminUI';
import { adminApi } from '../api/adminApi';
import './assistant.css';

type AssistantContext = {
  generated_at: string;
  platform: {
    users: number;
    professionals: number;
    open_requests: number;
    completed_requests: number;
    pending_penalties: number;
    upload_reviews: number;
  };
  requests_by_status: Array<{ status: string; count: number }>;
  recent_activity: Array<{ label: string; value: string; meta: string }>;
  recent_assistant_interactions: Array<{
    id: number;
    channel: string;
    prompt: string;
    response: string;
    intent: string;
    out_of_scope: boolean;
    created_at: string | null;
  }>;
  suggested_commands: string[];
};

type AssistantMessage = {
  id: string;
  role: 'admin' | 'assistant';
  text: string;
  createdAt: string;
  actions?: Array<{ label: string; href: string }>;
};

type VoiceState = {
  configured: boolean;
  url: string | null;
  token: string | null;
  room: string | null;
  message: string;
};

const fallbackCommands = [
  'What needs admin attention?',
  'Show pending moderation cases',
  'Generate today platform summary',
  'Show request status breakdown',
];

const timeLabel = (value: string | null | undefined) => {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const statusToAgentState = (voiceReady: boolean, voiceLoading: boolean): AgentState => {
  if (voiceLoading) return 'thinking';
  if (voiceReady) return 'listening';
  return null;
};

export default function AssistantModule() {
  const [context, setContext] = useState<AssistantContext | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'I can help only with Fixlife operations: requests, Trust & Safety, penalties, users, workers, platform status, and reports.',
      createdAt: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [answering, setAnswering] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voice, setVoice] = useState<VoiceState | null>(null);
  const [language, setLanguage] = useState('Spanish / English');
  const [playingAuditId, setPlayingAuditId] = useState<number | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const voiceReady = Boolean(voice?.configured && voice.token && voice.url);
  const agentState = statusToAgentState(voiceReady, voiceLoading);
  const commands = useMemo(() => context?.suggested_commands?.length ? context.suggested_commands : fallbackCommands, [context]);
  const platform = context?.platform;

  const loadContext = async () => {
    setLoading(true);
    try {
      const payload = await adminApi.get<{ context: AssistantContext }>(adminApi.endpoints.assistantContext, true);
      setContext(payload.context);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContext();
  }, []);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (messageText = input) => {
    const clean = messageText.trim();
    if (clean.length < 2 || answering) return;

    const adminMessage: AssistantMessage = {
      id: `admin-${Date.now()}`,
      role: 'admin',
      text: clean,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, adminMessage]);
    setInput('');
    setAnswering(true);

    try {
      const payload = await adminApi.post<{
        message: string;
        context: AssistantContext;
        actions: Array<{ label: string; href: string }>;
      }>(adminApi.endpoints.assistantChat, { message: clean });
      setContext(payload.context);
      setMessages((current) => [...current, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: payload.message,
        createdAt: new Date().toISOString(),
        actions: payload.actions,
      }]);
    } catch (error) {
      setMessages((current) => [...current, {
        id: `assistant-error-${Date.now()}`,
        role: 'assistant',
        text: error instanceof Error ? error.message : 'Assistant could not answer right now.',
        createdAt: new Date().toISOString(),
      }]);
    } finally {
      setAnswering(false);
    }
  };

  const startVoice = async () => {
    setVoiceLoading(true);
    try {
      const payload = await adminApi.post<{ voice: VoiceState }>(adminApi.endpoints.assistantLiveKitToken);
      setVoice(payload.voice);
    } finally {
      setVoiceLoading(false);
    }
  };

  const endVoice = () => {
    setVoice(null);
  };

  return (
    <div className="elevenlabs-assistant">
      <div className="el-grid-top">
        <div className="el-card el-transcript-card">
          <div className="el-card-header">
            <div className="el-card-title">
              <MessageSquare size={18} />
              <span>Live Transcript</span>
            </div>
            <div className="el-badge-live">
              <span className="el-badge-dot" />
              <span>{answering ? 'Thinking' : 'Live'}</span>
            </div>
          </div>

          <div ref={transcriptRef} className="el-transcript-list">
            {messages.map((message) => (
              <div key={message.id} className="el-msg">
                <div className={`el-msg-avatar ${message.role === 'admin' ? 'el-msg-avatar--user' : 'el-msg-avatar--ai'}`}>
                  {message.role === 'admin' ? 'A' : <img src="/Fixilogo.webp" alt="Fixlife AI" />}
                </div>
                <div className="el-msg-content">
                  <div className="el-msg-header">
                    <span className="el-msg-author">{message.role === 'admin' ? 'You' : 'Fixlife Assistant'}</span>
                    <span className="el-msg-time">{timeLabel(message.createdAt)}</span>
                  </div>
                  <div>{message.text}</div>
                  {message.actions && message.actions.length > 0 && (
                    <div className="el-message-actions">
                      {message.actions.map((action) => action.href.startsWith('/admin-dashboard') ? (
                        <Link key={action.label} to={action.href}>{action.label}</Link>
                      ) : (
                        <span key={action.label}>{action.label}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {answering && (
              <div className="el-thinking-line">
                <Loader2 className="animate-spin" size={15} />
                Reading Fixlife platform data...
              </div>
            )}
          </div>

          <form className="el-assistant-composer" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={1000}
              placeholder="Ask about Fixlife requests, users, moderation..."
            />
            <button type="submit" disabled={answering || input.trim().length < 2}>
              {answering ? <Loader2 className="animate-spin" size={17} /> : <Send size={17} />}
            </button>
          </form>
        </div>

        <div className="el-card el-orb-card">
          <div className="el-card-header" style={{ width: '100%' }}>
            <div className="el-card-title">
              <Sparkles size={18} />
              <span>Assistant</span>
            </div>
            <div className="el-badge-live">
              <span className="el-badge-dot" style={{ background: voiceReady ? '#22c55e' : '#f59e0b' }} />
              <span>{voiceReady ? 'Listening' : 'Standby'}</span>
            </div>
          </div>

          <div className="el-orb-stage">
            <div className="el-orb-backlight" />
            <Orb colors={['#38bdf8', '#1d4ed8']} agentState={agentState} volumeMode="auto" />
          </div>

          <div>
            <div className="el-orb-status-title">
              {voiceLoading ? 'Connecting...' : voiceReady ? 'Listening...' : 'Voice standby'}
            </div>
            <div className="el-orb-status-sub">
              {voiceReady
                ? 'Speak after enabling the mic. If there is no answer, check OpenAI API billing quota.'
                : voice?.message || 'Start a secure LiveKit voice room for this admin session.'}
            </div>
          </div>

          {voiceReady ? (
            <LiveKitRoom
              token={voice?.token || undefined}
              serverUrl={voice?.url || undefined}
              connect
              audio
              video={false}
              className="admin-livekit-room el-livekit-room"
            >
              <RoomAudioRenderer />
              <ControlBar variation="minimal" />
            </LiveKitRoom>
          ) : (
            <div className="el-audio-controls">
              <div className="el-ctrl-btn-wrap">
                <button className="el-ctrl-btn el-ctrl-btn--primary" onClick={startVoice} disabled={voiceLoading} type="button">
                  {voiceLoading ? <Loader2 className="animate-spin" size={22} /> : <Mic size={22} />}
                </button>
                <span className="el-ctrl-label">{voiceLoading ? 'Connecting' : 'Speak'}</span>
              </div>
            </div>
          )}

          {voiceReady && (
            <div className="el-audio-controls el-audio-controls--compact">
              <div className="el-ctrl-btn-wrap">
                <button className="el-ctrl-btn el-ctrl-btn--danger" onClick={endVoice} type="button">
                  <PhoneOff size={20} />
                </button>
                <span className="el-ctrl-label">End</span>
              </div>
            </div>
          )}

          <div className="el-orb-footer-note">
            <ShieldCheck size={14} />
            <span>Tokens are server-side and expire after 30 minutes.</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="el-card">
            <div className="el-card-header">
              <div className="el-card-title">
                <Volume2 size={18} />
                <span>Voice Status</span>
              </div>
              <Radio size={16} style={{ color: '#3b82f6' }} />
            </div>

            <div className="el-voice-status-metrics">
              <div className="el-metric-row">
                <span className="el-metric-label">Connection</span>
                <span className="el-metric-value">
                  <span className="el-badge-dot" style={{ background: voiceReady ? '#22c55e' : '#f59e0b' }} />
                  <span>{voiceReady ? 'Good' : 'Not connected'}</span>
                </span>
              </div>
              <div className="el-metric-row">
                <span className="el-metric-label">Room</span>
                <span className="el-metric-value">{voice?.room || 'No room'}</span>
              </div>
              <div className="el-metric-row">
                <span className="el-metric-label">Transport</span>
                <span className="el-metric-value">LiveKit WebRTC</span>
              </div>
              <div className="el-metric-row">
                <span className="el-metric-label">Input Level</span>
                <div className="el-metric-value">
                  <div className="el-eq-bars">
                    {[60, 85, 40, 95, 70, 80, 50, 90, 65, 75, 45, 85, 90, 60].map((height, index) => (
                      <div
                        key={index}
                        className="el-eq-bar"
                        style={{ height: voiceReady ? `${height}%` : '15%', background: voiceReady ? undefined : '#64748b' }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="el-metric-row">
                <span className="el-metric-label">Language</span>
                <select className="el-lang-select" value={language} onChange={(event) => setLanguage(event.target.value)}>
                  <option value="Spanish / English">Spanish / English</option>
                  <option value="English only">English only</option>
                  <option value="Spanish only">Spanish only</option>
                </select>
              </div>
            </div>
          </div>

          <div className="el-card" style={{ flex: 1 }}>
            <div className="el-card-header">
              <div className="el-card-title">
                <Zap size={18} />
                <span>Quick Actions</span>
              </div>
            </div>

            <div className="el-quick-actions-grid">
              <button className="el-action-btn" onClick={() => sendMessage('Show pending moderation cases')} type="button">
                <div className="el-action-icon"><ShieldCheck size={16} /></div>
                <div className="el-action-text"><strong>Moderation</strong><span>Review unsafe uploads</span></div>
              </button>
              <button className="el-action-btn" onClick={() => sendMessage('Show pending penalties')} type="button">
                <div className="el-action-icon"><DollarSign size={16} /></div>
                <div className="el-action-text"><strong>Penalties</strong><span>Open balances</span></div>
              </button>
              <button className="el-action-btn" onClick={() => sendMessage('Show recent requests')} type="button">
                <div className="el-action-icon"><Search size={16} /></div>
                <div className="el-action-text"><strong>Requests</strong><span>Latest platform jobs</span></div>
              </button>
              <button className="el-action-btn" onClick={() => sendMessage('Generate today platform summary')} type="button">
                <div className="el-action-icon"><BarChart2 size={16} /></div>
                <div className="el-action-text"><strong>Report</strong><span>Platform summary</span></div>
              </button>
              <button className="el-action-btn" onClick={() => sendMessage('Show workers that need admin attention')} type="button">
                <div className="el-action-icon"><Users size={16} /></div>
                <div className="el-action-text"><strong>Workers</strong><span>Trust status</span></div>
              </button>
              <button className="el-action-btn" onClick={loadContext} type="button">
                <div className="el-action-icon"><RefreshCw size={16} /></div>
                <div className="el-action-text"><strong>Refresh</strong><span>Reload context</span></div>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="el-grid-bottom">
        <div className="el-card">
          <div className="el-card-header">
            <div className="el-card-title">
              <Sparkles size={18} />
              <span>Suggested Commands</span>
            </div>
          </div>
          <div className="el-commands-list">
            {commands.slice(0, 5).map((command, index) => {
              const Icon = [Users, Radio, TrendingUp, Clock, ShieldCheck][index % 5];
              return (
                <button key={command} className="el-cmd-item" onClick={() => sendMessage(command)} disabled={answering} type="button">
                  <div className="el-cmd-left">
                    <Icon size={16} />
                    <span>{command}</span>
                  </div>
                  <ChevronRight size={14} style={{ color: '#64748b' }} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="el-card">
          <div className="el-card-header">
            <div className="el-card-title">
              <Activity size={18} />
              <span>Assistant Audit Trail</span>
            </div>
          </div>

          {context?.recent_assistant_interactions?.length ? (
            <div className="el-interactions-list">
              {context.recent_assistant_interactions.slice(0, 6).map((item) => (
                <div key={item.id} className="el-interaction-row">
                  <span className="el-interaction-time">{timeLabel(item.created_at)}</span>
                  <span className="el-interaction-desc">{item.prompt}</span>
                  <div className="el-interaction-right">
                    <span className={item.out_of_scope ? 'el-tag-warning' : 'el-tag-completed'}>{item.intent.replace(/_/g, ' ')}</span>
                    <button className="el-btn-play" onClick={() => setPlayingAuditId(playingAuditId === item.id ? null : item.id)} type="button">
                      <Play size={11} style={{ fill: playingAuditId === item.id ? '#ffffff' : 'currentColor', marginLeft: '1px' }} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : loading ? (
            <div className="el-thinking-line"><Loader2 className="animate-spin" size={15} /> Loading audit trail...</div>
          ) : (
            <EmptyState title="No assistant activity yet" description="Text and voice sessions will appear here." />
          )}
        </div>

        <div className="el-card">
          <div className="el-card-header">
            <div className="el-card-title">
              <Lightbulb size={18} />
              <span>Platform Pulse</span>
            </div>
          </div>

          {platform ? (
            <div className="el-platform-pulse">
              <div><span>Users</span><strong>{platform.users}</strong></div>
              <div><span>Professionals</span><strong>{platform.professionals}</strong></div>
              <div><span>Open requests</span><strong>{platform.open_requests}</strong></div>
              <div><span>Completed</span><strong>{platform.completed_requests}</strong></div>
              <div><span>Penalties</span><strong>{platform.pending_penalties}</strong></div>
              <div><span>Upload reviews</span><strong>{platform.upload_reviews}</strong></div>
            </div>
          ) : (
            <div className="el-tips-list">
              <div className="el-tip-item">
                <div className="el-tip-icon"><Lock size={15} /></div>
                <div>Assistant access is restricted to Fixlife operational data.</div>
              </div>
              <div className="el-tip-item">
                <div className="el-tip-icon"><ExternalLink size={15} /></div>
                <div>Use text mode while OpenAI voice quota is unavailable.</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
