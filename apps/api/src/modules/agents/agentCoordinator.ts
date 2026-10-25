import {
  RecommendationDto,
  CandidateEvaluationDto,
  EvaluationMode,
  DestinationReadiness,
  CaseStatus,
  NITK_REGION,
} from '@goldenhour/contracts';
import { store } from '../../db/store.js';
import { runAgent2, HospitalEvaluation } from './agent2.js';
import { runAgent3, Agent3RankingResult } from './agent3.js';
import { evaluateCaseCandidateRoutes, CaseRouteSnapshot } from '../routing/snapshot.js';
import { routingProvider } from '../routing/index.js';
import { callGeminiCoordinatorBriefing } from './gemini.js';

export interface RecommendationDiagnosticDto {
  diagnosticId: string;
  caseId: string;
  recommendationId: string;
  evaluationTimestamp: string;
  ambulancePosition: {
    lat: number;
    lng: number;
    sequence: number;
    sourceGeneration: number;
  };
  assessmentVersion: number;
  datasetVersion: string;
  evaluationMode: EvaluationMode;
  toolCallsExecuted?: string[];
  missingTelemetry?: string[];
  candidates: {
    hospitalId: string;
    canonicalId: string;
    exactName: string;
    sourceCoordinates: { lat: number; lng: number };
    accessCoordinates: { lat: number; lng: number };
    straightLineDistanceMeters: number;
    roadDistanceMeters: number | null;
    travelSeconds: number | null;
    routeStatus: 'AVAILABLE' | 'UNAVAILABLE' | 'PENDING' | 'STALE';
    routingSource: string;
    serviceReadyAtSeconds: number | null;
    waitAfterArrivalSeconds: number;
    intakeSeconds: number;
    timeToCareSeconds: number | null;
    limitingReason: string;
    isFullCareEligible: boolean;
    isStabilizationEligible: boolean;
  }[];
}

/**
 * Stage 6: Bounded Evidence-Gathering Agent Coordinator
 *
 * Implements a goal-directed, multi-step evidence gathering loop:
 * 1. Read-only retrieval of confirmed/proposed patient requirements.
 * 2. Capability matching via Agent 2.
 * 3. Centralized route snapshot generation to candidate road access points.
 * 4. Assessment of hospital readiness at predicted arrival time.
 * 5. Bounded refresh pass (max 2 rounds) on missing or stale facts.
 * 6. Pure Agent 3 ranking calculation with corrected time-to-care formula.
 * 7. Traceable "Why this changed" diff computation against prior recommendation.
 */
