import pool from '../config/db';
import {
  ensureSavedLocationsTable,
  ensureServiceCardsTable,
  ensureServiceRequestTables,
  ensureWorkerGeoColumns,
} from '../controllers/services.controller';
import { ensureCommissionEngineTables } from '../services/commissionEngine.service';
import { ensurePaymentLedgerTables } from '../services/paymentLedger.service';
import { ensureWorkerTierTables } from '../services/workerTier.service';
import { ensureFinanceOperationsTables } from '../services/financeOperations.service';
import { ensureBackgroundJobsTable } from '../services/backgroundJobs.service';
import { ensureSystemEventsTable } from '../services/systemEvents.service';
import { ensurePaypalWebhookTables } from '../services/paypalWebhook.service';
import { markDatabaseSchemaReady } from '../services/schemaState.service';
import { ensureNotificationsTable } from '../utils/notifications';
import { ensureUsersActiveColumn, ensureUsersPendingWorkerColumn, ensureUsersPhoneNumberNullable } from '../utils/users';
import { ensureWorkerRewardsTables } from '../utils/workerRewards';

type MigrationDefinition = {
  id: string;
  description: string;
  run: () => Promise<void>;
};

const MIGRATIONS: MigrationDefinition[] = [
  {
    id: '20260424_001_users_core_columns',
    description: 'Users operational columns',
    run: async () => {
      await ensureUsersActiveColumn();
      await ensureUsersPendingWorkerColumn();
      await ensureUsersPhoneNumberNullable();
    },
  },
  {
    id: '20260424_002_service_request_runtime_schema',
    description: 'Service request, service cards, geo and saved locations schema',
    run: async () => {
      await ensureServiceCardsTable();
      await ensureWorkerGeoColumns();
      await ensureSavedLocationsTable();
      await ensureServiceRequestTables();
    },
  },
  {
    id: '20260424_003_commission_ledger_rewards',
    description: 'Commission engine, ledger and worker rewards',
    run: async () => {
      await ensureCommissionEngineTables();
      await ensurePaymentLedgerTables();
      await ensureWorkerRewardsTables();
    },
  },
  {
    id: '20260424_004_worker_tiers_finance_ops',
    description: 'Worker tier controls and finance operations',
    run: async () => {
      await ensureWorkerTierTables();
      await ensureFinanceOperationsTables();
    },
  },
  {
    id: '20260424_005_observability_jobs_webhooks',
    description: 'System events, background jobs, notifications and PayPal webhooks',
    run: async () => {
      await ensureSystemEventsTable();
      await ensureBackgroundJobsTable();
      await ensureNotificationsTable();
      await ensurePaypalWebhookTables();
    },
  },
  {
    id: '20260524_001_scheduled_bookings',
    description: 'Scheduled service request fields and worker availability table',
    run: async () => {
      await ensureServiceRequestTables();
    },
  },
];

const ensureMigrationsTable = async () => {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id_migration VARCHAR(80) NOT NULL,
      description VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_migration)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

export const runDatabaseMigrations = async (options?: { applyPending?: boolean }) => {
  const previousRuntimeSync = process.env.ENABLE_RUNTIME_SCHEMA_SYNC;
  process.env.ENABLE_RUNTIME_SCHEMA_SYNC = 'true';

  try {
    await ensureMigrationsTable();
    const [rows] = await pool.execute<any[]>(
      `SELECT id_migration FROM schema_migrations ORDER BY applied_at ASC`
    );
    const applied = new Set(rows.map((row) => String(row.id_migration)));
    const pending = MIGRATIONS.filter((migration) => !applied.has(migration.id));

    if (pending.length === 0) {
      markDatabaseSchemaReady();
      return {
        appliedNow: [] as string[],
        pending: [] as string[],
      };
    }

    if (!options?.applyPending) {
      throw new Error(
        `Pending database migrations detected: ${pending.map((item) => item.id).join(', ')}. Run backend migrations before starting this environment.`
      );
    }

    const appliedNow: string[] = [];
    for (const migration of pending) {
      await migration.run();
      await pool.execute(
        `INSERT INTO schema_migrations (id_migration, description) VALUES (?, ?)`,
        [migration.id, migration.description]
      );
      appliedNow.push(migration.id);
    }

    markDatabaseSchemaReady();
    return {
      appliedNow,
      pending: [] as string[],
    };
  } finally {
    if (previousRuntimeSync == null) {
      delete process.env.ENABLE_RUNTIME_SCHEMA_SYNC;
    } else {
      process.env.ENABLE_RUNTIME_SCHEMA_SYNC = previousRuntimeSync;
    }
  }
};
