import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { initApp } from '../src/server.js';
import { store } from '../src/db/store.js';
import { simulationService } from '../src/modules/simulation/service.js';
import { UserRole } from '@goldenhour/contracts';

describe('Phase 10 — Connected Simulation and Digital Twin Engine', () => {
  let app: FastifyInstance;
  let adminCookie: string;
  let paramedicCookie: string;

  beforeAll(async () => {
    app = await initApp();
    await app.ready();

    // 1. Log in as ADMIN
    const adminLoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'admin@goldenhour.test', password: 'demo123' },
    });
    adminCookie = adminLoginRes.cookies.find((c) => c.name === 'gh_session')!.value;

    // 2. Log in as PARAMEDIC
    const paramLoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'paramedic@goldenhour.test', password: 'demo123' },
    });
    paramedicCookie = paramLoginRes.cookies.find((c) => c.name === 'gh_session')!.value;
  });

  afterAll(() => {
    simulationService.pause();
  });

  it('1. Simulation State: returns graph, ambulance telemetry, and clock status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/simulation/state',
      cookies: { gh_session: adminCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.roadGraph).toBeDefined();
    expect(body.roadGraph.nodes.length).toBeGreaterThan(5);
    expect(body.roadGraph.edges.length).toBeGreaterThan(5);
    expect(body.ambulancePosition).toBeDefined();
    expect(body.ambulancePosition.x).toBe(120);
    expect(body.ambulancePosition.y).toBe(150);
    expect(body.simulationRun.running).toBe(false);
  });

  it('2. Role Security: Rejects non-admin users from simulation control endpoints', async () => {
    const playRes = await app.inject({
      method: 'POST',
      url: '/api/v1/simulation/play',
      cookies: { gh_session: paramedicCookie },
    });
    expect(playRes.statusCode).toBe(403);

    const stepRes = await app.inject({
      method: 'POST',
      url: '/api/v1/simulation/step',
      cookies: { gh_session: paramedicCookie },
    });
    expect(stepRes.statusCode).toBe(403);
  });

  it('3. Clock & Movement Step: deterministically advances clock and updates ambulance position', async () => {
    const posBefore = { ...store.ambulancePosition };

    const stepRes = await app.inject({
      method: 'POST',
      url: '/api/v1/simulation/step',
      cookies: { gh_session: adminCookie },
      payload: { stepSeconds: 10 },
    });

    expect(stepRes.statusCode).toBe(200);
    const body = stepRes.json();
    expect(body.simulationRun.simulatedSeconds).toBe(10);

    // Ambulance coordinates have progressed along edge
    const posAfter = store.ambulancePosition;
    expect(posAfter.serverSequence).toBeGreaterThan(posBefore.serverSequence);
    // Moved east toward junction 1 (x: 120 -> 200)
    expect(posAfter.x).toBeGreaterThanOrEqual(posBefore.x);
  });

  it('4. Speed Control & Pause: adjusts simulation multiplier and halts ticker', async () => {
    const speedRes = await app.inject({
      method: 'POST',
      url: '/api/v1/simulation/speed',
      cookies: { gh_session: adminCookie },
      payload: { speedMultiplier: 2.5 },
    });

    expect(speedRes.statusCode).toBe(200);
    expect(speedRes.json().simulationRun.speedMultiplier).toBe(2.5);

    const pauseRes = await app.inject({
      method: 'POST',
      url: '/api/v1/simulation/pause',
      cookies: { gh_session: adminCookie },
    });

    expect(pauseRes.statusCode).toBe(200);
    expect(pauseRes.json().simulationRun.running).toBe(false);
  });

  it('5. Scenario Injections: Traffic, Hospital Surge, and Patient Decompensation', async () => {
    // A. Inject Traffic Multiplier
    const trafficRes = await app.inject({
      method: 'POST',
      url: '/api/v1/simulation/scenarios/traffic',
      cookies: { gh_session: adminCookie },
      payload: { edgeId: 'edge-1', multiplier: 3.5 },
    });
    expect(trafficRes.statusCode).toBe(200);
    expect(store.trafficOverrides['edge-1']).toBe(3.5);

    // B. Inject Hospital Intake Surge
    const surgeRes = await app.inject({
      method: 'POST',
      url: '/api/v1/simulation/scenarios/hospital-surge',
      cookies: { gh_session: adminCookie },
      payload: { hospitalId: 'hosp-001' },
    });
    expect(surgeRes.statusCode).toBe(200);
    expect(store.getHospital('hosp-001')?.receivingDelaySeconds).toBe(900);

    // C. Create a case and inject Decompensation
    const caseRes = await app.inject({
      method: 'POST',
      url: '/api/v1/cases',
      cookies: { gh_session: paramedicCookie },
      payload: { patientLabel: 'Simulation Decomp Victim' },
    });
    const caseId = caseRes.json().case.id;

    const decompRes = await app.inject({
      method: 'POST',
      url: '/api/v1/simulation/scenarios/decompensation',
      cookies: { gh_session: adminCookie },
      payload: { caseId },
    });
    expect(decompRes.statusCode).toBe(200);

    // Case has new assessment with critical vitals requiring clinician confirmation
    const latestAssess = store.getLatestAssessment(caseId);
    expect(latestAssess).toBeDefined();
    expect(latestAssess?.observations.vitals.oxygenSaturation).toBe(82);
    expect(latestAssess?.observations.vitals.gcs).toBe(5);
    expect(latestAssess?.clinicianConfirmed).toBe(false);
  });

  it('6. Reset Control: resets clock and returns ambulance position to origin', async () => {
    const resetRes = await app.inject({
      method: 'POST',
      url: '/api/v1/simulation/reset',
      cookies: { gh_session: adminCookie },
    });

    expect(resetRes.statusCode).toBe(200);
    expect(resetRes.json().simulationRun.simulatedSeconds).toBe(0);
    expect(store.ambulancePosition.x).toBe(0);
    expect(store.ambulancePosition.y).toBe(0);
  });
});
