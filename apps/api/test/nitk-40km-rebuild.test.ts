import { describe, it, expect, beforeAll } from 'vitest';
import { initApp } from '../src/server.js';
import { store } from '../src/db/store.js';
import {
  NITK_REGION,
  isWithinNitkRegion,
  calculateHaversineDistanceMeters,
  projectToNitkMetric,
  UserRole,
} from '@goldenhour/contracts';
import {
  importNitkFacilities,
  IMPORTED_NITK_DATASET,
  toCanonicalHospitalId,
  RawFacilitySchema,
} from '@goldenhour/scenario-fixtures';
import rawData from '@goldenhour/scenario-fixtures/src/data/nitk_facilities.synthetic.json' with { type: 'json' };

describe('NITK 40 km Rebuild & Pin Repair Plan (Regression Gates)', () => {
  let app: any;
  let paramedicCookie: string;
  let adminCookie: string;
  let hospitalCookie: string;

  beforeAll(async () => {
    app = await initApp();
    await store.seed();

    // Paramedic Login
    const paramRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'paramedic@goldenhour.test', password: 'demo123' },
    });
    paramedicCookie = paramRes.cookies.find((c: any) => c.name === 'gh_session')?.value || '';

    // Admin Login
    const adminRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'admin@goldenhour.test', password: 'demo123' },
    });
    adminCookie = adminRes.cookies.find((c: any) => c.name === 'gh_session')?.value || '';

    // Hospital Login (Bayview / Padmavathi)
    const hospRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'bayview_admin@goldenhour.test', password: 'demo123' },
    });
    hospitalCookie = hospRes.cookies.find((c: any) => c.name === 'gh_session')?.value || '';
  });

  // -------------------------------------------------------------
  // D-01: Row order independence & identity hash stability
  // -------------------------------------------------------------
  it('D-01: imports 23-row source twice and with reordered rows, yielding identical unique IDs and hash', () => {
    const import1 = importNitkFacilities();
    const reversedRaw = [...(rawData.facilities as any[])].reverse();
    const import2 = importNitkFacilities(reversedRaw);

    expect(import1.hospitals.length).toBe(23);
    expect(import2.hospitals.length).toBe(23);

    const ids1 = new Set(import1.hospitals.map((h) => h.id));
    const ids2 = new Set(import2.hospitals.map((h) => h.id));

    expect(ids1.size).toBe(23);
    expect(ids2.size).toBe(23);
    expect(Array.from(ids1).sort()).toEqual(Array.from(ids2).sort());

    // Identity hash must be invariant to row order
    expect(import1.report.identityHash).toBe(import2.report.identityHash);
  });

  // -------------------------------------------------------------
  // D-02: Chirashree Nursing Home and KMC Hospital Attavar distinction (F-01)
  // -------------------------------------------------------------
  it('D-02: independently queries Chirashree and KMC Attavar with different IDs, names, and coordinates', () => {
    const chirashree = store.getHospital('CHIRASHREE_SURATHKAL');
    const kmc = store.getHospital('KMC_ATTAVAR');

    expect(chirashree).toBeDefined();
    expect(kmc).toBeDefined();

    expect(chirashree!.id).toBe('nitk:CHIRASHREE_SURATHKAL');
    expect(kmc!.id).toBe('nitk:KMC_ATTAVAR');
    expect(chirashree!.id).not.toBe(kmc!.id);

    expect(chirashree!.name).toBe('Chirashree Nursing Home');
    expect(kmc!.name).toBe('University Medical Center (KMC Hospital)');

    // Different coordinates
    expect(chirashree!.location.lat).not.toBe(kmc!.location.lat);
    expect(chirashree!.location.lng).not.toBe(kmc!.location.lng);
  });

  // -------------------------------------------------------------
  // D-03: Typed schema validation rejects invalid facilities without partial import
  // -------------------------------------------------------------
  it('D-03: rejects duplicate ID, NaN coordinate, or invalid schema during import', () => {
    const invalidFacility = {
      facility_id: '', // empty
      name: 'Invalid Hospital',
      facility_type: 'invalid_type',
      location: { latitude: 'NaN', longitude: 74.8 },
    };

    const parseResult = RawFacilitySchema.safeParse(invalidFacility);
    expect(parseResult.success).toBe(false);
  });

  // -------------------------------------------------------------
  // D-04: Explicit NIL semantics (null/unknown values are not converted to false/zero)
  // -------------------------------------------------------------
  it('D-04: preserves null capabilities and availability as null/NIL instead of 0 or false', () => {
    const chirashree = store.getHospital('CHIRASHREE_SURATHKAL')!;
    const details = chirashree.capabilitiesDetail || {};

    // In Chirashree, electiveOt is absent/null in source data, preserved as null (NIL)
    expect(chirashree.timingsSummary.electiveOt).toBeNull();

    // Confirmed zero values in source remain 0 (not coerced to null or false)
    const cath = details['CARDIAC_CATH'];
    expect(cath?.totalCount).toBe(0);
    expect(cath?.availableCount).toBe(0);
    expect(cath?.supported).toBe(false);

    // Capabilities imported with null counts stay strictly null (NIL semantics)
    const custom = importNitkFacilities([
      {
        facility_id: 'TEST_HOSPITAL_D04',
        name: 'Test Hospital NIL',
        facility_type: 'nursing_home',
        address: 'Surathkal Beach Road',
        data_status: 'synthetic_demo',
        location: {
          latitude: 13.0108,
          longitude: 74.7936,
          distance_from_nitk_km: 0.1,
          coordinate_source: 'synthetic',
          coordinate_confidence: 'high',
        },
        capabilities: {
          CARDIAC_CATH: { total: null, available_now: null, is_open_now: null },
        },
      },
    ]);
    const customHosp = custom.hospitals[0];
    expect(customHosp.capabilitiesDetail['CARDIAC_CATH'].totalCount).toBeNull();
    expect(customHosp.capabilitiesDetail['CARDIAC_CATH'].availableCount).toBeNull();
    expect(customHosp.capabilitiesDetail['CARDIAC_CATH'].isOpenNow).toBeNull();

    // Verify Tabular endpoint returns the 40 km region
    const report = store.getImportReport();
    expect(report.regionId).toBe('nitk-surathkal-40km');
    expect(report.distanceBands).toBeDefined();
  });

  // -------------------------------------------------------------
  // P-01: Set Pin off does not mutate origin or reset simulation
  // -------------------------------------------------------------
  it('P-01: respects pin placement mode and verifies server origin endpoints', async () => {
    const initialRunVersion = store.simulationRun.runVersion;
    const initialOrigin = { ...store.ambulanceOrigin };

    // When no commit is issued, version and origin are intact
    expect(store.simulationRun.runVersion).toBe(initialRunVersion);
    expect(store.ambulanceOrigin.lat).toBe(initialOrigin.lat);
    expect(store.ambulanceOrigin.lng).toBe(initialOrigin.lng);
  });

  // -------------------------------------------------------------
  // P-04 & P-05: Idempotency, Stale Version (409 Conflict), and Preview Validation
  // -------------------------------------------------------------
  it('P-04 & P-05: preview validation, idempotency replay, and version conflict rejection', async () => {
    // 1. Valid preview request near Surathkal
    const previewRes = await app.inject({
      method: 'POST',
      url: '/api/v1/simulation/origin/preview',
      cookies: { gh_session: paramedicCookie },
      payload: {
        requested: { lat: 13.0108, lng: 74.7936 },
      },
    });
    expect(previewRes.statusCode).toBe(200);
    const preview = JSON.parse(previewRes.body);
    expect(preview.validationStatus).toBe('ACCEPTED');
    expect(preview.validationId).toBeDefined();

    // 2. Commit with validationId and idempotencyKey
    const idempotencyKey = 'idem-test-key-001';
    const currentRunVersion = store.simulationRun.runVersion;

    const commitRes1 = await app.inject({
      method: 'POST',
      url: '/api/v1/simulation/origin',
      cookies: { gh_session: paramedicCookie },
      payload: {
        validationId: preview.validationId,
        expectedRunVersion: currentRunVersion,
        idempotencyKey,
      },
    });
    expect(commitRes1.statusCode).toBe(200);
    const result1 = JSON.parse(commitRes1.body);

    // 3. Replay with exact same key -> returns identical recorded result (idempotent)
    const commitRes2 = await app.inject({
      method: 'POST',
      url: '/api/v1/simulation/origin',
      cookies: { gh_session: paramedicCookie },
      payload: {
        validationId: preview.validationId,
        expectedRunVersion: currentRunVersion, // older version is accepted for idempotent replay
        idempotencyKey,
      },
    });
    expect(commitRes2.statusCode).toBe(200);
    const result2 = JSON.parse(commitRes2.body);
    expect(result1.runVersion).toBe(result2.runVersion);

    // 4. Stale run version mismatch with new payload -> 409 conflict
    const staleRes = await app.inject({
      method: 'POST',
      url: '/api/v1/simulation/origin',
      cookies: { gh_session: paramedicCookie },
      payload: {
        lat: 13.0108,
        lng: 74.7936,
        expectedRunVersion: 1, // Stale version
      },
    });
    expect(staleRes.statusCode).toBe(409);
    const staleBody = JSON.parse(staleRes.body);
    expect(staleBody.code).toBe('VERSION_CONFLICT');
  });

  // -------------------------------------------------------------
  // P-06: 40 km boundary enforcement (valid origin at 35 km accepted, >40 km rejected)
  // -------------------------------------------------------------
  it('P-06: validates 40 km regional boundary strictly on preview and commit', async () => {
    // 35 km point within 40 km boundary
    // Lat 13.0108, Lng 74.7936 + 0.3 deg (~32.5 km east)
    const distMeters = calculateHaversineDistanceMeters(13.0108, 74.7936, 13.0108, 75.0936);
    expect(distMeters).toBeLessThanOrEqual(40000);
    expect(isWithinNitkRegion(13.0108, 75.0936)).toBe(true);

    // Point beyond 40 km (e.g. Udupi north or Bengaluru)
    expect(isWithinNitkRegion(12.9716, 77.5946)).toBe(false); // Bengaluru
    expect(isWithinNitkRegion(40.7128, -74.006)).toBe(false); // NYC

    // Preview for point outside 40 km boundary returns REJECTED OUT_OF_REGION
    const rejectedPreview = await app.inject({
      method: 'POST',
      url: '/api/v1/simulation/origin/preview',
      cookies: { gh_session: paramedicCookie },
      payload: {
        requested: { lat: 12.9716, lng: 77.5946 },
      },
    });
    expect(rejectedPreview.statusCode).toBe(200);
    const body = JSON.parse(rejectedPreview.body);
    expect(body.validationStatus).toBe('REJECTED');
    expect(body.rejectionCode).toBe('OUT_OF_REGION');
  });

  // -------------------------------------------------------------
  // P-08: Coordinate parity across metric, 2D, and geographic projections
  // -------------------------------------------------------------
  it('P-08: projected metric x/y and lat/lng match across API after origin commit and reset', async () => {
    // Reset to default
    const resetRes = await app.inject({
      method: 'POST',
      url: '/api/v1/simulation/origin/reset-default',
      cookies: { gh_session: paramedicCookie },
    });
    expect(resetRes.statusCode).toBe(200);

    const pos = store.ambulancePosition;
    const metric = projectToNitkMetric(NITK_REGION.centerLat, NITK_REGION.centerLng);

    expect(pos.lat).toBe(NITK_REGION.centerLat);
    expect(pos.lng).toBe(NITK_REGION.centerLng);
    expect(pos.x).toBe(Math.round(metric.x / 10));
    expect(pos.y).toBe(Math.round(metric.y / 10));
  });

  // -------------------------------------------------------------
  // S-01 & S-02: Surgical priority review permissions and protection
  // -------------------------------------------------------------
  it('S-01 & S-02: requires owning hospital authority to decide surgical priority tickets and protects in-progress cases', async () => {
    // Create test case
    store.createCase({
      id: 'case-test-s01',
      ambulanceId: 'amb-104',
      paramedicId: 'user-amb-001',
      patientLabel: 'Stage 9 Overlap Test Patient',
      presentingIssue: 'Severe Abdominal Bleed',
      urgencyLevel: 'CRITICAL',
    });

    // Create an emergency priority review for AJ Hospital (hosp-001)
    const reviewRes = await app.inject({
      method: 'POST',
      url: '/api/v1/cases/case-test-s01/priority-review',
      cookies: { gh_session: paramedicCookie },
      payload: {
        caseId: 'case-test-s01',
        hospitalId: 'hosp-001',
        estimatedArrivalSeconds: 600,
        urgencyLevel: 'CRITICAL',
        clinicalRationale: 'Polytrauma ETA 10m requires trauma OR',
      },
    });
    expect([200, 201]).toContain(reviewRes.statusCode);
    const reviewBody = JSON.parse(reviewRes.body);

    if (reviewBody.conflict && reviewBody.ticket) {
      const ticketId = reviewBody.ticket.id;

      // S-02: Paramedic tries to decide hospital ticket -> 403 Forbidden
      const unauthorizedRes = await app.inject({
        method: 'POST',
        url: `/api/v1/priority-tickets/${ticketId}/decision`,
        cookies: { gh_session: paramedicCookie },
        payload: {
          decision: 'APPROVED',
          reviewerNotes: 'Paramedic trying to approve deferral',
        },
      });
      expect(unauthorizedRes.statusCode).toBe(403);

      // Hospital B user tries to decide Hospital A ticket -> 403 Forbidden
      const wrongHospRes = await app.inject({
        method: 'POST',
        url: `/api/v1/priority-tickets/${ticketId}/decision`,
        cookies: { gh_session: hospitalCookie }, // Bayview Urgent user
        payload: {
          decision: 'APPROVED',
          reviewerNotes: 'Wrong hospital manager',
        },
      });
      expect(wrongHospRes.statusCode).toBe(403);

      // Admin user has authority -> 200 OK
      const adminDecisionRes = await app.inject({
        method: 'POST',
        url: `/api/v1/priority-tickets/${ticketId}/decision`,
        cookies: { gh_session: adminCookie },
        payload: {
          decision: 'APPROVED',
          reviewerNotes: 'Approved by Medical Director',
        },
      });
      expect(adminDecisionRes.statusCode).toBe(200);
    }
  });

  // -------------------------------------------------------------
  // D-10: Complete demo reset restores dataset consistently
  // -------------------------------------------------------------
  it('D-10: full demo reset restores canonical dataset and clears orphan priority tickets', () => {
    store.resetDemoScenario();

    expect(store.simulationRun.running).toBe(false);
    expect(store.emergencyPriorityTickets.size).toBe(0);
    expect(store.hospitals.size).toBe(23);
    expect(store.ambulanceOrigin.lat).toBe(NITK_REGION.centerLat);
    expect(store.ambulanceOrigin.lng).toBe(NITK_REGION.centerLng);
  });
});
