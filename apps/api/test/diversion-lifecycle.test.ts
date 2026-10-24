import { describe, it, expect, beforeAll } from 'vitest';
import { buildServer } from '../src/server.js';
import { store } from '../src/db/store.js';
import {
  CaseStatus,
  RequestRole,
  RequestStatus,
  DestinationReadiness,
  ResourceType,
  AllocationState,
} from '@goldenhour/contracts';
import { runAgent1Async } from '../src/modules/agents/agent1.js';

describe('Phase 8 — Dynamic Diversion, Arrival, Handover, and Resource Lifecycle', () => {
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

  it('1. Full Pre-Diversion Journey: Dispatched and Accepted by Hospital A', async () => {
    // 1. Create Case
    const caseRes = await app.inject({
      method: 'POST',
      url: '/api/v1/cases',
      cookies: { gh_session: paramedicCookie },
      payload: { patientLabel: 'Phase 8 Diversion Patient', assignedAmbulanceId: 'amb-104' },
    });
    const caseId = JSON.parse(caseRes.body).case.id;

    // 2. Submit Assessment & Confirm
    await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/assessments`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        observations: {
          patientLabel: 'Phase 8 Diversion Patient',
          presentingIssue: 'Polytrauma TBI with Hemorrhagic Shock',
          urgencyLevel: 'CRITICAL',
          vitals: { heartRate: 130, systolicBp: 78, diastolicBp: 44, respiratoryRate: 26, oxygenSaturation: 88, gcs: 7 },
          ambulanceSupportProvided: ['HIGH_FLOW_O2', 'IV_ACCESS'],
          clinicalNotes: 'Intubated in field',
        },
      },
    });

    await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/confirm-requirements`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        assessmentVersion: 1,
        confirmedFullCareNeeds: ['TRAUMA_L1', 'NEUROSURGERY', 'VENTILATORS', 'CT_SCAN', 'ICU'],
        confirmedStabilizationNeeds: ['STABILIZATION', 'BASIC_OXYGEN'],
      },
    });

    await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/recommendations`,
      cookies: { gh_session: paramedicCookie },
    });

    // 3. Dispatch to Hospital A
    const dispatchRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/dispatch`,
      cookies: { gh_session: paramedicCookie },
    });
    expect(dispatchRes.statusCode).toBe(200);

    // 4. Hospital A Accepts & Reserves Inventory
    const hospAReq = store.getHospitalRequests('hosp-001').find((r) => r.caseId === caseId && r.role === RequestRole.MAIN)!;
    expect(hospAReq).toBeDefined();

    const acceptRes = await app.inject({
      method: 'POST',
      url: `/api/v1/hospital-requests/${hospAReq.id}/accept`,
      cookies: { gh_session: hospACookie },
    });
    expect(acceptRes.statusCode).toBe(200);

    const dest = store.getDestination(caseId);
    expect(dest?.readiness).toBe(DestinationReadiness.CONFIRMED);
    expect(dest?.hospitalId).toBe('hosp-001');

    // Confirm allocations exist at Hospital A
    const allocations = store.listAllocationsByCase(caseId);
    expect(allocations.length).toBeGreaterThanOrEqual(2);
    expect(allocations.every((a) => a.state === AllocationState.RESERVED)).toBe(true);
  });

  it('2. Clinician Diversion: Releases unused reservations at Hospital A and creates new request at Hospital B', async () => {
    const activeCase = Array.from((store as any).cases.values()).find((c: any) => c.patientLabel === 'Phase 8 Diversion Patient');
    expect(activeCase).toBeDefined();
    const caseId = activeCase.id;
    const destVersionBefore = activeCase.destinationVersion;

    // Check Hospital A ventilator reserved count before diversion
    const poolABefore = store.listResourcePoolsByHospital('hosp-001').find((p) => p.resourceType === ResourceType.VENTILATOR)!;
    const ventReservedBefore = poolABefore.reservedCount;
    const ventAvailBefore = poolABefore.availableCount;

    // Clinician initiates emergency diversion to Hospital B (Bayview)
    const divertRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/divert`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        targetHospitalId: 'hosp-002',
        expectedDestinationVersion: destVersionBefore,
        reason: 'Acute intracranial herniation signs; diverting to closest stabilization ED immediately.',
      },
    });

    expect(divertRes.statusCode).toBe(200);
    const body = divertRes.json();
    expect(body.case.destinationVersion).toBe(destVersionBefore + 1);
    expect(body.case.selectedHospitalId).toBe('hosp-002');
    expect(body.destination.hospitalId).toBe('hosp-002');
    expect(body.destination.readiness).toBe(DestinationReadiness.PENDING);
    expect(body.request.hospitalId).toBe('hosp-002');
    expect(body.request.role).toBe(RequestRole.MAIN);

    // Verify unused reservations at Hospital A were released
    const poolAAfter = store.listResourcePoolsByHospital('hosp-001').find((p) => p.resourceType === ResourceType.VENTILATOR)!;
    expect(poolAAfter.reservedCount).toBe(ventReservedBefore - 1);
    expect(poolAAfter.availableCount).toBe(ventAvailBefore + 1);

    // Old main request at Hospital A is marked CANCELED
    const oldReq = store.getHospitalRequests('hosp-001').find((r) => r.caseId === caseId && r.role === RequestRole.MAIN)!;
    expect(oldReq.status).toBe(RequestStatus.CANCELED);
  });

  it('3. Late acceptance rejection: Hospital A cannot accept stale request after diversion', async () => {
    const activeCase = Array.from((store as any).cases.values()).find((c: any) => c.patientLabel === 'Phase 8 Diversion Patient');
    const caseId = activeCase.id;

    const oldReq = store.getHospitalRequests('hosp-001').find((r) => r.caseId === caseId && r.role === RequestRole.MAIN)!;

    // Hospital A attempts to accept the obsolete generation 1 request
    const lateRes = await app.inject({
      method: 'POST',
      url: `/api/v1/hospital-requests/${oldReq.id}/accept`,
      cookies: { gh_session: hospACookie },
    });

    expect(lateRes.statusCode).toBe(409);
    expect(lateRes.json().code).toBe('REQUEST_OBSOLETE');

    // Case destination remains pointed at Hospital B!
    const dest = store.getDestination(caseId);
    expect(dest?.hospitalId).toBe('hosp-002');
  });

  it('4. Hospital B accepts diverted request and confirms destination', async () => {
    const activeCase = Array.from((store as any).cases.values()).find((c: any) => c.patientLabel === 'Phase 8 Diversion Patient');
    const caseId = activeCase.id;

    const newReq = store.getHospitalRequests('hosp-002').find((r) => r.caseId === caseId && r.role === RequestRole.MAIN)!;
    expect(newReq).toBeDefined();

    const acceptRes = await app.inject({
      method: 'POST',
      url: `/api/v1/hospital-requests/${newReq.id}/accept`,
      cookies: { gh_session: hospBCookie },
    });

    expect(acceptRes.statusCode).toBe(200);
    const dest = store.getDestination(caseId);
    expect(dest?.readiness).toBe(DestinationReadiness.CONFIRMED);
    expect(dest?.hospitalId).toBe('hosp-002');
  });

  it('5. Arrival at Hospital B bay preserves reservations without premature release', async () => {
    const activeCase = Array.from((store as any).cases.values()).find((c: any) => c.patientLabel === 'Phase 8 Diversion Patient');
    const caseId = activeCase.id;

    const arriveRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/arrive`,
      cookies: { gh_session: paramedicCookie },
    });

    expect(arriveRes.statusCode).toBe(200);
    expect(arriveRes.json().case.caseStatus).toBe(CaseStatus.ARRIVED);

    // Invariant: Equipment at Hospital B is NOT released on arrival
    const hospBAllocations = store.listAllocationsByCase(caseId).filter((a) => a.hospitalId === 'hosp-002');
    expect(hospBAllocations.length).toBeGreaterThan(0);
    expect(hospBAllocations.every((a) => a.state === AllocationState.RESERVED)).toBe(true);
  });

  it('6. Hospital B records active resource use (RESERVED -> IN_USE)', async () => {
    const activeCase = Array.from((store as any).cases.values()).find((c: any) => c.patientLabel === 'Phase 8 Diversion Patient');
    const caseId = activeCase.id;

    const alloc = store.listAllocationsByCase(caseId).find((a) => a.hospitalId === 'hosp-002' && a.state === AllocationState.RESERVED);
    expect(alloc).toBeDefined();

    const poolBefore = store.getResourcePool(alloc!.resourcePoolId)!;
    const reservedBefore = poolBefore.reservedCount;
    const inUseBefore = poolBefore.inUseCount;
    const availBefore = poolBefore.availableCount;

    // Hospital B marks trauma bay in-use as patient enters bay
    const startUseRes = await app.inject({
      method: 'POST',
      url: `/api/v1/allocations/${alloc!.id}/start-use`,
      cookies: { gh_session: hospBCookie },
      payload: { expectedVersion: alloc!.version },
    });

    expect(startUseRes.statusCode).toBe(200);
    const updatedAlloc = startUseRes.json().allocation;
    expect(updatedAlloc.state).toBe(AllocationState.IN_USE);
    expect(updatedAlloc.inUseAt).toBeDefined();

    // Pool counts: reservedCount decrements, inUseCount increments, available stays constant
    const poolAfter = store.getResourcePool(alloc!.resourcePoolId)!;
    expect(poolAfter.reservedCount).toBe(reservedBefore - 1);
    expect(poolAfter.inUseCount).toBe(inUseBefore + 1);
    expect(poolAfter.availableCount).toBe(availBefore);
  });

  it('7. Clinical Handover preserves occupied equipment in-use', async () => {
    const activeCase = Array.from((store as any).cases.values()).find((c: any) => c.patientLabel === 'Phase 8 Diversion Patient');
    const caseId = activeCase.id;

    const handoverRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/handover`,
      cookies: { gh_session: paramedicCookie },
    });

    expect(handoverRes.statusCode).toBe(200);
    expect(handoverRes.json().case.caseStatus).toBe(CaseStatus.HANDED_OVER);

    // Invariant: Equipment in-use at Hospital B remains occupied after handover
    const inUseAllocations = store.listAllocationsByCase(caseId).filter((a) => a.hospitalId === 'hosp-002' && a.state === AllocationState.IN_USE);
    expect(inUseAllocations.length).toBeGreaterThan(0);
  });

  it('8. Hospital explicitly releases resource restoring available count', async () => {
    const activeCase = Array.from((store as any).cases.values()).find((c: any) => c.patientLabel === 'Phase 8 Diversion Patient');
    const caseId = activeCase.id;

    const alloc = store.listAllocationsByCase(caseId).find((a) => a.hospitalId === 'hosp-002' && a.state === AllocationState.IN_USE)!;
    expect(alloc).toBeDefined();

    const poolBefore = store.getResourcePool(alloc.resourcePoolId)!;
    const inUseBefore = poolBefore.inUseCount;
    const availBefore = poolBefore.availableCount;

    // Hospital explicitly releases equipment upon patient discharge/transfer
    const releaseRes = await app.inject({
      method: 'POST',
      url: `/api/v1/allocations/${alloc.id}/release`,
      cookies: { gh_session: hospBCookie },
      payload: { expectedVersion: alloc.version },
    });

    expect(releaseRes.statusCode).toBe(200);
    const updated = releaseRes.json().allocation;
    expect(updated.state).toBe(AllocationState.RELEASED);
    expect(updated.releasedAt).toBeDefined();

    const poolAfter = store.getResourcePool(alloc.resourcePoolId)!;
    expect(poolAfter.inUseCount).toBe(inUseBefore - 1);
    expect(poolAfter.availableCount).toBe(availBefore + 1);
  });

  it('9. Agent 1 AI Integration: runAgent1Async returns validated clinical proposal and identifies missing vitals', async () => {
    const proposal = await runAgent1Async({
      patientLabel: 'Agent AI Test Patient',
      presentingIssue: 'Motor vehicle collision with suspected traumatic brain injury',
      urgencyLevel: 'CRITICAL',
      vitals: {
        heartRate: 118,
        systolicBp: null, // Explicit unknown
        diastolicBp: null,
        respiratoryRate: 24,
        oxygenSaturation: null, // Explicit unknown
        gcs: null, // Explicit unknown
      },
      ambulanceSupportProvided: ['CERVICAL_COLLAR', 'PELVIC_BINDER'],
    });

    expect(proposal.proposedFullCareNeeds).toEqual(expect.arrayContaining(['TRAUMA_L1']));
    expect(proposal.missingInputs.length).toBeGreaterThanOrEqual(2);
    expect(proposal.reasons.length).toBeGreaterThan(0);
  });
});
