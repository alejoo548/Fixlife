import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { ensureSystemEventsTable, recordSystemEvent } from './systemEvents.service';
import { createUserNotification } from '../utils/notifications';
import { pushToUser, pushToWorkers } from './sseManager';

type BackgroundJobStatus = 'pending' | 'processing' | 'retrying' | 'completed' | 'failed';
export type BackgroundJobType =
  | 'send_payment_invoice_email'
  | 'send_worker_payment_secured_email'
  | 'send_worker_payout_paid_email'
  | 'send_worker_statement_email'
  | 'process_paypal_webhook';

type BackgroundJobRow = RowDataPacket & {
  id_job: number;
  job_key: string | null;
  job_type: BackgroundJobType;
  payload_json: string | null;
  status: BackgroundJobStatus;
  attempts_made: number;
  attempts_max: number;
  run_after: string;
};

let backgroundJobsTableChecked = false;
let backgroundWorkerStarted = false;
let backgroundWorkerTimer: NodeJS.Timeout | null = null;
let backgroundWorkerTickInFlight = false;
let scheduledMaintenanceLastRun = 0;

const BACKGROUND_JOB_INTERVAL_MS = 8000;
const SCHEDULED_MAINTENANCE_INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.SCHEDULED_MAINTENANCE_INTERVAL_MS || 5 * 60_000)
);
const SCHEDULED_REASSIGN_LOOKAHEAD_MINUTES = Math.max(
  15,
  Math.min(Number(process.env.SCHEDULED_REASSIGN_LOOKAHEAD_MINUTES || 45), 180)
);
const SCHEDULED_REQUEST_DURATION_MINUTES = Math.max(
  60,
  Math.min(Number(process.env.SCHEDULED_REQUEST_DURATION_MINUTES || 120), 7 * 60)
);

const getRetryDelayMs = (attemptsMade: number) =>
  Math.min(5 * 60_000, Math.max(20_000, Math.pow(2, attemptsMade) * 10_000));

const reinjectScheduledRequestCandidates = async (
  connection: any,
  input: {
    idRequest: number;
    idService: number;
    latitude: number | null;
    longitude: number | null;
    radiusKm: number;
    previousWorkerProfile: number | null;
    onlineOnly?: boolean;
  }
) => {
  if (input.latitude == null || input.longitude == null || !input.idService) return;

  await connection.execute(
    `INSERT INTO service_request_workers (id_request, id_worker_profile, distance_km, status)
     SELECT
       sr.id_request,
       wp.id_worker_profile,
       (ST_Distance_Sphere(point(wp.longitude, wp.latitude), point(sr.longitude, sr.latitude)) / 1000) AS distance_km,
       'new' AS status
     FROM service_requests sr
     INNER JOIN worker_services ws ON ws.id_service = sr.id_service
     INNER JOIN worker_profiles wp ON wp.id_worker_profile = ws.id_worker_profile
     INNER JOIN users u ON u.id_user = wp.id_user
     INNER JOIN worker_availabilities wa
       ON wa.id_worker_profile = wp.id_worker_profile
      AND wa.is_active = 1
      AND wa.day_of_week = MOD(WEEKDAY(sr.scheduled_date) + 1, 7)
      AND wa.start_time <= sr.scheduled_time
      AND wa.end_time >= TIME(COALESCE(sr.scheduled_end_time, DATE_ADD(sr.scheduled_start_time, INTERVAL ? MINUTE)))
     WHERE sr.id_request = ?
       AND u.rol = 'worker'
       AND wp.is_verified = 1
       AND (? = 0 OR wp.is_online = 1)
       AND wp.latitude IS NOT NULL
       AND wp.longitude IS NOT NULL
       AND (? IS NULL OR wp.id_worker_profile <> ?)
       AND (ST_Distance_Sphere(point(wp.longitude, wp.latitude), point(sr.longitude, sr.latitude)) / 1000) <= LEAST(COALESCE(sr.radius_km, 8), wp.coverage_km)
     ORDER BY distance_km ASC
     LIMIT 50
     ON DUPLICATE KEY UPDATE
       distance_km = VALUES(distance_km),
       status = CASE
         WHEN service_request_workers.status IN ('new', 'expired') THEN 'new'
         ELSE service_request_workers.status
       END,
       counter_status = CASE
         WHEN service_request_workers.status IN ('new', 'expired') THEN NULL
         ELSE service_request_workers.counter_status
       END,
       updated_at = CURRENT_TIMESTAMP`,
    [
      SCHEDULED_REQUEST_DURATION_MINUTES,
      input.idRequest,
      input.onlineOnly ? 1 : 0,
      input.previousWorkerProfile,
      input.previousWorkerProfile,
    ]
  );
};

