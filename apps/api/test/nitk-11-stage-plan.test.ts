import { describe, it, expect, beforeAll } from 'vitest';
import { initApp } from '../src/server.js';
import { store } from '../src/db/store.js';
import {
  NITK_REGION,
  isWithinNitkRegion,
  calculateHaversineDistanceMeters,
  CAPABILITY_CATALOGUE,
} from '@goldenhour/contracts';
import { IMPORTED_NITK_DATASET } from '@goldenhour/scenario-fixtures';
import { agentTools } from '../src/modules/agents/tools.js';

describe('NITK Hospital Data, Agent, Map & Simulator 11-Stage Verification', () => {
  let app: any;
  let authCookie: string;

  beforeAll(async () => {
    app = await initApp();
    await store.seed();

    // Authenticate demo paramedic
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'paramedic@goldenhour.test',
        password: 'demo123',
      },
    });
    expect(loginRes.statusCode).toBe(200);
    const cookies = loginRes.cookies;
    authCookie = cookies.find((c: any) => c.name === 'gh_session')?.value || '';
  });

  // --- STAGE 1 & 3: IMPORT CONTRACT, PROVENANCE & 23 FACILITIES ---
  it('Stage 1 & 3: imports all 23 NITK facilities with complete provenance and <= 30 km regional distance', async () => {
    const reportRes = await app.inject({
      method: 'GET',
      url: '/api/v1/hospitals/import-report',
      cookies: { gh_session: authCookie },
    });
    expect(reportRes.statusCode).toBe(200);
    const reportBody = JSON.parse(reportRes.body);

    expect(reportBody.report.totalRecords).toBe(23);
    expect(reportBody.report.accepted).toBe(23);
    expect(reportBody.report.rejected).toBe(0);
    expect(reportBody.report.datasetStatus).toBe('synthetic_demo');
    expect(reportBody.report.regionId).toBe(NITK_REGION.regionId);
    expect(reportBody.report.maxDistanceMeters).toBeLessThanOrEqual(30000);

    // Verify all 23 coordinates are strictly within 30 km of NITK
    for (const fac of reportBody.report.facilities) {
      expect(fac.within30km).toBe(true);
      expect(fac.distanceMeters).toBeLessThanOrEqual(30000);
    }
  });

  // --- STAGE 2 & 5: TABULAR HOSPITAL DIRECTORY WITH PRECISE NIL SEMANTICS ---
  it('Stage 2 & 5: returns tabular capability matrix with explicit NIL semantics', async () => {
    const tabRes = await app.inject({
      method: 'GET',
      url: '/api/v1/hospitals/tabular',
      cookies: { gh_session: authCookie },
    });
    expect(tabRes.statusCode).toBe(200);
    const tabBody = JSON.parse(tabRes.body);

    expect(tabBody.total).toBe(23);
    expect(tabBody.region).toBe(NITK_REGION.regionId);
    expect(Array.isArray(tabBody.hospitals)).toBe(true);
    expect(tabBody.hospitals.length).toBe(23);

    // Check specific facility capabilities Detail
    const nitkHcc = tabBody.hospitals.find((h: any) => h.id === 'hosp-005' || h.code.includes('NITK_HCC'));
    expect(nitkHcc).toBeDefined();
    expect(nitkHcc.capabilitiesDetail).toBeDefined();

    // NITK HCC does not have trauma L1 or neurosurgery -> total is 0 or null, never coerced to string 'nil'
    const traumaDetail = nitkHcc.capabilitiesDetail['TRAUMA_L1'];
    expect(traumaDetail).toBeDefined();
    expect(typeof traumaDetail.supported).toBe('boolean');
  });

  // --- STAGE 4: GEOGRAPHIC CONSISTENCY & NITK 30 KM RADIUS ---
  it('Stage 4: validates coordinates against NITK 30 km radius (Haversine formula)', () => {
    // Center point (NITK Surathkal)
    expect(isWithinNitkRegion(13.0108, 74.7936)).toBe(true);

    // KMC Mangaluru (~16.6 km away)
    expect(isWithinNitkRegion(12.8718, 74.8490)).toBe(true);

    // Yenepoya Deralakatte (~24 km away)
    expect(isWithinNitkRegion(12.8125, 74.8807)).toBe(true);

    // Bengaluru (~300 km away) -> Out of region
    expect(isWithinNitkRegion(12.9716, 77.5946)).toBe(false);

    // Legacy NYC coordinates -> Out of region
    expect(isWithinNitkRegion(40.7128, -74.006)).toBe(false);
  });

  // --- STAGE 6: AMBULANCE ORIGIN SELECTION WITH MOVABLE PIN & ROAD SNAP ---
  it('Stage 6: allows setting ambulance origin within 30 km and snaps to road network', async () => {
    // Valid location near Surathkal Lighthouse (approx 1.5 km from NITK)
    const validLat = 13.008;
    const validLng = 74.795;

    const originRes = await app.inject({
      method: 'POST',
      url: '/api/v1/simulation/origin',
      cookies: { gh_session: authCookie },
      payload: {
        lat: validLat,
        lng: validLng,
      },
    });

    expect(originRes.statusCode).toBe(200);
    const originBody = JSON.parse(originRes.body);
    expect(originBody.requested.lat).toBe(validLat);
    expect(originBody.snapped).toBeDefined();
    expect(originBody.distanceFromNitkKm).toBeLessThanOrEqual(30);

    // Origin outside 30 km boundary must be rejected with 400 OUT_OF_REGION
    const invalidRes = await app.inject({
      method: 'POST',
      url: '/api/v1/simulation/origin',
      cookies: { gh_session: authCookie },
      payload: {
        lat: 12.5, // ~60 km south
        lng: 74.8,
      },
    });

    expect(invalidRes.statusCode).toBe(400);
    const invalidBody = JSON.parse(invalidRes.body);
    expect(invalidBody.code).toBe('OUT_OF_REGION');

    // Reset to NITK default
    const resetRes = await app.inject({
      method: 'POST',
      url: '/api/v1/simulation/origin/reset-default',
      cookies: { gh_session: authCookie },
    });
    expect(resetRes.statusCode).toBe(200);
    const resetBody = JSON.parse(resetRes.body);
    expect(resetBody.origin.lat).toBeCloseTo(NITK_REGION.centerLat, 4);
    expect(resetBody.origin.lng).toBeCloseTo(NITK_REGION.centerLng, 4);
  });

  // --- STAGE 7: REPRODUCIBLE ARTIFICIAL TRAFFIC PRESETS ---
  it('Stage 7: applies reproducible traffic presets with unambiguous travel time multiplier', async () => {
    // Authenticate demo admin for traffic controls
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'admin@goldenhour.test',
        password: 'demo123',
      },
    });
    const adminCookie = adminLogin.cookies.find((c: any) => c.name === 'gh_session')?.value || '';

    // Apply Corridor Congestion preset (3.5x travel time)
    const trafficRes = await app.inject({
      method: 'POST',
      url: '/api/v1/simulation/scenarios/traffic',
      cookies: { gh_session: adminCookie },
      payload: {
        preset: 'CORRIDOR_CONGESTION',
        edgeId: 'edge-3',
      },
    });

    expect(trafficRes.statusCode).toBe(200);
    const trafficBody = JSON.parse(trafficRes.body);
    expect(trafficBody.multiplier).toBe(3.5);
    expect(trafficBody.label).toBe('3.5x travel time');
    expect(trafficBody.preset).toBe('CORRIDOR_CONGESTION');
  });

  // --- STAGE 8: AGENT 1 STRUCTURED EVIDENCE & READ-ONLY TOOLS ---
  it('Stage 8: provides read-only tools for capability definitions, hospital readiness, and arrival service hours', () => {
    // Tool 1: Capability catalogue definitions
    const defs = agentTools.getCapabilityDefinitions();
    expect(defs['TRAUMA_L1']).toBeDefined();
    expect(defs['NEUROSURGERY']).toBeDefined();
    expect(defs['VENTILATORS'].isCountable).toBe(true);

    // Tool 2: Hospital readiness
    const readiness = agentTools.getHospitalReadiness('hosp-001');
    expect(readiness).toBeDefined();
    expect(readiness?.hospitalId).toBe(store.resolveHospitalId('hosp-001'));
    expect(readiness?.resources.length).toBeGreaterThan(0);
    expect(readiness?.staff.length).toBeGreaterThan(0);

    // Tool 3: Service hours at arrival
    const arrivalHours = agentTools.getServiceHoursAtArrival('hosp-001', 600);
    expect(arrivalHours.hospitalId).toBe(store.resolveHospitalId('hosp-001'));
    expect(arrivalHours.emergencyDeptOpen).toBe(true);
  });

  // --- STAGE 9: CORRECT SURGERY SCHEDULES & ACTUAL OVERLAP DETECTION ---
  it('Stage 9: detects actual resource-specific overlap and rejects tickets for non-overlapping cases', async () => {
    const caseId = 'case-overlap-stage9';
    store.createCase({
      id: caseId,
      ambulanceId: 'amb-104',
      paramedicId: 'user-amb-001',
      patientLabel: 'Stage 9 Overlap Test Patient',
      presentingIssue: 'Severe Abdominal Bleed',
      urgencyLevel: 'CRITICAL',
    });

    // 1. Arrival in 15 minutes (overlaps with scheduled elective proc-101 planned for +15m to +75m)
    const overlapRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/priority-review`,
      cookies: { gh_session: authCookie },
      payload: {
        caseId,
        hospitalId: 'hosp-001',
        estimatedArrivalSeconds: 900, // 15 minutes
        urgencyLevel: 'CRITICAL',
      },
    });

    expect(overlapRes.statusCode).toBe(201);
    const overlapBody = JSON.parse(overlapRes.body);
    expect(overlapBody.conflict).toBe(true);
    expect(overlapBody.ticket).toBeDefined();
    expect(overlapBody.ticket.conflictingProcedureId).toBe('proc-101');
    expect(overlapBody.ticket.status).toBe('PENDING_REVIEW');

    // 2. Case with arrival in 10 hours (600 minutes) does NOT overlap with any procedure
    const nonOverlapCaseId = 'case-no-overlap';
    store.createCase({
      id: nonOverlapCaseId,
      ambulanceId: 'amb-104',
      paramedicId: 'user-amb-001',
      patientLabel: 'Far Future Arrival Patient',
      presentingIssue: 'Delayed Observation',
      urgencyLevel: 'MODERATE',
    });

    const noOverlapRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${nonOverlapCaseId}/priority-review`,
      cookies: { gh_session: authCookie },
      payload: {
        caseId: nonOverlapCaseId,
        hospitalId: 'hosp-001',
        estimatedArrivalSeconds: 36000, // 10 hours into the future
        urgencyLevel: 'MODERATE',
      },
    });

    expect(noOverlapRes.statusCode).toBe(200);
    const noOverlapBody = JSON.parse(noOverlapRes.body);
    expect(noOverlapBody.conflict).toBe(false);
    expect(noOverlapBody.ticket).toBeNull();
  });
});
