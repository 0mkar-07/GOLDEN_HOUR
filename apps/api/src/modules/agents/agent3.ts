import {
  RecommendationDto,
  CandidateEvaluationDto,
  PriorityCandidateDto,
  RecommendationMode,
  DestinationReadiness,
} from '@goldenhour/contracts';
import { HospitalEvaluation } from './agent2.js';
import { RoutingProvider } from '../routing/index.js';
import { CaseRouteSnapshot } from '../routing/snapshot.js';

export interface Agent3RankingResult {
  recommendationMode: RecommendationMode;
  priorityCandidates: PriorityCandidateDto[];
  hospitalA: CandidateEvaluationDto | null;
  hospitalB: CandidateEvaluationDto | null;
  hospitalC: CandidateEvaluationDto | null;
  allEvaluations: CandidateEvaluationDto[];
}

interface ComputedScore {
  evaluation: HospitalEvaluation;
  travelSeconds: number | null;
  serviceReadyAtSeconds: number;
  waitAfterArrivalSeconds: number;
  intakeServiceSeconds: number;
  careStartSeconds: number | null;
  timeToCareSeconds: number | null;
  roadDistanceMeters: number | null;
  straightLineDistanceMeters: number | null;
  routeStatus: 'AVAILABLE' | 'UNAVAILABLE' | 'PENDING' | 'STALE';
  routingSource: 'SIMULATED_GRAPH' | 'GOOGLE_ROUTES' | 'LIVE_OSRM' | 'FALLBACK_GRAPH';
  limitingReason: string;
}

/**
 * Stage 4: Single Authoritative Candidate Serializer
 * Emits mathematically consistent DTOs where:
 *   careStartSeconds = max(travelSeconds, readyAtSeconds) + receivingDelaySeconds
 *   waitAfterArrivalSeconds = max(0, readyAtSeconds - travelSeconds)
 */
function serializeCandidate(
  score: ComputedScore,
  role: 'PRIMARY_A' | 'BACKUP_B' | 'BACKUP_C',
  careObjective: 'FULL_CARE' | 'STABILIZATION',
  rank: number
): { evaluation: CandidateEvaluationDto; priority: PriorityCandidateDto } {
  const hosp = score.evaluation.hospital;
  const isAvailable = score.routeStatus === 'AVAILABLE' && score.travelSeconds !== null;
  const travelSec = isAvailable ? score.travelSeconds! : 0;
  const careStartSec = isAvailable ? score.careStartSeconds! : 0;
  const timeToCareSec = isAvailable ? score.timeToCareSeconds! : 0;

  const reasons = careObjective === 'FULL_CARE'
    ? [
        `Ranked #${rank} for definitive care. Care start: ~${Math.round(timeToCareSec / 60)}m (Road travel: ~${Math.round(travelSec / 60)}m, Wait: ~${Math.round(score.waitAfterArrivalSeconds / 60)}m, Intake: ~${Math.round(score.intakeServiceSeconds / 60)}m).`,
        `Limiting factor: ${score.limitingReason}`,
        ...score.evaluation.fullCareReasons,
      ]
    : [
        `Ranked #${rank} for emergency stabilization. Care start: ~${Math.round(timeToCareSec / 60)}m (Road travel: ~${Math.round(travelSec / 60)}m, Intake: ~${Math.round(score.intakeServiceSeconds / 60)}m).`,
        `Limiting factor: ${score.limitingReason}`,
        ...score.evaluation.stabilizationReasons,
      ];

  const limitations = careObjective === 'STABILIZATION' && score.evaluation.missingFullCareCapabilities.length > 0
    ? [`Full-care requirements not available here: ${score.evaluation.missingFullCareCapabilities.join(', ')}`]
    : [];

  const evaluation: CandidateEvaluationDto = {
    hospitalId: hosp.id,
    code: hosp.code,
    name: hosp.name,
    role,
    eligible: careObjective === 'FULL_CARE' ? score.evaluation.isFullCareEligible : score.evaluation.isStabilizationEligible,
    fullCareEligible: score.evaluation.isFullCareEligible,
    stabilizationEligible: score.evaluation.isStabilizationEligible,
    careObjective,
    travelSeconds: travelSec,
    readyAtSeconds: score.serviceReadyAtSeconds,
    waitAfterArrivalSeconds: score.waitAfterArrivalSeconds,
    receivingDelaySeconds: score.intakeServiceSeconds,
    careStartSeconds: careStartSec,
    timeToCareSeconds: timeToCareSec,
    roadDistanceMeters: score.roadDistanceMeters,
    straightLineDistanceMeters: score.straightLineDistanceMeters,
    routeStatus: score.routeStatus,
    limitingReason: score.limitingReason,
    reasons,
    missingCapabilities: careObjective === 'FULL_CARE'
      ? score.evaluation.missingFullCareCapabilities
      : score.evaluation.missingStabilizationCapabilities,
    limitations,
    readiness: DestinationReadiness.PENDING,
    routingSource: score.routingSource,
  };

  const priority: PriorityCandidateDto = {
    hospitalId: hosp.id,
    code: hosp.code,
    name: hosp.name,
    priorityRank: rank,
    careObjective,
    eligible: evaluation.eligible,
    fullCareEligible: score.evaluation.isFullCareEligible,
    stabilizationEligible: score.evaluation.isStabilizationEligible,
    travelSeconds: travelSec,
    readyAtSeconds: score.serviceReadyAtSeconds,
    waitAfterArrivalSeconds: score.waitAfterArrivalSeconds,
    receivingDelaySeconds: score.intakeServiceSeconds,
    careStartSeconds: careStartSec,
    timeToCareSeconds: timeToCareSec,
    roadDistanceMeters: score.roadDistanceMeters,
    straightLineDistanceMeters: score.straightLineDistanceMeters,
    routeStatus: score.routeStatus,
    limitingReason: score.limitingReason,
    reasons,
    missingCapabilities: evaluation.missingCapabilities,
    limitations,
    readiness: DestinationReadiness.PENDING,
    routingSource: score.routingSource,
  };

  return { evaluation, priority };
}

