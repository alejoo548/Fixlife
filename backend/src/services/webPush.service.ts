import webpush from 'web-push';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';

let configured = false;

const ensureConfigured = () => {
  if (configured) return true;
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || '').trim();
  const subject = String(process.env.VAPID_SUBJECT || 'mailto:support@fixlife.site').trim();
  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
};

let tableChecked = false;
export const ensurePushSubscriptionsTable = async () => {
  if (tableChecked) return;
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id_subscription INT AUTO_INCREMENT PRIMARY KEY,
      id_user INT NOT NULL,
      endpoint VARCHAR(512) NOT NULL,
      p256dh VARCHAR(255) NOT NULL,
      auth VARCHAR(255) NOT NULL,
      user_agent VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_endpoint (endpoint(255)),
      KEY idx_push_subscriptions_user (id_user)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  tableChecked = true;
};

export const saveSubscription = async (input: {
  userId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}) => {
  await ensurePushSubscriptionsTable();
  await pool.execute(
    `INSERT INTO push_subscriptions (id_user, endpoint, p256dh, auth, user_agent)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id_user = VALUES(id_user), p256dh = VALUES(p256dh), auth = VALUES(auth), user_agent = VALUES(user_agent)`,
    [input.userId, input.endpoint, input.p256dh, input.auth, input.userAgent ?? null]
  );
};

export const removeSubscription = async (userId: number, endpoint: string) => {
  await ensurePushSubscriptionsTable();
  await pool.execute(`DELETE FROM push_subscriptions WHERE id_user = ? AND endpoint = ?`, [userId, endpoint]);
};

// Fire-and-forget: a push failure should never break the notification flow
// that triggered it (in-app notifications + sockets already covered that).
export const sendPushToUser = async (
  userId: number,
  payload: { title: string; body: string; url?: string | null }
) => {
  try {
    if (!ensureConfigured()) return;
    await ensurePushSubscriptionsTable();

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id_subscription, endpoint, p256dh, auth FROM push_subscriptions WHERE id_user = ?`,
      [userId]
    );
    if (rows.length === 0) return;

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || '/',
    });

    await Promise.all(
      rows.map(async (row) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: row.endpoint,
              keys: { p256dh: row.p256dh, auth: row.auth },
            },
            body
          );
        } catch (error: any) {
          const statusCode = error?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await pool.execute(`DELETE FROM push_subscriptions WHERE id_subscription = ?`, [row.id_subscription]);
          } else {
            console.error('[webPush] sendNotification failed:', error?.message || error);
          }
        }
      })
    );
  } catch (error) {
    console.error('[webPush] sendPushToUser failed:', error);
  }
};
