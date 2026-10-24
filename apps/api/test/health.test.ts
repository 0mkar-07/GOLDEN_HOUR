import { describe, it, expect, afterAll } from 'vitest';
import { buildServer } from '../src/server.js';
import { pool } from '../src/db/index.js';

describe('Health Endpoints', () => {
  const app = buildServer();

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('GET /health/live returns 200 with service information', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health/live',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('goldenhour-api');
    expect(typeof body.uptimeSeconds).toBe('number');
  });

  it('GET /health/ready returns database readiness check', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    // Depending on whether local Postgres is up, response is either 200 or 503
    expect([200, 503]).toContain(res.statusCode);
    const body = JSON.parse(res.body);
    expect(['ok', 'degraded']).toContain(body.status);
    expect(body.database).toBeDefined();
    expect(['connected', 'disconnected', 'mock']).toContain(body.database.status);
  });
});