const expireScheduledCounterOffers = async () => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       sr.id_request,
       sr.id_user,
       sr.id_service,
       sr.latitude,
       sr.longitude,
       sr.radius_km,
       sr.assigned_worker_profile,
       wp.id_user AS worker_user_id
     FROM service_requests sr
     INNER JOIN service_request_workers srw
       ON srw.id_request = sr.id_request
      AND srw.id_worker_profile = sr.assigned_worker_profile
     LEFT JOIN worker_profiles wp ON wp.id_worker_profile = sr.assigned_worker_profile
     WHERE sr.booking_type = 'scheduled'
       AND sr.status = 'assigned'
       AND sr.assigned_worker_profile IS NOT NULL
       AND srw.counter_status = 'pending'
       AND (
         sr.assigned_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR)
         OR sr.scheduled_start_time <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL 12 HOUR)
       )
     ORDER BY sr.scheduled_start_time ASC
     LIMIT 30`
  );

  for (const row of rows) {
    const connection = await pool.getConnection();
    const idRequest = Number(row.id_request);
    const previousWorkerProfile = Number(row.assigned_worker_profile || 0) || null;
    const clientUserId = Number(row.id_user || 0);
    const workerUserId = Number(row.worker_user_id || 0);

    try {
      await connection.beginTransaction();
      const [lockRows] = await connection.execute<RowDataPacket[]>(
        `SELECT sr.id_request, sr.status, sr.assigned_worker_profile, sr.id_service, sr.latitude, sr.longitude, sr.radius_km
         FROM service_requests sr
         INNER JOIN service_request_workers srw
           ON srw.id_request = sr.id_request
          AND srw.id_worker_profile = sr.assigned_worker_profile
         WHERE sr.id_request = ?
           AND sr.booking_type = 'scheduled'
           AND sr.status = 'assigned'
           AND srw.counter_status = 'pending'
         FOR UPDATE`,
        [idRequest]
      );

      if (lockRows.length === 0) {
        await connection.rollback();
        continue;
      }

      await connection.execute(
        `UPDATE service_request_workers
         SET status = 'expired',
             counter_status = 'declined',
             updated_at = CURRENT_TIMESTAMP
         WHERE id_request = ? AND id_worker_profile = ?`,
        [idRequest, previousWorkerProfile]
      );

      await connection.execute(
        `UPDATE service_requests
         SET status = 'pending',
             assigned_worker_profile = NULL,
             assigned_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id_request = ?`,
        [idRequest]
      );

      await reinjectScheduledRequestCandidates(connection, {
        idRequest,
        idService: Number(lockRows[0].id_service),
        latitude: lockRows[0].latitude != null ? Number(lockRows[0].latitude) : null,
        longitude: lockRows[0].longitude != null ? Number(lockRows[0].longitude) : null,
        radiusKm: Number(lockRows[0].radius_km || 8),
        previousWorkerProfile,
      });

      await connection.commit();

      if (clientUserId) {
        await createUserNotification({
          userId: clientUserId,
          eventType: 'scheduled_counter_expired',
          title: 'Counter offer expired',
          message: `Request #${idRequest} is back in the pro pool so another worker can take it.`,
          tone: 'info',
          requestId: idRequest,
          actionUrl: '/app',
          dedupeKey: `scheduled-counter-expired-client-${idRequest}`,
          metadata: { request_status: 'pending' },
        });
      }
      if (workerUserId) {
        await createUserNotification({
          userId: workerUserId,
          eventType: 'scheduled_counter_expired',
          title: 'Counter offer expired',
          message: `Your counter offer for request #${idRequest} expired.`,
          tone: 'warning',
          requestId: idRequest,
          actionUrl: '/pro-dashboard',
          dedupeKey: `scheduled-counter-expired-worker-${idRequest}`,
          metadata: { request_status: 'expired' },
        });
      }
      pushToWorkers('request_updated', { id_request: idRequest });
    } catch (error: any) {
      await connection.rollback();
      await recordSystemEvent({
        level: 'warning',
        component: 'scheduled_bookings',
        eventType: 'counter_expire_failed',
        message: `Could not expire scheduled counter offer for request #${idRequest}.`,
        metadata: { id_request: idRequest, error: String(error?.message || error).slice(0, 300) },
      });
    } finally {
      connection.release();
    }
  }
};

