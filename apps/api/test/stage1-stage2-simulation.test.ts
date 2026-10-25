import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/server.js';
import { store } from '../src/db/store.js';
import { simulationService } from '../src/modules/simulation/service.js';
import { FastifyInstance } from 'fastify';

describe('Stage 1 & Stage 2 — Contracts, Identity, Source Ownership & Movement Correctness', () => {
  let app: FastifyInstance;
  let adminCookie: string;
  let paramedicCookie: string;

  beforeAll(async () => {
    await store.seed();
    app = await buildServer({ testing: true });
    await app.ready();

    // Login admin
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'admin@goldenhour.test',
        password: 'demo123',
      },
    });
    adminCookie = adminLogin.cookies[0].value;

    // Login paramedic
    const paramedicLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'paramedic@goldenhour.test',
        password: 'demo123',
      },
    });
    paramedicCookie = paramedicLogin.cookies[0].value;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. Source Ownership & Canonical Units: GPS submission sets DEVICE_GPS, pauses simulation, and sets speedMps', async () => {
    // Start simulation
    simulationService.play(1.0);
    expect(simulationService.getSimulationState().simulationRun.running).toBe(true);

    // Ingest device GPS
    const gpsRes = await app.inject({
      method: 'POST',
      url: '/api/v1/ambulances/amb-104/position',
      cookies: { gh_session: paramedicCookie },
      payload: {
        lat: 40.7150,
        lng: -74.0080,
        speed: 54, // km/h
        heading: 75,
        accuracyMeters: 4,
      },
    });

    expect(gpsRes.statusCode).toBe(200);
    const body = gpsRes.json();
    expect(body.position.source).toBe('DEVICE_GPS');
    expect(body.position.speed).toBe(54);
    expect(body.position.speedMps).toBeCloseTo(15, 0); // 54 / 3.6 = 15 m/s
    expect(body.position.headingDegrees).toBe(75);

    // Simulation must have paused due to exclusive producer ownership lock
    expect(simulationService.getSimulationState().simulationRun.running).toBe(false);
  });

  it('2. Multi-Edge Traversal: Single step across multiple edges consumes distance and calculates correct progress', async () => {
    simulationService.reset();
    expect(store.ambulancePosition.x).toBe(0);

    // Large step of 30 seconds at 50 km/h (~416 meters) traverses across multiple graph segments
    const stepRes = await app.inject({
      method: 'POST',
      url: '/api/v1/simulation/step',
      cookies: { gh_session: adminCookie },
      payload: { stepSeconds: 30 },
    });

    expect(stepRes.statusCode).toBe(200);
    const stepBody = stepRes.json();
    expect(stepBody.simulationRun.simulatedSeconds).toBe(30);

    // Position must have advanced forward along directed route
    expect(store.ambulancePosition.x).toBeGreaterThan(120);
    expect(store.ambulancePosition.source).toBe('SIMULATED');
  });

  it('3. Control Validation: Rejects invalid edge in traffic scenario injection with 400', async () => {
    const invalidTrafficRes = await app.inject({
      method: 'POST',
      url: '/api/v1/simulation/scenarios/traffic',
      cookies: { gh_session: adminCookie },
      payload: {
        edgeId: 'non-existent-edge-999',
        multiplier: 3.5,
      },
    });

    expect(invalidTrafficRes.statusCode).toBe(400);
    const body = invalidTrafficRes.json();
    expect(body.code).toBe('EDGE_NOT_FOUND');
  });

  it('4. Control Validation: Rejects invalid hospital in surge injection with 400', async () => {
    const invalidSurgeRes = await app.inject({
      method: 'POST',
      url: '/api/v1/simulation/scenarios/hospital-surge',
      cookies: { gh_session: adminCookie },
      payload: {
        hospitalId: 'ghost-hospital-404',
      },
    });

    expect(invalidSurgeRes.statusCode).toBe(400);
    const body = invalidSurgeRes.json();
    expect(body.code).toBe('HOSPITAL_NOT_FOUND');
  });
});
