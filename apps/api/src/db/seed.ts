import { checkDatabaseHealth } from './index.js';
import { INITIAL_HOSPITALS_PLACEHOLDER } from '@goldenhour/scenario-fixtures';

export async function runSeed() {
  console.log('[Seed] Checking database connectivity...');
  const health = await checkDatabaseHealth();
  if (health.status !== 'connected') {
    console.warn('[Seed] Database not available:', health.error);
    console.log('[Seed] Skipping database seed for Phase 1 foundation.');
    console.log(`[Seed] Fixture placeholder loaded: ${INITIAL_HOSPITALS_PLACEHOLDER.length} hospitals defined.`);
    return;
  }
  console.log('[Seed] Ready for Phase 2 database seeding.');
}

if (process.argv[1]?.includes('seed.ts')) {
  runSeed().then(() => process.exit(0)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