const reassignScheduledRequestsWithBusyWorkers = async () => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       sr.id_request,
       sr.id_user,
       sr.id_service,
       sr.latitude,
       sr.longitude,
       sr.radius_km,
       sr.assigned_worker_profile,
       wp.id_user AS worker_user_id,
       busy.id_request AS busy_request_id
     FROM service_requests sr
     INNER JOIN worker_profiles wp ON wp.id_worker_profile = sr.assigned_worker_profile
     INNER JOIN service_requests busy
       ON busy.assigned_worker_profile = sr.assigned_worker_profile
      AND busy.id_request <> sr.id_request
      AND busy.status = 'in_progress'
     WHERE sr.booking_type = 'scheduled'
       AND sr.status = 'assigned'
       AND sr.assigned_worker_profile IS NOT NULL
       AND sr.scheduled_start_time BETWEEN UTC_TIMESTAMP() AND DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE)
     ORDER BY sr.scheduled_start_time ASC
     LIMIT 30`,
    [SCHEDULED_REASSIGN_LOOKAHEAD_MINUTES]
  );

  for (const row of rows) {
    const connection = await pool.getConnection();
    const idRequest = Number(row.id_request);
    const previousWorkerProfile = Number(row.assigned_worker_profile || 0) || null;
    const clientUserId = Number(row.id_user || 0);
    const workerUserId = Number(row.worker_user_id || 0);

    try {
      await connection.beginTransaction();
      const [lockRows] = await connection.execute<RowDataPacket[]>(
        `SELECT id_request, status, assigned_worker_profile, id_service, latitude, longitude, radius_km
         FROM service_requests
         WHERE id_request = ?
           AND booking_type = 'scheduled'
           AND status = 'assigned'
           AND assigned_worker_profile = ?
         FOR UPDATE`,
        [idRequest, previousWorkerProfile]
      );

      if (lockRows.length === 0) {
        await connection.rollback();
        continue;
      }

      await connection.execute(
        `UPDATE service_request_workers
         SET status = 'expired',
             counter_status = CASE WHEN counter_status = 'pending' THEN 'declined' ELSE counter_status END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id_request = ? AND id_worker_profile = ?`,
        [idRequest, previousWorkerProfile]
      );

      await connection.execute(
        `UPDATE service_requests
         SET status = 'pending',
             assigned_worker_profile = NULL,
             assigned_at = NULL,
             urgency_level = 'urgent',
             updated_at = CURRENT_TIMESTAMP
         WHERE id_request = ?`,
        [idRequest]
      );

      await reinjectScheduledRequestCandidates(connection, {
        idRequest,
        idService: Number(lockRows[0].id_service),
        latitude: lockRows[0].latitude != null ? Number(lockRows[0].latitude) : null,
        longitude: lockRows[0].longitude != null ? Number(lockRows[0].longitude) : null,
        radiusKm: Number(lockRows[0].radius_km || 8),
        previousWorkerProfile,
        onlineOnly: true,
      });

      await connection.commit();

      if (clientUserId) {
        await createUserNotification({
          userId: clientUserId,
          eventType: 'scheduled_worker_reassigned',
          title: 'We are finding another pro',
          message: `Request #${idRequest} was reopened to protect your scheduled visit time.`,
          tone: 'warning',
          requestId: idRequest,
          actionUrl: '/app',
          dedupeKey: `scheduled-reassigned-client-${idRequest}`,
          metadata: { request_status: 'pending' },
        });
        pushToUser(clientUserId, 'request_updated', { id_request: idRequest });
      }
      if (workerUserId) {
        await createUserNotification({
          userId: workerUserId,
          eventType: 'scheduled_worker_reassigned',
          title: 'Scheduled visit reassigned',
          message: `Request #${idRequest} was released because another job is still in progress.`,
          tone: 'warning',
          requestId: idRequest,
          actionUrl: '/pro-dashboard',
          dedupeKey: `scheduled-reassigned-worker-${idRequest}`,
          metadata: { request_status: 'expired' },
        });
      }
      pushToWorkers('request_updated', { id_request: idRequest });
    } catch (error: any) {
      await connection.rollback();
      await recordSystemEvent({
        level: 'warning',
        component: 'scheduled_bookings',
        eventType: 'preventive_reassign_failed',
        message: `Could not reassign scheduled request #${idRequest}.`,
        metadata: { id_request: idRequest, error: String(error?.message || error).slice(0, 300) },
      });
    } finally {
      connection.release();
    }
  }
};

