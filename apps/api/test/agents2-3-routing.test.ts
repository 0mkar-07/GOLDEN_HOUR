import { describe, it, expect, beforeAll } from 'vitest';
import { buildServer } from '../src/server.js';
import { store } from '../src/db/store.js';
import { routingProvider } from '../src/modules/routing/index.js';
import { runAgent2 } from '../src/modules/agents/agent2.js';
import { runAgent3 } from '../src/modules/agents/agent3.js';
import { SEEDED_ROAD_GRAPH } from '@goldenhour/scenario-fixtures';

describe('Phase 5 — Agent 2, Agent 3, and Routing', () => {
  const app = buildServer();
  let paramedicCookie: string;

  beforeAll(async () => {
    await store.seed();
    await app.ready();

    // Login as Paramedic
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'paramedic@goldenhour.test',
        password: 'demo123',
      },
    });
    paramedicCookie = loginRes.cookies[0].value;
  });

  it('Dijkstra router calculates accurate road network routes (not straight-line)', () => {
    // Route from ambulance start (node-amb-start) to St. Jude (node-hosp-a)
    const routeToA = routingProvider.calculateRoute('node-amb-start', 'node-hosp-a');
    expect(routeToA.pathNodeIds).toEqual([
      'node-amb-start',
      'node-jct-1',
      'node-jct-2',
      'node-hosp-a',
    ]);
    expect(routeToA.totalDistanceMeters).toBe(2400 + 3200 + 1200); // 6800m
    expect(routeToA.travelSeconds).toBe(144 + 210 + 96); // 450s (~7.5m)

    // Route to Bayview (node-hosp-b)
    const routeToB = routingProvider.calculateRoute('node-amb-start', 'node-hosp-b');
    expect(routeToB.pathNodeIds).toEqual(['node-amb-start', 'node-jct-1', 'node-hosp-b']);
    expect(routeToB.totalDistanceMeters).toBe(2400 + 1800); // 4200m
    expect(routeToB.travelSeconds).toBe(144 + 130); // 274s (~4.5m)
  });

  it('nearby unsuitable hospital loses to a farther suitable hospital for Primary A', () => {
    const fullCareNeeds = ['TRAUMA_L1', 'NEUROSURGERY', 'VENTILATORS', 'CT_SCAN', 'ICU'];
    const stabilizationNeeds = ['STABILIZATION', 'BASIC_OXYGEN'];

    const evaluations = runAgent2(
      fullCareNeeds,
      stabilizationNeeds,
      store.listHospitals(),
      (id) => store.listResourcePoolsByHospital(id),
      (id) => store.listStaffByHospital(id)
    );

    // St. Jude (Hosp A) must be eligible for full care
    const hospAEval = evaluations.find((e) => e.hospital.id === 'hosp-001')!;
    expect(hospAEval.isFullCareEligible).toBe(true);

    // Bayview (Hosp B) is nearby but lacks Trauma L1 and Neurosurgery -> Must be ineligible for full care
    const hospBEval = evaluations.find((e) => e.hospital.id === 'hosp-002')!;
    expect(hospBEval.isFullCareEligible).toBe(false);
    expect(hospBEval.missingFullCareCapabilities).toContain('TRAUMA_L1');
    expect(hospBEval.missingFullCareCapabilities).toContain('NEUROSURGERY');
    // But Bayview is eligible for immediate stabilization!
    expect(hospBEval.isStabilizationEligible).toBe(true);

    // Run Agent 3 Ranking from initial ambulance position
    const ranking = runAgent3(
      'case-test',
      1,
      { x: 120, y: 150 },
      evaluations,
      routingProvider
    );

    // Primary A must be St. Jude
    expect(ranking.hospitalA).toBeDefined();
    expect(ranking.hospitalA!.hospitalId).toBe('hosp-001');

    // Backup B must be Bayview (closest stabilization facility from initial position)
    expect(ranking.hospitalB).toBeDefined();
    expect(ranking.hospitalB!.hospitalId).toBe('hosp-002');
  });

  it('route traffic congestion increases ETA and reflects in recommendation', () => {
    const fullCareNeeds = ['TRAUMA_L1', 'NEUROSURGERY', 'VENTILATORS', 'CT_SCAN', 'ICU'];
    const stabilizationNeeds = ['STABILIZATION', 'BASIC_OXYGEN'];

    const evaluations = runAgent2(
      fullCareNeeds,
      stabilizationNeeds,
      store.listHospitals(),
      (id) => store.listResourcePoolsByHospital(id),
      (id) => store.listStaffByHospital(id)
    );

    // Baseline ranking
    const baseline = runAgent3('case-test', 1, { x: 120, y: 150 }, evaluations, routingProvider);
    const baselineTimeToCare = baseline.hospitalA!.timeToCareSeconds;

    // Apply severe traffic jam on edge-3 (Westside Expressway to Midtown, 4x delay)
    const congested = runAgent3(
      'case-test',
      1,
      { x: 120, y: 150 },
      evaluations,
      routingProvider,
      { 'edge-3': 4.0 }
    );

    expect(congested.hospitalA!.travelSeconds).toBeGreaterThan(baseline.hospitalA!.travelSeconds);
    expect(congested.hospitalA!.timeToCareSeconds).toBeGreaterThan(baselineTimeToCare);
  });

  it('dynamic backups B/C recalculate from ambulance current coordinates', () => {
    const fullCareNeeds = ['TRAUMA_L1', 'NEUROSURGERY', 'VENTILATORS'];
    const stabilizationNeeds = ['STABILIZATION', 'BASIC_OXYGEN'];

    const evaluations = runAgent2(
      fullCareNeeds,
      stabilizationNeeds,
      store.listHospitals(),
      (id) => store.listResourcePoolsByHospital(id),
      (id) => store.listStaffByHospital(id)
    );

    // 1. Initial Position: Westside incident scene [x: 120, y: 150] (Closest to Hosp B)
    const westsideRanking = runAgent3(
      'case-test',
      1,
      { x: 120, y: 150 },
      evaluations,
      routingProvider
    );
    expect(westsideRanking.hospitalB!.hospitalId).toBe('hosp-002'); // Bayview

    // 2. Ambulance moves to Eastside River Connector [x: 400, y: 240] (Near Hosp D / C)
    const eastsideRanking = runAgent3(
      'case-test',
      1,
      { x: 400, y: 240 },
      evaluations,
      routingProvider
    );

    // Backup B should now prioritize the closest facility to the new position (Hosp D or C, not Bayview!)
    expect(eastsideRanking.hospitalB!.hospitalId).not.toBe('hosp-002');
    expect(['hosp-004', 'hosp-003']).toContain(eastsideRanking.hospitalB!.hospitalId);
  });

  it('POST /api/v1/cases/:id/recommendations persists and returns A/B/C recommendation', async () => {
    // 1. Create and confirm case
    const caseRes = await app.inject({
      method: 'POST',
      url: '/api/v1/cases',
      cookies: { gh_session: paramedicCookie },
      payload: { patientLabel: 'Phase 5 Polytrauma Patient' },
    });
    const caseId = JSON.parse(caseRes.body).case.id;

    await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/assessments`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        observations: {
          presentingIssue: 'Polytrauma TBI',
          urgencyLevel: 'CRITICAL',
          vitals: { heartRate: 120, systolicBp: 85, diastolicBp: 50, respiratoryRate: 24, oxygenSaturation: 90, gcs: 7 },
          ambulanceSupportProvided: ['HIGH_FLOW_O2'],
        },
      },
    });

    await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/confirm-requirements`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        assessmentVersion: 1,
        confirmedFullCareNeeds: ['TRAUMA_L1', 'NEUROSURGERY', 'VENTILATORS'],
        confirmedStabilizationNeeds: ['STABILIZATION', 'BASIC_OXYGEN'],
      },
    });

    // 2. Generate recommendations
    const recRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/recommendations`,
      cookies: { gh_session: paramedicCookie },
    });

    expect(recRes.statusCode).toBe(200);
    const body = JSON.parse(recRes.body);
    const rec = body.recommendation;
    expect(rec.hospitalA).toBeDefined();
    expect(rec.hospitalA.role).toBe('PRIMARY_A');
    expect(rec.hospitalA.hospitalId).toBe('hosp-001');

    expect(rec.hospitalB).toBeDefined();
    expect(rec.hospitalB.role).toBe('BACKUP_B');

    expect(rec.hospitalC).toBeDefined();
    expect(rec.hospitalC.role).toBe('BACKUP_C');
  });
});
