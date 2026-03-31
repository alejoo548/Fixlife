import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/db';

export type NotificationTone = 'info' | 'success' | 'warning';

export interface AppNotificationRow extends RowDataPacket {
  id_notification: number;
  id_user: number;
  event_type: string;
  title: string;
  message: string;
  tone: NotificationTone;
  is_read: number;
  read_at: string | null;
  id_request: number | null;
  id_bonus_payout: number | null;
  action_url: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

let notificationsTableChecked = false;

export const ensureNotificationsTable = async () => {
  if (notificationsTableChecked) return;

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS user_notifications (
      id_notification INT NOT NULL AUTO_INCREMENT,
      id_user INT NOT NULL,
      event_type VARCHAR(60) NOT NULL,
      title VARCHAR(140) NOT NULL,
      message VARCHAR(255) NOT NULL,
      tone ENUM('info', 'success', 'warning') NOT NULL DEFAULT 'info',
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      read_at TIMESTAMP NULL,
      id_request INT NULL,
      id_bonus_payout INT NULL,
      action_url VARCHAR(255) NULL,
      dedupe_key VARCHAR(140) NULL,
      metadata_json JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_notification),
      UNIQUE KEY uniq_notification_dedupe (dedupe_key),
      KEY idx_notification_user_created (id_user, created_at DESC),
      KEY idx_notification_user_read (id_user, is_read, created_at DESC),
      CONSTRAINT fk_notification_user FOREIGN KEY (id_user) REFERENCES users(id_user) ON DELETE CASCADE,
      CONSTRAINT fk_notification_request FOREIGN KEY (id_request) REFERENCES service_requests(id_request) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  notificationsTableChecked = true;
};

export const createUserNotification = async (input: {
  userId: number;
  eventType: string;
  title: string;
  message: string;
  tone?: NotificationTone;
  requestId?: number | null;
  bonusPayoutId?: number | null;
  actionUrl?: string | null;
  dedupeKey?: string | null;
  metadata?: Record<string, unknown> | null;
}) => {
  await ensureNotificationsTable();

  const tone = input.tone || 'info';
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

  await pool.execute(
    `INSERT INTO user_notifications
      (id_user, event_type, title, message, tone, is_read, read_at, id_request, id_bonus_payout, action_url, dedupe_key, metadata_json)
     VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       message = VALUES(message),
       tone = VALUES(tone),
       action_url = VALUES(action_url),
       metadata_json = VALUES(metadata_json),
       updated_at = CURRENT_TIMESTAMP`,
    [
      input.userId,
      input.eventType,
      input.title.slice(0, 140),
      input.message.slice(0, 255),
      tone,
      input.requestId ?? null,
      input.bonusPayoutId ?? null,
      input.actionUrl ?? null,
      input.dedupeKey ?? null,
      metadataJson,
    ]
  );
};

export const listUserNotifications = async (
  userId: number,
  options?: { limit?: number; unreadOnly?: boolean }
) => {
  await ensureNotificationsTable();

  const limit = Math.min(Math.max(Number(options?.limit || 30), 1), 100);
  const unreadOnly = Boolean(options?.unreadOnly);
  const where = unreadOnly ? 'WHERE id_user = ? AND is_read = 0' : 'WHERE id_user = ?';

  const [rows] = await pool.execute<AppNotificationRow[]>(
    `SELECT
       id_notification,
       id_user,
       event_type,
       title,
       message,
       tone,
       is_read,
       read_at,
       id_request,
       id_bonus_payout,
       action_url,
       metadata_json,
       created_at,
       updated_at
     FROM user_notifications
     ${where}
     ORDER BY created_at DESC
     LIMIT ?`,
    [userId, limit]
  );

  const [summaryRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       COUNT(*) AS total_count,
       SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) AS unread_count
     FROM user_notifications
     WHERE id_user = ?`,
    [userId]
  );

  const summary = summaryRows[0] || { total_count: 0, unread_count: 0 };

  return {
    notifications: rows.map((row) => ({
      ...row,
      is_read: Number(row.is_read || 0) === 1,
      metadata: row.metadata_json ? safeParseMetadata(row.metadata_json) : null,
    })),
    summary: {
      total_count: Number(summary.total_count || 0),
      unread_count: Number(summary.unread_count || 0),
    },
  };
};

const safeParseMetadata = (raw: string) => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const markNotificationRead = async (userId: number, idNotification: number) => {
  await ensureNotificationsTable();

  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE user_notifications
     SET is_read = 1,
         read_at = COALESCE(read_at, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP
     WHERE id_notification = ?
       AND id_user = ?`,
    [idNotification, userId]
  );

  return result.affectedRows > 0;
};

export const markAllNotificationsRead = async (userId: number) => {
  await ensureNotificationsTable();

  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE user_notifications
     SET is_read = 1,
         read_at = COALESCE(read_at, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP
     WHERE id_user = ?
       AND is_read = 0`,
    [userId]
  );

  return result.affectedRows;
};

