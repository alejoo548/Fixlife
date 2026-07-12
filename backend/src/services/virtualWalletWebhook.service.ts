import pool from '../config/db';
import { isDatabaseSchemaReady } from './schemaState.service';

type SqlExecutor = {
  execute: (sql: string, values?: any[]) => Promise<any>;
};

let virtualWalletWebhookTablesChecked = false;

// Virtual Wallet's webhook payload/signature scheme is undocumented (see plan
// "Fase 0"). Columns are deliberately schema-agnostic (raw JSON blobs) until a
// real payload has been captured and inspected — do not add typed columns for
// guessed field names.
export const ensureVirtualWalletWebhookTables = async (executor: SqlExecutor = pool) => {
  if (virtualWalletWebhookTablesChecked) return;
  if (isDatabaseSchemaReady()) {
    virtualWalletWebhookTablesChecked = true;
    return;
  }

  await executor.execute(`
    CREATE TABLE IF NOT EXISTS virtual_wallet_webhook_events (
      id_event_log INT NOT NULL AUTO_INCREMENT,
      raw_headers_json LONGTEXT NULL,
      raw_payload_json LONGTEXT NULL,
      verify_status ENUM('pending', 'verified', 'rejected', 'skipped', 'unknown_schema') NOT NULL DEFAULT 'unknown_schema',
      processing_status ENUM('queued', 'processing', 'processed', 'ignored', 'failed') NOT NULL DEFAULT 'queued',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at TIMESTAMP NULL,
      PRIMARY KEY (id_event_log)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  virtualWalletWebhookTablesChecked = true;
};

export const storeRawVirtualWalletWebhookEvent = async (input: {
  headers: Record<string, string | string[] | undefined>;
  payload: unknown;
}) => {
  await ensureVirtualWalletWebhookTables();

  const [result] = await pool.execute<any>(
    `INSERT INTO virtual_wallet_webhook_events (raw_headers_json, raw_payload_json, verify_status, processing_status)
     VALUES (?, ?, 'unknown_schema', 'queued')`,
    [JSON.stringify(input.headers || {}), JSON.stringify(input.payload ?? null)]
  );

  return Number(result?.insertId || 0);
};
