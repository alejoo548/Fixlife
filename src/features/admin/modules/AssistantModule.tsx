import { useState } from 'react';
import {
  Mic, MicOff, PhoneOff, Play, Sparkles, Radio, Zap, Users, TrendingUp,
  Clock, ShieldCheck, Lock, ChevronRight, ExternalLink, PlusCircle, Search,
  Send, BarChart2, DollarSign, Volume2, Lightbulb, MessageSquare
} from 'lucide-react';
import { Orb, AgentState } from '../../../components/ui/orb';
import './assistant.css';

interface TranscriptItem {
  id: string;
  sender: 'user' | 'assistant';
  name: string;
  avatar: string;
  time: string;
  text: string;
}

const initialTranscript: TranscriptItem[] = [
  {
    id: '1',
    sender: 'user',
    name: 'You',
    avatar: 'S',
    time: '2:18 PM',
    text: "What's the status of the AC installation request for #REQ-4821?",
  },
  {
    id: '2',
    sender: 'assistant',
    name: 'Fixlife Assistant',
    avatar: '/Fixilogo.webp',
    time: '2:18 PM',
    text: 'The request #REQ-4821 is currently assigned to Carlos M. and is scheduled for tomorrow between 9:00 AM and 11:00 AM.',
  },
  {
    id: '3',
    sender: 'user',
    name: 'You',
    avatar: 'S',
    time: '2:19 PM',
    text: 'Great, notify the customer about it.',
  },
  {
    id: '4',
    sender: 'assistant',
    name: 'Fixlife Assistant',
    avatar: '/Fixilogo.webp',
    time: '2:19 PM',
    text: 'Notification sent to the customer via SMS and email. Is there anything else I can help you with?',
  },
];

