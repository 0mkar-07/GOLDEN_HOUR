import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { AmbulancePage } from '../pages/AmbulancePage';
import { nitkHospitals } from './nitk-fixtures';
import { apiClient } from '../lib/api-client';
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

  if (url.includes('/api/v1/routing/graph')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () =>
        Promise.resolve({
          graph: {
            nodes: [
              { id: 'node-amb-start', label: 'Scene', x: 120, y: 150, lat: 13.0108, lng: 74.7936 },
              { id: 'node-hosp-a', label: nitkHospitals[0].name, ...nitkHospitals[0].location },
            ],
            edges: [],
          },
          trafficOverrides: {},
          ambulancePosition: { x: 120, y: 150, lat: 13.0108, lng: 74.7936, speed: 0, heading: 0, serverSequence: 1, observedAt: new Date().toISOString() },
        }),
    });
  }

  if (url.includes('/api/v1/hospitals')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () =>
        Promise.resolve({
          hospitals: nitkHospitals,
        }),
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
  it('clears patient fields and assessment without deleting stored cases', async () => {
    await act(async () => { render(<AuthProvider><AmbulancePage /></AuthProvider>); });
    fireEvent.click(screen.getByRole('button', { name: 'Reset patient data' }));
    expect(screen.queryByRole('button', { name: /Clinician Confirm Requirements/i })).not.toBeInTheDocument();
    expect(screen.queryByText('case-test-001')).not.toBeInTheDocument();
    for (const input of screen.getAllByRole('spinbutton')) expect(input).toHaveValue(null);
    expect(screen.getByText(/Patient form cleared/)).toBeInTheDocument();
  });

  it('regenerates recommendations and routes after committing a new origin', async () => {
    mockAssessment.clinicianConfirmed = true;
    const generate = vi.spyOn(apiClient, 'generateRecommendations').mockResolvedValue({ recommendation: null } as any);
    const routes = vi.spyOn(apiClient, 'getCaseRoutes').mockResolvedValue({ routes: {} } as any);
    const reset = vi.spyOn(apiClient, 'resetSimulationOriginToDefault').mockResolvedValue({ origin: { lat: 13.0108, lng: 74.7936 }, message: 'Reset' });
    try {
      await act(async () => { render(<AuthProvider><AmbulancePage /></AuthProvider>); });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'NITK Default' })); });
      expect(generate).toHaveBeenCalledWith('case-test-001');
      expect(routes).toHaveBeenCalledWith('case-test-001');
    } finally {
      mockAssessment.clinicianConfirmed = false;
      generate.mockRestore(); routes.mockRestore(); reset.mockRestore();
    }
  });

  it('invalidates the previous assessment when loading a new NITK patient scenario', async () => {
    await act(async () => { render(<AuthProvider><AmbulancePage /></AuthProvider>); });
    fireEvent.change(screen.getByLabelText('Preset Scenario'), { target: { value: '1' } });
    expect(screen.queryByRole('button', { name: /Clinician Confirm Requirements/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Patient scenario loaded/)).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /11m vs 22m/ })).not.toBeInTheDocument();
  });

});
