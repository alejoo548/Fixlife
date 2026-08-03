import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { Request } from 'express';
import pool from '../config/db';
import { buildProtectedAssetUrl } from '../utils/assets';

type DbExecutor = Pick<Pool | PoolConnection, 'execute'>;

type SnapshotInput = {
  incidentId: number;
  requestId: number;
  userId: number;
  actorRole: 'client' | 'worker';
  incidentType: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
};

const toNumberOrNull = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const distanceKm = (aLat: unknown, aLng: unknown, bLat: unknown, bLng: unknown) => {
  const lat1 = toNumberOrNull(aLat);
  const lng1 = toNumberOrNull(aLng);
  const lat2 = toNumberOrNull(bLat);
  const lng2 = toNumberOrNull(bLng);
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return Number((6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))).toFixed(2));
};

const signedImage = (req: Request | undefined, fileName: unknown) => {
  if (!req || !fileName) return fileName || null;
  return buildProtectedAssetUrl(req, String(fileName));
};

const protectSnapshotAssets = (snapshot: any, req?: Request) => {
  if (!snapshot || !req) return snapshot;
  const copy = JSON.parse(JSON.stringify(snapshot));
  copy.request_images = (copy.request_images || []).map((image: any) => ({
    ...image,
    url: signedImage(req, image.image_url),
  }));
  copy.chat_messages = (copy.chat_messages || []).map((message: any) => ({
    ...message,
    image_url: signedImage(req, message.image_url),
  }));
  copy.reports = (copy.reports || []).map((report: any) => ({
    ...report,
    evidence_image_url: signedImage(req, report.evidence_image_url),
  }));
  return copy;
};

