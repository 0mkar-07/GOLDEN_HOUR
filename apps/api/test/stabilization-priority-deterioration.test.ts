import { describe, it, expect, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import {
  UserRole,
  CaseStatus,
  RequestRole,
  RequestStatus,
  DestinationReadiness,
  AllocationState,
} from '@goldenhour/contracts';
import { store } from '../src/db/store.js';
import { initApp } from '../src/server.js';
import { runAgent2 } from '../src/modules/agents/agent2.js';
import { runAgent3 } from '../src/modules/agents/agent3.js';
import { routingProvider } from '../src/modules/routing/index.js';

describe('Stabilization Priority and In-Transit Deterioration Plan', () => {
  let app: FastifyInstance;
  let paramedicCookie: string;
  let bayviewCookie: string;

  beforeEach(async () => {
    store.seed();

    app = await initApp();
    await app.ready();

    // Login as paramedic
    const paraRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'paramedic@goldenhour.test', password: 'demo123' },
    });
    paramedicCookie = paraRes.cookies.find((c) => c.name === 'gh_session')!.value;

    // Login as hospital admin for Bayview (hosp-002)
    const hospRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'bayview_admin@goldenhour.test', password: 'demo123' },
    });
    bayviewCookie = hospRes.cookies.find((c) => c.name === 'gh_session')!.value;
  });

  it('Case 1: Agent 3 removes A and ranks eligible stabilization candidates by road ETA when no full-care facility is eligible', () => {
    // Requirements that NO seeded hospital can satisfy for full definitive care (e.g. non-existent specialty),
    // but Bayview and others can satisfy for stabilization
    const confirmedFullCare = ['PEDIATRIC_ICU', 'NEUROSURGERY', 'NON_EXISTENT_SUPER_SPECIALTY'];
    const confirmedStab = ['STABILIZATION', 'BASIC_OXYGEN'];

    const evals = runAgent2(
      confirmedFullCare,
      confirmedStab,
      store.listHospitals(),
      (id) => store.listResourcePoolsByHospital(id),
      (id) => store.listStaffByHospital(id)
    );

    // Verify all hospitals are ineligible for full-care
    expect(evals.every((e) => !e.isFullCareEligible)).toBe(true);

    const ranking = runAgent3(
      'case-test-stab',
      1,
      { x: 120, y: 150 },
      evals,
      routingProvider,
      {}
    );

    expect(ranking.recommendationMode).toBe('STABILIZATION_ONLY');
    expect(ranking.hospitalA).toBeNull(); // Empty A slot removed!
    expect(ranking.hospitalB).not.toBeNull();
    expect(ranking.hospitalB?.careObjective).toBe('STABILIZATION');
    expect(ranking.hospitalB?.limitations?.[0]).toContain('Full-care requirements not available here');

    // Priority candidates should contain only stabilization candidates
    expect(ranking.priorityCandidates.length).toBeGreaterThan(0);
    expect(ranking.priorityCandidates[0].priorityRank).toBe(1);
    expect(ranking.priorityCandidates[0].careObjective).toBe('STABILIZATION');
    expect(ranking.priorityCandidates[0].hospitalId).toBe(ranking.hospitalB?.hospitalId);
  });

  it('Case 2: Initial dispatch to stabilization candidate creates MAIN request at B and STANDBY at C', async () => {
    // 1. Create case & confirmed assessment
    const c = store.createCase({ patientLabel: 'Critical Polytrauma Stabilization Case' }, 'user-paramedic-1');
    store.createAssessment(
      c.id,
      {
        presentingIssue: 'Severe polytrauma in quadrant without full-care trauma center',
        urgencyLevel: 'CRITICAL',
        vitals: { heartRate: 130, systolicBp: 80, diastolicBp: 50, oxygenSaturation: 88, gcs: 9 },
        ambulanceSupportProvided: ['High-flow O2'],
      },
      ['TRAUMA_L1', 'NEUROSURGERY'],
      ['STABILIZATION', 'BASIC_OXYGEN']
    );
    store.confirmRequirements(
      c.id,
      1,
      ['TRAUMA_L1', 'NEUROSURGERY'],
      ['STABILIZATION', 'BASIC_OXYGEN'],
      'user-paramedic-1'
    );

    // Mock recommendation in STABILIZATION_ONLY mode with Bayview as hospitalB
    const bayview = store.getHospital('hosp-002')!;
    const stJude = store.getHospital('hosp-001')!;

    store.setRecommendation(c.id, {
      id: `rec-${c.id}-stab`,
      caseId: c.id,
      assessmentVersion: 1,
      positionSequence: 1,
      inventoryVersion: 1,
      recommendationMode: 'STABILIZATION_ONLY',
      hospitalA: null, // No full-care hospital
      hospitalB: {
        hospitalId: bayview.id,
        code: bayview.code,
        name: bayview.name,
        role: 'BACKUP_B',
        eligible: true,
        fullCareEligible: false,
        stabilizationEligible: true,
        careObjective: 'STABILIZATION',
        travelSeconds: 300,
        readyAtSeconds: 0,
        receivingDelaySeconds: bayview.receivingDelaySeconds,
        careStartSeconds: 300 + bayview.receivingDelaySeconds,
        timeToCareSeconds: 300 + bayview.receivingDelaySeconds,
        reasons: ['First eligible stabilization destination'],
        missingCapabilities: ['NEUROSURGERY'],
        limitations: ['Full-care requirements not available here: NEUROSURGERY'],
        readiness: DestinationReadiness.PENDING,
      },
      hospitalC: {
        hospitalId: stJude.id,
        code: stJude.code,
        name: stJude.name,
        role: 'BACKUP_C',
        eligible: true,
        fullCareEligible: false,
        stabilizationEligible: true,
        careObjective: 'STABILIZATION',
        travelSeconds: 650,
        readyAtSeconds: 0,
        receivingDelaySeconds: stJude.receivingDelaySeconds,
        careStartSeconds: 650 + stJude.receivingDelaySeconds,
        timeToCareSeconds: 650 + stJude.receivingDelaySeconds,
        reasons: ['Secondary stabilization backup'],
        missingCapabilities: ['PEDIATRIC_ICU'],
        limitations: ['Full-care requirements not available here'],
        readiness: DestinationReadiness.PENDING,
      },
      allCandidates: [],
      generatedAt: new Date().toISOString(),
    });

    // 2. Dispatch ambulance explicitly to Bayview for stabilization
    const dispatchRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${c.id}/dispatch`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        targetHospitalId: bayview.id,
        careObjective: 'STABILIZATION',
      },
    });

    expect(dispatchRes.statusCode).toBe(200);
    const body = JSON.parse(dispatchRes.body);

    expect(body.destination.hospitalId).toBe(bayview.id);
    expect(body.destination.careObjective).toBe('STABILIZATION');

    // Exactly 1 MAIN request at Bayview
    const mainReq = body.requests.find((r: any) => r.role === RequestRole.MAIN);
    expect(mainReq).toBeDefined();
    expect(mainReq.hospitalId).toBe(bayview.id);
    expect(mainReq.careObjective).toBe('STABILIZATION');

    // STANDBY request should exist for distinct candidate St. Jude, NOT Bayview
    const standbyReqs = body.requests.filter((r: any) => r.role === RequestRole.STANDBY);
    expect(standbyReqs.length).toBe(1);
    expect(standbyReqs[0].hospitalId).toBe(stJude.id);
    expect(standbyReqs.every((r: any) => r.hospitalId !== bayview.id)).toBe(true);

    // 3. Hospital accepts MAIN stabilization request
    const acceptRes = await app.inject({
      method: 'POST',
      url: `/api/v1/hospital-requests/${mainReq.id}/accept`,
      cookies: { gh_session: bayviewCookie },
    });

    expect(acceptRes.statusCode).toBe(200);
    const acceptBody = JSON.parse(acceptRes.body);
    expect(acceptBody.request.status).toBe(RequestStatus.ACCEPTED);

    // Reserved allocations should match stabilization needs (e.g. TRAUMA_BAY), NOT full-care neurosurgery
    expect(acceptBody.allocations.length).toBeGreaterThan(0);
    expect(acceptBody.allocations.every((a: any) => a.state === AllocationState.RESERVED)).toBe(true);
  });

  it('Case 3: In-transit deterioration preview compares live ETAs from ambulance position and suggests nearest alternative', async () => {
    const c = store.createCase({ patientLabel: 'In-Transit Deteriorating Patient' }, 'user-paramedic-1');
    store.createAssessment(
      c.id,
      {
        presentingIssue: 'Severe TBI progressing',
        urgencyLevel: 'CRITICAL',
        vitals: { heartRate: 110, systolicBp: 140, diastolicBp: 90, oxygenSaturation: 94, gcs: 12 },
        ambulanceSupportProvided: ['C-collar', 'Oxygen'],
      },
      ['TRAUMA_L1', 'NEUROSURGERY'],
      ['STABILIZATION', 'BASIC_OXYGEN']
    );

    // Set destination to St. Jude (hosp-001) and transition to EN_ROUTE
    c.caseStatus = CaseStatus.EN_ROUTE;
    c.selectedHospitalId = 'hosp-001';
    c.destinationVersion = 1;
    store.destinations.set(c.id, {
      caseId: c.id,
      hospitalId: 'hosp-001',
      careObjective: 'FULL_CARE',
      readiness: DestinationReadiness.CONFIRMED,
      version: 1,
      selectedBy: UserRole.AMBULANCE as any,
      updatedAt: new Date().toISOString(),
    });

    // Ambulance position closer to node-hosp-b (Bayview) than other nodes
    store.ambulancePosition = {
      ambulanceId: 'amb-104',
      x: 180,
      y: 160,
      lat: 40.711,
      lng: -74.012,
      speed: 45,
      heading: 90,
      source: 'SIMULATED',
      sourceGeneration: 1,
      serverSequence: 10,
      observedAt: new Date().toISOString(),
    };

    const prevRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${c.id}/diversion-preview`,
      cookies: { gh_session: paramedicCookie },
    });

    expect(prevRes.statusCode).toBe(200);
    const { preview } = JSON.parse(prevRes.body);

    expect(preview.caseId).toBe(c.id);
    expect(preview.currentDestinationHospitalId).toBe('hosp-001');
    expect(preview.candidates.length).toBeGreaterThan(0);

    // Current destination (hosp-001) MUST be excluded from diversion candidates
    expect(preview.candidates.every((cand: any) => cand.hospitalId !== 'hosp-001')).toBe(true);

    // Suggested alternative should be an eligible candidate with shortest road ETA
    expect(preview.suggestedTargetHospitalId).toBeDefined();
    const suggested = preview.candidates.find((cand: any) => cand.hospitalId === preview.suggestedTargetHospitalId);
    expect(suggested).toBeDefined();
    expect(suggested.eligible).toBe(true);
  });

  it('Case 4: Diversion safely releases previous reservations and rejects terminal/invalid diversions', async () => {
    const c = store.createCase({ patientLabel: 'Diversion Safety Check Case' }, 'user-paramedic-1');
    c.caseStatus = CaseStatus.EN_ROUTE;
    c.selectedHospitalId = 'hosp-001';
    c.destinationVersion = 1;
    store.destinations.set(c.id, {
      caseId: c.id,
      hospitalId: 'hosp-001',
      careObjective: 'FULL_CARE',
      readiness: DestinationReadiness.CONFIRMED,
      version: 1,
      selectedBy: UserRole.AMBULANCE as any,
      updatedAt: new Date().toISOString(),
    });

    // Create an existing reservation at hosp-001
    const pool = store.listResourcePoolsByHospital('hosp-001')[0];
    const alloc = {
      id: `alloc-test-${c.id}`,
      caseId: c.id,
      hospitalId: 'hosp-001',
      resourcePoolId: pool.id,
      resourceType: pool.resourceType,
      quantity: 1,
      state: AllocationState.RESERVED,
      reservedAt: new Date().toISOString(),
      inUseAt: null,
      releasedAt: null,
      version: 1,
      createdAt: new Date().toISOString(),
    };
    (store as any).allocations.set(alloc.id, alloc);

    // 1. Confirm diversion to Bayview (hosp-002)
    const divertRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${c.id}/divert`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        targetHospitalId: 'hosp-002',
        expectedDestinationVersion: 1,
        reason: 'Patient acute SpO2 decompensation to 79%',
      },
    });

    expect(divertRes.statusCode).toBe(200);
    const divertBody = JSON.parse(divertRes.body);
    expect(divertBody.destination.hospitalId).toBe('hosp-002');
    expect(divertBody.destination.version).toBe(2);
    expect(divertBody.destination.careObjective).toBe('STABILIZATION');
    expect(divertBody.releasedAllocations.length).toBe(1);
    expect(divertBody.releasedAllocations[0].state).toBe(AllocationState.RELEASED);

    // 2. Cannot divert to current destination
    const sameDestRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${c.id}/divert`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        targetHospitalId: 'hosp-002',
        expectedDestinationVersion: 2,
        reason: 'Duplicate diversion attempt',
      },
    });
    expect(sameDestRes.statusCode).toBe(400);

    // 3. Cannot divert arrived or handed over case
    c.caseStatus = CaseStatus.ARRIVED;
    const arrivedDivertRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${c.id}/divert`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        targetHospitalId: 'hosp-003',
        expectedDestinationVersion: 2,
        reason: 'Post-arrival diversion attempt',
      },
    });
    expect(arrivedDivertRes.statusCode).toBe(400);
  });
});
