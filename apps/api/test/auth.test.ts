import { describe, it, expect, beforeAll } from 'vitest';
import { buildServer } from '../src/server.js';
import { store } from '../src/db/store.js';
import { UserRole } from '@goldenhour/contracts';

describe('Phase 2 — Identity, Boundaries, and Seed Verification', () => {
  const app = buildServer();

  beforeAll(async () => {
    await store.seed();
    await app.ready();
  });

  it('verifies seed contains exactly the intended five hospitals', () => {
    const hospitals = store.listHospitals();
    expect(hospitals.length).toBe(5);
    const codes = hospitals.map((h) => h.code).sort();
    expect(codes).toEqual(['HOSP-A', 'HOSP-B', 'HOSP-C', 'HOSP-D', 'HOSP-E']);
  });

  it('seed is idempotent and safe to rerun', async () => {
    await store.seed();
    await store.seed();
    expect(store.listHospitals().length).toBe(5);
    expect(store.users.size).toBe(4);
  });

  it('rejects unauthenticated requests to protected endpoints with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/hospitals',
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('logs in paramedic demo user successfully', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'paramedic@goldenhour.test',
        password: 'demo123',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.email).toBe('paramedic@goldenhour.test');
    expect(body.user.role).toBe(UserRole.AMBULANCE);

    // Verify set-cookie header
    const cookie = res.headers['set-cookie'];
    expect(cookie).toBeDefined();
    expect(cookie?.toString()).toContain('gh_session=');
  });

  it('rejects login with invalid password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'paramedic@goldenhour.test',
        password: 'wrongpassword',
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it('enforces cross-hospital mutation denial (Hospital A cannot mutate Hospital B)', async () => {
    // 1. Login as St. Jude (Hospital A) user
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'stjude_admin@goldenhour.test',
        password: 'demo123',
      },
    });
    expect(loginRes.statusCode).toBe(200);
    const cookies = loginRes.cookies;

    // 2. Attempt to mutate Hospital B (Bayview)
    const mutateRes = await app.inject({
      method: 'PATCH',
      url: '/api/v1/hospitals/hosp-002',
      cookies: {
        gh_session: cookies[0].value,
      },
      payload: {
        receivingDelaySeconds: 500,
        expectedVersion: 1,
      },
    });

    // Must be rejected with 403 Forbidden!
    expect(mutateRes.statusCode).toBe(403);
    const body = JSON.parse(mutateRes.body);
    expect(body.code).toBe('FORBIDDEN');
    expect(body.message).toContain('Cross-hospital access denied');
  });

  it('allows Hospital A user to mutate Hospital A within valid version', async () => {
    // Login as St. Jude
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'stjude_admin@goldenhour.test',
        password: 'demo123',
      },
    });
    const sessionCookie = loginRes.cookies[0].value;

    const hospA = store.getHospital('hosp-001')!;

    const updateRes = await app.inject({
      method: 'PATCH',
      url: '/api/v1/hospitals/hosp-001',
      cookies: { gh_session: sessionCookie },
      payload: {
        receivingDelaySeconds: 150,
        expectedVersion: hospA.version,
      },
    });

    expect(updateRes.statusCode).toBe(200);
    const body = JSON.parse(updateRes.body);
    expect(body.hospital.receivingDelaySeconds).toBe(150);
    expect(body.hospital.version).toBe(hospA.version + 1);
  });

  it('rejects resource pool capacity reduction below committed resources', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'stjude_admin@goldenhour.test',
        password: 'demo123',
      },
    });
    const sessionCookie = loginRes.cookies[0].value;

    // Pool 001 (Ventilator at Hosp A): total=8, outOfService=1, external=4 (committed=5)
    // Trying to reduce totalCount to 3 should be rejected!
    const pool = store.getResourcePool('pool-001')!;

    const failRes = await app.inject({
      method: 'PATCH',
      url: '/api/v1/resource-pools/pool-001',
      cookies: { gh_session: sessionCookie },
      payload: {
        totalCount: 3,
        expectedVersion: pool.version,
      },
    });

    expect(failRes.statusCode).toBe(400);
    const body = JSON.parse(failRes.body);
    expect(body.code).toBe('INVARIANT_VIOLATION');
    expect(body.message).toContain('committed resources');
  });
});
