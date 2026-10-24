import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecommendationPanel } from '../components/RecommendationPanel';
import { RecommendationDto } from '@goldenhour/contracts';

const mockRecommendation: RecommendationDto = {
  id: 'rec-test-001',
  caseId: 'case-001',
  assessmentVersion: 1,
  positionSequence: 1,
  inventoryVersion: 1,
  hospitalA: {
    hospitalId: 'hosp-001',
    code: 'HOSP-A',
    name: 'St. Jude Metropolitan Trauma Center',
    role: 'PRIMARY_A',
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
    role: 'BACKUP_B',
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
    role: 'BACKUP_C',
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

describe('Phase 5 — Destination Recommendation Panel', () => {
  it('renders Primary A and Backups B & C with time-to-care and limitations', () => {
    render(
      <RecommendationPanel
        recommendation={mockRecommendation}
        loading={false}
        onRefresh={() => {}}
      />
    );

    expect(screen.getByText('St. Jude Metropolitan Trauma Center')).toBeInTheDocument();
    expect(screen.getByText(/Primary \(A\)/i)).toBeInTheDocument();
    expect(screen.getByText('Bayview Urgent Care')).toBeInTheDocument();
    expect(screen.getByText(/Backup \(B\)/i)).toBeInTheDocument();
    expect(screen.getByText('Northpoint Regional')).toBeInTheDocument();
    expect(screen.getByText(/Backup \(C\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Tri-Agent Decision Pipeline Breakdown/i)).toBeInTheDocument();
  });

  it('renders standby placeholder when recommendation is null', () => {
    render(
      <RecommendationPanel
        recommendation={null}
        loading={false}
        onRefresh={() => {}}
      />
    );

    expect(screen.getByText('Destination Recommendation Standby')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Run Destination Matching/i })).toBeInTheDocument();
  });
});
