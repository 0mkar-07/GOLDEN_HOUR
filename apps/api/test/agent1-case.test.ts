import { describe, it, expect, beforeAll } from 'vitest';
import { buildServer } from '../src/server.js';
import { store } from '../src/db/store.js';
import { CaseStatus } from '@goldenhour/contracts';

describe('Phase 4 — Ambulance Case Entry and Agent 1', () => {
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
    expect(loginRes.statusCode).toBe(200);
    paramedicCookie = loginRes.cookies[0].value;
  });

  it('creates an emergency case in DRAFT status', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/cases',
      cookies: { gh_session: paramedicCookie },
      payload: {
        patientLabel: 'John Doe, 34M — Unrestrained Driver',
        assignedAmbulanceId: 'amb-104',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.case.id).toBeDefined();
    expect(body.case.caseStatus).toBe(CaseStatus.DRAFT);
    expect(body.case.assessmentVersion).toBe(0);
  });

  it('Agent 1 interprets polytrauma with TBI into full-care and stabilization needs', async () => {
    // 1. Create case
    const caseRes = await app.inject({
      method: 'POST',
      url: '/api/v1/cases',
      cookies: { gh_session: paramedicCookie },
      payload: { patientLabel: 'Severe TBI Victim' },
    });
    const caseId = JSON.parse(caseRes.body).case.id;

    // 2. Submit assessment with GCS 7 and low SpO2
    const assessRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/assessments`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        observations: {
          presentingIssue: 'Severe Polytrauma with Traumatic Brain Injury and Hemorrhagic Shock',
          urgencyLevel: 'CRITICAL',
          vitals: {
            heartRate: 125,
            systolicBp: 85,
            diastolicBp: 50,
            respiratoryRate: 26,
            oxygenSaturation: 89,
            gcs: 7,
          },
          ambulanceSupportProvided: ['HIGH_FLOW_O2', 'IV_ACCESS', 'CERVICAL_COLLAR'],
          notes: 'Depressed skull fracture, unresponsive.',
        },
      },
    });

    expect(assessRes.statusCode).toBe(200);
    const body = JSON.parse(assessRes.body);
    expect(body.assessment.version).toBe(1);
    expect(body.assessment.clinicianConfirmed).toBe(false);

    // Verify Agent 1 Proposal
    const proposal = body.agent1Proposal;
    expect(proposal.proposedFullCareNeeds).toEqual(
      expect.arrayContaining(['TRAUMA_L1', 'NEUROSURGERY', 'VENTILATORS', 'CT_SCAN', 'ICU'])
    );
    expect(proposal.proposedStabilizationNeeds).toEqual(
      expect.arrayContaining(['STABILIZATION', 'BASIC_OXYGEN', 'CT_SCAN'])
    );
    expect(proposal.reasons.length).toBeGreaterThan(0);
    expect(proposal.missingInputs).toEqual([]); // All vitals were provided
  });

  it('Agent 1 explicitly identifies missing telemetry instead of assuming normal', async () => {
    const caseRes = await app.inject({
      method: 'POST',
      url: '/api/v1/cases',
      cookies: { gh_session: paramedicCookie },
      payload: { patientLabel: 'Incomplete Assessment Patient' },
    });
    const caseId = JSON.parse(caseRes.body).case.id;

    // Submit with null GCS and null SpO2
    const assessRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/assessments`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        observations: {
          presentingIssue: 'Roadside extraction with suspected head injury',
          urgencyLevel: 'CRITICAL',
          vitals: {
            heartRate: 110,
            systolicBp: null,
            diastolicBp: null,
            respiratoryRate: null,
            oxygenSaturation: null,
            gcs: null,
          },
          ambulanceSupportProvided: ['CERVICAL_COLLAR'],
        },
      },
    });

    expect(assessRes.statusCode).toBe(200);
    const body = JSON.parse(assessRes.body);
    const missing = body.agent1Proposal.missingInputs;

    expect(missing).toEqual(
      expect.arrayContaining([
        'Glasgow Coma Scale (GCS) unknown or not recorded.',
        'Oxygen saturation (SpO2) not recorded.',
        'Systolic blood pressure not recorded.',
        'Respiratory rate not recorded.',
      ])
    );
  });

  it('clinician confirms requirements and transitions case status to ASSESSED', async () => {
    // 1. Create case & assessment
    const caseRes = await app.inject({
      method: 'POST',
      url: '/api/v1/cases',
      cookies: { gh_session: paramedicCookie },
      payload: { patientLabel: 'STEMI Patient' },
    });
    const caseId = JSON.parse(caseRes.body).case.id;

    const assessRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/assessments`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        observations: {
          presentingIssue: 'Acute STEMI anterior wall',
          urgencyLevel: 'CRITICAL',
          vitals: {
            heartRate: 98,
            systolicBp: 140,
            diastolicBp: 90,
            respiratoryRate: 18,
            oxygenSaturation: 96,
            gcs: 15,
          },
          ambulanceSupportProvided: ['ASPIRIN_324MG'],
        },
      },
    });
    const assessmentVersion = JSON.parse(assessRes.body).assessment.version;

    // 2. Clinician Confirms Requirements
    const confirmRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/confirm-requirements`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        assessmentVersion,
        confirmedFullCareNeeds: ['CARDIAC_CATH', 'ICU', 'VENTILATORS'],
        confirmedStabilizationNeeds: ['STABILIZATION', 'BASIC_OXYGEN'],
      },
    });

    expect(confirmRes.statusCode).toBe(200);
    const body = JSON.parse(confirmRes.body);
    expect(body.assessment.clinicianConfirmed).toBe(true);
    expect(body.assessment.confirmedFullCareNeeds).toEqual(['CARDIAC_CATH', 'ICU', 'VENTILATORS']);
    expect(body.assessment.confirmedBy).toBeDefined();
    expect(body.assessment.confirmedAt).toBeDefined();

    // Verify case status updated to ASSESSED
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/cases/${caseId}`,
      cookies: { gh_session: paramedicCookie },
    });
    const updatedCase = JSON.parse(getRes.body).case;
    expect(updatedCase.caseStatus).toBe(CaseStatus.ASSESSED);
  });

  it('rejects confirmation with stale assessment version (409 Version Conflict)', async () => {
    const caseRes = await app.inject({
      method: 'POST',
      url: '/api/v1/cases',
      cookies: { gh_session: paramedicCookie },
      payload: { patientLabel: 'Conflict Test Patient' },
    });
    const caseId = JSON.parse(caseRes.body).case.id;

    // Assessment v1
    await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/assessments`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        observations: {
          presentingIssue: 'Head injury',
          urgencyLevel: 'URGENT',
          vitals: { heartRate: 90, systolicBp: 120, diastolicBp: 80, respiratoryRate: 16, oxygenSaturation: 98, gcs: 14 },
          ambulanceSupportProvided: [],
        },
      },
    });

    // Assessment v2
    await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/assessments`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        observations: {
          presentingIssue: 'Condition deteriorated: GCS drop',
          urgencyLevel: 'CRITICAL',
          vitals: { heartRate: 110, systolicBp: 90, diastolicBp: 60, respiratoryRate: 24, oxygenSaturation: 91, gcs: 8 },
          ambulanceSupportProvided: ['HIGH_FLOW_O2'],
        },
      },
    });

    // Attempt confirming stale version 1
    const staleRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/confirm-requirements`,
      cookies: { gh_session: paramedicCookie },
      payload: {
        assessmentVersion: 1, // Stale! Current is v2
        confirmedFullCareNeeds: ['TRAUMA_L1'],
        confirmedStabilizationNeeds: ['STABILIZATION'],
      },
    });

    expect(staleRes.statusCode).toBe(409);
    const body = JSON.parse(staleRes.body);
    expect(body.code).toBe('VERSION_CONFLICT');
  });
});
