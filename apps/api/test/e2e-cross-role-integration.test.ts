import { describe, it, expect, beforeAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { initApp } from '../src/server.js';
import { store } from '../src/db/store.js';
import {
  CaseStatus,
  DestinationReadiness,
  RequestRole,
  RequestStatus,
  AllocationState,
  ResourceType,
  UserRole,
} from '@goldenhour/contracts';

describe('Phase 11 — Dedicated E2E Integration Gate (Full Lifecycle Across Roles)', () => {
  let app: FastifyInstance;
  let paramedicCookie: string;
  let hospACookie: string; // St. Jude
  let hospBCookie: string; // Bayview
  let adminCookie: string;

  beforeAll(async () => {
    app = await initApp();
    await app.ready();

    // 1. Authenticate Paramedic Context (Ambulance)
    const paramRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'paramedic@goldenhour.test', password: 'demo123' },
    });
    expect(paramRes.statusCode).toBe(200);
    paramedicCookie = paramRes.cookies.find((c) => c.name === 'gh_session')!.value;

    // 2. Authenticate Hospital A Context (St. Jude)
    const hospARes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'stjude_admin@goldenhour.test', password: 'demo123' },
    });
    expect(hospARes.statusCode).toBe(200);
    hospACookie = hospARes.cookies.find((c) => c.name === 'gh_session')!.value;

    // 3. Authenticate Hospital B Context (Bayview)
    const hospBRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'bayview_admin@goldenhour.test', password: 'demo123' },
    });
    expect(hospBRes.statusCode).toBe(200);
    hospBCookie = hospBRes.cookies.find((c) => c.name === 'gh_session')!.value;

    // 4. Authenticate Admin Context (System Dispatcher)
    const adminRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'admin@goldenhour.test', password: 'demo123' },
    });
    expect(adminRes.statusCode).toBe(200);
    adminCookie = adminRes.cookies.find((c) => c.name === 'gh_session')!.value;
  });

  it('1. End-to-End Multi-Role Clinical Journey: create -> assess -> rank -> dispatch -> reserve -> divert -> arrive -> use -> handover -> release', async () => {
    // -------------------------------------------------------------
    // STEP 1: Paramedic creates new emergency case
    // -------------------------------------------------------------
    const createCaseRes = await app.inject({
      method: 'POST',
      url: '/api/v1/cases',
      cookies: { gh_session: paramedicCookie },
      payload: {
        patientLabel: 'E2E Full Journey Patient #1001',
        notes: 'High-speed rollover MVC, extricated with head trauma and shock.',
      },
    });
    expect(createCaseRes.statusCode).toBe(201);
    const caseId = createCaseRes.json().case.id;
    expect(createCaseRes.json().case.caseStatus).toBe(CaseStatus.DRAFT);

    // -------------------------------------------------------------
    // STEP 2: Paramedic records telemetry observations & Agent 1 runs
    // -------------------------------------------------------------
    const assessRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/assessments`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        observations: {
          presentingIssue: 'Severe Polytrauma with Traumatic Brain Injury and Hemorrhagic Shock',
          urgencyLevel: 'CRITICAL',
          vitals: {
            heartRate: 128,
            systolicBp: 82,
            diastolicBp: 46,
            respiratoryRate: 28,
            oxygenSaturation: 88,
            gcs: 7,
          },
          ambulanceSupportProvided: ['CERVICAL_COLLAR', 'BAG_VALVE_MASK', 'IV_ACCESS'],
          notes: 'Depressed right parietal skull fracture, unreactive right pupil.',
        },
      },
    });
    expect(assessRes.statusCode).toBe(200);
    const assessment = assessRes.json().assessment;
    expect(assessment.version).toBe(1);
    expect(assessment.clinicianConfirmed).toBe(false);

    // -------------------------------------------------------------
    // STEP 3: Paramedic confirms clinical requirements
    // -------------------------------------------------------------
    const confirmRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/confirm-requirements`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        assessmentVersion: assessment.version,
        confirmedFullCareNeeds: ['TRAUMA_L1', 'NEUROSURGERY', 'VENTILATORS', 'ICU'],
        confirmedStabilizationNeeds: ['STABILIZATION', 'BASIC_OXYGEN'],
      },
    });
    expect(confirmRes.statusCode).toBe(200);
    expect(confirmRes.json().assessment.clinicianConfirmed).toBe(true);
    expect(store.cases.get(caseId)?.caseStatus).toBe(CaseStatus.ASSESSED);

    // -------------------------------------------------------------
    // STEP 4: Agent 2/3 generates multi-hospital A / B / C ranking
    // -------------------------------------------------------------
    const recRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/recommendations`,
      cookies: { gh_session: paramedicCookie },
    });
    expect(recRes.statusCode).toBe(200);
    const rec = recRes.json().recommendation;
    expect(rec.hospitalA.hospitalId).toBe('hosp-001'); // St. Jude (Trauma L1 + Neurosurgery)
    expect(rec.hospitalB.hospitalId).toBe('hosp-002'); // Bayview (Immediate Stabilization Backup)

    // Capture initial inventory counts at St. Jude
    const ventPoolBefore = store.listResourcePoolsByHospital('hosp-001').find((p) => p.resourceType === ResourceType.VENTILATOR)!;
    const ventAvailBefore = ventPoolBefore.availableCount;
    const ventResBefore = ventPoolBefore.reservedCount;

    // -------------------------------------------------------------
    // STEP 5: Paramedic initiates dispatch
    // -------------------------------------------------------------
    const dispatchRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/dispatch`,
      cookies: { gh_session: paramedicCookie },
    });
    expect(dispatchRes.statusCode).toBe(200);
    const dispatchData = dispatchRes.json();
    expect(dispatchData.case.caseStatus).toBe(CaseStatus.DISPATCHING);
    expect(dispatchData.destination.readiness).toBe(DestinationReadiness.PENDING);
    expect(dispatchData.requests).toHaveLength(3);

    // INVARIANT: Inventory is NOT locked before hospital confirmation
    const ventAfterDispatch = store.listResourcePoolsByHospital('hosp-001').find((p) => p.resourceType === ResourceType.VENTILATOR)!;
    expect(ventAfterDispatch.reservedCount).toBe(ventResBefore);
    expect(ventAfterDispatch.availableCount).toBe(ventAvailBefore);

    // -------------------------------------------------------------
    // STEP 6: Hospital A (St. Jude) accepts MAIN request
    // -------------------------------------------------------------
    const hospAReq = dispatchData.requests.find((r: any) => r.role === RequestRole.MAIN && r.hospitalId === 'hosp-001');
    expect(hospAReq).toBeDefined();

    const acceptARes = await app.inject({
      method: 'POST',
      url: `/api/v1/hospital-requests/${hospAReq.id}/accept`,
      cookies: { gh_session: hospACookie },
    });
    expect(acceptARes.statusCode).toBe(200);

    // INVARIANT: Confirmed destination A reserves required equipment atomically
    const ventAfterAccept = store.listResourcePoolsByHospital('hosp-001').find((p) => p.resourceType === ResourceType.VENTILATOR)!;
    expect(ventAfterAccept.reservedCount).toBe(ventResBefore + 1);
    expect(ventAfterAccept.availableCount).toBe(ventAvailBefore - 1);

    // INVARIANT: Standby tickets at Hospital B did NOT lock scarce equipment
    const bayviewPools = store.listResourcePoolsByHospital('hosp-002');
    for (const p of bayviewPools) {
      expect(p.reservedCount).toBe(0);
    }

    // Destination readiness is now CONFIRMED
    const destConfirmed = store.getDestination(caseId);
    expect(destConfirmed?.readiness).toBe(DestinationReadiness.CONFIRMED);
    expect(destConfirmed?.hospitalId).toBe('hosp-001');

    // -------------------------------------------------------------
    // STEP 7: Ambulance advances in transit & clinician initiates DIVERSION to Backup B
    // -------------------------------------------------------------
    store.updateAmbulancePosition(180, 160, 40.711, -74.012);
    const destVersionBefore = store.cases.get(caseId)!.destinationVersion;

    const divertRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/divert`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        targetHospitalId: 'hosp-002',
        expectedDestinationVersion: destVersionBefore,
        reason: 'Patient acute herniation in-transit; diverting immediately to Bayview for airway stabilization.',
      },
    });
    expect(divertRes.statusCode).toBe(200);

    // INVARIANT: Unused reservations at old hospital A are released atomically on diversion
    const ventAfterDivert = store.listResourcePoolsByHospital('hosp-001').find((p) => p.resourceType === ResourceType.VENTILATOR)!;
    expect(ventAfterDivert.reservedCount).toBe(ventResBefore);
    expect(ventAfterDivert.availableCount).toBe(ventAvailBefore);

    // Old main request at Hospital A is CANCELED
    const oldMainReq = store.getHospitalRequests('hosp-001').find((r) => r.id === hospAReq.id);
    expect(oldMainReq?.status).toBe(RequestStatus.CANCELED);

    // -------------------------------------------------------------
    // STEP 8: Stale Late Acceptance Rejection
    // -------------------------------------------------------------
    const lateRes = await app.inject({
      method: 'POST',
      url: `/api/v1/hospital-requests/${hospAReq.id}/accept`,
      cookies: { gh_session: hospACookie },
    });
    expect(lateRes.statusCode).toBe(409);
    expect(lateRes.json().code).toBe('REQUEST_OBSOLETE');

    // -------------------------------------------------------------
    // STEP 9: Hospital B (Bayview) accepts diverted MAIN request
    // -------------------------------------------------------------
    const newMainReq = store.getHospitalRequests('hosp-002').find((r) => r.caseId === caseId && r.role === RequestRole.MAIN)!;
    expect(newMainReq).toBeDefined();

    const bayviewBayBefore = store.listResourcePoolsByHospital('hosp-002').find((p) => p.resourceType === ResourceType.TRAUMA_BAY)!;
    const bayReservedBefore = bayviewBayBefore.reservedCount;

    const acceptBRes = await app.inject({
      method: 'POST',
      url: `/api/v1/hospital-requests/${newMainReq.id}/accept`,
      cookies: { gh_session: hospBCookie },
    });
    expect(acceptBRes.statusCode).toBe(200);

    // Bayview has atomically reserved trauma bay
    const bayviewBayAfter = store.listResourcePoolsByHospital('hosp-002').find((p) => p.resourceType === ResourceType.TRAUMA_BAY)!;
    expect(bayviewBayAfter.reservedCount).toBe(bayReservedBefore + 1);

    // -------------------------------------------------------------
    // STEP 10: Ambulance arrives at Bayview bay
    // -------------------------------------------------------------
    const arriveRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/arrive`,
      cookies: { gh_session: paramedicCookie },
    });
    expect(arriveRes.statusCode).toBe(200);
    expect(arriveRes.json().case.caseStatus).toBe(CaseStatus.ARRIVED);

    // INVARIANT: Arrival does NOT release reserved equipment
    const allocAfterArrive = store.listAllocationsByCase(caseId).find((a) => a.hospitalId === 'hosp-002');
    expect(allocAfterArrive?.state).toBe(AllocationState.RESERVED);

    // -------------------------------------------------------------
    // STEP 11: Hospital B records active resource use (RESERVED -> IN_USE)
    // -------------------------------------------------------------
    const startUseRes = await app.inject({
      method: 'POST',
      url: `/api/v1/allocations/${allocAfterArrive!.id}/start-use`,
      cookies: { gh_session: hospBCookie },
      payload: { expectedVersion: allocAfterArrive!.version },
    });
    expect(startUseRes.statusCode).toBe(200);
    expect(startUseRes.json().allocation.state).toBe(AllocationState.IN_USE);

    const bayviewBayInUse = store.listResourcePoolsByHospital('hosp-002').find((p) => p.resourceType === ResourceType.TRAUMA_BAY)!;
    expect(bayviewBayInUse.inUseCount).toBe(1);
    expect(bayviewBayInUse.reservedCount).toBe(0);

    // -------------------------------------------------------------
    // STEP 12: Paramedic completes clinical handover
    // -------------------------------------------------------------
    const handoverRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/handover`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        receivingClinicianName: 'Dr. Rebecca Miller, MD',
        handoverNotes: 'Patient handed over to Bayview resuscitation suite; trauma bay in use.',
      },
    });
    expect(handoverRes.statusCode).toBe(200);
    expect(handoverRes.json().case.caseStatus).toBe(CaseStatus.HANDED_OVER);

    // INVARIANT: Handover does NOT release in-use equipment
    const bayviewBayPostHandover = store.listResourcePoolsByHospital('hosp-002').find((p) => p.resourceType === ResourceType.TRAUMA_BAY)!;
    expect(bayviewBayPostHandover.inUseCount).toBe(1);

    // -------------------------------------------------------------
    // STEP 13: Hospital explicitly releases equipment after care
    // -------------------------------------------------------------
    const inUseAlloc = store.listAllocationsByCase(caseId).find((a) => a.hospitalId === 'hosp-002' && a.state === AllocationState.IN_USE)!;
    expect(inUseAlloc).toBeDefined();

    const releaseRes = await app.inject({
      method: 'POST',
      url: `/api/v1/allocations/${inUseAlloc.id}/release`,
      cookies: { gh_session: hospBCookie },
      payload: { expectedVersion: inUseAlloc.version },
    });
    expect(releaseRes.statusCode).toBe(200);
    expect(releaseRes.json().allocation.state).toBe(AllocationState.RELEASED);

    const bayviewBayReleased = store.listResourcePoolsByHospital('hosp-002').find((p) => p.resourceType === ResourceType.TRAUMA_BAY)!;
    expect(bayviewBayReleased.inUseCount).toBe(0);
    expect(bayviewBayReleased.availableCount).toBe(bayviewBayBefore.availableCount);

    // -------------------------------------------------------------
    // STEP 14: Admin verifies immutable audit trace of every transition
    // -------------------------------------------------------------
    const auditRes = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/audit-logs?caseId=${caseId}`,
      cookies: { gh_session: adminCookie },
    });
    expect(auditRes.statusCode).toBe(200);
    const traceLogs = auditRes.json().logs;
    const actions = traceLogs.map((l: any) => l.action);

    expect(actions).toContain('CASE_CREATED');
    expect(actions).toContain('REQUIREMENTS_CONFIRMED');
    expect(actions).toContain('CASE_DISPATCHED');
    expect(actions).toContain('REQUEST_ACCEPTED');
    expect(actions).toContain('CASE_DIVERTED');
    expect(actions).toContain('CASE_ARRIVED');
    expect(actions).toContain('RESOURCE_START_USE');
    expect(actions).toContain('CASE_HANDED_OVER');
    expect(actions).toContain('RESOURCE_RELEASED');
  });

  it('2. Critical Invariant Gate: All-or-nothing rollback on concurrent inventory contention', async () => {
    // Paramedic creates and dispatches case A
    const caseARes = await app.inject({
      method: 'POST',
      url: '/api/v1/cases',
      cookies: { gh_session: paramedicCookie },
      payload: { patientLabel: 'Contention Case Alpha' },
    });
    const caseAId = caseARes.json().case.id;

    // Assess and confirm
    const assessARes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseAId}/assessments`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        observations: {
          presentingIssue: 'Respiratory Arrest',
          urgencyLevel: 'CRITICAL',
          vitals: { heartRate: 110, systolicBp: 95, diastolicBp: 60, respiratoryRate: 32, oxygenSaturation: 84, gcs: 6 },
          ambulanceSupportProvided: ['BAG_VALVE_MASK'],
        },
      },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseAId}/confirm-requirements`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        assessmentVersion: assessARes.json().assessment.version,
        confirmedFullCareNeeds: ['TRAUMA_L1', 'VENTILATORS'],
        confirmedStabilizationNeeds: ['STABILIZATION', 'BASIC_OXYGEN'],
      },
    });

    await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseAId}/recommendations`,
      cookies: { gh_session: paramedicCookie },
    });

    const dispatchARes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseAId}/dispatch`,
      cookies: { gh_session: paramedicCookie },
    });
    expect(dispatchARes.statusCode).toBe(200);

    // Simulate exhausting ventilators at St. Jude (availableCount drops to 0)
    const ventPool = store.listResourcePoolsByHospital('hosp-001').find((p) => p.resourceType === ResourceType.VENTILATOR)!;
    const originalOos = ventPool.outOfServiceCount;
    ventPool.outOfServiceCount = ventPool.totalCount; // take all out of service
    ventPool.availableCount = 0;
    store.resourcePools.set(ventPool.id, ventPool);

    // Hospital A attempts to accept Case A when ventilators are unavailable
    const reqA = store.getHospitalRequests('hosp-001').find((r) => r.caseId === caseAId && r.role === RequestRole.MAIN)!;
    const acceptContentionRes = await app.inject({
      method: 'POST',
      url: `/api/v1/hospital-requests/${reqA.id}/accept`,
      cookies: { gh_session: hospACookie },
    });

    // Invariant: Atomic rejection with 409 RESOURCE_UNAVAILABLE
    expect(acceptContentionRes.statusCode).toBe(409);
    expect(acceptContentionRes.json().code).toBe('RESOURCE_UNAVAILABLE');

    // Invariant: All-or-nothing rollback ensures no partial leaked reservations
    const allocs = store.listAllocationsByCase(caseAId);
    expect(allocs).toHaveLength(0);

    // Cleanup pool
    ventPool.outOfServiceCount = originalOos;
    ventPool.availableCount = ventPool.totalCount - ventPool.outOfServiceCount - ventPool.externalOccupancy - ventPool.reservedCount - ventPool.inUseCount;
    store.resourcePools.set(ventPool.id, ventPool);
  });
});
