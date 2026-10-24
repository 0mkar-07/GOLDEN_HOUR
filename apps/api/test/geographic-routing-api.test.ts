import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/server.js';
import { store } from '../src/db/store.js';
import { FastifyInstance } from 'fastify';

describe('Phase 13 / Stage 2 — Geographic Routing and Device GPS Ingestion API', () => {
  let app: FastifyInstance;
  let paramedicCookie: string;
  let caseId: string;

  beforeAll(async () => {
    await store.seed();
    app = await buildServer({ testing: true });
    await app.ready();

    // Login as paramedic
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'paramedic@goldenhour.test',
        password: 'demo123',
      },
    });
    expect(loginRes.statusCode).toBe(200);
    paramedicCookie = loginRes.cookies[0].value;

    // Create a draft case
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/cases',
      cookies: { gh_session: paramedicCookie },
      payload: {
        patientLabel: 'Route Navigation Test Patient',
        chiefComplaint: 'Chest trauma',
        initialLocation: { lat: 12.9716, lng: 77.5946 }, // Bangalore origin
      },
    });
    const created = JSON.parse(createRes.body);
    caseId = created.case.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/cases/:id/routes returns geographic road routes with honest source provenance', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/cases/${caseId}/routes`,
      cookies: { gh_session: paramedicCookie },
    });

    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);

    expect(data.caseId).toBe(caseId);
    expect(data.routes).toBeDefined();

    const routeEntries = Object.values(data.routes) as any[];
    expect(routeEntries.length).toBeGreaterThan(0);

    const firstRoute = routeEntries[0];
    expect(firstRoute.destHospitalId).toBeDefined();
    expect(firstRoute.destHospitalName).toBeDefined();
    expect(Array.isArray(firstRoute.pathCoordinates)).toBe(true);
    expect(firstRoute.pathCoordinates.length).toBeGreaterThanOrEqual(2);
    expect(firstRoute.distanceMeters).toBeGreaterThan(0);
    expect(firstRoute.durationSeconds).toBeGreaterThan(0);
    // Source provenance must be one of the known enums (never fake)
    expect(['SIMULATED_GRAPH', 'GOOGLE_ROUTES', 'LIVE_OSRM', 'FALLBACK_GRAPH']).toContain(firstRoute.routingSource);
  });

  it('POST /api/v1/ambulances/:id/position ingests valid device GPS coordinates with sequence numbers', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ambulances/amb-104/position',
      cookies: { gh_session: paramedicCookie },
      payload: {
        lat: 12.9780,
        lng: 77.6020,
        speed: 45.5,
        heading: 180,
        accuracyMeters: 4.2,
        source: 'DEVICE_GPS',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.position).toBeDefined();
    expect(body.position.ambulanceId).toBe('amb-104');
    expect(body.position.lat).toBe(12.9780);
    expect(body.position.lng).toBe(77.6020);
    expect(body.position.source).toBe('DEVICE_GPS');
    expect(body.position.accuracyMeters).toBe(4.2);
    expect(body.position.serverSequence).toBeGreaterThan(0);
  });

  it('POST /api/v1/ambulances/:id/position rejects out-of-range coordinates with 400 Bad Request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ambulances/amb-104/position',
      cookies: { gh_session: paramedicCookie },
      payload: {
        lat: 95.0, // Invalid latitude > 90
        lng: 77.6020,
        source: 'DEVICE_GPS',
      },
    });

    expect(res.statusCode).toBe(400);
  });
});
