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
import { ensureVirtualWalletWebhookTables } from '../services/virtualWalletWebhook.service';
import { ensureSupportTables } from '../services/support.service';
import { markDatabaseSchemaReady } from '../services/schemaState.service';
import { ensureNotificationsTable } from '../utils/notifications';
import {
  ensureUsersActiveColumn,
  ensureUsersLoginSecurityColumns,
  ensureUsersPendingWorkerColumn,
  ensureUsersPhoneNumberNullable,
} from '../utils/users';
import { ensureWorkerRewardsTables } from '../utils/workerRewards';
import {
  ensurePublicFaqItemsTable,
  ensureHeroTextTable,
  ensureHeroTextEsColumns,
  ensureHeroSlidesEsColumns,
} from '../controllers/admin.controller';

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
  {
    id: '20260528_001_support_chat',
    description: 'Support chat threads and messages (user-admin)',
    run: async () => {
      await ensureSupportTables();
    },
  },
  {
    id: '20260613_001_request_chat_messages',
    description: 'Service request chat messages table (worker-client)',
    run: async () => {
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS service_request_chat_messages (
          id_message INT NOT NULL AUTO_INCREMENT,
          id_request INT NOT NULL,
          sender_role ENUM('client','worker') NOT NULL,
          id_user INT NOT NULL,
          id_worker_profile INT NULL,
          message VARCHAR(500) NULL,
          image_url VARCHAR(255) NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id_message),
          KEY idx_sr_chat_request_created (id_request, created_at),
          KEY idx_sr_chat_sender (id_user),
          CONSTRAINT fk_sr_chat_request FOREIGN KEY (id_request) REFERENCES service_requests(id_request) ON DELETE CASCADE,
          CONSTRAINT fk_sr_chat_user FOREIGN KEY (id_user) REFERENCES users(id_user) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    },
  },
  {
    id: '20260613_002_double_approval_workflow',
    description: 'Double approval service workflow, timestamps and states',
    run: async () => {
      await ensureServiceRequestTables();
    },
  },
  {
    id: '20260618_001_users_login_security_columns',
    description: 'Users login lockout columns (failed_login_attempts, locked_until)',
    run: async () => {
      await ensureUsersLoginSecurityColumns();
    },
  },
  {
    id: '20260622_001_service_request_selection_mode',
    description: 'Client worker selection mode for service requests',
    run: async () => {
      const [rows] = await pool.execute<any[]>(
        `SELECT COUNT(*) AS total
         FROM information_schema.columns
         WHERE table_schema = DATABASE()
           AND table_name = 'service_requests'
           AND column_name = 'selection_mode'`
      );

      if (Number(rows[0]?.total || 0) === 0) {
        await pool.execute(
          `ALTER TABLE service_requests
           ADD COLUMN selection_mode ENUM('auto_assign', 'client_review') NOT NULL DEFAULT 'client_review'
           AFTER booking_type`
        );
      }
    },
  },
  {
    id: '20260630_001_service_request_reports',
    description: 'Client and worker incident reports for service requests',
    run: async () => {
      await ensureServiceRequestTables();
    },
  },
  {
    id: '20260701_001_public_faq_items',
    description: 'Dynamic public FAQ items managed from admin',
    run: async () => {
      await ensurePublicFaqItemsTable();
    },
  },
  {
    id: '20260708_001_cash_payment_ledger_entries',
    description: 'Cash payment ledger entry types (cash_collected, worker_commission_owed)',
    run: async () => {
      await ensurePaymentLedgerTables();
    },
  },
  {
    id: '20260710_001_virtual_wallet_webhook_events',
    description: 'Virtual Wallet webhook raw event logging table',
    run: async () => {
      await ensureVirtualWalletWebhookTables();
    },
  },
  {
    id: '20260719_001_wompi_webhook_token',
    description: 'Wompi payment webhook anti-spoof token column',
    run: async () => {
      await ensureServiceRequestTables();
    },
  },
  {
    id: '20260725_001_hero_text_settings',
    description: 'Homepage hero text settings table',
    run: async () => {
      await ensureHeroTextTable();
    },
  },
  {
    id: '20260729_001_service_budget_limits',
    description: 'Service budget limit columns',
    run: async () => {
      const [rows] = await pool.execute<any[]>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = DATABASE()
           AND table_name = 'services'
           AND column_name IN ('min_budget', 'max_budget')`
      );
      const existingColumns = new Set(rows.map((row) => String(row.COLUMN_NAME)));

      if (!existingColumns.has('min_budget')) {
        await pool.execute(`ALTER TABLE services ADD COLUMN min_budget DECIMAL(10,2) NULL`);
      }
      if (!existingColumns.has('max_budget')) {
        await pool.execute(`ALTER TABLE services ADD COLUMN max_budget DECIMAL(10,2) NULL`);
      }
    },
  },
  {
    id: '20260729_002_seed_service_budget_limits',
    description: 'Default service budget limits',
    run: async () => {
      const budgetLimits = [
        ['Carpentry', 35, 700],
        ['Auto Mechanic', 30, 800],
        ['Childcare / Babysitting', 20, 250],
        ['Gardening', 25, 450],
        ['Electrical Services', 35, 900],
        ['Plumbing', 35, 900],
        ['House Painting', 50, 1000],
        ['Masonry', 50, 1000],
        ['Welding', 40, 900],
        ['AC Installation & Repair', 45, 1000],
        ['Refrigeration Repair', 40, 900],
        ['Locksmith Services', 25, 350],
        ['Drywall Installation', 45, 900],
        ['Home Cleaning', 25, 400],
        ['Elderly Care', 25, 350],
        ['Computer Technician', 25, 500],
        ['Security Camera Installation', 50, 1000],
        ['Appliance Repair', 30, 800],
      ] as const;

      for (const [name, minBudget, maxBudget] of budgetLimits) {
        await pool.execute(
          `UPDATE services
           SET min_budget = COALESCE(min_budget, ?),
               max_budget = COALESCE(max_budget, ?)
           WHERE LOWER(name) = LOWER(?)`,
          [minBudget, maxBudget, name]
        );
      }
    },
  },
  {
    id: '20260806_001_hero_text_and_slides_es_columns',
    description: 'Spanish translations for hero text settings and hero slides',
    run: async () => {
      await ensureHeroTextEsColumns();
      await ensureHeroSlidesEsColumns();
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
