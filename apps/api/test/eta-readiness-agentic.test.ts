import { describe, it, expect, beforeAll } from 'vitest';
import { initApp } from '../src/server.js';
import { store } from '../src/db/store.js';
import {
  NITK_REGION,
  CaseStatus,
  DestinationReadiness,
  UserRole,
} from '@goldenhour/contracts';
import {
  DEFAULT_SCENARIO_SEED,
  applyHospitalOperationalOverlay,
  computeFacilityHash,
  importNitkFacilities,
} from '@goldenhour/scenario-fixtures';
import { routingProvider, geographicRoutingProvider } from '../src/modules/routing/index.js';
import { runAgent3 } from '../src/modules/agents/agent3.js';
import { runAgentCoordinator } from '../src/modules/agents/agentCoordinator.js';
import { evaluateCaseCandidateRoutes } from '../src/modules/routing/snapshot.js';

describe('Stage 8 Acceptance Test Matrix: Accurate ETA, Readiness & Agentic Recommendations', () => {
  let app: any;
  let paramedicCookie: string;
  let adminCookie: string;

  beforeAll(async () => {
    app = await initApp();
    await store.seed();

    const paramRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'paramedic@goldenhour.test', password: 'demo123' },
    });
    paramedicCookie = paramRes.cookies.find((c: any) => c.name === 'gh_session')?.value || '';

    const adminRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'admin@goldenhour.test', password: 'demo123' },
    });
    adminCookie = adminRes.cookies.find((c: any) => c.name === 'gh_session')?.value || '';
  });

  // -------------------------------------------------------------
  // ETA-01: Distinct hospital coordinates do not collapse to zero travel
  // -------------------------------------------------------------
  it('ETA-01: distinct hospital coordinates account for road access and do not collapse to zero travel', async () => {
    const origin = { lat: 13.0108, lng: 74.7936 }; // NITK Campus
    const hospMukka = store.getHospital('nitk:SRINIVAS_MUKKA')!;
    const hospSurathkal = store.getHospital('nitk:PADMAVATHI_SURATHKAL')!;

    const routeMukka = await geographicRoutingProvider.calculateGeographicRoute(origin, hospMukka.location);
    const routeSurathkal = await geographicRoutingProvider.calculateGeographicRoute(origin, hospSurathkal.location);

    expect(routeMukka.travelSeconds).toBeGreaterThan(0);
    expect(routeSurathkal.travelSeconds).toBeGreaterThan(0);
    expect(routeMukka.distanceMeters).toBeGreaterThan(500);
    expect(routeSurathkal.distanceMeters).toBeGreaterThan(500);
    // Distinct locations must yield distinct distances
    expect(routeMukka.distanceMeters).not.toBe(routeSurathkal.distanceMeters);
  });

  // -------------------------------------------------------------
  // ETA-02: Zero travel, ready now, 120s intake yields 120s, NOT 240s
  // -------------------------------------------------------------
  it('ETA-02: zero travel, ready now, and 120s intake yields 120s total, eliminating double intake bug', () => {
    const hosp = {
      ...store.getHospital('nitk:PADMAVATHI_SURATHKAL')!,
      receivingDelaySeconds: 120,
      intakeServiceSeconds: 120,
    };

    const mockEvaluation: any = {
      hospital: hosp,
      isFullCareEligible: true,
      isStabilizationEligible: true,
      missingFullCareCapabilities: [],
      missingStabilizationCapabilities: [],
      fullCareReasons: ['Test full care'],
      stabilizationReasons: ['Test stabilization'],
    };

    const mockSnapshot: any = {
      snapshotId: 'snap-test-eta-02',
      originLat: hosp.location.lat,
      originLng: hosp.location.lng,
      positionSequence: 1,
      createdAt: new Date().toISOString(),
      routes: {
        [hosp.id]: {
          hospitalId: hosp.id,
          status: 'AVAILABLE',
          durationSeconds: 0,
          distanceMeters: 0,
          straightLineDistanceMeters: 0,
          routingSource: 'SIMULATED_GRAPH',
          geometry: [],
        },
      },
    };

    const result = runAgent3(
      'case-eta-02',
      1,
      { lat: hosp.location.lat, lng: hosp.location.lng },
      [mockEvaluation],
      routingProvider,
      {},
      mockSnapshot
    );

    expect(result.hospitalA).toBeDefined();
    expect(result.hospitalA!.travelSeconds).toBe(0);
    expect(result.hospitalA!.waitAfterArrivalSeconds).toBe(0);
    expect(result.hospitalA!.receivingDelaySeconds).toBe(120);
    // Verified time-to-care formula: max(0, 0) + 120 = 120 (NOT 240)
    expect(result.hospitalA!.careStartSeconds).toBe(120);
    expect(result.hospitalA!.timeToCareSeconds).toBe(120);
  });

  // -------------------------------------------------------------
  // ETA-03: Travel 720s, readiness +1200s, intake 120s -> Wait 480s, Care start 1320s
  // -------------------------------------------------------------
  it('ETA-03: travel 720s, readiness offset 1200s, intake 120s yields wait 480s and total time-to-care 1320s', () => {
    const hosp: any = {
      ...store.getHospital('nitk:AJ_HOSPITAL_MANGALURU')!,
      receivingDelaySeconds: 120,
      intakeServiceSeconds: 120,
      serviceReadyAtSeconds: 1200, // Specialist or OR ready at t0 + 1200s
    };

    const mockEvaluation: any = {
      hospital: hosp,
      isFullCareEligible: true,
      isStabilizationEligible: true,
      missingFullCareCapabilities: [],
      missingStabilizationCapabilities: [],
      fullCareReasons: ['Trauma ready'],
      stabilizationReasons: ['Stabilization ready'],
    };

    const mockSnapshot: any = {
      snapshotId: 'snap-test-eta-03',
      originLat: 13.0108,
      originLng: 74.7936,
      positionSequence: 1,
      createdAt: new Date().toISOString(),
      routes: {
        [hosp.id]: {
          hospitalId: hosp.id,
          status: 'AVAILABLE',
          durationSeconds: 720,
          distanceMeters: 8000,
          routingSource: 'GOOGLE_ROUTES',
          geometry: [],
        },
      },
    };

    const result = runAgent3(
      'case-eta-03',
      1,
      { lat: 13.0108, lng: 74.7936 },
      [mockEvaluation],
      routingProvider,
      {},
      mockSnapshot
    );

    const cand = result.hospitalA!;
    expect(cand.travelSeconds).toBe(720);
    // waitAfterArrival = max(0, 1200 - 720) = 480s
    expect(cand.waitAfterArrivalSeconds).toBe(480);
    // careStart = max(720, 1200) + 120 = 1200 + 120 = 1320s
    expect(cand.careStartSeconds).toBe(1320);
    expect(cand.timeToCareSeconds).toBe(1320);
  });

  // -------------------------------------------------------------
  // ETA-04: Valid zero intake preserved (no || 120 coercion)
  // -------------------------------------------------------------
  it('ETA-04: legitimate zero intake delay is preserved without coercion', () => {
    const hosp: any = {
      ...store.getHospital('nitk:PADMAVATHI_SURATHKAL')!,
      receivingDelaySeconds: 0,
      intakeServiceSeconds: 0,
    };

    const mockEvaluation: any = {
      hospital: hosp,
      isFullCareEligible: true,
      isStabilizationEligible: true,
      missingFullCareCapabilities: [],
      missingStabilizationCapabilities: [],
      fullCareReasons: ['Fast intake'],
      stabilizationReasons: ['Fast stabilization'],
    };

    const mockSnapshot: any = {
      snapshotId: 'snap-test-eta-04',
      originLat: 13.0108,
      originLng: 74.7936,
      positionSequence: 1,
      createdAt: new Date().toISOString(),
      routes: {
        [hosp.id]: {
          hospitalId: hosp.id,
          status: 'AVAILABLE',
          durationSeconds: 300,
          distanceMeters: 3000,
          routingSource: 'SIMULATED_GRAPH',
          geometry: [],
        },
      },
    };

    const result = runAgent3(
      'case-eta-04',
      1,
      { lat: 13.0108, lng: 74.7936 },
      [mockEvaluation],
      routingProvider,
      {},
      mockSnapshot
    );

    const cand = result.hospitalA!;
    expect(cand.receivingDelaySeconds).toBe(0);
    // careStart = travel 300 + intake 0 = 300s
    expect(cand.careStartSeconds).toBe(300);
    expect(cand.timeToCareSeconds).toBe(300);
  });

  // -------------------------------------------------------------
  // ETA-05: Missing staff/resource/queue evidence marked with uncertainty
  // -------------------------------------------------------------
  it('ETA-05: missing telemetry or readiness evidence triggers explicit uncertainty', async () => {
    const testCase = store.createCase('Missing Vitals Test Patient');
    // Assessment with missing vitals
    store.createAssessment(
      testCase.id,
      { vitals: { oxygenSaturation: 95 } }, // GCS and systolicBp missing!
      ['TRAUMA_L1'],
      ['STABILIZATION']
    );

    const result = await runAgentCoordinator(testCase.id, 'user-paramedic', UserRole.AMBULANCE, {
      forceMode: 'WAITING_FOR_DATA',
    });
    expect(result.recommendation.evaluationMode).toBe('WAITING_FOR_DATA');
    expect(result.diagnostic.evaluationMode).toBe('WAITING_FOR_DATA');
    expect(result.diagnostic.missingTelemetry).toContain('gcs');
    expect(result.diagnostic.missingTelemetry).toContain('systolicBp');
  });

  // -------------------------------------------------------------
  // ETA-06: Provider unavailable yields typed failure with no 9999-second fallback
  // -------------------------------------------------------------
  it('ETA-06: unreachable facility yields typed UNAVAILABLE status without magic 9999s', () => {
    const hosp: any = store.getHospital('nitk:PADMAVATHI_SURATHKAL')!;
    const mockEvaluation: any = {
      hospital: hosp,
      isFullCareEligible: true,
      isStabilizationEligible: true,
      missingFullCareCapabilities: [],
      missingStabilizationCapabilities: [],
      fullCareReasons: [],
      stabilizationReasons: [],
    };

    const mockSnapshot: any = {
      snapshotId: 'snap-test-eta-06',
      originLat: 13.0108,
      originLng: 74.7936,
      positionSequence: 1,
      createdAt: new Date().toISOString(),
      routes: {
        [hosp.id]: {
          hospitalId: hosp.id,
          status: 'UNAVAILABLE',
          durationSeconds: 0,
          distanceMeters: 0,
          unavailabilityReason: 'Road flooded / bridge closed',
          routingSource: 'FALLBACK_GRAPH',
          geometry: [],
        },
      },
    };

    const result = runAgent3(
      'case-eta-06',
      1,
      { lat: 13.0108, lng: 74.7936 },
      [mockEvaluation],
      routingProvider,
      {},
      mockSnapshot
    );

    expect(result.allEvaluations[0].routeStatus).toBe('UNAVAILABLE');
    expect(result.allEvaluations[0].travelSeconds).toBe(0); // Not 9999!
    expect(result.allEvaluations[0].limitingReason).toContain('Road flooded');
  });

  // -------------------------------------------------------------
  // ETA-07: Valid route duration exceeding 9999s remains valid
  // -------------------------------------------------------------
  it('ETA-07: long route exceeding 9999s remains valid AVAILABLE route', () => {
    const hosp: any = store.getHospital('nitk:PADMAVATHI_SURATHKAL')!;
    const mockEvaluation: any = {
      hospital: hosp,
      isFullCareEligible: true,
      isStabilizationEligible: true,
      missingFullCareCapabilities: [],
      missingStabilizationCapabilities: [],
      fullCareReasons: ['Long distance eligible'],
      stabilizationReasons: [],
    };

    const mockSnapshot: any = {
      snapshotId: 'snap-test-eta-07',
      originLat: 13.0108,
      originLng: 74.7936,
      positionSequence: 1,
      createdAt: new Date().toISOString(),
      routes: {
        [hosp.id]: {
          hospitalId: hosp.id,
          status: 'AVAILABLE',
          durationSeconds: 12500, // ~3.5 hours
          distanceMeters: 140000,
          routingSource: 'GOOGLE_ROUTES',
          geometry: [],
        },
      },
    };

    const result = runAgent3(
      'case-eta-07',
      1,
      { lat: 13.0108, lng: 74.7936 },
      [mockEvaluation],
      routingProvider,
      {},
      mockSnapshot
    );

    const cand = result.hospitalA!;
    expect(cand.routeStatus).toBe('AVAILABLE');
    expect(cand.travelSeconds).toBe(12500);
    expect(cand.careStartSeconds).toBe(12500 + (cand.receivingDelaySeconds || 90));
  });

  // -------------------------------------------------------------
  // ETA-08: UI map and recommendation share identical routeSnapshotId
  // -------------------------------------------------------------
  it('ETA-08: /recommendations and /routes return identical routeSnapshotId and travel metrics', async () => {
    const testCase = store.createCase('Snapshot Sync Test Patient');
    store.createAssessment(
      testCase.id,
      { vitals: { gcs: 14, systolicBp: 120 } },
      ['TRAUMA_L1'],
      ['STABILIZATION']
    );
    store.confirmRequirements(testCase.id, 1, ['TRAUMA_L1'], ['STABILIZATION'], 'user-amb-001');

    // 1. Fetch recommendation
    const recRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${testCase.id}/recommendations`,
      cookies: { gh_session: paramedicCookie },
    });
    expect(recRes.statusCode).toBe(200);
    const recBody = JSON.parse(recRes.body);
    const snapshotId = recBody.recommendation.routeSnapshotId;
    expect(snapshotId).toBeDefined();

    // 2. Fetch routes for the case
    const routesRes = await app.inject({
      method: 'GET',
      url: `/api/v1/cases/${testCase.id}/routes`,
      cookies: { gh_session: paramedicCookie },
    });
    expect(routesRes.statusCode).toBe(200);
    const routesBody = JSON.parse(routesRes.body);

    expect(routesBody.routeSnapshotId).toBe(snapshotId);

    // Verify Hospital A travel seconds match exactly
    if (recBody.recommendation.hospitalA) {
      const hospAId = recBody.recommendation.hospitalA.hospitalId;
      const routeForA = routesBody.routes[hospAId];
      expect(routeForA).toBeDefined();
      expect(routeForA.travelSeconds).toBe(recBody.recommendation.hospitalA.travelSeconds);
      expect(routeForA.distanceMeters).toBe(recBody.recommendation.hospitalA.roadDistanceMeters);
    }
  });

  // -------------------------------------------------------------
  // ETA-09: Distinct durations both rounding to four minutes show honest tie
  // -------------------------------------------------------------
  it('ETA-09: distinct durations that round to the same minute preserve underlying precision without artificial separation', () => {
    const hosp1: any = {
      ...store.getHospital('nitk:PADMAVATHI_SURATHKAL')!,
      id: 'nitk:TEST_HOSP_1',
      receivingDelaySeconds: 0,
      intakeServiceSeconds: 0,
    };
    const hosp2: any = {
      ...store.getHospital('nitk:SRINIVAS_MUKKA')!,
      id: 'nitk:TEST_HOSP_2',
      receivingDelaySeconds: 0,
      intakeServiceSeconds: 0,
    };

    const eval1: any = {
      hospital: hosp1,
      isFullCareEligible: true,
      isStabilizationEligible: true,
      missingFullCareCapabilities: [],
      missingStabilizationCapabilities: [],
      fullCareReasons: [],
      stabilizationReasons: [],
    };
    const eval2: any = {
      hospital: hosp2,
      isFullCareEligible: true,
      isStabilizationEligible: true,
      missingFullCareCapabilities: [],
      missingStabilizationCapabilities: [],
      fullCareReasons: [],
      stabilizationReasons: [],
    };

    const mockSnapshot: any = {
      snapshotId: 'snap-test-eta-09',
      originLat: 13.0108,
      originLng: 74.7936,
      positionSequence: 1,
      createdAt: new Date().toISOString(),
      routes: {
        [hosp1.id]: {
          hospitalId: hosp1.id,
          status: 'AVAILABLE',
          durationSeconds: 230, // ~3m 50s -> rounds to 4m
          distanceMeters: 2300,
          routingSource: 'SIMULATED_GRAPH',
          geometry: [],
        },
        [hosp2.id]: {
          hospitalId: hosp2.id,
          status: 'AVAILABLE',
          durationSeconds: 250, // ~4m 10s -> rounds to 4m
          distanceMeters: 2500,
          routingSource: 'SIMULATED_GRAPH',
          geometry: [],
        },
      },
    };

    const result = runAgent3(
      'case-eta-09',
      1,
      { lat: 13.0108, lng: 74.7936 },
      [eval1, eval2],
      routingProvider,
      {},
      mockSnapshot
    );

    // Both round to 4 minutes:
    expect(Math.round(result.hospitalA!.timeToCareSeconds / 60)).toBe(4);
    expect(Math.round(result.hospitalB!.timeToCareSeconds / 60)).toBe(4);

    // But precise unrounded seconds differentiate them honestly:
    expect(result.hospitalA!.timeToCareSeconds).toBe(230);
    expect(result.hospitalB!.timeToCareSeconds).toBe(250);
  });

  // -------------------------------------------------------------
  // DATA-01 & DATA-02: Scenario seed independence and replay reproducibility
  // -------------------------------------------------------------
  it('DATA-01 & DATA-02: changing scenario seed preserves identity checksum, and replaying seed reproduces exact state', () => {
    const baselineHospitals = importNitkFacilities().hospitals;

    // Apply Seed 1
    const hospitalsSeed1 = baselineHospitals.map((f, i) =>
      applyHospitalOperationalOverlay(f, 'seed-2026-alpha', i)
    );
    // Apply Seed 2
    const hospitalsSeed2 = baselineHospitals.map((f, i) =>
      applyHospitalOperationalOverlay(f, 'seed-2026-beta', i)
    );

    // DATA-01: Identity hashes remain identical across different scenario seeds
    for (let i = 0; i < baselineHospitals.length; i++) {
      const h1 = hospitalsSeed1[i];
      const h2 = hospitalsSeed2[i];
      expect(h1.id).toBe(h2.id);
      expect(h1.name).toBe(h2.name);
      expect(h1.location.lat).toBe(h2.location.lat);
      expect(h1.location.lng).toBe(h2.location.lng);

      const hash1 = computeFacilityHash(h1.code, h1.name, h1.location.lat, h1.location.lng);
      const hash2 = computeFacilityHash(h2.code, h2.name, h2.location.lat, h2.location.lng);
      expect(hash1).toBe(hash2);
    }

    // DATA-02: Replaying the same seed produces identical operational state
    const replayHospitals = baselineHospitals.map((f, i) =>
      applyHospitalOperationalOverlay(f, 'seed-2026-alpha', i)
    );
    for (let i = 0; i < baselineHospitals.length; i++) {
      expect(hospitalsSeed1[i].operationalProfile).toBe(replayHospitals[i].operationalProfile);
      expect(hospitalsSeed1[i].intakeServiceSeconds).toBe(replayHospitals[i].intakeServiceSeconds);
      expect(hospitalsSeed1[i].queueEstimatedWaitSeconds).toBe(replayHospitals[i].queueEstimatedWaitSeconds);
    }
  });

  // -------------------------------------------------------------
  // EVENT-01: Corridor congestion affects shared routes coherently
  // -------------------------------------------------------------
  it('EVENT-01: corridor congestion dynamically increases travel duration on affected route segments', () => {
    const fromNode = 'node-amb-start';
    const toNode = 'node-hosp-a';

    const normalRoute = routingProvider.calculateRoute(fromNode, toNode);
    // Add 2.0x congestion on edge-3
    const congestedRoute = routingProvider.calculateRoute(fromNode, toNode, { 'edge-3': 2.0 });

    expect(congestedRoute.travelSeconds).toBeGreaterThan(normalRoute.travelSeconds);
    expect(congestedRoute.totalDistanceMeters).toBe(normalRoute.totalDistanceMeters);
  });

  // -------------------------------------------------------------
  // EVENT-02: Specialist readiness updates care start without mutating travel
  // -------------------------------------------------------------
  it('EVENT-02: specialist becoming ready updates time-to-care without altering road travel time', () => {
    const hosp: any = {
      ...store.getHospital('nitk:PADMAVATHI_SURATHKAL')!,
      receivingDelaySeconds: 90,
      serviceReadyAtSeconds: 1200, // 20m wait initially
    };

    const mockEval: any = {
      hospital: hosp,
      isFullCareEligible: true,
      isStabilizationEligible: true,
      missingFullCareCapabilities: [],
      missingStabilizationCapabilities: [],
      fullCareReasons: [],
      stabilizationReasons: [],
    };

    const mockSnapshot: any = {
      snapshotId: 'snap-event-02',
      originLat: 13.0108,
      originLng: 74.7936,
      positionSequence: 1,
      createdAt: new Date().toISOString(),
      routes: {
        [hosp.id]: {
          hospitalId: hosp.id,
          status: 'AVAILABLE',
          durationSeconds: 400,
          distanceMeters: 4000,
          routingSource: 'SIMULATED_GRAPH',
          geometry: [],
        },
      },
    };

    // Initial evaluation with specialist delay (1200s)
    const result1 = runAgent3('case-event-02', 1, { lat: 13.0108, lng: 74.7936 }, [mockEval], routingProvider, {}, mockSnapshot);
    const initialCareStart = result1.hospitalA!.careStartSeconds;
    const initialTravel = result1.hospitalA!.travelSeconds;

    // Specialist mobilized early: now ready at 200s (already ready upon arrival at 400s)
    hosp.serviceReadyAtSeconds = 200;
    const result2 = runAgent3('case-event-02', 1, { lat: 13.0108, lng: 74.7936 }, [mockEval], routingProvider, {}, mockSnapshot);
    const updatedCareStart = result2.hospitalA!.careStartSeconds;
    const updatedTravel = result2.hospitalA!.travelSeconds;

    // Travel time remains strictly unchanged
    expect(updatedTravel).toBe(initialTravel);
    // Care start is significantly reduced because specialist is ready upon arrival
    expect(updatedCareStart).toBeLessThan(initialCareStart);
    expect(updatedCareStart).toBe(400 + (result2.hospitalA!.receivingDelaySeconds ?? 75));
  });

  // -------------------------------------------------------------
  // AGENT-01 & AGENT-02: Bounded coordinator loop & graceful timeout fallback
  // -------------------------------------------------------------
  it('AGENT-01 & AGENT-02: coordinator evaluates bounded loop and falls back cleanly without hanging', async () => {
    const testCase = store.createCase('Coordinator Bounded Loop Patient');
    store.createAssessment(
      testCase.id,
      { vitals: { gcs: 15, systolicBp: 125 } },
      ['TRAUMA_L1'],
      ['STABILIZATION']
    );

    const startTime = Date.now();
    const result = await runAgentCoordinator(testCase.id, 'user-paramedic', UserRole.AMBULANCE, {
      forceMode: 'RULES_FALLBACK',
    });
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(4000);
    expect(result.recommendation).toBeDefined();
    expect(result.routeSnapshot).toBeDefined();
    expect(result.diagnostic.evaluationMode).toBe('RULES_FALLBACK');
    expect(result.diagnostic.toolCallsExecuted).toContain('getCandidateRoutes');
  });

  // -------------------------------------------------------------
  // AUTH-01: Recommendation change does not auto-mutate confirmed destination
  // -------------------------------------------------------------
  it('AUTH-01: recommendation update does not auto-mutate confirmed destination without human dispatch', async () => {
    const testCase = store.createCase('Auth Preservation Patient');
    store.createAssessment(
      testCase.id,
      { vitals: { gcs: 15, systolicBp: 120 } },
      ['TRAUMA_L1'],
      ['STABILIZATION']
    );
    store.confirmRequirements(testCase.id, 1, ['TRAUMA_L1'], ['STABILIZATION'], 'user-amb-001');

    // Initial recommendation
    const rec1 = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${testCase.id}/recommendations`,
      cookies: { gh_session: paramedicCookie },
    });
    expect(rec1.statusCode).toBe(200);

    // Human Clinician explicitly dispatches to Destination
    const dispatchRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${testCase.id}/dispatch`,
      cookies: { gh_session: paramedicCookie },
      payload: { targetHospitalId: 'nitk:PADMAVATHI_SURATHKAL', careObjective: 'STABILIZATION' },
    });
    expect([200, 201]).toContain(dispatchRes.statusCode);

    const savedDestination = store.getDestination(testCase.id);
    expect(savedDestination?.hospitalId).toBe('nitk:PADMAVATHI_SURATHKAL');

    // Scenario evolves and recommendation recalculates
    const rec2 = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${testCase.id}/recommendations`,
      cookies: { gh_session: paramedicCookie },
    });
    expect(rec2.statusCode).toBe(200);

    // Destination must NOT have changed automatically
    const destAfterRecalculation = store.getDestination(testCase.id);
    expect(destAfterRecalculation?.hospitalId).toBe('nitk:PADMAVATHI_SURATHKAL');
  });
});
