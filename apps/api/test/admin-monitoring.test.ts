import { describe, it, expect, beforeAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { initApp } from '../src/server.js';
import { store } from '../src/db/store.js';
import { CaseStatus, ReceivingStatus, UserRole } from '@goldenhour/contracts';

describe('Phase 9 — Admin Management and Monitoring', () => {
  let app: FastifyInstance;
  let adminCookie: string;
  let paramedicCookie: string;
  let hospACookie: string;

  beforeAll(async () => {
    app = await initApp();
    await app.ready();

    // 1. Log in as ADMIN
    const adminLoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'admin@goldenhour.test',
        password: 'demo123',
      },
    });
    expect(adminLoginRes.statusCode).toBe(200);
    adminCookie = adminLoginRes.cookies.find((c) => c.name === 'gh_session')!.value;

    // 2. Log in as PARAMEDIC (Ambulance)
    const paramLoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'paramedic@goldenhour.test',
        password: 'demo123',
      },
    });
    expect(paramLoginRes.statusCode).toBe(200);
    paramedicCookie = paramLoginRes.cookies.find((c) => c.name === 'gh_session')!.value;

    // 3. Log in as HOSPITAL (St. Jude)
    const hospALoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'stjude_admin@goldenhour.test',
        password: 'demo123',
      },
    });
    expect(hospALoginRes.statusCode).toBe(200);
    hospACookie = hospALoginRes.cookies.find((c) => c.name === 'gh_session')!.value;
  });

  it('1. Role Authorization: rejects unauthenticated, paramedic, and hospital users from admin endpoints', async () => {
    // Unauthenticated -> 401
    const unauthRes = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/overview',
    });
    expect(unauthRes.statusCode).toBe(401);

    // Paramedic (AMBULANCE) -> 403 Forbidden
    const paramRes = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/overview',
      cookies: { gh_session: paramedicCookie },
    });
    expect(paramRes.statusCode).toBe(403);
    expect(paramRes.json().code).toBe('FORBIDDEN');

    // Hospital user -> 403 Forbidden
    const hospRes = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/overview',
      cookies: { gh_session: hospACookie },
    });
    expect(hospRes.statusCode).toBe(403);
    expect(hospRes.json().code).toBe('FORBIDDEN');

    // Audit logs endpoint also rejects non-admin
    const auditParamRes = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/audit-logs',
      cookies: { gh_session: paramedicCookie },
    });
    expect(auditParamRes.statusCode).toBe(403);

    // Settings endpoint also rejects non-admin
    const settingsHospRes = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings',
      cookies: { gh_session: hospACookie },
      payload: { demoRefreshIntervalSeconds: 10 },
    });
    expect(settingsHospRes.statusCode).toBe(403);
  });

  it('2. Admin Overview: returns real-time metrics, fleet readiness, occupancy, and telemetry status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/overview',
      cookies: { gh_session: adminCookie },
    });

    if (res.statusCode !== 200) {
      console.log('Overview 500 error body:', res.json());
    }
    expect(res.statusCode).toBe(200);
    const body = res.json();

    // Check structure
    expect(typeof body.activeCasesCount).toBe('number');
    expect(body.casesByStatus).toBeDefined();
    expect(typeof body.casesByStatus[CaseStatus.DRAFT]).toBe('number');

    // Hospital readiness fleet check
    expect(Array.isArray(body.hospitalReadiness)).toBe(true);
    expect(body.hospitalReadiness.length).toBe(5);
    const stJude = body.hospitalReadiness.find((h: any) => h.id === 'hosp-001');
    expect(stJude).toBeDefined();
    expect(stJude.name).toBe('St. Jude Metropolitan Trauma Center');
    expect(stJude.totalResources).toBeGreaterThan(0);
    expect(stJude.availableCount).toBeGreaterThan(0);

    // Total resources aggregate
    expect(body.totalResources.total).toBeGreaterThan(0);
    expect(body.totalResources.available).toBeGreaterThan(0);

    // Ambulance telemetry
    expect(body.ambulanceTelemetry).toBeDefined();
    expect(body.ambulanceTelemetry.position.x).toBeDefined();
    expect(body.ambulanceTelemetry.position.y).toBeDefined();
    expect(typeof body.ambulanceTelemetry.isStale).toBe('boolean');

    // System Settings
    expect(body.systemSettings.demoRefreshIntervalSeconds).toBeGreaterThan(0);
    expect(body.systemSettings.stalenessThresholdSeconds).toBeGreaterThan(0);
  });

  it('3. Configurable Settings: validates bounds, units, updates state, and logs actor attribution', async () => {
    // Rejects invalid values (negative or beyond max limit)
    const invalidRes = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings',
      cookies: { gh_session: adminCookie },
      payload: {
        demoRefreshIntervalSeconds: 0, // min is 1
        stalenessThresholdSeconds: 1000, // max is 300
      },
    });
    expect(invalidRes.statusCode).toBe(400);
    expect(invalidRes.json().code).toBe('VALIDATION_ERROR');

    // Accepts valid update
    const validRes = await app.inject({
      method: 'PUT',
      url: '/api/v1/admin/settings',
      cookies: { gh_session: adminCookie },
      payload: {
        demoRefreshIntervalSeconds: 8,
        stalenessThresholdSeconds: 20,
        rankingImprovementMarginSeconds: 90,
      },
    });
    expect(validRes.statusCode).toBe(200);
    const updatedSettings = validRes.json().settings;
    expect(updatedSettings.demoRefreshIntervalSeconds).toBe(8);
    expect(updatedSettings.stalenessThresholdSeconds).toBe(20);
    expect(updatedSettings.rankingImprovementMarginSeconds).toBe(90);

    // Verify actor-attributed audit entry
    const auditRes = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/audit-logs?action=SYSTEM_SETTINGS_UPDATED',
      cookies: { gh_session: adminCookie },
    });
    expect(auditRes.statusCode).toBe(200);
    const logs = auditRes.json().logs;
    expect(logs.length).toBeGreaterThan(0);
    const latestSettingLog = logs[0];
    expect(latestSettingLog.actorRole).toBe(UserRole.ADMIN);
    expect(latestSettingLog.action).toBe('SYSTEM_SETTINGS_UPDATED');
    expect(latestSettingLog.details.current.demoRefreshIntervalSeconds).toBe(8);
  });

  it('4. Hospital Status Management: updates receiving status and receiving delay with audit trail', async () => {
    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/hospitals/hosp-002/status',
      cookies: { gh_session: adminCookie },
      payload: {
        receivingStatus: ReceivingStatus.RESTRICTED,
        receivingDelaySeconds: 300,
      },
    });

    expect(patchRes.statusCode).toBe(200);
    const body = patchRes.json();
    expect(body.hospital.receivingStatus).toBe(ReceivingStatus.RESTRICTED);
    expect(body.hospital.receivingDelaySeconds).toBe(300);

    // Verify hospital updated in store
    const hosp = store.getHospital('hosp-002');
    expect(hosp?.receivingStatus).toBe(ReceivingStatus.RESTRICTED);

    // Verify audit log
    const auditLogs = store.getFilteredAuditLogs({ hospitalId: 'hosp-002', action: 'ADMIN_HOSPITAL_STATUS_OVERRIDE' });
    expect(auditLogs.length).toBeGreaterThan(0);
    expect(auditLogs[0].actorRole).toBe(UserRole.ADMIN);
  });

  it('5. End-to-End Case Traceability: Admin traces one case from creation to release explaining every destination/resource transition', async () => {
    // Step A: Create and assess a new case
    const caseRes = await app.inject({
      method: 'POST',
      url: '/api/v1/cases',
      cookies: { gh_session: paramedicCookie },
      payload: {
        patientLabel: 'Admin Trace Patient #901',
        notes: 'Vehicular trauma subject for admin audit verification',
      },
    });
    expect(caseRes.statusCode).toBe(201);
    const caseId = caseRes.json().case.id;

    // Assess with vitals
    const assessRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/assessments`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        observations: {
          presentingIssue: 'Major vehicular crash with altered mental status',
          urgencyLevel: 'CRITICAL',
          vitals: {
            heartRate: 115,
            systolicBp: 88,
            diastolicBp: 52,
            respiratoryRate: 26,
            oxygenSaturation: 89,
            gcs: 7,
          },
          ambulanceSupportProvided: ['CERVICAL_COLLAR', 'BAG_VALVE_MASK'],
        },
      },
    });
    expect(assessRes.statusCode).toBe(200);
    const assessmentVersion = assessRes.json().assessment.version;

    // Confirm clinical requirements
    const confirmRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/confirm-requirements`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        confirmedFullCareNeeds: ['TRAUMA_L1', 'NEUROSURGERY', 'VENTILATORS', 'ICU'],
        confirmedStabilizationNeeds: ['STABILIZATION', 'BASIC_OXYGEN'],
        assessmentVersion,
      },
    });
    expect(confirmRes.statusCode).toBe(200);

    // Generate recommendations
    const recRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/recommendations`,
      cookies: { gh_session: paramedicCookie },
    });
    expect(recRes.statusCode).toBe(200);

    // Dispatch
    const dispatchRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/dispatch`,
      cookies: { gh_session: paramedicCookie },
    });
    expect(dispatchRes.statusCode).toBe(200);

    // St. Jude Accepts -> creates atomic reservations
    const hospAReq = store.getHospitalRequests('hosp-001').find((r) => r.caseId === caseId && r.role === 'MAIN');
    expect(hospAReq).toBeDefined();

    const acceptRes = await app.inject({
      method: 'POST',
      url: `/api/v1/hospital-requests/${hospAReq!.id}/accept`,
      cookies: { gh_session: hospACookie },
    });
    expect(acceptRes.statusCode).toBe(200);

    // Clinician Diverts to Hospital B (Bayview)
    const divertRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/divert`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        targetHospitalId: 'hosp-002',
        reason: 'Patient decompensating, immediate airway stabilization required',
        expectedDestinationVersion: 1,
      },
    });
    expect(divertRes.statusCode).toBe(200);

    // Hospital B accepts
    const hospBReq = store.getHospitalRequests('hosp-002').find((r) => r.caseId === caseId && r.role === 'MAIN');
    expect(hospBReq).toBeDefined();

    const hospBLoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'bayview_admin@goldenhour.test',
        password: 'demo123',
      },
    });
    const hospBCookie = hospBLoginRes.cookies.find((c) => c.name === 'gh_session')!.value;

    const hospBAcceptRes = await app.inject({
      method: 'POST',
      url: `/api/v1/hospital-requests/${hospBReq!.id}/accept`,
      cookies: { gh_session: hospBCookie },
    });
    expect(hospBAcceptRes.statusCode).toBe(200);

    // Ambulance Arrives at Bayview
    const arriveRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/arrive`,
      cookies: { gh_session: paramedicCookie },
    });
    expect(arriveRes.statusCode).toBe(200);

    // Bayview marks equipment IN_USE
    const hospBAlloc = store.listAllocationsByCase(caseId).find((a) => a.hospitalId === 'hosp-002');
    expect(hospBAlloc).toBeDefined();

    const startUseRes = await app.inject({
      method: 'POST',
      url: `/api/v1/allocations/${hospBAlloc!.id}/start-use`,
      cookies: { gh_session: hospBCookie },
      payload: { expectedVersion: hospBAlloc!.version },
    });
    expect(startUseRes.statusCode).toBe(200);

    // Clinical Handover
    const handoverRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/handover`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        receivingClinicianName: 'Dr. Sarah Connor, MD',
        handoverNotes: 'Patient handed over to Bayview trauma team; ventilator connected.',
      },
    });
    expect(handoverRes.statusCode).toBe(200);

    // Hospital releases equipment
    const inUseAlloc = store.listAllocationsByCase(caseId).find((a) => a.hospitalId === 'hosp-002' && a.state === 'IN_USE')!;
    const releaseRes = await app.inject({
      method: 'POST',
      url: `/api/v1/allocations/${inUseAlloc.id}/release`,
      cookies: { gh_session: hospBCookie },
      payload: { expectedVersion: inUseAlloc.version },
    });
    expect(releaseRes.statusCode).toBe(200);

    // --- NOW ADMIN TRACES THE CASE VIA API ---
    const caseAuditRes = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/audit-logs?caseId=${caseId}`,
      cookies: { gh_session: adminCookie },
    });
    expect(caseAuditRes.statusCode).toBe(200);
    const traceLogs = caseAuditRes.json().logs;

    expect(traceLogs.length).toBeGreaterThanOrEqual(7);

    // Verify key transitions exist in audit trail
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

    // Admin cases API returns the complete enriched case
    const adminCasesRes = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/cases',
      cookies: { gh_session: adminCookie },
    });
    expect(adminCasesRes.statusCode).toBe(200);
    const tracedCase = adminCasesRes.json().cases.find((c: any) => c.id === caseId);
    expect(tracedCase).toBeDefined();
    expect(tracedCase.caseStatus).toBe(CaseStatus.HANDED_OVER);
    expect(tracedCase.destination.hospitalId).toBe('hosp-002');
    expect(tracedCase.allocations.length).toBeGreaterThan(0);
  }, 20000);
});
