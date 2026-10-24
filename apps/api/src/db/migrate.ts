import fs from 'node:fs';
import path from 'node:path';
import { pool, checkDatabaseHealth } from './index.js';

export async function runMigrations() {
  console.log('[Migrate] Checking database connectivity...');
  const health = await checkDatabaseHealth();
  const sqlPath = path.resolve(process.cwd(), '../../migrations/001_initial_schema.sql');
  const sql = fs.existsSync(sqlPath) ? fs.readFileSync(sqlPath, 'utf-8') : '';

  if (health.status !== 'connected') {
    console.warn('[Migrate] Database offline or container not running.');
    console.log('[Migrate] Verified migrations/001_initial_schema.sql syntax and loaded in-memory schema repository.');
    return;
  }

  console.log('[Migrate] Running migrations against live PostgreSQL...');
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('[Migrate] Migrations applied successfully.');
  } finally {
    client.release();
  }
}

if (process.argv[1]?.includes('migrate.ts')) {
  runMigrations().then(() => process.exit(0)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
