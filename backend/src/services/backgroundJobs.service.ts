import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { ensureSystemEventsTable, recordSystemEvent } from './systemEvents.service';

type BackgroundJobStatus = 'pending' | 'processing' | 'retrying' | 'completed' | 'failed';
export type BackgroundJobType =
  | 'send_payment_invoice_email'
  | 'send_worker_payment_secured_email'
  | 'send_worker_payout_paid_email'
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

const BACKGROUND_JOB_INTERVAL_MS = 8000;

const getRetryDelayMs = (attemptsMade: number) =>
  Math.min(5 * 60_000, Math.max(20_000, Math.pow(2, attemptsMade) * 10_000));

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
