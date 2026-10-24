import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { AmbulancePage } from '../pages/AmbulancePage';
import { AuthProvider } from '../context/AuthContext';

const mockCase = {
  id: 'case-test-001',
  assignedAmbulanceId: 'amb-104',
  caseStatus: 'DRAFT',
  patientLabel: 'John Doe, 34M — Unrestrained Driver',
  assessmentVersion: 1,
  destinationVersion: 0,
  selectedHospitalId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockAssessment = {
  id: 'assess-case-test-001-v1',
  caseId: 'case-test-001',
  version: 1,
  observations: {
    presentingIssue: 'Severe Polytrauma with TBI',
    urgencyLevel: 'CRITICAL',
    vitals: { heartRate: 128, systolicBp: 82, diastolicBp: 48, respiratoryRate: 26, oxygenSaturation: 89, gcs: 7 },
    ambulanceSupportProvided: ['HIGH_FLOW_O2'],
  },
  proposedFullCareNeeds: ['TRAUMA_L1', 'NEUROSURGERY', 'VENTILATORS'],
  proposedStabilizationNeeds: ['STABILIZATION', 'BASIC_OXYGEN'],
  confirmedFullCareNeeds: [],
  confirmedStabilizationNeeds: [],
  clinicianConfirmed: false,
  confirmedAt: null,
  confirmedBy: null,
  createdAt: new Date().toISOString(),
};

global.fetch = vi.fn().mockImplementation((url: string) => {
  if (url.includes('/api/v1/auth/me')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () =>
        Promise.resolve({
          user: {
            id: 'user-amb-001',
            email: 'paramedic@goldenhour.test',
            name: 'Officer Alex Rivera, Paramedic Lead',
            role: 'AMBULANCE',
            ambulanceId: 'amb-104',
            active: true,
            createdAt: new Date().toISOString(),
          },
        }),
    });
  }

  if (url.includes('/api/v1/cases/case-test-001')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ case: mockCase, latestAssessment: mockAssessment }),
    });
  }

  if (url.includes('/api/v1/cases')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ cases: [mockCase] }),
    });
  }

  return Promise.resolve({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve({}),
  });
});

describe('Phase 4 — Ambulance Terminal & Agent 1 UI', () => {
  it('renders ambulance terminal, case telemetry form, and preset selector', async () => {
    await act(async () => {
      render(
        <AuthProvider>
          <AmbulancePage />
        </AuthProvider>
      );
    });

    expect(screen.getByText('Ambulance Mobile Terminal')).toBeInTheDocument();
    expect(screen.getByText(/Patient Telemetry & Presenting Symptoms/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /preset scenario/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Run Agent 1 Requirements Synthesis/i })).toBeInTheDocument();
  });

  it('renders Agent 1 proposal panel and confirmation button when assessment exists', async () => {
    await act(async () => {
      render(
        <AuthProvider>
          <AmbulancePage />
        </AuthProvider>
      );
    });

    expect(screen.getByText('Agent 1 — Requirements Synthesis')).toBeInTheDocument();
    expect(screen.getByText('TRAUMA_L1')).toBeInTheDocument();
    expect(screen.getByText('NEUROSURGERY')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clinician Confirm Requirements/i })).toBeInTheDocument();
  });
});
