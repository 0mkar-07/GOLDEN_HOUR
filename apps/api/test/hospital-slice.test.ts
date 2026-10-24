import { describe, it, expect, beforeAll } from 'vitest';
import { buildServer } from '../src/server.js';
import { store } from '../src/db/store.js';
import { ReceivingStatus } from '@goldenhour/contracts';

describe('Phase 3 — Hospital Live Data Vertical Slice', () => {
  const app = buildServer();
  let sessionCookie: string;

  beforeAll(async () => {
    await store.seed();
    await app.ready();

    // Login as St. Jude (Hosp A) staff
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'stjude_admin@goldenhour.test',
        password: 'demo123',
      },
    });
    expect(loginRes.statusCode).toBe(200);
    sessionCookie = loginRes.cookies[0].value;
  });

  it('computes availability using the exact formula: total - oos - ext - reserved - in_use', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/hospitals/hosp-001/resources',
      cookies: { gh_session: sessionCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.resourcePools.length).toBeGreaterThan(0);

    for (const pool of body.resourcePools) {
      const expectedAvailable =
        pool.totalCount - pool.outOfServiceCount - pool.externalOccupancy - pool.reservedCount - pool.inUseCount;
      expect(pool.availableCount).toBe(expectedAvailable);
    }
  });

  it('updates resource pool total capacity and recalculates availability server-side', async () => {
    const pool = store.getResourcePool('pool-001')!; // Ventilator at Hosp A
    const currentVersion = pool.version;

    // Update total to 10, external to 2, outOfService to 1
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/resource-pools/pool-001',
      cookies: { gh_session: sessionCookie },
      payload: {
        totalCount: 10,
        outOfServiceCount: 1,
        externalOccupancy: 2,
        expectedVersion: currentVersion,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.resourcePool.totalCount).toBe(10);
    expect(body.resourcePool.version).toBe(currentVersion + 1);

    // Available must be strictly 10 - 1 - 2 - reserved(0) - inUse(0) = 7
    expect(body.resourcePool.availableCount).toBe(7);

    // Verify persistence in store
    const persisted = store.getResourcePool('pool-001')!;
    expect(persisted.totalCount).toBe(10);
    expect(persisted.availableCount).toBe(7);
  });

  it('rejects version conflicts with 409', async () => {
    const pool = store.getResourcePool('pool-001')!;

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/resource-pools/pool-001',
      cookies: { gh_session: sessionCookie },
      payload: {
        totalCount: 12,
        expectedVersion: pool.version - 1, // Stale version
      },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('VERSION_CONFLICT');
  });

  it('rejects reducing capacity below committed allocations', async () => {
    const pool = store.getResourcePool('pool-001')!;

    // Out of service is 1, external is 2 => committed is 3
    // Trying to reduce total capacity to 2 must be rejected!
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/resource-pools/pool-001',
      cookies: { gh_session: sessionCookie },
      payload: {
        totalCount: 2,
        expectedVersion: pool.version,
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('INVARIANT_VIOLATION');
    expect(body.message).toContain('committed resources');
  });

  it('rejects negative counts with 400 validation error', async () => {
    const pool = store.getResourcePool('pool-001')!;

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/resource-pools/pool-001',
      cookies: { gh_session: sessionCookie },
      payload: {
        totalCount: -5,
        expectedVersion: pool.version,
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('updates staff availability slots and persists state', async () => {
    const staff = store.listStaffByHospital('hosp-001')[0];
    const currentVersion = staff.version;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/staff-availability/${staff.id}`,
      cookies: { gh_session: sessionCookie },
      payload: {
        availableTeamSlots: 4,
        expectedVersion: currentVersion,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.staffAvailability.availableTeamSlots).toBe(4);
    expect(body.staffAvailability.version).toBe(currentVersion + 1);

    // Verify persistence
    const reloaded = store.getStaff(staff.id)!;
    expect(reloaded.availableTeamSlots).toBe(4);
  });

  it('updates receiving status and records audit event', async () => {
    const hosp = store.getHospital('hosp-001')!;

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/hospitals/hosp-001',
      cookies: { gh_session: sessionCookie },
      payload: {
        receivingStatus: ReceivingStatus.RESTRICTED,
        expectedVersion: hosp.version,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.hospital.receivingStatus).toBe(ReceivingStatus.RESTRICTED);

    // Verify audit log
    const lastAudit = store.auditEvents[store.auditEvents.length - 1];
    expect(lastAudit.action).toBe('HOSPITAL_UPDATE');
    expect(lastAudit.entityId).toBe('hosp-001');
  });
});
