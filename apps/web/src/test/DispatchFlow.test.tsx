import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecommendationPanel } from '../components/RecommendationPanel';
import { DestinationReadiness, DestinationActor } from '@goldenhour/contracts';

const mockRecommendation = {
  id: 'rec-test-001',
  caseId: 'case-001',
  assessmentVersion: 1,
  positionSequence: 1,
  inventoryVersion: 1,
  hospitalA: {
    hospitalId: 'hosp-001',
    code: 'HOSP-A',
    name: 'St. Jude Metropolitan Trauma Center',
    role: 'PRIMARY_A' as any,
    eligible: true,
    travelSeconds: 540,
    readyAtSeconds: 0,
    receivingDelaySeconds: 120,
    careStartSeconds: 660,
    timeToCareSeconds: 660,
    reasons: ['Ranked #1 for full definitive care.'],
    missingCapabilities: [],
    readiness: 'PENDING' as any,
  },
  hospitalB: {
    hospitalId: 'hosp-002',
    code: 'HOSP-B',
    name: 'Bayview Urgent Care',
    role: 'BACKUP_B' as any,
    eligible: true,
    travelSeconds: 240,
    readyAtSeconds: 0,
    receivingDelaySeconds: 90,
    careStartSeconds: 330,
    timeToCareSeconds: 330,
    reasons: ['Closest verified stabilization facility.'],
    missingCapabilities: ['TRAUMA_L1', 'NEUROSURGERY'],
    readiness: 'PENDING' as any,
  },
  hospitalC: {
    hospitalId: 'hosp-003',
    code: 'HOSP-C',
    name: 'Northpoint Regional',
    role: 'BACKUP_C' as any,
    eligible: true,
    travelSeconds: 420,
    readyAtSeconds: 0,
    receivingDelaySeconds: 150,
    careStartSeconds: 570,
    timeToCareSeconds: 570,
    reasons: ['Secondary stabilization backup.'],
    missingCapabilities: ['NEUROSURGERY'],
    readiness: 'PENDING' as any,
  },
  allCandidates: [],
  generatedAt: new Date().toISOString(),
};

describe('Phase 6 & 7 — Dispatch UI and Real-Time State Progression', () => {
  it('renders "Dispatch Ambulance to Hospital A" action button when undispatched', () => {
    const handleDispatch = vi.fn();

    render(
      <RecommendationPanel
        recommendation={mockRecommendation}
        loading={false}
        onRefresh={() => {}}
        destination={null}
        onDispatch={handleDispatch}
      />
    );

    const dispatchBtn = screen.getByRole('button', { name: /Dispatch Ambulance to Hospital A/i });
    expect(dispatchBtn).toBeInTheDocument();

    fireEvent.click(dispatchBtn);
    expect(handleDispatch).toHaveBeenCalledTimes(1);
  });

  it('renders live "Requested (Awaiting Confirmation)" state once dispatched', () => {
    const requestedDest = {
      caseId: 'case-001',
      hospitalId: 'hosp-001',
      readiness: DestinationReadiness.PENDING,
      version: 1,
      selectedBy: DestinationActor.CLINICIAN,
      updatedAt: new Date().toISOString(),
    };

    render(
      <RecommendationPanel
        recommendation={mockRecommendation}
        loading={false}
        onRefresh={() => {}}
        destination={requestedDest}
      />
    );

    expect(screen.getByText(/Requested \(Awaiting Confirmation\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Ambulance dispatched\. Waiting for Hospital St\. Jude/i)).toBeInTheDocument();
  });

  it('renders "Confirmed • Resources Reserved" state once Hospital A accepts', () => {
    const confirmedDest = {
      caseId: 'case-001',
      hospitalId: 'hosp-001',
      readiness: DestinationReadiness.CONFIRMED,
      version: 1,
      selectedBy: DestinationActor.CLINICIAN,
      updatedAt: new Date().toISOString(),
    };

    render(
      <RecommendationPanel
        recommendation={mockRecommendation}
        loading={false}
        onRefresh={() => {}}
        destination={confirmedDest}
      />
    );

    expect(screen.getByText(/Confirmed • Resources Reserved/i)).toBeInTheDocument();
    expect(screen.getByText(/confirmed the reservation\. Full-care inventory atomically locked/i)).toBeInTheDocument();
  });
});