/**
 * Agent 3 — Pure Time Calculation & Destination Coordination Ranking (Stage 4)
 *
 * Implements the verified time-to-care formula:
 *   arrivalAt = t0 + travelSeconds
 *   serviceReadyAt = earliest joint usable time for required staff/resources
 *   waitAfterArrival = max(0, serviceReadyAt - travelSeconds)
 *   startBeforeIntake = max(travelSeconds, serviceReadyAt)
 *   careStartSeconds = startBeforeIntake + intakeServiceSeconds
 *   timeToCareSeconds = careStartSeconds
 *
 * Uses the shared route snapshot (Stage 2) so map polylines and cards are 100% synchronized.
 */
export function runAgent3(
  caseId: string,
  assessmentVersion: number,
  ambulancePosition: { lat?: number; lng?: number; x?: number; y?: number },
  evaluations: HospitalEvaluation[],
  routing: RoutingProvider,
  trafficOverrides: Record<string, number> = {},
  routeSnapshot?: CaseRouteSnapshot
): Agent3RankingResult {
  const candidateScores: ComputedScore[] = [];

  for (const item of evaluations) {
    const hosp = item.hospital;
    let travelSeconds: number | null = null;
    let roadDistanceMeters: number | null = null;
    let straightLineDistanceMeters: number | null = null;
    let routeStatus: 'AVAILABLE' | 'UNAVAILABLE' | 'PENDING' | 'STALE' = 'UNAVAILABLE';
    let routingSource: 'SIMULATED_GRAPH' | 'GOOGLE_ROUTES' | 'LIVE_OSRM' | 'FALLBACK_GRAPH' = 'SIMULATED_GRAPH';
    let limitingReason = (hosp as any).limitingReason || 'Standard facility intake';

    // 1. Resolve route from shared snapshot if available (Stage 2)
    if (routeSnapshot && routeSnapshot.routes[hosp.id]) {
      const r = routeSnapshot.routes[hosp.id];
      if (r.status === 'AVAILABLE') {
        travelSeconds = r.durationSeconds;
        roadDistanceMeters = r.distanceMeters;
        straightLineDistanceMeters = r.straightLineDistanceMeters ?? null;
        routingSource = r.routingSource;
        routeStatus = 'AVAILABLE';
      } else {
        routeStatus = 'UNAVAILABLE';
        limitingReason = r.unavailabilityReason || 'No drivable road route found';
      }
    } else {
      // Fallback: Graph-based route calculation
      try {
        const fromNode = routing.findClosestNode(ambulancePosition.x ?? 120, ambulancePosition.y ?? 150);
        const toNode = routing.findClosestNode(hosp.location.x, hosp.location.y);
        const graphRoute = routing.calculateRoute(fromNode.id, toNode.id, trafficOverrides);
        travelSeconds = graphRoute.travelSeconds;
        roadDistanceMeters = graphRoute.totalDistanceMeters;
        routingSource = graphRoute.routingSource;
        routeStatus = 'AVAILABLE';
      } catch (err: any) {
        routeStatus = 'UNAVAILABLE';
        limitingReason = err.message || 'No graph route found';
      }
    }

    // 2. Operational Readiness & Intake Derivation (Stage 3 & 4)
    // Preserve valid zero intake without coercing via || 120 (ETA-04)
    const intakeServiceSeconds =
      hosp.intakeServiceSeconds !== undefined && hosp.intakeServiceSeconds !== null
        ? hosp.intakeServiceSeconds
        : (hosp.receivingDelaySeconds !== undefined && hosp.receivingDelaySeconds !== null
            ? hosp.receivingDelaySeconds
            : 90);

    // Derive service readiness offset (seconds relative to t0)
    let serviceReadyAtSeconds = 0;
    const dynamicReady = (hosp as any).serviceReadyAtSeconds;
    if (typeof dynamicReady === 'number') {
      serviceReadyAtSeconds = dynamicReady;
    } else if (dynamicReady && typeof dynamicReady === 'object') {
      const readyValues = Object.values(dynamicReady).filter((v): v is number => typeof v === 'number');
      if (readyValues.length > 0) {
        serviceReadyAtSeconds = Math.max(...readyValues);
      }
    } else if (hosp.operationalProfile === 'SPECIALIST_ON_CALL') {
      serviceReadyAtSeconds = 480; // 8 minutes on-call team arrival
      limitingReason = 'Specialist mobilization time (on-call)';
    } else if (hosp.operationalProfile === 'THEATRE_OCCUPIED') {
      serviceReadyAtSeconds = 900; // 15 minutes OR turnover
      limitingReason = 'Operating theatre occupied / turnover in progress';
    } else if (hosp.operationalProfile === 'BUSY_EMERGENCY_INTAKE') {
      serviceReadyAtSeconds = hosp.queueEstimatedWaitSeconds || 180;
      limitingReason = 'High ED intake queue / triage delay';
    }

    // 3. Strict Time-to-Care Formula (Stage 4)
    let waitAfterArrivalSeconds = 0;
    let careStartSeconds: number | null = null;
    let timeToCareSeconds: number | null = null;

    if (routeStatus === 'AVAILABLE' && travelSeconds !== null) {
      waitAfterArrivalSeconds = Math.max(0, serviceReadyAtSeconds - travelSeconds);
      const startBeforeIntake = Math.max(travelSeconds, serviceReadyAtSeconds);
      careStartSeconds = startBeforeIntake + intakeServiceSeconds;
      timeToCareSeconds = careStartSeconds;
    }

    candidateScores.push({
      evaluation: item,
      travelSeconds,
      serviceReadyAtSeconds,
      waitAfterArrivalSeconds,
      intakeServiceSeconds,
      careStartSeconds,
      timeToCareSeconds,
      roadDistanceMeters,
      straightLineDistanceMeters,
      routeStatus,
      routingSource,
      limitingReason,
    });
  }

  // 4. Filter Reachable Full-Care Candidates (exclude unavailable routes)
  const reachableFullCare = candidateScores.filter(
    (c) => c.evaluation.isFullCareEligible && c.routeStatus === 'AVAILABLE' && c.timeToCareSeconds !== null
  );

  let recommendationMode: RecommendationMode = 'FULL_CARE_AVAILABLE';
  let hospitalA: CandidateEvaluationDto | null = null;
  let hospitalB: CandidateEvaluationDto | null = null;
  let hospitalC: CandidateEvaluationDto | null = null;
  const priorityCandidates: PriorityCandidateDto[] = [];
  const allEvaluations: CandidateEvaluationDto[] = [];

  if (reachableFullCare.length > 0) {
    // Sort primarily by timeToCareSeconds ascending, then deterministic canonical ID
    reachableFullCare.sort(
      (a, b) =>
        (a.timeToCareSeconds! - b.timeToCareSeconds!) ||
        a.evaluation.hospital.id.localeCompare(b.evaluation.hospital.id)
    );

    const bestA = reachableFullCare[0];
    const serializedA = serializeCandidate(bestA, 'PRIMARY_A', 'FULL_CARE', 1);
    hospitalA = serializedA.evaluation;
    priorityCandidates.push(serializedA.priority);

    // Stabilization Backups B & C (distinct from A)
    const reachableStab = candidateScores
      .filter(
        (c) =>
          c.evaluation.isStabilizationEligible &&
          c.evaluation.hospital.id !== bestA.evaluation.hospital.id &&
          c.routeStatus === 'AVAILABLE' &&
          c.travelSeconds !== null
      )
      .sort(
        (a, b) =>
          (a.travelSeconds! - b.travelSeconds!) ||
          (a.timeToCareSeconds! - b.timeToCareSeconds!) ||
          a.evaluation.hospital.id.localeCompare(b.evaluation.hospital.id)
      );

    if (reachableStab.length > 0) {
      const bestB = reachableStab[0];
      const serializedB = serializeCandidate(bestB, 'BACKUP_B', 'STABILIZATION', 2);
      hospitalB = serializedB.evaluation;
      priorityCandidates.push(serializedB.priority);
    }

    if (reachableStab.length > 1) {
      const bestC = reachableStab[1];
      const serializedC = serializeCandidate(bestC, 'BACKUP_C', 'STABILIZATION', 3);
      hospitalC = serializedC.evaluation;
      priorityCandidates.push(serializedC.priority);
    }
  } else {
    // NO FULL-CARE FACILITY REACHABLE: Switch to STABILIZATION_ONLY
    const reachableStab = candidateScores
      .filter((c) => c.evaluation.isStabilizationEligible && c.routeStatus === 'AVAILABLE' && c.travelSeconds !== null)
      .sort(
        (a, b) =>
          (a.travelSeconds! - b.travelSeconds!) ||
          (a.timeToCareSeconds! - b.timeToCareSeconds!) ||
          a.evaluation.hospital.id.localeCompare(b.evaluation.hospital.id)
      );

    if (reachableStab.length > 0) {
      recommendationMode = 'STABILIZATION_ONLY';
      hospitalA = null;

      const bestB = reachableStab[0];
      const serializedB = serializeCandidate(bestB, 'BACKUP_B', 'STABILIZATION', 1);
      hospitalB = serializedB.evaluation;
      priorityCandidates.push(serializedB.priority);

      if (reachableStab.length > 1) {
        const bestC = reachableStab[1];
        const serializedC = serializeCandidate(bestC, 'BACKUP_C', 'STABILIZATION', 2);
        hospitalC = serializedC.evaluation;
        priorityCandidates.push(serializedC.priority);
      }
    } else {
      recommendationMode = 'NO_ELIGIBLE_DESTINATION';
      hospitalA = null;
      hospitalB = null;
      hospitalC = null;
    }
  }

  // Populate allEvaluations for audit and comparison table
  for (const score of candidateScores) {
    const isA = hospitalA && hospitalA.hospitalId === score.evaluation.hospital.id;
    const isB = hospitalB && hospitalB.hospitalId === score.evaluation.hospital.id;
    const isC = hospitalC && hospitalC.hospitalId === score.evaluation.hospital.id;
    const role = isA ? 'PRIMARY_A' : isB ? 'BACKUP_B' : isC ? 'BACKUP_C' : 'BACKUP_C';
    const obj = score.evaluation.isFullCareEligible ? 'FULL_CARE' : 'STABILIZATION';
    const s = serializeCandidate(score, role, obj, 99);
    allEvaluations.push(s.evaluation);
  }

  return {
    recommendationMode,
    priorityCandidates,
    hospitalA,
    hospitalB,
    hospitalC,
    allEvaluations,
  };
}
