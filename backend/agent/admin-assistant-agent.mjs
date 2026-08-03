import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { z } from 'zod';
import {
  Agent,
  AgentSession,
  AutoSubscribe,
  cli,
  defineAgent,
  llm,
  ServerOptions,
} from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';

const env = (name, fallback = '') => String(process.env[name] || fallback).trim();

const dbConfig = {
  host: env('DB_HOST', '127.0.0.1'),
  port: Number(env('DB_PORT', '3306')),
  user: env('DB_USER', 'fixlife_app'),
  password: env('DB_PASSWORD'),
  database: env('DB_NAME', env('MYSQL_DATABASE', 'fixlife_db')),
  waitForConnections: true,
  connectionLimit: 4,
  queueLimit: 0,
};

const pool = mysql.createPool(dbConfig);

const numberValue = (value) => Number(value || 0);

const queryRows = async (sql, params = []) => {
  const [rows] = await pool.query(sql, params);
  return Array.isArray(rows) ? rows : [];
};

const getPlatformContext = async () => {
  const [summary = {}] = await queryRows(`
    SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM worker_profiles) AS professionals,
      (SELECT COUNT(*) FROM service_requests WHERE status NOT IN ('done','cancelled','rejected')) AS open_requests,
      (SELECT COUNT(*) FROM service_requests WHERE status = 'done') AS completed_requests,
      (SELECT COUNT(*) FROM account_penalties WHERE penalty_status IN ('pending','disputed')) AS pending_penalties,
      (SELECT COUNT(*) FROM upload_moderation_reviews WHERE decision IN ('review','block','skipped') AND reviewed_at IS NULL) AS upload_reviews
  `);

  const statuses = await queryRows(`
    SELECT status, COUNT(*) AS count
    FROM service_requests
    GROUP BY status
    ORDER BY count DESC
    LIMIT 10
  `);

  return {
    generatedAt: new Date().toISOString(),
    users: numberValue(summary.users),
    professionals: numberValue(summary.professionals),
    openRequests: numberValue(summary.open_requests),
    completedRequests: numberValue(summary.completed_requests),
    pendingPenalties: numberValue(summary.pending_penalties),
    pendingUploadReviews: numberValue(summary.upload_reviews),
    requestStatuses: statuses.map((row) => ({
      status: String(row.status || 'unknown'),
      count: numberValue(row.count),
    })),
  };
};

const getTrustSafetyContext = async () => {
  const [summary = {}] = await queryRows(`
    SELECT
      (SELECT COUNT(*) FROM account_penalties WHERE penalty_status = 'pending') AS pending_penalties,
      (SELECT COUNT(*) FROM account_penalties WHERE penalty_status = 'disputed') AS disputed_penalties,
      (SELECT COALESCE(SUM(amount), 0) FROM account_penalties WHERE penalty_status IN ('pending','disputed')) AS outstanding_balance,
      (SELECT COUNT(*) FROM upload_moderation_reviews WHERE decision = 'review' AND reviewed_at IS NULL) AS reviews,
      (SELECT COUNT(*) FROM upload_moderation_reviews WHERE decision = 'block' AND reviewed_at IS NULL) AS blocked_reviews
  `);

  const recentReviews = await queryRows(`
    SELECT id_review, original_name, decision, risk_level, provider, created_at
    FROM upload_moderation_reviews
    ORDER BY created_at DESC
    LIMIT 5
  `);

  return {
    pendingPenalties: numberValue(summary.pending_penalties),
    disputedPenalties: numberValue(summary.disputed_penalties),
    outstandingBalance: Number(summary.outstanding_balance || 0).toFixed(2),
    uploadReviews: numberValue(summary.reviews),
    blockedUploadReviews: numberValue(summary.blocked_reviews),
    recentReviews: recentReviews.map((row) => ({
      id: numberValue(row.id_review),
      file: String(row.original_name || 'upload'),
      decision: String(row.decision || 'unknown'),
      risk: String(row.risk_level || 'unknown'),
      provider: String(row.provider || 'unknown'),
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    })),
  };
};