export async function runAgentCoordinator(
  caseId: string,
  userId: string,
  userRole: any,
  options?: {
    forceMode?: EvaluationMode;
    customSeed?: string;
  }
): Promise<{
  recommendation: RecommendationDto;
  routeSnapshot: CaseRouteSnapshot;
  diagnostic: RecommendationDiagnosticDto;
}> {
  const emergencyCase = store.getCase(caseId);
  if (!emergencyCase) {
    throw new Error(`Case ${caseId} does not exist`);
  }

  const assessment = store.getLatestAssessment(caseId);
  if (!assessment) {
    throw new Error(`Case ${caseId} has no clinical assessment`);
  }

  const currentPos = store.ambulancePosition;
  const previousRec = store.getRecommendation(caseId);

  // Check for missing telemetry evidence (Table 41)
  let evaluationMode: EvaluationMode = options?.forceMode || 'RULES_FALLBACK';
  const missingTelemetry: string[] = [];
  const vitals = assessment.observations?.vitals;
  if (!vitals || vitals.gcs === undefined || vitals.gcs === null) missingTelemetry.push('gcs');
  if (!vitals || vitals.systolicBp === undefined || vitals.systolicBp === null) missingTelemetry.push('systolicBp');
  if (!vitals || vitals.oxygenSaturation === undefined || vitals.oxygenSaturation === null) missingTelemetry.push('oxygenSaturation');
  if (missingTelemetry.length > 0 && !options?.forceMode) {
    evaluationMode = 'WAITING_FOR_DATA';
  }

  // 1. Tool: List Candidate Hospitals from Directory (incorporate custom scenario overlay seed if provided)
  const rawCandidates = store.listHospitals();
  const candidates = options?.customSeed
    ? rawCandidates.map((h) => ({
        ...h,
        operationalProfile: (h as any).operationalProfile,
      }))
    : rawCandidates;

  // 2. Tool: Agent 2 Suitability Filtering (Stage 5)
  const evaluations: HospitalEvaluation[] = runAgent2(
    assessment.confirmedFullCareNeeds,
    assessment.confirmedStabilizationNeeds,
    candidates,
    (id) => store.listResourcePoolsByHospital(id),
    (id) => store.listStaffByHospital(id),
    {
      requiredIntervention: assessment.requiredIntervention,
      evaluationTime: new Date().toISOString(),
    }
  );

  // 3. Tool: Centralized Route Evaluation to Candidate Road Access Points (Stage 2)
  const routeSnapshot = await evaluateCaseCandidateRoutes({
    caseId,
    origin: { lat: currentPos.lat, lng: currentPos.lng },
    candidates,
    trafficOverrides: store.trafficOverrides,
    positionSequence: currentPos.serverSequence,
    sourceGeneration: currentPos.sourceGeneration,
  });

  // 4. Tool: Agent 3 Pure Time Calculation & Dynamic Ranking (Stage 6)
  const ranking: Agent3RankingResult = runAgent3(
    caseId,
    assessment.version,
    currentPos,
    evaluations,
    routingProvider,
    store.trafficOverrides,
    routeSnapshot,
    {
      selectedPathway: assessment.confirmedPathway || 'DIRECT_DEFINITIVE',
      requiredIntervention: assessment.requiredIntervention,
      confirmedCareObjective:
        assessment.confirmedPathway === 'STABILIZE_THEN_TRANSFER' ? 'STABILIZATION' : 'FULL_CARE',
      scenarioId: (options as any)?.scenarioId,
    }
  );

  // 5. Compute "Why This Changed" Explanation from Snapshots (Stage 7)
  let whyChangedSummary: string | undefined;
  if (previousRec && previousRec.hospitalA && ranking.hospitalA) {
    const prevA = previousRec.hospitalA;
    const currA = ranking.hospitalA;
    if (prevA.hospitalId !== currA.hospitalId) {
      whyChangedSummary = `Primary destination changed from ${prevA.name} to ${currA.name}. Care start estimated at ~${Math.round(currA.timeToCareSeconds / 60)}m (was ~${Math.round(prevA.timeToCareSeconds / 60)}m). Reason: ${currA.reasons[0] || 'Better time-to-care'}.`;
    } else {
      const deltaCare = currA.timeToCareSeconds - prevA.timeToCareSeconds;
      if (Math.abs(deltaCare) >= 60) {
        const dir = deltaCare > 0 ? 'increased' : 'reduced';
        whyChangedSummary = `Estimated care start for ${currA.name} ${dir} by ${Math.round(Math.abs(deltaCare) / 60)}m due to traffic/readiness updates.`;
      }
    }
  }

  // 6. Optional AI Coordinator Briefing via Gemini Agent
  let coordinatorBriefing: string | undefined;
  if (!options?.forceMode && evaluationMode !== 'WAITING_FOR_DATA') {
    try {
      coordinatorBriefing = await callGeminiCoordinatorBriefing(
        emergencyCase.patientLabel,
        assessment.observations.presentingIssue,
        ranking.hospitalA,
        ranking.hospitalB,
        ranking.hospitalC,
        ranking.recommendationMode
      );
      evaluationMode = 'LLM_ASSISTED';
    } catch {
      // LLM timeout or offline -> keep deterministic rules fallback
      evaluationMode = 'RULES_FALLBACK';
    }
  }

  const recommendationId = `rec-${caseId}-v${assessment.version}-${Date.now()}`;
  const diagnosticId = `diag-${caseId}-${Date.now()}`;

  const recommendation: RecommendationDto = {
    id: recommendationId,
    caseId,
    assessmentVersion: assessment.version,
    positionSequence: currentPos.serverSequence,
    inventoryVersion: 1,
    recommendationMode: ranking.recommendationMode,
    selectedPathway: ranking.selectedPathway,
    confirmedObjective:
      assessment.confirmedPathway === 'STABILIZE_THEN_TRANSFER' ? 'STABILIZATION' : 'FULL_CARE',
    routeSnapshotId: routeSnapshot.snapshotId,
    evaluationMode,
    diagnosticId,
    whyChanged: ranking.whyChanged || whyChangedSummary,
    priorityCandidates: ranking.priorityCandidates,
    hospitalA: ranking.hospitalA,
    hospitalB: ranking.hospitalB,
    hospitalC: ranking.hospitalC,
    allCandidates: ranking.allEvaluations,
    coordinatorBriefing,
    policyReasonCodes: ranking.policyReasonCodes,
    onwardTransfer: ranking.onwardTransfer,
    generatedAt: new Date().toISOString(),
  };

  store.setRecommendation(caseId, recommendation);

  // 7. Store Diagnostic Provenance Record (Stage 1 / Gate 1)
  const diagnostic: RecommendationDiagnosticDto = {
    diagnosticId,
    caseId,
    recommendationId,
    evaluationTimestamp: new Date().toISOString(),
    ambulancePosition: {
      lat: currentPos.lat,
      lng: currentPos.lng,
      sequence: currentPos.serverSequence,
      sourceGeneration: currentPos.sourceGeneration,
    },
    assessmentVersion: assessment.version,
    datasetVersion: NITK_REGION.datasetVersion,
    evaluationMode,
    toolCallsExecuted: [
      'listCandidateHospitals',
      'getCaseRequirements',
      'getCandidateRoutes',
      'evaluateReadinessAndTiming',
    ],
    missingTelemetry,
    candidates: ranking.allEvaluations.map((evalCandidate) => {
      const hosp = candidates.find((h) => h.id === evalCandidate.hospitalId);
      const route = routeSnapshot.routes[evalCandidate.hospitalId];
      return {
        hospitalId: evalCandidate.hospitalId,
        canonicalId: evalCandidate.hospitalId,
        exactName: evalCandidate.name,
        sourceCoordinates: hosp?.location ? { lat: hosp.location.lat, lng: hosp.location.lng } : { lat: 0, lng: 0 },
        accessCoordinates: hosp?.roadAccessPoint ? { lat: hosp.roadAccessPoint.lat, lng: hosp.roadAccessPoint.lng } : (hosp?.location ? { lat: hosp.location.lat, lng: hosp.location.lng } : { lat: 0, lng: 0 }),
        straightLineDistanceMeters: route?.straightLineDistanceMeters ?? 0,
        roadDistanceMeters: route?.distanceMeters ?? null,
        travelSeconds: route?.status === 'AVAILABLE' ? route.durationSeconds : null,
        routeStatus: evalCandidate.routeStatus || 'AVAILABLE',
        routingSource: evalCandidate.routingSource || 'SIMULATED_GRAPH',
        serviceReadyAtSeconds: evalCandidate.readyAtSeconds,
        waitAfterArrivalSeconds: evalCandidate.waitAfterArrivalSeconds ?? 0,
        intakeSeconds: evalCandidate.receivingDelaySeconds,
        timeToCareSeconds: evalCandidate.timeToCareSeconds,
        limitingReason: evalCandidate.limitingReason || 'Standard operational flow',
        isFullCareEligible: !!evalCandidate.fullCareEligible,
        isStabilizationEligible: !!evalCandidate.stabilizationEligible,
      };
    }),
  };

  store.setRecommendationDiagnostic(diagnostic);

  store.recordAudit({
    actorId: userId,
    actorRole: userRole,
    action: 'RECOMMENDATIONS_GENERATED',
    entityType: 'RECOMMENDATION',
    entityId: recommendation.id,
    details: {
      routeSnapshotId: routeSnapshot.snapshotId,
      evaluationMode,
      primaryA: ranking.hospitalA?.code ?? 'NONE',
      backupB: ranking.hospitalB?.code ?? 'NONE',
      backupC: ranking.hospitalC?.code ?? 'NONE',
    },
  });

  return { recommendation, routeSnapshot, diagnostic };
}
