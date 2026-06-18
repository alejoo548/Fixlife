import { RowDataPacket } from 'mysql2';
import pool from '../config/db';

export type SystemEventLevel = 'info' | 'warning' | 'error' | 'critical';

type SystemEventRow = RowDataPacket & {
  id_event: number;
  level: SystemEventLevel;
  component: string;
  event_type: string;
  message: string;
  metadata_json: string | null;
  created_at: string;
};

let systemEventsTableChecked = false;

const clampLimit = (value: unknown, fallback: number, max: number) => {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), max);
};

export const ensureSystemEventsTable = async () => {
  if (systemEventsTableChecked) return;

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS system_events (
      id_event INT NOT NULL AUTO_INCREMENT,
      level ENUM('info', 'warning', 'error', 'critical') NOT NULL DEFAULT 'info',
      component VARCHAR(60) NOT NULL,
      event_type VARCHAR(80) NOT NULL,
      message VARCHAR(255) NOT NULL,
      metadata_json LONGTEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_event),
      KEY idx_system_events_component (component, created_at),
      KEY idx_system_events_level (level, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  systemEventsTableChecked = true;
};

export const recordSystemEvent = async (input: {
  level?: SystemEventLevel;
  component: string;
  eventType: string;
  message: string;
  metadata?: Record<string, any> | null;
}) => {
  try {
    await ensureSystemEventsTable();
    await pool.execute(
      `INSERT INTO system_events (level, component, event_type, message, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      [
        input.level || 'info',
        String(input.component || 'system').slice(0, 60),
        String(input.eventType || 'event').slice(0, 80),
        String(input.message || '').slice(0, 255),
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );
  } catch (error) {
    console.error('Error in recordSystemEvent:', error);
  }
};

export const getSystemEvents = async (input: {
  limit?: number;
  component?: string | null;
  level?: string | null;
}) => {
  await ensureSystemEventsTable();

  const whereParts = ['1=1'];
  const params: any[] = [];
  if (input.component) {
    whereParts.push('component = ?');
    params.push(String(input.component).slice(0, 60));
  }
  if (input.level) {
    whereParts.push('level = ?');
    params.push(String(input.level).slice(0, 20));
  }

  const safeLimit = clampLimit(input.limit, 30, 100);
  const [rows] = await pool.execute<SystemEventRow[]>(
    `SELECT id_event, level, component, event_type, message, metadata_json, created_at
     FROM system_events
     WHERE ${whereParts.join(' AND ')}
     ORDER BY created_at DESC, id_event DESC
     LIMIT ${safeLimit}`,
    params
  );

  return rows.map((row) => ({
    id_event: Number(row.id_event),
    level: row.level,
    component: String(row.component || 'system'),
    event_type: String(row.event_type || 'event'),
    message: String(row.message || ''),
    metadata_json: row.metadata_json || null,
    created_at: row.created_at,
  }));
};
