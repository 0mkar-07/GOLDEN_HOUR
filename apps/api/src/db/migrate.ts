import { checkDatabaseHealth } from './index.js';

export async function runMigrations() {
  console.log('[Migrate] Checking database connectivity...');
  const health = await checkDatabaseHealth();
  if (health.status !== 'connected') {
    console.warn('[Migrate] Database not available:', health.error);
    console.log('[Migrate] Skipping migrations for Phase 1 foundation.');
    return;
  }
  console.log('[Migrate] Ready for Phase 2 SQL migrations.');
}

if (process.argv[1]?.includes('migrate.ts')) {
  runMigrations().then(() => process.exit(0)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
