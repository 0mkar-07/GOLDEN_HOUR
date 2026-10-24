import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecommendationPanel } from '../components/RecommendationPanel';
import { DestinationReadiness, DestinationActor } from '@goldenhour/contracts';

const mockRecommendation = {
  id: 'rec-test-p8',
  caseId: 'case-p8-001',
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
    reasons: ['Level-1 Trauma & Neurosurgery'],
    missingCapabilities: [],
    readiness: 'CONFIRMED' as any,
  },
  hospitalB: {
    hospitalId: 'hosp-002',
    code: 'HOSP-B',
    name: 'Bayview Urgent Care & Community Hospital',
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
  coordinatorBriefing: 'Gemini AI Dispatch Briefing: Patient in hemorrhagic shock; consider diversion to Bayview if blood pressure deteriorates below 70 mmHg.',
  generatedAt: new Date().toISOString(),
};

describe('Phase 8 — Diversion & AI Agent Narrative UI', () => {
  it('renders Gemini AI Dispatch Coordinator Briefing narrative banner', () => {
    render(
      <RecommendationPanel
        recommendation={mockRecommendation}
        loading={false}
        onRefresh={() => {}}
      />
    );

    expect(screen.getByText(/AI Dispatch Coordinator Briefing \(Gemini Agent\)/i)).toBeInTheDocument();
    expect(
      screen.getByText(/consider diversion to Bayview if blood pressure deteriorates/i)
    ).toBeInTheDocument();
  });

  it('renders "Divert to Backup B" button when en route to Hospital A and triggers onDivert', () => {
    const handleDivert = vi.fn();
    const destination = {
      caseId: 'case-p8-001',
      hospitalId: 'hosp-001', // Currently en route to Hosp A
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
        destination={destination}
        onDivert={handleDivert}
      />
    );

    const divertBtn = screen.getByRole('button', { name: /Divert to Backup B/i });
    expect(divertBtn).toBeInTheDocument();

    fireEvent.click(divertBtn);
    expect(handleDivert).toHaveBeenCalledWith('hosp-002');
  });
});