const processScheduledBookingMaintenance = async () => {
  const now = Date.now();
  if (now - scheduledMaintenanceLastRun < SCHEDULED_MAINTENANCE_INTERVAL_MS) return;
  scheduledMaintenanceLastRun = now;

  await expireScheduledCounterOffers();
  await reassignScheduledRequestsWithBusyWorkers();
};

export const ensureBackgroundJobsTable = async () => {
  if (backgroundJobsTableChecked) return;

  await ensureSystemEventsTable();
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS background_jobs (
      id_job INT NOT NULL AUTO_INCREMENT,
      job_key VARCHAR(120) NULL,
      job_type VARCHAR(80) NOT NULL,
      payload_json LONGTEXT NULL,
      status ENUM('pending', 'processing', 'retrying', 'completed', 'failed') NOT NULL DEFAULT 'pending',
      attempts_made INT NOT NULL DEFAULT 0,
      attempts_max INT NOT NULL DEFAULT 5,
      run_after DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      locked_at DATETIME NULL,
      completed_at DATETIME NULL,
      last_error TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_job),
      UNIQUE KEY uniq_background_job_key (job_key),
      KEY idx_background_jobs_status_run_after (status, run_after)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  backgroundJobsTableChecked = true;
};

export const enqueueBackgroundJob = async (input: {
  jobType: BackgroundJobType;
  payload: Record<string, any>;
  jobKey?: string | null;
  attemptsMax?: number;
  runAfter?: Date | null;
}) => {
  await ensureBackgroundJobsTable();

  const attemptsMax = Math.max(1, Math.min(Number(input.attemptsMax || 5), 10));
  const payloadJson = JSON.stringify(input.payload || {});
  const runAfter = input.runAfter ? input.runAfter.toISOString().slice(0, 19).replace('T', ' ') : null;

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO background_jobs (
       job_key,
       job_type,
       payload_json,
       status,
       attempts_made,
       attempts_max,
       run_after
     )
     VALUES (?, ?, ?, 'pending', 0, ?, COALESCE(?, CURRENT_TIMESTAMP))
     ON DUPLICATE KEY UPDATE
       payload_json = VALUES(payload_json),
       status = CASE
         WHEN status IN ('completed', 'failed') THEN 'pending'
         ELSE status
       END,
       attempts_made = CASE
         WHEN status IN ('completed', 'failed') THEN 0
         ELSE attempts_made
       END,
       attempts_max = VALUES(attempts_max),
       run_after = COALESCE(VALUES(run_after), CURRENT_TIMESTAMP),
       last_error = NULL,
       completed_at = NULL,
       updated_at = CURRENT_TIMESTAMP`,
    [input.jobKey || null, input.jobType, payloadJson, attemptsMax, runAfter]
  );

  return result.insertId || null;
};

const runJobHandler = async (row: BackgroundJobRow) => {
  const payload = row.payload_json ? JSON.parse(String(row.payload_json)) : {};

  if (row.job_type === 'send_payment_invoice_email') {
    const { sendPaymentInvoiceEmail } = require('../utils/email');
    await sendPaymentInvoiceEmail(payload);
    return;
  }

  if (row.job_type === 'send_worker_payment_secured_email') {
    const { sendWorkerPaymentSecuredEmail } = require('../utils/email');
    await sendWorkerPaymentSecuredEmail(payload);
    return;
  }

  if (row.job_type === 'send_worker_payout_paid_email') {
    const { sendWorkerPayoutPaidEmail } = require('../utils/email');
    await sendWorkerPayoutPaidEmail(payload);
    return;
  }

  if (row.job_type === 'send_worker_statement_email') {
    const { sendWorkerStatementEmail } = require('../utils/email');
    await sendWorkerStatementEmail(payload);
    return;
  }

  if (row.job_type === 'process_paypal_webhook') {
    const { processStoredPaypalWebhookEvent } = require('./paypalWebhook.service');
    await processStoredPaypalWebhookEvent(payload);
    return;
  }

  throw new Error(`Unsupported background job type: ${row.job_type}`);
};

export const processPendingBackgroundJobs = async (limit = 5) => {
  await ensureBackgroundJobsTable();

  const safeLimit = Math.max(1, Math.min(Number(limit || 5), 20));
  const [rows] = await pool.execute<BackgroundJobRow[]>(
    `SELECT id_job, job_key, job_type, payload_json, status, attempts_made, attempts_max, run_after
     FROM background_jobs
     WHERE status IN ('pending', 'retrying')
       AND run_after <= CURRENT_TIMESTAMP
     ORDER BY run_after ASC, id_job ASC
     LIMIT ${safeLimit}`
  );

  for (const row of rows) {
    const [lockResult] = await pool.execute<ResultSetHeader>(
      `UPDATE background_jobs
       SET status = 'processing',
           locked_at = CURRENT_TIMESTAMP,
           attempts_made = attempts_made + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id_job = ?
         AND status IN ('pending', 'retrying')`,
      [Number(row.id_job)]
    );

    if (lockResult.affectedRows === 0) {
      continue;
    }

    try {
      await runJobHandler(row);
      await pool.execute(
        `UPDATE background_jobs
         SET status = 'completed',
             completed_at = CURRENT_TIMESTAMP,
             locked_at = NULL,
             last_error = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id_job = ?`,
        [Number(row.id_job)]
      );
    } catch (error: any) {
      const attemptsMade = Number(row.attempts_made || 0) + 1;
      const retryable = attemptsMade < Number(row.attempts_max || 5);
      const nextDelayMs = getRetryDelayMs(attemptsMade);
      const nextRunAt = new Date(Date.now() + nextDelayMs).toISOString().slice(0, 19).replace('T', ' ');
      const errorMessage = String(error?.message || 'Background job failed.').slice(0, 600);

      await pool.execute(
        `UPDATE background_jobs
         SET status = ?,
             run_after = CASE WHEN ? = 'retrying' THEN ? ELSE run_after END,
             locked_at = NULL,
             last_error = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id_job = ?`,
        [retryable ? 'retrying' : 'failed', retryable ? 'retrying' : 'failed', nextRunAt, errorMessage, Number(row.id_job)]
      );

      await recordSystemEvent({
        level: retryable ? 'warning' : 'error',
        component: 'background_jobs',
        eventType: retryable ? 'job_retry' : 'job_failed',
        message: `Background job ${row.job_type} ${retryable ? 'scheduled for retry' : 'failed permanently'}.`,
        metadata: {
          id_job: Number(row.id_job),
          job_type: row.job_type,
          attempts_made: attemptsMade,
          attempts_max: Number(row.attempts_max || 5),
          error: errorMessage,
        },
      });
    }
  }
};

export const startBackgroundJobWorker = () => {
  if (backgroundWorkerStarted) return;
  backgroundWorkerStarted = true;

  const tick = async () => {
    if (backgroundWorkerTickInFlight) return;
    backgroundWorkerTickInFlight = true;
    try {
      await processPendingBackgroundJobs(6);
      await processScheduledBookingMaintenance();
    } catch (error) {
      console.error('Error in processPendingBackgroundJobs:', error);
    } finally {
      backgroundWorkerTickInFlight = false;
    }
  };

  backgroundWorkerTimer = setInterval(() => {
    void tick();
  }, BACKGROUND_JOB_INTERVAL_MS);

  void tick();
};

export const stopBackgroundJobWorker = () => {
  if (backgroundWorkerTimer) {
    clearInterval(backgroundWorkerTimer);
    backgroundWorkerTimer = null;
  }
  backgroundWorkerStarted = false;
};

export const getBackgroundJobsAdmin = async (limit = 30) => {
  await ensureBackgroundJobsTable();
  const safeLimit = Math.max(1, Math.min(Number(limit || 30), 100));
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       id_job,
       job_key,
       job_type,
       status,
       attempts_made,
       attempts_max,
       run_after,
       completed_at,
       last_error,
       created_at,
       updated_at
     FROM background_jobs
     ORDER BY created_at DESC, id_job DESC
     LIMIT ${safeLimit}`
  );

  return rows.map((row) => ({
    id_job: Number(row.id_job),
    job_key: row.job_key || null,
    job_type: String(row.job_type || ''),
    status: String(row.status || 'pending'),
    attempts_made: Number(row.attempts_made || 0),
    attempts_max: Number(row.attempts_max || 0),
    run_after: row.run_after,
    completed_at: row.completed_at || null,
    last_error: row.last_error || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
};
