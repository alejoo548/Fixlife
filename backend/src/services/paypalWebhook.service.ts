import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import { ensureBackgroundJobsTable, enqueueBackgroundJob } from './backgroundJobs.service';
import { ensureFinanceOperationsTables, createFinanceCase, resolveFinanceCase } from './financeOperations.service';
import { ensurePaymentLedgerTables } from './paymentLedger.service';
import { recordSystemEvent } from './systemEvents.service';

type PaypalWebhookRow = RowDataPacket & {
  id_event_log: number;
  paypal_event_id: string;
  event_type: string;
  resource_id: string | null;
  payload_json: string;
  verify_status: string;
  processing_status: string;
  processed_at: string | null;
};

let paypalWebhookTablesChecked = false;

const getPaypalBaseUrl = () =>
  String(process.env.PAYPAL_MODE || 'sandbox').toLowerCase() === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

const getPaypalCredentials = () => ({
  clientId: String(process.env.PAYPAL_CLIENT_ID || '').trim(),
  clientSecret: String(process.env.PAYPAL_CLIENT_SECRET || '').trim(),
});

const getPaypalAccessToken = async () => {
  const { clientId, clientSecret } = getPaypalCredentials();
  if (!clientId || !clientSecret) {
    throw new Error('PayPal credentials are missing.');
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetchPaypalWithTimeout(`${getPaypalBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const payload = await parsePaypalResponse(response);
  if (!response.ok || !payload?.access_token) {
    throw new Error(String(payload?.error_description || payload?.error || 'Could not get PayPal access token.'));
  }
  return String(payload.access_token);
};

const PAYPAL_REQUEST_TIMEOUT_MS = 15000;

const fetchPaypalWithTimeout = async (url: string, init: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PAYPAL_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const parsePaypalResponse = async (response: Response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

export const ensurePaypalWebhookTables = async () => {
  if (paypalWebhookTablesChecked) return;

  await ensureBackgroundJobsTable();
  await ensurePaymentLedgerTables();
  await ensureFinanceOperationsTables();
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS paypal_webhook_events (
      id_event_log INT NOT NULL AUTO_INCREMENT,
      paypal_event_id VARCHAR(120) NOT NULL,
      event_type VARCHAR(120) NOT NULL,
      resource_id VARCHAR(120) NULL,
      payload_json LONGTEXT NOT NULL,
      verify_status ENUM('pending', 'verified', 'rejected', 'skipped') NOT NULL DEFAULT 'pending',
      processing_status ENUM('queued', 'processing', 'processed', 'ignored', 'failed') NOT NULL DEFAULT 'queued',
      last_error TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at TIMESTAMP NULL,
      PRIMARY KEY (id_event_log),
      UNIQUE KEY uniq_paypal_webhook_event (paypal_event_id),
      KEY idx_paypal_webhook_processing (processing_status, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  paypalWebhookTablesChecked = true;
};

export const verifyPaypalWebhookSignature = async (input: {
  headers: Record<string, string | string[] | undefined>;
  payload: any;
}) => {
  const webhookId = String(process.env.PAYPAL_WEBHOOK_ID || '').trim();
  if (!webhookId) {
    return { verified: false, skipped: true, reason: 'PAYPAL_WEBHOOK_ID is not configured.' };
  }

  const accessToken = await getPaypalAccessToken();
  const body = {
    auth_algo: String(input.headers['paypal-auth-algo'] || ''),
    cert_url: String(input.headers['paypal-cert-url'] || ''),
    transmission_id: String(input.headers['paypal-transmission-id'] || ''),
    transmission_sig: String(input.headers['paypal-transmission-sig'] || ''),
    transmission_time: String(input.headers['paypal-transmission-time'] || ''),
    webhook_id: webhookId,
    webhook_event: input.payload,
  };

  const response = await fetchPaypalWithTimeout(`${getPaypalBaseUrl()}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await parsePaypalResponse(response);

  if (!response.ok || !payload) {
    throw new Error(String(payload?.message || payload?.name || 'PayPal webhook verification failed.'));
  }

  return {
    verified: String(payload?.verification_status || '').toUpperCase() === 'SUCCESS',
    skipped: false,
    reason: String(payload?.verification_status || 'UNKNOWN'),
  };
};

export const storePaypalWebhookEvent = async (input: {
  payload: any;
  verified: boolean;
  skipped?: boolean;
}) => {
  await ensurePaypalWebhookTables();

  const eventId = String(input.payload?.id || '').trim();
  if (!eventId) {
    throw new Error('PayPal webhook event is missing an id.');
  }

  const verifyStatus = input.skipped ? 'skipped' : input.verified ? 'verified' : 'rejected';
  const resourceId =
    input.payload?.resource?.id != null ? String(input.payload.resource.id).slice(0, 120) : null;

  await pool.execute(
    `INSERT INTO paypal_webhook_events (
       paypal_event_id,
       event_type,
       resource_id,
       payload_json,
       verify_status,
       processing_status
     )
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       payload_json = VALUES(payload_json),
       verify_status = VALUES(verify_status),
       resource_id = VALUES(resource_id),
       event_type = VALUES(event_type)`,
    [
      eventId,
      String(input.payload?.event_type || 'UNKNOWN').slice(0, 120),
      resourceId,
      JSON.stringify(input.payload),
      verifyStatus,
      input.verified || input.skipped ? 'queued' : 'ignored',
    ]
  );

  if (input.verified || input.skipped) {
    await enqueueBackgroundJob({
      jobType: 'process_paypal_webhook',
      jobKey: `paypal-webhook-${eventId}`,
      payload: { paypal_event_id: eventId },
      attemptsMax: 5,
    });
  }

  return eventId;
};

const markPaypalWebhookProcessed = async (paypalEventId: string, status: 'processed' | 'ignored' | 'failed', error?: string | null) => {
  await pool.execute(
    `UPDATE paypal_webhook_events
     SET processing_status = ?,
         processed_at = CURRENT_TIMESTAMP,
         last_error = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE paypal_event_id = ?`,
    [status, error ? String(error).slice(0, 1000) : null, paypalEventId]
  );
};

export const processStoredPaypalWebhookEvent = async (input: { paypal_event_id: string }) => {
  await ensurePaypalWebhookTables();

  const [rows] = await pool.execute<PaypalWebhookRow[]>(
    `SELECT id_event_log, paypal_event_id, event_type, resource_id, payload_json, verify_status, processing_status, processed_at
     FROM paypal_webhook_events
     WHERE paypal_event_id = ?
     LIMIT 1`,
    [String(input.paypal_event_id || '').trim()]
  );
  const webhookRow = rows[0];
  if (!webhookRow) {
    throw new Error('Stored PayPal webhook event not found.');
  }

  const payload = JSON.parse(String(webhookRow.payload_json || '{}'));
  const eventType = String(webhookRow.event_type || 'UNKNOWN').toUpperCase();

  try {
    if (eventType === 'PAYMENT.CAPTURE.REFUNDED' || eventType === 'PAYMENT.CAPTURE.REVERSED') {
      const captureId = payload?.resource?.id ? String(payload.resource.id) : null;
      if (!captureId) {
        await markPaypalWebhookProcessed(webhookRow.paypal_event_id, 'ignored');
        return;
      }

      const [paymentRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id_payment, id_request, amount, currency_code
         FROM service_request_payments
         WHERE provider_capture_id = ?
         LIMIT 1`,
        [captureId]
      );
      const paymentRow = paymentRows[0];
      if (!paymentRow) {
        await markPaypalWebhookProcessed(webhookRow.paypal_event_id, 'ignored');
        return;
      }

      const refundAmount = Number(payload?.resource?.amount?.value || paymentRow.amount || 0);
      const financeCaseId = await createFinanceCase({
        caseType: 'refund',
        direction: 'customer_refund',
        idRequest: Number(paymentRow.id_request),
        idPayment: Number(paymentRow.id_payment),
        amount: refundAmount,
        currencyCode: String(payload?.resource?.amount?.currency_code || paymentRow.currency_code || 'USD'),
        reason: 'PayPal webhook refund received.',
        notes: `Webhook ${webhookRow.paypal_event_id}`,
      });
      await resolveFinanceCase({ idCase: financeCaseId, applyLedger: true });

      await recordSystemEvent({
        level: 'warning',
        component: 'paypal_webhook',
        eventType: 'refund_processed',
        message: `Refund webhook applied to payment #${Number(paymentRow.id_payment)}.`,
        metadata: {
          paypal_event_id: webhookRow.paypal_event_id,
          capture_id: captureId,
          amount: refundAmount,
        },
      });
      await markPaypalWebhookProcessed(webhookRow.paypal_event_id, 'processed');
      return;
    }

    await recordSystemEvent({
      level: 'info',
      component: 'paypal_webhook',
      eventType: 'webhook_received',
      message: `Webhook ${eventType} stored for audit.`,
      metadata: {
        paypal_event_id: webhookRow.paypal_event_id,
        resource_id: webhookRow.resource_id,
      },
    });
    await markPaypalWebhookProcessed(webhookRow.paypal_event_id, 'processed');
  } catch (error: any) {
    await markPaypalWebhookProcessed(
      webhookRow.paypal_event_id,
      'failed',
      String(error?.message || 'PayPal webhook processing failed.')
    );
    throw error;
  }
};
