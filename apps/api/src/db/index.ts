import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  connectionTimeoutMillis: 3000,
  max: 10,
});

pool.on('error', (err) => {
  // Prevent unhandled error crashes from pool background connections
  console.error('[DB Pool Error]', err.message);
});

export interface DbHealthStatus {
  status: 'connected' | 'disconnected' | 'mock';
  latencyMs: number | null;
  error?: string | null;
}

export async function checkDatabaseHealth(): Promise<DbHealthStatus> {
  const start = Date.now();
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1 as ping');
      const latencyMs = Date.now() - start;
      return {
        status: 'connected',
        latencyMs,
      };
    } finally {
      client.release();
    }
  } catch (err: any) {
    return {
      status: 'disconnected',
      latencyMs: null,
      error: err?.message || 'Database connection error',
    };
  }
}
