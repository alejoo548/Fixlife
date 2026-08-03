import { AccessToken } from 'livekit-server-sdk';
import pool from '../config/db';
import type { RowDataPacket } from 'mysql2';

export type AdminAssistantContext = {
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

type AssistantIntent =
  | 'moderation'
  | 'penalties'
  | 'requests'
  | 'reports'
  | 'attention'
  | 'summary'
  | 'out_of_scope'
  | 'voice_session';

const numberValue = (value: unknown) => Number(value || 0);

let assistantTablesChecked = false;

export const ensureAdminAssistantTables = async () => {
  if (assistantTablesChecked) return;

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS admin_assistant_interactions (
      id_interaction INT NOT NULL AUTO_INCREMENT,
      id_admin INT NULL,
      channel ENUM('text','voice') NOT NULL DEFAULT 'text',
      prompt_text VARCHAR(1000) NOT NULL,
      response_text TEXT NULL,
      intent VARCHAR(40) NOT NULL DEFAULT 'summary',
      out_of_scope TINYINT(1) NOT NULL DEFAULT 0,
      actions_json TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_interaction),
      KEY idx_admin_assistant_admin_created (id_admin, created_at),
      KEY idx_admin_assistant_intent_created (intent, created_at),
      KEY idx_admin_assistant_scope_created (out_of_scope, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  assistantTablesChecked = true;
};

const safeSlice = (value: unknown, max: number) =>
  String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);

const recordAssistantInteraction = async (input: {
  adminId?: number | null;
  channel: 'text' | 'voice';
  prompt: string;
  response?: string | null;
  intent: AssistantIntent;
  outOfScope?: boolean;
  actions?: Array<{ label: string; href: string }>;
}) => {
  try {
    await ensureAdminAssistantTables();
    await pool.execute(
      `INSERT INTO admin_assistant_interactions
       (id_admin, channel, prompt_text, response_text, intent, out_of_scope, actions_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.adminId ?? null,
        input.channel,
        safeSlice(input.prompt, 1000),
        input.response ? safeSlice(input.response, 4000) : null,
        input.intent,
        input.outOfScope ? 1 : 0,
        input.actions?.length ? JSON.stringify(input.actions).slice(0, 2000) : null,
      ]
    );
  } catch (error) {
    console.error('Error recording admin assistant interaction:', error);
  }
};

export const getAdminAssistantContext = async (): Promise<AdminAssistantContext> => {
  await ensureAdminAssistantTables();

  const [summaryRows] = await pool.query<RowDataPacket[]>(`
    SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM worker_profiles) AS professionals,
      (SELECT COUNT(*) FROM service_requests WHERE status NOT IN ('done','cancelled','rejected')) AS open_requests,
      (SELECT COUNT(*) FROM service_requests WHERE status = 'done') AS completed_requests,
      (SELECT COUNT(*) FROM account_penalties WHERE status IN ('pending','disputed')) AS pending_penalties,
      (SELECT COUNT(*) FROM upload_moderation_reviews WHERE decision IN ('review','block','skipped') AND reviewed_at IS NULL) AS upload_reviews
  `);

  const [statusRows] = await pool.query<RowDataPacket[]>(`
    SELECT status, COUNT(*) AS count
    FROM service_requests
    GROUP BY status
    ORDER BY count DESC
    LIMIT 8
  `);

  const [activityRows] = await pool.query<RowDataPacket[]>(`
    SELECT action_type, entity_type, summary, created_at
    FROM admin_activity_log
    ORDER BY created_at DESC
    LIMIT 5
  `).catch(async () => [[] as RowDataPacket[]]);

  const [assistantRows] = await pool.query<RowDataPacket[]>(`
    SELECT id_interaction, channel, prompt_text, response_text, intent, out_of_scope, created_at
    FROM admin_assistant_interactions
    ORDER BY created_at DESC
    LIMIT 6
  `).catch(async () => [[] as RowDataPacket[]]);

  const summary = summaryRows[0] || {};
  return {
    generated_at: new Date().toISOString(),
    platform: {
      users: numberValue(summary.users),
      professionals: numberValue(summary.professionals),
      open_requests: numberValue(summary.open_requests),
      completed_requests: numberValue(summary.completed_requests),
      pending_penalties: numberValue(summary.pending_penalties),
      upload_reviews: numberValue(summary.upload_reviews),
    },
    requests_by_status: statusRows.map((row) => ({
      status: String(row.status || 'unknown'),
      count: numberValue(row.count),
    })),
    recent_activity: activityRows.map((row) => ({
      label: `${String(row.action_type || 'action')} ${String(row.entity_type || 'item')}`.replace(/_/g, ' '),
      value: String(row.summary || 'Admin activity'),
      meta: row.created_at ? new Date(row.created_at).toLocaleString('en-US') : '',
    })),
    recent_assistant_interactions: assistantRows.map((row) => ({
      id: numberValue(row.id_interaction),
      channel: String(row.channel || 'text'),
      prompt: String(row.prompt_text || ''),
      response: String(row.response_text || ''),
      intent: String(row.intent || 'summary'),
      out_of_scope: Boolean(row.out_of_scope),
      created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    })),
    suggested_commands: [
      'Show open requests',
      'Generate today platform summary',
      'What needs admin attention?',
      'Show pending moderation cases',
      'Show pending penalties',
      'Give me a weekly operations report',
    ],
  };
};

const buildSummaryReply = (context: AdminAssistantContext) => {
  const { platform } = context;
  return `Platform summary: ${platform.open_requests} active requests, ${platform.completed_requests} completed requests, ${platform.pending_penalties} pending/disputed penalties, and ${platform.upload_reviews} upload reviews waiting for Trust & Safety.`;
};

const buildAttentionReply = (context: AdminAssistantContext) => {
  const issues: string[] = [];
  if (context.platform.upload_reviews > 0) issues.push(`${context.platform.upload_reviews} upload moderation case(s) need review`);
  if (context.platform.pending_penalties > 0) issues.push(`${context.platform.pending_penalties} penalty balance(s) are pending or disputed`);
  if (context.platform.open_requests > 0) issues.push(`${context.platform.open_requests} service request(s) are still active`);
  return issues.length
    ? `Admin attention: ${issues.join(', ')}. I recommend starting with Trust & Safety, then checking active requests.`
    : 'Everything looks calm right now. No urgent moderation, penalty, or request issue is standing out.';
};

const buildStatusReply = (context: AdminAssistantContext) => {
  if (context.requests_by_status.length === 0) return 'There are no request status rows available yet.';
  return `Request status breakdown: ${context.requests_by_status.map((item) => `${item.status}: ${item.count}`).join(', ')}.`;
};

const buildOpenRequestsReply = async (context: AdminAssistantContext) => {
  const [rows] = await pool.query<RowDataPacket[]>(`
    SELECT id_request, status, booking_type, service_name, budget, created_at
    FROM service_requests
    WHERE status NOT IN ('done','cancelled','rejected')
    ORDER BY created_at DESC
    LIMIT 5
  `).catch(async () => [[] as RowDataPacket[]]);

  if (rows.length === 0) return 'There are no active service requests right now.';
  const preview = rows
    .map((row) => `#${row.id_request} ${row.service_name || 'Service'} is ${row.status} (${row.booking_type || 'express'}, $${Number(row.budget || 0).toFixed(2)})`)
    .join('; ');
  return `${buildStatusReply(context)} Latest active requests: ${preview}.`;
};

const buildModerationReply = async (context: AdminAssistantContext) => {
  const [rows] = await pool.query<RowDataPacket[]>(`
    SELECT id_review, decision, risk_level, provider, created_at
    FROM upload_moderation_reviews
    WHERE decision IN ('review','block','skipped') AND reviewed_at IS NULL
    ORDER BY created_at DESC
    LIMIT 5
  `).catch(async () => [[] as RowDataPacket[]]);

  if (rows.length === 0) return 'Trust & Safety has no pending upload moderation cases right now.';
  const preview = rows
    .map((row) => `review #${row.id_review} is ${row.decision}/${row.risk_level || 'unknown'} from ${row.provider || 'local'}`)
    .join('; ');
  return `Trust & Safety has ${context.platform.upload_reviews} upload moderation case(s) waiting. Latest cases: ${preview}.`;
};

const buildPenaltyReply = async (context: AdminAssistantContext) => {
  const [rows] = await pool.query<RowDataPacket[]>(`
    SELECT id_penalty, actor_role, reason, amount, status, created_at
    FROM account_penalties
    WHERE status IN ('pending','disputed')
    ORDER BY created_at DESC
    LIMIT 5
  `).catch(async () => [[] as RowDataPacket[]]);

  if (rows.length === 0) return 'There are no pending or disputed account penalty balances right now.';
  const preview = rows
    .map((row) => `penalty #${row.id_penalty} ${row.status} for ${row.actor_role}: ${row.reason} ($${Number(row.amount || 0).toFixed(2)})`)
    .join('; ');
  return `There are ${context.platform.pending_penalties} pending or disputed penalty balance(s). Latest: ${preview}.`;
};

const FIXLIFE_TOPIC_PATTERN = /\b(fixlife|platform|plataforma|admin|dashboard|request|requests|solicitud|solicitudes|service|servicio|job|jobs|worker|workers|professional|professionals|profesional|profesionales|cliente|client|usuario|user|users|map|mapa|location|ubicacion|schedule|scheduled|agenda|calendar|calendario|chat|notification|notifications|notificacion|notificaciones|trust|safety|seguridad|penalty|penalties|penalizacion|penalizaciones|debt|deuda|balance|saldo|appeal|apelacion|dispute|disputa|moderation|moderacion|upload|uploads|imagen|image|photo|foto|payment|payments|pago|pagos|cash|efectivo|account|cuenta|status|estado|metric|metrics|metrica|report|reports|reporte|informes|support|soporte|tier|elite|verification|verificacion|rating|calificacion|review|reviews|historial|history|earning|earnings|finance|finanzas|revenue|ingreso|ingresos)\b/i;

const ASSISTANT_META_PATTERN = /\b(hola|hello|hey|buenas|ayuda|help|puedes|can you|what can you do|que puedes hacer|comandos|commands|asistente|assistant)\b/i;

const normalizePrompt = (prompt: string) =>
  prompt
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const isFixlifeScopedPrompt = (prompt: string) => {
  const clean = normalizePrompt(prompt.trim());
  if (clean.length < 2) return false;
  return FIXLIFE_TOPIC_PATTERN.test(clean) || ASSISTANT_META_PATTERN.test(clean);
};

const buildOutOfScopeReply = () => ({
  message: 'Solo puedo ayudarte con temas de Fixlife: requests, usuarios, workers, Trust & Safety, pagos, moderacion, reportes y soporte de la plataforma.',
  actions: [
    { label: 'Open requests', href: '/admin-dashboard/requests' },
    { label: 'Open Trust & Safety', href: '/admin-dashboard/trust-safety' },
  ],
});

export const answerAdminAssistantPrompt = async (
  prompt: string,
  options: { adminId?: number | null; channel?: 'text' | 'voice' } = {}
) => {
  const context = await getAdminAssistantContext();
  const normalized = normalizePrompt(prompt);

  let message = buildSummaryReply(context);
  const actions: Array<{ label: string; href: string }> = [];
  let intent: AssistantIntent = 'summary';
  let outOfScope = false;

  if (!isFixlifeScopedPrompt(prompt)) {
    const outOfScopeReply = buildOutOfScopeReply();
    message = outOfScopeReply.message;
    actions.push(...outOfScopeReply.actions);
    intent = 'out_of_scope';
    outOfScope = true;
  } else if (/moderation|moderacion|upload|image|imagen|photo|foto|trust|safety|seguridad/.test(normalized)) {
    message = await buildModerationReply(context);
    actions.push({ label: 'Open Trust & Safety', href: '/admin-dashboard/trust-safety' });
    intent = 'moderation';
  } else if (/penalt|penalizacion|debt|balance|owed|deuda|saldo/.test(normalized)) {
    message = await buildPenaltyReply(context);
    actions.push({ label: 'Review penalties', href: '/admin-dashboard/trust-safety' });
    intent = 'penalties';
  } else if (/request|solicitud|status|estado|service|servicio|job|worker|professional|cliente|client/.test(normalized)) {
    message = await buildOpenRequestsReply(context);
    actions.push({ label: 'Open requests', href: '/admin-dashboard/requests' });
    intent = 'requests';
  } else if (/report|summary|informe|reporte|metric|metrica/.test(normalized)) {
    message = `${buildSummaryReply(context)} ${buildAttentionReply(context)}`;
    actions.push({ label: 'Export dashboard PDF', href: '/api/admin/stats/export-pdf' });
    intent = 'reports';
  } else if (/attention|priority|urgent|help|ayuda/.test(normalized)) {
    message = buildAttentionReply(context);
    actions.push({ label: 'Open Trust & Safety', href: '/admin-dashboard/trust-safety' });
    actions.push({ label: 'Open requests', href: '/admin-dashboard/requests' });
    intent = 'attention';
  }

  await recordAssistantInteraction({
    adminId: options.adminId ?? null,
    channel: options.channel || 'text',
    prompt,
    response: message,
    intent,
    outOfScope,
    actions,
  });

  return {
    message,
    context: await getAdminAssistantContext(),
    actions,
  };
};

export const createAdminAssistantLiveKitToken = async (input: { adminId: number; adminName: string }) => {
  const url = String(process.env.LIVEKIT_URL || '').trim();
  const apiKey = String(process.env.LIVEKIT_API_KEY || '').trim();
  const apiSecret = String(process.env.LIVEKIT_API_SECRET || '').trim();

  if (!url || !apiKey || !apiSecret) {
    return {
      configured: false,
      url: url || null,
      token: null,
      room: null,
      message: 'LiveKit credentials are not configured.',
    };
  }

  await recordAssistantInteraction({
    adminId: input.adminId,
    channel: 'voice',
    prompt: 'LiveKit voice session requested',
    response: 'LiveKit voice room ready.',
    intent: 'voice_session',
  });

  const room = `fixlife-admin-assistant-${input.adminId}`;
  const identity = `admin-${input.adminId}`;
  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    name: input.adminName || 'Fixlife Admin',
    ttl: '30m',
  });

  token.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return {
    configured: true,
    url,
    token: await token.toJwt(),
    room,
    message: 'LiveKit voice room ready.',
  };
};