const getRequestContext = async ({ status, limit }) => {
  const cleanLimit = Math.min(Math.max(Number(limit || 5), 1), 10);
  const params = [];
  let statusFilter = '';
  if (status && status !== 'all') {
    statusFilter = 'WHERE sr.status = ?';
    params.push(status);
  }
  params.push(cleanLimit);

  const requests = await queryRows(`
    SELECT
      sr.id_request,
      sr.status,
      sr.booking_type,
      sr.service_name,
      sr.address,
      sr.budget,
      sr.created_at,
      sr.scheduled_start_time,
      u.first_name,
      u.last_name,
      wp.business_name
    FROM service_requests sr
    LEFT JOIN users u ON u.id_user = sr.id_user
    LEFT JOIN worker_profiles wp ON wp.id_worker_profile = sr.assigned_worker_profile
    ${statusFilter}
    ORDER BY sr.created_at DESC
    LIMIT ?
  `, params);

  return {
    count: requests.length,
    requests: requests.map((row) => ({
      id: numberValue(row.id_request),
      status: String(row.status || 'unknown'),
      bookingType: String(row.booking_type || 'express'),
      service: String(row.service_name || 'Service'),
      client: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unknown client',
      worker: String(row.business_name || 'Not assigned'),
      address: String(row.address || 'No address'),
      budget: Number(row.budget || 0).toFixed(2),
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      scheduledAt: row.scheduled_start_time ? new Date(row.scheduled_start_time).toISOString() : null,
    })),
  };
};

const assistantTools = [
  llm.tool({
    name: 'get_platform_context',
    description: 'Read current Fixlife platform totals, request counts, penalties, and moderation queue size.',
    execute: async () => getPlatformContext(),
  }),
  llm.tool({
    name: 'get_trust_safety_context',
    description: 'Read Trust & Safety totals, outstanding balances, upload reviews, blocked cases, and recent reviews.',
    execute: async () => getTrustSafetyContext(),
  }),
  llm.tool({
    name: 'get_recent_requests',
    description: 'Read recent service requests. Use status all, pending, assigned, in_progress, done, cancelled, or other known states.',
    parameters: z.object({
      status: z.string().default('all'),
      limit: z.number().min(1).max(10).default(5),
    }),
    execute: async (args) => getRequestContext(args),
  }),
];

const instructions = [
  'You are Fixlife Assistant, a voice assistant for platform administrators.',
  'Speak naturally in Spanish by default unless the admin asks for English.',
  'Use short, useful answers. Avoid long lectures in voice mode.',
  'You are strictly scoped to Fixlife operations. Only answer about Fixlife, the admin dashboard, service requests, clients, professionals, worker tiers, maps, scheduling, chats, notifications, Trust & Safety, penalties, debts, appeals, upload moderation, platform metrics, reports, payments, account status, and support workflows.',
  'If the admin asks about anything outside Fixlife, politely refuse in one short sentence and redirect them to ask about Fixlife. Do not answer general knowledge, personal advice, schoolwork, politics, entertainment, coding unrelated to this project, medical, legal, financial, or random topics.',
  'For mixed questions, answer only the Fixlife-related part and say the rest is outside your Fixlife scope.',
  'You have read-only tools. Never claim you changed, deleted, approved, penalized, suspended, refunded, or resolved anything.',
  'If an admin asks for an action, explain the recommended action and tell them where to do it in the admin dashboard.',
  'If data is unavailable, say so clearly instead of inventing numbers.',
  'Protect private data: summarize emails and names only when needed for admin operations.',
].join('\n');

export default defineAgent({
  entry: async (ctx) => {
    await ctx.connect(undefined, AutoSubscribe.AUDIO_ONLY);

    const session = new AgentSession({
      llm: new openai.realtime.RealtimeModel({
        apiKey: env('OPENAI_API_KEY'),
        model: env('LIVEKIT_AGENT_OPENAI_MODEL', 'gpt-realtime'),
        voice: env('LIVEKIT_AGENT_OPENAI_VOICE', 'marin'),
        modalities: ['text', 'audio'],
      }),
      tools: assistantTools,
    });

    const agent = new Agent({
      instructions,
      tools: assistantTools,
    });

    await session.start({
      agent,
      room: ctx.room,
      record: false,
    });

    session.generateReply({
      instructions: 'Saluda brevemente y pregunta al administrador en qué parte de Fixlife necesita ayuda. Menciona que solo puedes ayudar con temas de la plataforma Fixlife.',
    });
  },
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli.runApp(new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    wsURL: env('LIVEKIT_URL'),
    apiKey: env('LIVEKIT_API_KEY'),
    apiSecret: env('LIVEKIT_API_SECRET'),
    logLevel: env('LIVEKIT_AGENT_LOG_LEVEL', 'info'),
  }));
}