export default function AssistantModule() {
  const [transcript, setTranscript] = useState<TranscriptItem[]>(initialTranscript);
  const [status, setStatus] = useState<'listening' | 'speaking' | 'muted' | 'idle'>('listening');
  const [language, setLanguage] = useState('English (US)');
  const [isPlayingAudio, setIsPlayingAudio] = useState<string | null>(null);

  const getAgentState = (): AgentState => {
    if (status === 'listening') return 'listening';
    if (status === 'speaking') return 'talking';
    if (status === 'muted') return 'thinking';
    return null;
  };

  const handleCommandClick = (commandText: string) => {
    const timeNow = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: TranscriptItem = {
      id: Date.now().toString(),
      sender: 'user',
      name: 'You',
      avatar: 'S',
      time: timeNow,
      text: commandText,
    };
    
    setTranscript((prev) => [...prev, userMsg]);
    setStatus('speaking');

    setTimeout(() => {
      let replyText = "I've retrieved the data for your request.";
      if (commandText.includes('open requests')) {
        replyText = "You currently have 14 active open requests across Plumbing, AC, and Cleaning categories.";
      } else if (commandText.includes('performing professionals')) {
        replyText = "Top performing pros: 1. Carlos M. (4.9★), 2. Ana R. (4.9★), 3. Mateo G. (4.85★).";
      } else if (commandText.includes('Revenue summary')) {
        replyText = "Gross revenue for this month stands at $24,850 USD with a 12% platform fee net of $2,982 USD.";
      } else if (commandText.includes('users registered')) {
        replyText = "Today 38 new clients and 4 service professionals completed registration.";
      }

      const aiMsg: TranscriptItem = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        name: 'Fixlife Assistant',
        avatar: '/Fixilogo.webp',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: replyText,
      };
      setTranscript((prev) => [...prev, aiMsg]);
      setStatus('listening');
    }, 1200);
  };

  const toggleMute = () => {
    if (status === 'muted') {
      setStatus('listening');
    } else {
      setStatus('muted');
    }
  };

  const toggleSpeak = () => {
    if (status === 'speaking') {
      setStatus('listening');
    } else {
      setStatus('speaking');
    }
  };

  return (
    <div className="elevenlabs-assistant">
      {/* TOP ROW */}
      <div className="el-grid-top">
        {/* 1. Live Transcript */}
        <div className="el-card">
          <div className="el-card-header">
            <div className="el-card-title">
              <MessageSquare size={18} />
              <span>Live Transcript</span>
            </div>
            <div className="el-badge-live">
              <span className="el-badge-dot" />
              <span>{status === 'muted' ? 'Muted' : 'Live'}</span>
            </div>
          </div>

          <div className="el-transcript-list">
            {transcript.map((msg) => (
              <div key={msg.id} className="el-msg">
                <div className={`el-msg-avatar ${msg.sender === 'user' ? 'el-msg-avatar--user' : 'el-msg-avatar--ai'}`}>
                  {msg.sender === 'user' ? (
                    msg.avatar
                  ) : (
                    <img src={msg.avatar} alt="Fixlife AI" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                  )}
                </div>
                <div className="el-msg-content">
                  <div className="el-msg-header">
                    <span className="el-msg-author">{msg.name}</span>
                    <span className="el-msg-time">{msg.time}</span>
                  </div>
                  <div>{msg.text}</div>
                </div>
              </div>
            ))}
          </div>

          <button className="el-card-footer-link" type="button" onClick={() => alert('Viewing full conversation logs')}>
            <span>View full transcript</span>
            <ExternalLink size={14} />
          </button>
        </div>

        {/* 2. Central Assistant Orb Visualizer */}
        <div className="el-card el-orb-card">
          <div className="el-card-header" style={{ width: '100%' }}>
            <div className="el-card-title">
              <span>Assistant</span>
            </div>
            <div className="el-badge-live">
              <span className="el-badge-dot" style={{ background: status === 'muted' ? '#ef4444' : '#22c55e' }} />
              <span style={{ textTransform: 'capitalize' }}>{status}</span>
            </div>
          </div>

          <div style={{ width: '100%', height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', margin: '0.5rem 0' }}>
            <div style={{
              position: 'absolute',
              width: '170px',
              height: '170px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(56, 189, 248, 0.35) 0%, rgba(37, 99, 235, 0.15) 55%, transparent 75%)',
              filter: 'blur(16px)',
              pointerEvents: 'none',
            }} />
            <Orb
              colors={['#38bdf8', '#1d4ed8']}
              agentState={getAgentState()}
              volumeMode="auto"
            />
          </div>

          <div>
            <div className="el-orb-status-title">
              {status === 'listening' && 'Listening...'}
              {status === 'speaking' && 'Speaking...'}
              {status === 'muted' && 'Microphone Muted'}
              {status === 'idle' && 'Standby Mode'}
            </div>
            <div className="el-orb-status-sub">
              {status === 'listening' ? 'How can I help you today?' : 'Ask anything about requests, metrics or platform actions.'}
            </div>
          </div>

          <div className="el-audio-controls">
            <div className="el-ctrl-btn-wrap">
              <button
                className={`el-ctrl-btn ${status === 'muted' ? 'el-ctrl-btn--danger' : ''}`}
                onClick={toggleMute}
                type="button"
                title="Toggle Mute"
              >
                {status === 'muted' ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
              <span className="el-ctrl-label">{status === 'muted' ? 'Unmute' : 'Mute'}</span>
            </div>

            <div className="el-ctrl-btn-wrap">
              <button
                className={`el-ctrl-btn el-ctrl-btn--primary`}
                onClick={toggleSpeak}
                type="button"
                title="Speak"
              >
                <Radio size={22} />
              </button>
              <span className="el-ctrl-label">Speak</span>
            </div>

            <div className="el-ctrl-btn-wrap">
              <button
                className="el-ctrl-btn el-ctrl-btn--danger"
                onClick={() => setStatus('idle')}
                type="button"
                title="End session"
              >
                <PhoneOff size={20} />
              </button>
              <span className="el-ctrl-label">End</span>
            </div>
          </div>

          <div className="el-orb-footer-note">
            <ShieldCheck size={14} style={{ color: '#3b82f6' }} />
            <span>Powered by Fixlife AI • Your data is secure and private</span>
          </div>
        </div>

        {/* 3. Voice Status & Quick Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Voice Status Card */}
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
                  <span className="el-badge-dot" />
                  <span>Good (28 ms)</span>
                </span>
              </div>

              <div className="el-metric-row">
                <span className="el-metric-label">Input Level</span>
                <div className="el-metric-value">
                  <div className="el-eq-bars">
                    {[60, 85, 40, 95, 70, 80, 50, 90, 65, 75, 45, 85, 90, 60].map((h, i) => (
                      <div
                        key={i}
                        className="el-eq-bar"
                        style={{
                          height: status === 'muted' ? '15%' : `${h}%`,
                          animationDelay: `${i * 0.08}s`,
                          background: status === 'muted' ? '#64748b' : undefined,
                        }}
                      />
                    ))}
                  </div>
                  <span style={{ fontSize: '0.75rem', width: '30px', textAlign: 'right' }}>78%</span>
                </div>
              </div>

              <div className="el-metric-row">
                <span className="el-metric-label">Output Level</span>
                <div className="el-metric-value">
                  <div className="el-eq-bars">
                    {[40, 70, 90, 50, 80, 60, 75, 95, 40, 85, 65, 50, 75, 80].map((h, i) => (
                      <div
                        key={i}
                        className="el-eq-bar"
                        style={{
                          height: status === 'idle' ? '15%' : `${h}%`,
                          animationDelay: `${i * 0.1}s`,
                          background: '#0ea5e9',
                        }}
                      />
                    ))}
                  </div>
                  <span style={{ fontSize: '0.75rem', width: '30px', textAlign: 'right' }}>64%</span>
                </div>
              </div>

              <div className="el-metric-row">
                <span className="el-metric-label">Language</span>
                <select
                  className="el-lang-select"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="English (US)">English (US)</option>
                  <option value="Spanish (ES)">Spanish (ES)</option>
                  <option value="Portuguese (BR)">Portuguese (BR)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Quick Actions Card */}
          <div className="el-card" style={{ flex: 1 }}>
            <div className="el-card-header">
              <div className="el-card-title">
                <Zap size={18} />
                <span>Quick Actions</span>
              </div>
            </div>

            <div className="el-quick-actions-grid">
              <button className="el-action-btn" onClick={() => handleCommandClick('Create a new service request')} type="button">
                <div className="el-action-icon"><PlusCircle size={16} /></div>
                <div className="el-action-text">
                  <strong>Create Request</strong>
                  <span>New service request</span>
                </div>
              </button>

              <button className="el-action-btn" onClick={() => handleCommandClick('Check status for request #REQ-4821')} type="button">
                <div className="el-action-icon"><Search size={16} /></div>
                <div className="el-action-text">
                  <strong>Check Status</strong>
                  <span>Track a request</span>
                </div>
              </button>

              <button className="el-action-btn" onClick={() => handleCommandClick('Find available professionals nearby')} type="button">
                <div className="el-action-icon"><Users size={16} /></div>
                <div className="el-action-text">
                  <strong>Find Professional</strong>
                  <span>Search availability</span>
                </div>
              </button>

              <button className="el-action-btn" onClick={() => handleCommandClick('Send notification to client')} type="button">
                <div className="el-action-icon"><Send size={16} /></div>
                <div className="el-action-text">
                  <strong>Send Notification</strong>
                  <span>Notify a user</span>
                </div>
              </button>

              <button className="el-action-btn" onClick={() => handleCommandClick('Generate platform analytics report')} type="button">
                <div className="el-action-icon"><BarChart2 size={16} /></div>
                <div className="el-action-text">
                  <strong>Generate Report</strong>
                  <span>Platform analytics</span>
                </div>
              </button>

              <button className="el-action-btn" onClick={() => handleCommandClick('Show billing summary and revenue overview')} type="button">
                <div className="el-action-icon"><DollarSign size={16} /></div>
                <div className="el-action-text">
                  <strong>Billing Summary</strong>
                  <span>Revenue overview</span>
                </div>
              </button>
            </div>

            <button className="el-card-footer-link" type="button">
              <span>View all actions</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* BOTTOM ROW */}
      <div className="el-grid-bottom">
        {/* 1. Suggested Commands */}
        <div className="el-card">
          <div className="el-card-header">
            <div className="el-card-title">
              <Sparkles size={18} />
              <span>Suggested Commands</span>
            </div>
          </div>

          <div className="el-commands-list">
            <button className="el-cmd-item" onClick={() => handleCommandClick('Show my open requests')} type="button">
              <div className="el-cmd-left">
                <Users size={16} />
                <span>Show my open requests</span>
              </div>
              <ChevronRight size={14} style={{ color: '#64748b' }} />
            </button>

            <button className="el-cmd-item" onClick={() => handleCommandClick('Top performing professionals this week')} type="button">
              <div className="el-cmd-left">
                <Radio size={16} />
                <span>Top performing professionals this week</span>
              </div>
              <ChevronRight size={14} style={{ color: '#64748b' }} />
            </button>

            <button className="el-cmd-item" onClick={() => handleCommandClick('Revenue summary for this month')} type="button">
              <div className="el-cmd-left">
                <TrendingUp size={16} />
                <span>Revenue summary for this month</span>
              </div>
              <ChevronRight size={14} style={{ color: '#64748b' }} />
            </button>

            <button className="el-cmd-item" onClick={() => handleCommandClick('How many users registered today?')} type="button">
              <div className="el-cmd-left">
                <Clock size={16} />
                <span>How many users registered today?</span>
              </div>
              <ChevronRight size={14} style={{ color: '#64748b' }} />
            </button>
          </div>

          <button className="el-card-footer-link" type="button">
            <span>Explore more commands</span>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* 2. Recent Interactions */}
        <div className="el-card">
          <div className="el-card-header">
            <div className="el-card-title">
              <Clock size={18} />
              <span>Recent Interactions</span>
            </div>
          </div>

          <div className="el-interactions-list">
            {[
              { id: 'act-1', time: '2:19 PM', desc: 'Notified customer about AC installation update', status: 'Completed' },
              { id: 'act-2', time: '2:17 PM', desc: 'Checked status for request #REQ-4821', status: 'Completed' },
              { id: 'act-3', time: '2:15 PM', desc: 'Searched for available electricians in Zona Norte', status: 'Completed' },
              { id: 'act-4', time: '2:12 PM', desc: 'Generated weekly platform activity report', status: 'Completed' },
            ].map((item) => (
              <div key={item.id} className="el-interaction-row">
                <span className="el-interaction-time">{item.time}</span>
                <span className="el-interaction-desc">{item.desc}</span>
                <div className="el-interaction-right">
                  <span className="el-tag-completed">{item.status}</span>
                  <button
                    className="el-btn-play"
                    onClick={() => setIsPlayingAudio(isPlayingAudio === item.id ? null : item.id)}
                    type="button"
                    title="Play audio log"
                  >
                    <Play size={11} style={{ fill: isPlayingAudio === item.id ? '#ffffff' : 'currentColor', marginLeft: '1px' }} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button className="el-card-footer-link" type="button">
            <span>View all interactions</span>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* 3. Assistant Tips */}
        <div className="el-card">
          <div className="el-card-header">
            <div className="el-card-title">
              <Lightbulb size={18} />
              <span>Assistant Tips</span>
            </div>
          </div>

          <div className="el-tips-list">
            <div className="el-tip-item">
              <div className="el-tip-icon"><ShieldCheck size={15} /></div>
              <div>You can ask about requests, users, professionals, and platform metrics.</div>
            </div>

            <div className="el-tip-item">
              <div className="el-tip-icon"><Radio size={15} /></div>
              <div>Get natural language. For example: "Show me last week's revenue."</div>
            </div>

            <div className="el-tip-item">
              <div className="el-tip-icon"><Lock size={15} /></div>
              <div>Your conversations are private and used only to improve assistance.</div>
            </div>
          </div>

          <button className="el-card-footer-link" type="button">
            <span>Learn more about Fixlife Assistant</span>
            <ExternalLink size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
