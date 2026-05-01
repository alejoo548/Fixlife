import { runDatabaseMigrations } from '../migrations/runMigrations';

void (async () => {
  try {
    const result = await runDatabaseMigrations({ applyPending: true });
    if (result.appliedNow.length === 0) {
      console.log('No pending migrations.');
    } else {
      console.log(`Applied migrations: ${result.appliedNow.join(', ')}`);
    }
    process.exit(0);
  } catch (error: any) {
    console.error('Migration failed:', error?.message || error);
    process.exit(1);
  }
})();
