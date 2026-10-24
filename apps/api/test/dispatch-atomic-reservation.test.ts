import { describe, it, expect, beforeAll } from 'vitest';
import { buildServer } from '../src/server.js';
import { store } from '../src/db/store.js';
import {
  CaseStatus,
  RequestRole,
  RequestStatus,
  DestinationReadiness,
  ResourceType,
  SpecialtyType,
  UserRole,
} from '@goldenhour/contracts';

describe('Phase 6 & 7 — Dispatch, Atomic Reservations, and Real-Time Outbox', () => {
  const app = buildServer();
  let paramedicCookie: string;
  let hospACookie: string;
  let hospBCookie: string;

  beforeAll(async () => {
    await store.seed();
    await app.ready();

    // Login Paramedic
    const pLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'paramedic@goldenhour.test', password: 'demo123' },
    });
    paramedicCookie = pLogin.cookies[0].value;

    // Login Hosp A (St. Jude)
    const haLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'stjude_admin@goldenhour.test', password: 'demo123' },
    });
    hospACookie = haLogin.cookies[0].value;

    // Login Hosp B (Bayview)
    const hbLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'bayview_admin@goldenhour.test', password: 'demo123' },
    });
    hospBCookie = hbLogin.cookies[0].value;
  });

  it('1. Full Dispatch Flow: Paramedic dispatches assessed case creating 1 MAIN and 2 STANDBY requests', async () => {
    // 1. Create Case
    const caseRes = await app.inject({
      method: 'POST',
      url: '/api/v1/cases',
      cookies: { gh_session: paramedicCookie },
      payload: { patientLabel: 'Phase 6 Test Patient', assignedAmbulanceId: 'amb-104' },
    });
    const caseId = JSON.parse(caseRes.body).case.id;

    // 2. Submit Assessment & Confirm Requirements
    const assessRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/assessments`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        observations: {
          patientLabel: 'Phase 6 Test Patient',
          presentingIssue: 'Polytrauma TBI',
          urgencyLevel: 'CRITICAL',
          vitals: { heartRate: 125, systolicBp: 80, diastolicBp: 50, respiratoryRate: 24, oxygenSaturation: 91, gcs: 7 },
          ambulanceSupportProvided: ['HIGH_FLOW_O2', 'IV_ACCESS'],
          clinicalNotes: 'Intubation needed',
        },
      },
    });
    expect(assessRes.statusCode).toBe(200);

    const confirmRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/confirm-requirements`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        assessmentVersion: 1,
        confirmedFullCareNeeds: ['TRAUMA_L1', 'NEUROSURGERY', 'VENTILATORS', 'CT_SCAN', 'ICU'],
        confirmedStabilizationNeeds: ['STABILIZATION', 'BASIC_OXYGEN'],
      },
    });
    expect(confirmRes.statusCode).toBe(200);

    // Generate recommendation first
    const recRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/recommendations`,
      cookies: { gh_session: paramedicCookie },
    });
    expect(recRes.statusCode).toBe(200);

    // 3. Dispatch Case
    const dispatchRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/dispatch`,
      cookies: { gh_session: paramedicCookie },
    });

    expect(dispatchRes.statusCode).toBe(200);
    const body = dispatchRes.json();
    expect(body.case.caseStatus).toBe(CaseStatus.DISPATCHING);
    expect(body.destination.readiness).toBe(DestinationReadiness.PENDING);
    expect(body.requests).toHaveLength(3);

    const mainReq = body.requests.find((r: any) => r.role === RequestRole.MAIN);
    const standbyReqs = body.requests.filter((r: any) => r.role === RequestRole.STANDBY);

    expect(mainReq).toBeDefined();
    expect(mainReq.hospitalId).toBe('hosp-001'); // St. Jude is Hosp A
    expect(mainReq.status).toBe(RequestStatus.PENDING);
    expect(standbyReqs).toHaveLength(2);
  });

  it('2. Hospital A accepts MAIN request: Atomically reserves all required resources and decrements staff slots', async () => {
    // Get initial ventilator & trauma surgeon availability at Hosp A
    const poolsBefore = store.listResourcePoolsByHospital('hosp-001');
    const ventBefore = poolsBefore.find((p) => p.resourceType === ResourceType.VENTILATOR)!;
    const ventReservedBefore = ventBefore.reservedCount;
    const ventAvailBefore = ventBefore.availableCount;

    const staffBefore = store.listStaffByHospital('hosp-001');
    const neuroBefore = staffBefore.find((s) => s.specialty === SpecialtyType.NEUROSURGEON)!;
    const neuroSlotsBefore = neuroBefore.availableTeamSlots;

    const requests = store.getHospitalRequests('hosp-001');
    const mainReq = requests.find((r) => r.role === RequestRole.MAIN && r.status === RequestStatus.PENDING)!;
    expect(mainReq).toBeDefined();

    const acceptRes = await app.inject({
      method: 'POST',
      url: `/api/v1/hospital-requests/${mainReq.id}/accept`,
      cookies: { gh_session: hospACookie },
    });

    expect(acceptRes.statusCode).toBe(200);
    const body = acceptRes.json();
    expect(body.request.status).toBe(RequestStatus.ACCEPTED);
    expect(body.case.caseStatus).toBe(CaseStatus.EN_ROUTE);
    expect(body.allocations.length).toBeGreaterThanOrEqual(2);

    // Verify inventory reserved count incremented and available decremented
    const poolsAfter = store.listResourcePoolsByHospital('hosp-001');
    const ventAfter = poolsAfter.find((p) => p.resourceType === ResourceType.VENTILATOR)!;
    expect(ventAfter.reservedCount).toBe(ventReservedBefore + 1);
    expect(ventAfter.availableCount).toBe(ventAvailBefore - 1);

    // Verify staff slot decremented
    const staffAfter = store.listStaffByHospital('hosp-001');
    const neuroAfter = staffAfter.find((s) => s.specialty === SpecialtyType.NEUROSURGEON)!;
    expect(neuroAfter.availableTeamSlots).toBe(neuroSlotsBefore - 1);

    // Destination confirmed
    const dest = store.getDestination(mainReq.caseId);
    expect(dest?.readiness).toBe(DestinationReadiness.CONFIRMED);
  });

  it('3. Standby Notices do NOT lock scarce inventory', async () => {
    const poolsBefore = store.listResourcePoolsByHospital('hosp-002');
    const bayBefore = poolsBefore.find((p) => p.resourceType === ResourceType.TRAUMA_BAY)!;
    const bayReservedBefore = bayBefore.reservedCount;
    const bayAvailBefore = bayBefore.availableCount;

    const requests = store.getHospitalRequests('hosp-002');
    const standbyReq = requests.find((r) => r.role === RequestRole.STANDBY && r.status === RequestStatus.PENDING)!;
    expect(standbyReq).toBeDefined();

    const acceptRes = await app.inject({
      method: 'POST',
      url: `/api/v1/hospital-requests/${standbyReq.id}/accept`,
      cookies: { gh_session: hospBCookie },
    });

    expect(acceptRes.statusCode).toBe(200);
    const body = acceptRes.json();
    expect(body.request.status).toBe(RequestStatus.ACCEPTED);
    expect(body.allocations).toHaveLength(0); // Zero allocations for standby!

    const poolsAfter = store.listResourcePoolsByHospital('hosp-002');
    const bayAfter = poolsAfter.find((p) => p.resourceType === ResourceType.TRAUMA_BAY)!;
    expect(bayAfter.reservedCount).toBe(bayReservedBefore);
    expect(bayAfter.availableCount).toBe(bayAvailBefore);
  });

  it('4. Concurrent Contention: All-or-nothing rollback when any required resource is unavailable', async () => {
    // 1. Create and dispatch a case while resources are nominally available
    const caseRes = await app.inject({
      method: 'POST',
      url: '/api/v1/cases',
      cookies: { gh_session: paramedicCookie },
      payload: { patientLabel: 'Contention Test Patient', assignedAmbulanceId: 'amb-104' },
    });
    const caseId = JSON.parse(caseRes.body).case.id;

    await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/assessments`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        observations: {
          patientLabel: 'Contention Test Patient',
          presentingIssue: 'Severe TBI',
          urgencyLevel: 'CRITICAL',
          vitals: { heartRate: 110, systolicBp: 90, diastolicBp: 60, respiratoryRate: 22, oxygenSaturation: 90, gcs: 8 },
          ambulanceSupportProvided: ['O2'],
          clinicalNotes: 'Critical',
        },
      },
    });

    await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/confirm-requirements`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        assessmentVersion: 1,
        confirmedFullCareNeeds: ['VENTILATORS', 'TRAUMA_L1'],
        confirmedStabilizationNeeds: ['BASIC_OXYGEN'],
      },
    });

    await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/recommendations`,
      cookies: { gh_session: paramedicCookie },
    });

    const dispatchRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/dispatch`,
      cookies: { gh_session: paramedicCookie },
    });

    expect(dispatchRes.statusCode).toBe(200);
    const newMainReq = dispatchRes.json().requests.find((r: any) => r.role === RequestRole.MAIN && r.hospitalId === 'hosp-001');
    expect(newMainReq).toBeDefined();

    // 2. NOW simulate race condition contention: Hospital A's ventilators drop to 0 available before acceptance
    const pools = store.listResourcePoolsByHospital('hosp-001');
    const ventPool = pools.find((p) => p.resourceType === ResourceType.VENTILATOR)!;
    const savedExternal = ventPool.externalOccupancy;
    ventPool.externalOccupancy = ventPool.totalCount - ventPool.outOfServiceCount - ventPool.reservedCount - ventPool.inUseCount;
    ventPool.availableCount = 0;

    // 3. Hospital A coordinator attempts to accept when ventilator availability became 0
    const acceptRes = await app.inject({
      method: 'POST',
      url: `/api/v1/hospital-requests/${newMainReq.id}/accept`,
      cookies: { gh_session: hospACookie },
    });

    expect(acceptRes.statusCode).toBe(409);
    expect(acceptRes.json().code).toBe('RESOURCE_UNAVAILABLE');

    // Verify ZERO partial allocations created for this case
    const caseAllocations = store.listAllocationsByCase(caseId);
    expect(caseAllocations).toHaveLength(0);

    // Reset external occupancy for subsequent tests
    ventPool.externalOccupancy = savedExternal;
    ventPool.availableCount = ventPool.totalCount - ventPool.outOfServiceCount - ventPool.reservedCount - ventPool.inUseCount;
  });

  it('5. Idempotent acceptance: Repeated accept returns existing allocations without double-locking', async () => {
    const requests = store.getHospitalRequests('hosp-001');
    const acceptedReq = requests.find((r) => r.role === RequestRole.MAIN && r.status === RequestStatus.ACCEPTED)!;
    expect(acceptedReq).toBeDefined();

    const poolsBefore = store.listResourcePoolsByHospital('hosp-001');
    const ventBefore = poolsBefore.find((p) => p.resourceType === ResourceType.VENTILATOR)!.reservedCount;

    const secondAccept = await app.inject({
      method: 'POST',
      url: `/api/v1/hospital-requests/${acceptedReq.id}/accept`,
      cookies: { gh_session: hospACookie },
    });

    expect(secondAccept.statusCode).toBe(200);
    const poolsAfter = store.listResourcePoolsByHospital('hosp-001');
    const ventAfter = poolsAfter.find((p) => p.resourceType === ResourceType.VENTILATOR)!.reservedCount;
    expect(ventAfter).toBe(ventBefore); // No double allocation!
  });

  it('6. Cross-hospital security: Hospital B cannot accept Hospital A requests', async () => {
    const requests = store.getHospitalRequests('hosp-001');
    const hospAReq = requests[0];

    const crossRes = await app.inject({
      method: 'POST',
      url: `/api/v1/hospital-requests/${hospAReq.id}/accept`,
      cookies: { gh_session: hospBCookie }, // Hosp B attempting Hosp A
    });

    expect(crossRes.statusCode).toBe(403);
    expect(crossRes.json().code).toBe('FORBIDDEN');
  });

  it('7. Obsolete generation rejection: Stale requests cannot be accepted once destination generation advances', async () => {
    // Manually create an older generation request
    const staleReq = {
      id: 'req-stale-test',
      caseId: 'case-test-stale',
      hospitalId: 'hosp-001',
      role: RequestRole.MAIN,
      status: RequestStatus.PENDING,
      destinationGeneration: 1,
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      createdAt: new Date().toISOString(),
    };
    (store as any).hospitalRequests.set(staleReq.id, staleReq);
    (store as any).cases.set(staleReq.caseId, {
      id: staleReq.caseId,
      assignedAmbulanceId: 'amb-104',
      patientLabel: 'Stale Test',
      caseStatus: CaseStatus.DISPATCHING,
      assessmentVersion: 1,
      destinationVersion: 2, // Case is already on generation 2!
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const staleRes = await app.inject({
      method: 'POST',
      url: `/api/v1/hospital-requests/${staleReq.id}/accept`,
      cookies: { gh_session: hospACookie },
    });

    expect(staleRes.statusCode).toBe(409);
    expect(staleRes.json().code).toBe('REQUEST_OBSOLETE');
  });

  it('8. Real-time Outbox Verification: Outbox has recorded all required events', () => {
    const outbox = store.getOutboxEvents();
    expect(outbox.length).toBeGreaterThan(0);

    const eventTypes = outbox.map((e) => e.authorizedEventType);
    expect(eventTypes).toContain('case.updated');
    expect(eventTypes).toContain('destination.updated');
    expect(eventTypes).toContain('request.created');
    expect(eventTypes).toContain('request.updated');
    expect(eventTypes).toContain('inventory.updated');
  });
});
