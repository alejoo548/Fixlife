import { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import pool from '../config/db';

let supportTablesChecked = false;

export interface SupportThreadRow extends RowDataPacket {
  id: number;
  user_id: number;
  subject: string;
  status: 'open' | 'waiting_for_user' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high';
  assigned_admin_id: number | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  user_name?: string;
  user_lastname?: string;
  user_role?: string;
  message_count?: number;
  last_message?: string;
  last_sender_role?: string;
}

export interface SupportMessageRow extends RowDataPacket {
  id: number;
  thread_id: number;
  sender_user_id: number;
  sender_role: 'client' | 'worker' | 'admin';
  message: string | null;
  image_url: string | null;
  created_at: string;
  // Joined
  sender_name?: string;
  sender_lastname?: string;
}


export const ensureSupportTables = async (executor: Pool | PoolConnection = pool): Promise<void> => {
  if (supportTablesChecked) return;
  supportTablesChecked = true;

  try {
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS support_threads (
        id INT NOT NULL AUTO_INCREMENT,
        user_id INT NOT NULL,
        subject VARCHAR(120) NOT NULL,
        status ENUM('open', 'waiting_for_user', 'resolved', 'closed') NOT NULL DEFAULT 'open',
        priority ENUM('low', 'normal', 'high') NOT NULL DEFAULT 'normal',
        assigned_admin_id INT NULL,
        last_message_at TIMESTAMP NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_support_threads_user (user_id, status),
        KEY idx_support_threads_status (status, created_at),
        KEY idx_support_threads_assigned (assigned_admin_id),
        CONSTRAINT fk_support_threads_user FOREIGN KEY (user_id) REFERENCES users(id_user) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Support Messages
    await executor.execute(`
      CREATE TABLE IF NOT EXISTS support_messages (
        id INT NOT NULL AUTO_INCREMENT,
        thread_id INT NOT NULL,
        sender_user_id INT NOT NULL,
        sender_role ENUM('client', 'worker', 'admin') NOT NULL,
        message TEXT NULL,
        image_url VARCHAR(255) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_support_messages_thread (thread_id, created_at),
        KEY idx_support_messages_sender (sender_user_id),
        CONSTRAINT fk_support_messages_thread FOREIGN KEY (thread_id) REFERENCES support_threads(id) ON DELETE CASCADE,
        CONSTRAINT fk_support_messages_user FOREIGN KEY (sender_user_id) REFERENCES users(id_user) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await executor.execute(`
      CREATE INDEX IF NOT EXISTS idx_support_threads_last_message 
      ON support_threads (last_message_at DESC)
    `).catch(() => {});

    console.log('[Support] Support tables ensured.');
  } catch (error) {
    supportTablesChecked = false;
    console.error('[Support] Error ensuring support tables:', error);
    throw error;
  }
};

// ============== Queries ==============

export async function getThreadsForUser(userId: number, limit = 30): Promise<SupportThreadRow[]> {
  await ensureSupportTables();

  const [rows] = await pool.execute<SupportThreadRow[]>(
    `
    SELECT
      st.*,
      u.name AS user_name,
      u.lastname AS user_lastname,
      u.rol AS user_role,
      (SELECT COUNT(*) FROM support_messages WHERE thread_id = st.id) AS message_count,
      (SELECT message FROM support_messages WHERE thread_id = st.id ORDER BY created_at DESC LIMIT 1) AS last_message,
      (SELECT sender_role FROM support_messages WHERE thread_id = st.id ORDER BY created_at DESC LIMIT 1) AS last_sender_role
    FROM support_threads st
    LEFT JOIN users u ON u.id_user = st.user_id
    WHERE st.user_id = ?
    ORDER BY st.last_message_at DESC, st.created_at DESC
    LIMIT ${Number(limit)}
    `,
    [userId]
  );

  return rows;
}

export async function getAllThreadsForAdmin(limit = 50): Promise<SupportThreadRow[]> {
  await ensureSupportTables();

  const [rows] = await pool.execute<SupportThreadRow[]>(
    `
    SELECT
      st.*,
      u.name AS user_name,
      u.lastname AS user_lastname,
      u.rol AS user_role,
      (SELECT COUNT(*) FROM support_messages WHERE thread_id = st.id) AS message_count,
      (SELECT message FROM support_messages WHERE thread_id = st.id ORDER BY created_at DESC LIMIT 1) AS last_message,
      (SELECT sender_role FROM support_messages WHERE thread_id = st.id ORDER BY created_at DESC LIMIT 1) AS last_sender_role
    FROM support_threads st
    LEFT JOIN users u ON u.id_user = st.user_id
    ORDER BY
      CASE WHEN st.status = 'open' THEN 0 ELSE 1 END,
      st.last_message_at DESC,
      st.created_at DESC
    LIMIT ${Number(limit)}
    `
  );

  return rows;
}

export async function createThread(
  userId: number,
  subject: string,
  priority: 'low' | 'normal' | 'high' = 'normal'
): Promise<number> {
  await ensureSupportTables();

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO support_threads (user_id, subject, priority, status) VALUES (?, ?, ?, 'open')`,
    [userId, subject, priority]
  );

  return result.insertId;
}

export async function getThreadById(threadId: number): Promise<SupportThreadRow | null> {
  await ensureSupportTables();

  const [rows] = await pool.execute<SupportThreadRow[]>(
    `
    SELECT st.*, u.name AS user_name, u.lastname AS user_lastname, u.rol AS user_role
    FROM support_threads st
    LEFT JOIN users u ON u.id_user = st.user_id
    WHERE st.id = ?
    LIMIT 1
    `,
    [threadId]
  );

  return rows[0] || null;
}

export async function getMessagesForThread(threadId: number, limit = 100): Promise<SupportMessageRow[]> {
  await ensureSupportTables();

  const [rows] = await pool.execute<SupportMessageRow[]>(
    `
    SELECT
      sm.*,
      u.name AS sender_name,
      u.lastname AS sender_lastname
    FROM support_messages sm
    LEFT JOIN users u ON u.id_user = sm.sender_user_id
    WHERE sm.thread_id = ?
    ORDER BY sm.created_at ASC
    LIMIT ${Number(limit)}
    `,
    [threadId]
  );

  return rows;
}

export async function insertMessage(
  threadId: number,
  senderUserId: number,
  senderRole: 'client' | 'worker' | 'admin',
  message: string | null,
  imageUrl: string | null = null
): Promise<number> {
  await ensureSupportTables();

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO support_messages (thread_id, sender_user_id, sender_role, message, image_url) 
     VALUES (?, ?, ?, ?, ?)`,
    [threadId, senderUserId, senderRole, message, imageUrl]
  );

  await pool.execute(
    `UPDATE support_threads SET last_message_at = NOW() WHERE id = ?`,
    [threadId]
  );

  return result.insertId;
}

export async function userCanAccessThread(threadId: number, userId: number, userRole: string): Promise<boolean> {
  await ensureSupportTables();

  if (userRole === 'admin' || userRole === 'root') {
    return true;
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT 1 FROM support_threads WHERE id = ? AND user_id = ? LIMIT 1`,
    [threadId, userId]
  );

  return rows.length > 0;
}


export async function updateThreadStatus(
  threadId: number,
  status: 'open' | 'waiting_for_user' | 'resolved' | 'closed'
): Promise<boolean> {
  await ensureSupportTables();

  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE support_threads SET status = ? WHERE id = ?`,
    [status, threadId]
  );

  return result.affectedRows > 0;
}

export async function assignThreadToAdmin(
  threadId: number,
  adminUserId: number
): Promise<boolean> {
  await ensureSupportTables();

  const [adminCheck] = await pool.execute<RowDataPacket[]>(
    `SELECT 1 FROM users WHERE id_user = ? AND rol IN ('admin', 'root') LIMIT 1`,
    [adminUserId]
  );

  if (adminCheck.length === 0) {
    return false;
  }

  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE support_threads SET assigned_admin_id = ? WHERE id = ?`,
    [adminUserId, threadId]
  );

  return result.affectedRows > 0;
}

export async function getThreadWithDetails(threadId: number): Promise<SupportThreadRow | null> {
  await ensureSupportTables();

  const [rows] = await pool.execute<SupportThreadRow[]>(
    `
    SELECT
      st.*,
      u.name AS user_name,
      u.lastname AS user_lastname,
      u.rol AS user_role,
      admin.name AS assigned_admin_name,
      admin.lastname AS assigned_admin_lastname
    FROM support_threads st
    LEFT JOIN users u ON u.id_user = st.user_id
    LEFT JOIN users admin ON admin.id_user = st.assigned_admin_id
    WHERE st.id = ?
    LIMIT 1
    `,
    [threadId]
  );

  return rows[0] || null;
}


export function mapThreadRow(row: SupportThreadRow) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: `${row.user_name || ''} ${row.user_lastname || ''}`.trim() || 'Usuario',
    userRole: (row.user_role || 'client') as 'client' | 'worker',
    subject: row.subject,
    status: row.status,
    priority: row.priority,
    lastMessageAt: row.last_message_at || row.created_at,
    unreadCount: 0,
    createdAt: row.created_at,
  };
}

export function mapMessageRow(row: SupportMessageRow) {
  return {
    id: row.id,
    threadId: row.thread_id,
    senderUserId: row.sender_user_id,
    senderRole: row.sender_role,
    senderName: `${row.sender_name || ''} ${row.sender_lastname || ''}`.trim() || 'Usuario',
    message: row.message || '',
    imageUrl: row.image_url || null,
    createdAt: row.created_at,
  };
}
