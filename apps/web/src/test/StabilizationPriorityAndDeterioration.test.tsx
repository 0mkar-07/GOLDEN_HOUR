import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RecommendationPanel } from '../components/RecommendationPanel';
import { DeteriorationDiversionDialog } from '../components/DeteriorationDiversionDialog';
import { RecommendationDto, DestinationReadiness } from '@goldenhour/contracts';

const mockStabilizationOnlyRecommendation: RecommendationDto = {
  id: 'rec-test-stab',
  caseId: 'case-101',
  assessmentVersion: 1,
  positionSequence: 1,
  inventoryVersion: 1,
  recommendationMode: 'STABILIZATION_ONLY',
  hospitalA: null, // Strictly null: no full-care hospital available
  hospitalB: {
    hospitalId: 'hosp-002',
    code: 'HOSP-B',
    name: 'Bayview Community Hospital',
    role: 'BACKUP_B',
    eligible: true,
    fullCareEligible: false,
    stabilizationEligible: true,
    careObjective: 'STABILIZATION',
    travelSeconds: 300,
    readyAtSeconds: 0,
    receivingDelaySeconds: 60,
    careStartSeconds: 360,
    timeToCareSeconds: 360,
    reasons: ['First eligible emergency stabilization destination'],
    missingCapabilities: ['NEUROSURGERY', 'TRAUMA_L1'],
    limitations: ['Full-care requirements not available here: NEUROSURGERY, TRAUMA_L1'],
    readiness: DestinationReadiness.PENDING,
  },
  hospitalC: {
    hospitalId: 'hosp-003',
    code: 'HOSP-C',
    name: 'Northpoint Regional Medical Center',
    role: 'BACKUP_C',
    eligible: true,
    fullCareEligible: false,
    stabilizationEligible: true,
    careObjective: 'STABILIZATION',
    travelSeconds: 660,
    readyAtSeconds: 0,
    receivingDelaySeconds: 120,
    careStartSeconds: 780,
    timeToCareSeconds: 780,
    reasons: ['Secondary stabilization contingency'],
    missingCapabilities: ['PEDIATRIC_ICU'],
    limitations: ['Full-care requirements not available here: PEDIATRIC_ICU'],
    readiness: DestinationReadiness.PENDING,
  },
  allCandidates: [],
  coordinatorBriefing: 'No full-care destination is currently eligible. Bayview is the first stabilization option, with an estimated 5-minute drive.',
  generatedAt: new Date().toISOString(),
};

describe('Stabilization Priority & Deterioration UI Integration', () => {
  it('renders stabilization-only layout: removes empty A card, displays priority banner, and provides stabilization dispatch to Bayview', () => {
    const handleDispatch = vi.fn();
    const handleRefresh = vi.fn();

    render(
      <RecommendationPanel
        recommendation={mockStabilizationOnlyRecommendation}
        loading={false}
        onRefresh={handleRefresh}
        onDispatch={handleDispatch}
      />
    );

    // 1. Verify status banner is visible
    expect(
      screen.getByText(/No full-care destination is currently eligible\. Stabilization options are available below\./i)
    ).toBeInTheDocument();

    // 2. Verify empty Hospital A card is completely removed!
    expect(screen.queryByText(/Primary \(A\)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No Hospital Meets Full-Care Requirements/i)).not.toBeInTheDocument();

    // 3. Verify Priority 1 is Bayview with stabilization title and dispatch button
    expect(screen.getByText(/Priority 1 — Stabilization/i)).toBeInTheDocument();
    expect(screen.getByText('Bayview Community Hospital')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Dispatch to Bayview Community Hospital for stabilization/i })
    ).toBeInTheDocument();

    // 4. Verify "Full-care requirements not available here" copy replaces "Limitations vs Hospital A"
    expect(screen.getAllByText(/Full-care requirements not available here:/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Limitations vs Hospital A/i)).not.toBeInTheDocument();

    // 5. Verify Priority 2 is Northpoint with choose alternative button
    expect(screen.getByText(/Priority 2 — Stabilization/i)).toBeInTheDocument();
    expect(screen.getByText('Northpoint Regional Medical Center')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Choose this alternative for stabilization/i })
    ).toBeInTheDocument();

    // 6. Click dispatch button for Bayview
    fireEvent.click(
      screen.getByRole('button', { name: /Dispatch to Bayview Community Hospital for stabilization/i })
    );
    expect(handleDispatch).toHaveBeenCalledWith('hosp-002', 'STABILIZATION');
  });

  it('renders DeteriorationDiversionDialog, compares alternatives, highlights nearest ETA, and confirms diversion', async () => {
    const handleConfirm = vi.fn().mockResolvedValue(undefined);
    const handleClose = vi.fn();

    // Mock fetch for diversion preview
    const mockPreview = {
      previewId: 'prev-test-123',
      caseId: 'case-101',
      currentDestinationHospitalId: 'hosp-001',
      currentDestinationEtaSeconds: 600, // 10 mins to St. Jude
      suggestedTargetHospitalId: 'hosp-003', // Northpoint is closer (3 mins)
      candidates: [
        {
          hospitalId: 'hosp-003',
          code: 'HOSP-C',
          name: 'Northpoint Regional Medical Center',
          role: 'BACKUP_B',
          travelSeconds: 180, // 3 mins!
          receivingDelaySeconds: 60,
          timeToCareSeconds: 240,
          eligible: true,
          limitations: ['Full-care requirements not available here'],
        },
        {
          hospitalId: 'hosp-002',
          code: 'HOSP-B',
          name: 'Bayview Community Hospital',
          role: 'BACKUP_C',
          travelSeconds: 420, // 7 mins
          receivingDelaySeconds: 60,
          timeToCareSeconds: 480,
          eligible: true,
          limitations: ['Full-care requirements not available here'],
        },
      ],
      generatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/diversion-preview')) {
        return Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ preview: mockPreview }),
        });
      }
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({}),
      });
    });

    render(
      <DeteriorationDiversionDialog
        isOpen={true}
        onClose={handleClose}
        caseId="case-101"
        currentDestinationName="St. Jude Trauma Center"
        currentDestinationVersion={1}
        onConfirmDiversion={handleConfirm}
      />
    );

    // Verify current destination ETA rendered
    expect(screen.getByText('St. Jude Trauma Center')).toBeInTheDocument();
    expect(await screen.findByText(/Nearest eligible alternative: Northpoint Regional Medical Center — ~3 min/i)).toBeInTheDocument();

    // Verify both candidates are selectable
    expect(screen.getByText('Northpoint Regional Medical Center')).toBeInTheDocument();
    expect(screen.getByText('Bayview Community Hospital')).toBeInTheDocument();

    // Confirm button shows suggested target
    const confirmBtn = screen.getByRole('button', { name: /Confirm Diversion to Northpoint Regional Medical Center/i });
    expect(confirmBtn).toBeInTheDocument();

    // Click confirm
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(handleConfirm).toHaveBeenCalledWith(
        'hosp-003',
        expect.stringContaining('Acute respiratory decompensation'),
        'prev-test-123'
      );
    });
  });
});