export const ensureCaseEvidenceSnapshotsTable = async (executor: DbExecutor = pool) => {
  await executor.execute(`
    CREATE TABLE IF NOT EXISTS case_evidence_snapshots (
      id_snapshot INT NOT NULL AUTO_INCREMENT,
      id_incident INT NOT NULL,
      id_request INT NULL,
      id_user INT NOT NULL,
      actor_role ENUM('client','worker') NOT NULL,
      incident_type VARCHAR(60) NOT NULL,
      snapshot_json LONGTEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_snapshot),
      UNIQUE KEY uniq_case_snapshot_incident (id_incident),
      KEY idx_case_snapshot_request (id_request),
      KEY idx_case_snapshot_user (id_user, created_at),
      CONSTRAINT fk_case_snapshot_incident FOREIGN KEY (id_incident) REFERENCES account_incidents(id_incident) ON DELETE CASCADE,
      CONSTRAINT fk_case_snapshot_user FOREIGN KEY (id_user) REFERENCES users(id_user) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

export const captureCaseEvidenceSnapshot = async (input: SnapshotInput, executor: DbExecutor = pool) => {
  await ensureCaseEvidenceSnapshotsTable(executor);

  const [requestRows] = await executor.execute<RowDataPacket[]>(
    `SELECT sr.*,
            s.name AS service_name,
            client.id_user AS client_user_id,
            client.name AS client_name,
            client.lastname AS client_lastname,
            client.email AS client_email,
            worker_user.id_user AS worker_user_id,
            worker_user.name AS worker_name,
            worker_user.lastname AS worker_lastname,
            worker_user.email AS worker_email,
            wp.id_worker_profile AS worker_profile_id,
            wp.latitude AS worker_latitude,
            wp.longitude AS worker_longitude
     FROM service_requests sr
     LEFT JOIN services s ON s.id_service = sr.id_service
     LEFT JOIN users client ON client.id_user = sr.id_user
     LEFT JOIN worker_profiles wp ON wp.id_worker_profile = sr.assigned_worker_profile
     LEFT JOIN users worker_user ON worker_user.id_user = wp.id_user
     WHERE sr.id_request = ?
     LIMIT 1`,
    [input.requestId]
  );
  const request = requestRows[0] || null;
  if (!request) return null;

  const [paymentRows] = await executor.execute<RowDataPacket[]>(
    `SELECT id_payment, provider, currency_code, amount, platform_fee, worker_payout,
            payment_status, paid_at, released_at, created_at, updated_at
     FROM service_request_payments
     WHERE id_request = ?
     ORDER BY id_payment DESC
     LIMIT 1`,
    [input.requestId]
  );
  const [imageRows] = await executor.execute<RowDataPacket[]>(
    `SELECT id_image, image_url, created_at
     FROM service_request_images
     WHERE id_request = ?
     ORDER BY id_image ASC`,
    [input.requestId]
  );
  const [chatRows] = await executor.execute<RowDataPacket[]>(
    `SELECT id_message, sender_role, id_user, id_worker_profile, message, image_url, created_at
     FROM service_request_chat_messages
     WHERE id_request = ?
     ORDER BY created_at DESC, id_message DESC
     LIMIT 12`,
    [input.requestId]
  );
  const [reportRows] = await executor.execute<RowDataPacket[]>(
    `SELECT id_report, reporter_user_id, reporter_role, reported_user_id, reported_role,
            reason, description, evidence_image_url, status, created_at, resolved_at
     FROM service_request_reports
     WHERE id_request = ?
     ORDER BY created_at DESC, id_report DESC
     LIMIT 12`,
    [input.requestId]
  );
  const [candidateRows] = await executor.execute<RowDataPacket[]>(
    `SELECT id_worker_profile, distance_km, status, proposed_budget, counter_status, notified_at, updated_at
     FROM service_request_workers
     WHERE id_request = ?
     ORDER BY updated_at DESC, notified_at DESC
     LIMIT 20`,
    [input.requestId]
  );

  const snapshot = {
    captured_at: new Date().toISOString(),
    incident: {
      id_incident: input.incidentId,
      id_user: input.userId,
      actor_role: input.actorRole,
      incident_type: String(input.incidentType || 'policy_incident').slice(0, 60),
    },
    request: {
      id_request: Number(request.id_request),
      status: request.status || null,
      booking_type: request.booking_type || 'express',
      selection_mode: request.selection_mode || null,
      service_name: request.service_name || null,
      location_text: request.location_text || null,
      latitude: request.latitude != null ? Number(request.latitude) : null,
      longitude: request.longitude != null ? Number(request.longitude) : null,
      budget: request.budget != null ? Number(request.budget) : null,
      final_budget: request.final_budget != null ? Number(request.final_budget) : null,
      description: request.description || null,
      created_at: request.created_at || null,
      updated_at: request.updated_at || null,
    },
    lifecycle: {
      scheduled_start_time: request.scheduled_start_time || null,
      scheduled_end_time: request.scheduled_end_time || null,
      assigned_at: request.assigned_at || null,
      route_started_at: request.route_started_at || null,
      worker_arrived_at: request.worker_arrived_at || null,
      work_started_at: request.work_started_at || null,
      work_finished_at: request.work_finished_at || null,
      completed_at: request.completed_at || null,
    },
    client: request.client_user_id ? {
      id_user: Number(request.client_user_id),
      name: `${request.client_name || ''} ${request.client_lastname || ''}`.trim() || 'Client',
      email: request.client_email || null,
    } : null,
    worker: request.worker_user_id ? {
      id_user: Number(request.worker_user_id),
      id_worker_profile: request.worker_profile_id != null ? Number(request.worker_profile_id) : null,
      name: `${request.worker_name || ''} ${request.worker_lastname || ''}`.trim() || 'Worker',
      email: request.worker_email || null,
      distance_to_destination_km: distanceKm(request.worker_latitude, request.worker_longitude, request.latitude, request.longitude),
    } : null,
    payment: paymentRows[0] ? {
      id_payment: Number(paymentRows[0].id_payment),
      provider: paymentRows[0].provider || null,
      currency_code: paymentRows[0].currency_code || 'USD',
      amount: Number(paymentRows[0].amount || 0),
      platform_fee: Number(paymentRows[0].platform_fee || 0),
      worker_payout: Number(paymentRows[0].worker_payout || 0),
      payment_status: paymentRows[0].payment_status || null,
      paid_at: paymentRows[0].paid_at || null,
      released_at: paymentRows[0].released_at || null,
    } : null,
    before: input.before ?? null,
    after: input.after ?? null,
    metadata: input.metadata ?? null,
    request_images: imageRows.map((row) => ({
      id_image: Number(row.id_image),
      image_url: row.image_url || null,
      created_at: row.created_at,
    })),
    chat_messages: chatRows.reverse().map((row) => ({
      id_message: Number(row.id_message),
      sender_role: row.sender_role || null,
      id_user: row.id_user != null ? Number(row.id_user) : null,
      id_worker_profile: row.id_worker_profile != null ? Number(row.id_worker_profile) : null,
      message: row.message || null,
      image_url: row.image_url || null,
      created_at: row.created_at,
    })),
    reports: reportRows.map((row) => ({
      id_report: Number(row.id_report),
      reporter_user_id: row.reporter_user_id != null ? Number(row.reporter_user_id) : null,
      reporter_role: row.reporter_role || null,
      reported_user_id: row.reported_user_id != null ? Number(row.reported_user_id) : null,
      reported_role: row.reported_role || null,
      reason: row.reason || null,
      description: row.description || null,
      evidence_image_url: row.evidence_image_url || null,
      status: row.status || null,
      created_at: row.created_at,
      resolved_at: row.resolved_at || null,
    })),
    candidates: candidateRows.map((row) => ({
      id_worker_profile: Number(row.id_worker_profile),
      distance_km: row.distance_km != null ? Number(row.distance_km) : null,
      status: row.status || null,
      proposed_budget: row.proposed_budget != null ? Number(row.proposed_budget) : null,
      counter_status: row.counter_status || null,
      notified_at: row.notified_at,
      updated_at: row.updated_at,
    })),
  };

  const [result] = await executor.execute<ResultSetHeader>(
    `INSERT INTO case_evidence_snapshots
       (id_incident, id_request, id_user, actor_role, incident_type, snapshot_json)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       id_request = VALUES(id_request),
       id_user = VALUES(id_user),
       actor_role = VALUES(actor_role),
       incident_type = VALUES(incident_type),
       snapshot_json = VALUES(snapshot_json)`,
    [
      input.incidentId,
      input.requestId,
      input.userId,
      input.actorRole,
      String(input.incidentType || 'policy_incident').slice(0, 60),
      JSON.stringify(snapshot),
    ]
  );

  return Number(result.insertId || 0);
};

export const getCaseEvidenceSnapshotByIncident = async (idIncident: number, req?: Request, executor: DbExecutor = pool) => {
  await ensureCaseEvidenceSnapshotsTable(executor);
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT id_snapshot, id_incident, id_request, id_user, actor_role, incident_type, snapshot_json, created_at
     FROM case_evidence_snapshots
     WHERE id_incident = ?
     LIMIT 1`,
    [idIncident]
  );
  const row = rows[0];
  if (!row) return null;
  let snapshot: any = {};
  try {
    snapshot = JSON.parse(String(row.snapshot_json || '{}'));
  } catch {
    snapshot = {};
  }
  return {
    id_snapshot: Number(row.id_snapshot),
    id_incident: Number(row.id_incident),
    id_request: row.id_request != null ? Number(row.id_request) : null,
    id_user: Number(row.id_user),
    actor_role: String(row.actor_role),
    incident_type: String(row.incident_type),
    created_at: row.created_at,
    snapshot: protectSnapshotAssets(snapshot, req),
  };
};
