import {
  RecommendationDto,
  CandidateEvaluationDto,
  PriorityCandidateDto,
  RecommendationMode,
  DestinationReadiness,
  SelectedPathway,
  RequiredIntervention,
  CareObjective,
} from '@goldenhour/contracts';
import { HospitalEvaluation } from './agent2.js';
import { RoutingProvider } from '../routing/index.js';
import { CaseRouteSnapshot } from '../routing/snapshot.js';

export interface Agent3RankingResult {
  recommendationMode: RecommendationMode;
  selectedPathway: SelectedPathway;
  priorityCandidates: PriorityCandidateDto[];
  hospitalA: CandidateEvaluationDto | null;
  hospitalB: CandidateEvaluationDto | null;
  hospitalC: CandidateEvaluationDto | null;
  allEvaluations: CandidateEvaluationDto[];
  policyReasonCodes: string[];
  whyChanged?: string;
  onwardTransfer?: {
    status: string;
    destinationHospitalId?: string | null;
    destinationName?: string | null;
    timingConfirmed: boolean;
    message: string;
  };
}

interface ComputedScore {
  evaluation: HospitalEvaluation;
  travelSeconds: number | null;
  serviceReadyAtSeconds: number;
  waitAfterArrivalSeconds: number;
  intakeServiceSeconds: number;
  immediateCareStartSeconds: number | null;
  definitiveCareStartSeconds: number | null;
  careStartSeconds: number | null;
  timeToCareSeconds: number | null;
  roadDistanceMeters: number | null;
  straightLineDistanceMeters: number | null;
  routeStatus: 'AVAILABLE' | 'UNAVAILABLE' | 'PENDING' | 'STALE';
  routingSource: 'SIMULATED_GRAPH' | 'GOOGLE_ROUTES' | 'LIVE_OSRM' | 'FALLBACK_GRAPH';
  limitingReason: string;
}

/**
 * Single Authoritative Candidate Serializer (Stage 6)
 * Emits mathematically consistent DTOs with verified care start and policy reason codes.
 */
function serializeCandidate(
  score: ComputedScore,
  role: 'PRIMARY_A' | 'BACKUP_B' | 'BACKUP_C',
  careObjective: 'FULL_CARE' | 'STABILIZATION',
  rank: number,
  additionalReasons: string[] = [],
  policyReasonCodes: string[] = [],
  onwardDefinitive?: { hospitalId: string; name: string; status: string; note: string } | null
): { evaluation: CandidateEvaluationDto; priority: PriorityCandidateDto } {
  const hosp = score.evaluation.hospital;
  const isAvailable = score.routeStatus === 'AVAILABLE' && score.travelSeconds !== null;
  const travelSec = isAvailable ? score.travelSeconds! : 0;
  const careStartSec = isAvailable ? score.careStartSeconds! : 0;
  const timeToCareSec = isAvailable ? score.timeToCareSeconds! : 0;

  const baseReasons =
    careObjective === 'FULL_CARE'
      ? [
          `Ranked #${rank} for definitive care. Care start: ~${Math.round(timeToCareSec / 60)}m (Road travel: ~${Math.round(travelSec / 60)}m, Wait: ~${Math.round(score.waitAfterArrivalSeconds / 60)}m, Intake: ~${Math.round(score.intakeServiceSeconds / 60)}m).`,
          `Limiting factor: ${score.limitingReason}`,
          ...additionalReasons,
          ...score.evaluation.fullCareReasons,
        ]
      : [
          `Ranked #${rank} for emergency stabilization. Care start: ~${Math.round(timeToCareSec / 60)}m (Road travel: ~${Math.round(travelSec / 60)}m, Intake: ~${Math.round(score.intakeServiceSeconds / 60)}m).`,
          `Limiting factor: ${score.limitingReason}`,
          ...additionalReasons,
          ...score.evaluation.stabilizationReasons,
        ];

  const limitations =
    careObjective === 'STABILIZATION' && score.evaluation.missingFullCareCapabilities.length > 0
      ? [`Full-care requirements not available here: ${score.evaluation.missingFullCareCapabilities.join(', ')}`]
      : [];

  const combinedReasonCodes = Array.from(
    new Set([...policyReasonCodes, ...(score.evaluation.policyReasonCodes || [])])
  );

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
    immediateCareStartSeconds: score.immediateCareStartSeconds ?? undefined,
    definitiveCareStartSeconds: score.definitiveCareStartSeconds ?? null,
    theatreReady: score.evaluation.theatreReady,
    theatreWaitSeconds: score.evaluation.theatreWaitSeconds,
    specialistTeamReady: score.evaluation.specialistTeamReady,
    roadDistanceMeters: score.roadDistanceMeters,
    straightLineDistanceMeters: score.straightLineDistanceMeters,
    routeStatus: score.routeStatus,
    limitingReason: score.limitingReason,
    reasons: baseReasons,
    missingCapabilities:
      careObjective === 'FULL_CARE'
        ? score.evaluation.missingFullCareCapabilities
        : score.evaluation.missingStabilizationCapabilities,
    limitations,
    policyReasonCodes: combinedReasonCodes,
    readiness: DestinationReadiness.PENDING,
    routingSource: score.routingSource,
    onwardDefinitiveDestination: onwardDefinitive
      ? {
          hospitalId: onwardDefinitive.hospitalId,
          name: onwardDefinitive.name,
          status: onwardDefinitive.status,
          estimatedTravelSeconds: null,
          note: onwardDefinitive.note,
        }
      : null,
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
    immediateCareStartSeconds: score.immediateCareStartSeconds ?? undefined,
    definitiveCareStartSeconds: score.definitiveCareStartSeconds ?? null,
    theatreReady: score.evaluation.theatreReady,
    theatreWaitSeconds: score.evaluation.theatreWaitSeconds,
    specialistTeamReady: score.evaluation.specialistTeamReady,
    roadDistanceMeters: score.roadDistanceMeters,
    straightLineDistanceMeters: score.straightLineDistanceMeters,
    routeStatus: score.routeStatus,
    limitingReason: score.limitingReason,
    reasons: baseReasons,
    missingCapabilities: evaluation.missingCapabilities,
    limitations,
    policyReasonCodes: combinedReasonCodes,
    readiness: DestinationReadiness.PENDING,
    routingSource: score.routingSource,
    onwardDefinitiveDestination: evaluation.onwardDefinitiveDestination,
  };

  return { evaluation, priority };
}

/**
 * Agent 3 — Pure Time Calculation & Pathway-Aware Dynamic Ranking (Stage 6)
 *
 * Implements the verified timing model:
 *   arrivalAt = evaluationTime + routeTravelSeconds
 *   serviceStartAt = earliest feasible required-service interval at/after arrivalAt
 *                    + intakeServiceSeconds
 *
 * Pathway Selection:
 *   DIRECT_DEFINITIVE -> Ranks definitive-care eligible candidates by feasible care-start time.
 *   STABILIZE_THEN_TRANSFER -> Ranks immediate-stabilization eligible candidates by feasible immediate care-start time,
 *                              preserving definitive options as separate onward-transfer candidates.
 *   REVIEW_REQUIRED -> Flags review needed without auto-mutating or silently skipping constraints.
 */
export function runAgent3(
  caseId: string,
  assessmentVersion: number,
  ambulancePosition: { lat?: number; lng?: number; x?: number; y?: number },
  evaluations: HospitalEvaluation[],
  routing: RoutingProvider,
  trafficOverrides: Record<string, number> = {},
  routeSnapshot?: CaseRouteSnapshot,
  options?: {
    selectedPathway?: SelectedPathway;
    requiredIntervention?: RequiredIntervention;
    confirmedCareObjective?: CareObjective;
    scenarioId?: string;
  }
): Agent3RankingResult {
  const pathway: SelectedPathway = options?.selectedPathway || 'DIRECT_DEFINITIVE';
  const reqIntervention: RequiredIntervention = options?.requiredIntervention || 'UNKNOWN';

  const candidateScores: ComputedScore[] = [];

  for (const item of evaluations) {
    const hosp = item.hospital;
    let travelSeconds: number | null = null;
    let roadDistanceMeters: number | null = null;
    let straightLineDistanceMeters: number | null = null;
    let routeStatus: 'AVAILABLE' | 'UNAVAILABLE' | 'PENDING' | 'STALE' = 'UNAVAILABLE';
    let routingSource: 'SIMULATED_GRAPH' | 'GOOGLE_ROUTES' | 'LIVE_OSRM' | 'FALLBACK_GRAPH' = 'SIMULATED_GRAPH';
    let limitingReason = (hosp as any).limitingReason || 'Standard facility intake';

    // 1. Resolve route from shared snapshot if available
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

    // 2. Operational Readiness & Intake Derivation
    const intakeServiceSeconds =
      hosp.intakeServiceSeconds !== undefined && hosp.intakeServiceSeconds !== null
        ? hosp.intakeServiceSeconds
        : hosp.receivingDelaySeconds !== undefined && hosp.receivingDelaySeconds !== null
        ? hosp.receivingDelaySeconds
        : 90;

    let serviceReadyAtSeconds = 0;
    const dynamicReady = (hosp as any).serviceReadyAtSeconds;
    if (typeof dynamicReady === 'number') {
      serviceReadyAtSeconds = dynamicReady;
    } else if (dynamicReady && typeof dynamicReady === 'object') {
      if (reqIntervention !== 'UNKNOWN' && typeof dynamicReady[reqIntervention] === 'number') {
        serviceReadyAtSeconds = dynamicReady[reqIntervention];
      } else {
        const readyValues = Object.values(dynamicReady).filter((v): v is number => typeof v === 'number');
        if (readyValues.length > 0) {
          serviceReadyAtSeconds = Math.max(...readyValues);
        }
      }
    } else if (hosp.operationalProfile === 'SPECIALIST_ON_CALL') {
      serviceReadyAtSeconds = 480;
      limitingReason = 'Specialist mobilization time (on-call)';
    } else if (hosp.operationalProfile === 'THEATRE_OCCUPIED') {
      serviceReadyAtSeconds = 900;
      limitingReason = 'Operating theatre occupied / turnover in progress';
    } else if (hosp.operationalProfile === 'BUSY_EMERGENCY_INTAKE') {
      serviceReadyAtSeconds = hosp.queueEstimatedWaitSeconds || 180;
      limitingReason = 'High ED intake queue / triage delay';
    }

    // 3. Strict Time-to-Care Formula per objective
    let waitAfterArrivalSeconds = 0;
    let careStartSeconds: number | null = null;
    let timeToCareSeconds: number | null = null;
    let immediateCareStartSeconds: number | null = null;
    let definitiveCareStartSeconds: number | null = null;

    if (routeStatus === 'AVAILABLE' && travelSeconds !== null) {
      waitAfterArrivalSeconds = Math.max(0, serviceReadyAtSeconds - travelSeconds);
      const startBeforeIntake = Math.max(travelSeconds, serviceReadyAtSeconds);
      careStartSeconds = startBeforeIntake + intakeServiceSeconds;
      timeToCareSeconds = careStartSeconds;

      // Immediate care start (stabilisation)
      const immReady = item.immediateCareReadyAtSeconds ?? 0;
      immediateCareStartSeconds = Math.max(travelSeconds, immReady) + Math.min(intakeServiceSeconds, 60);

      // Definitive care start
      const defReady = item.definitiveCareReadyAtSeconds ?? serviceReadyAtSeconds;
      definitiveCareStartSeconds = Math.max(travelSeconds, defReady) + intakeServiceSeconds;
    }

    candidateScores.push({
      evaluation: item,
      travelSeconds,
      serviceReadyAtSeconds,
      waitAfterArrivalSeconds,
      intakeServiceSeconds,
      immediateCareStartSeconds,
      definitiveCareStartSeconds,
      careStartSeconds,
      timeToCareSeconds,
      roadDistanceMeters,
      straightLineDistanceMeters,
      routeStatus,
      routingSource,
      limitingReason,
    });
  }

  const globalReasonCodes: string[] = [];
  let whyChangedSummary: string | undefined;

  // 4. Branch by Confirmed Pathway (Stage 6)

  // PATHWAY BRANCH 1: STABILIZE_THEN_TRANSFER (Stabilisation first confirmed)
  if (pathway === 'STABILIZE_THEN_TRANSFER') {
    globalReasonCodes.push('STABILIZATION_FIRST_CONFIRMED');

    // Filter candidates meeting immediate stabilization requirements
    const reachableStab = candidateScores
      .filter((c) => c.evaluation.isStabilizationEligible && c.routeStatus === 'AVAILABLE' && c.travelSeconds !== null)
      .sort(
        (a, b) =>
          (a.immediateCareStartSeconds! - b.immediateCareStartSeconds!) ||
          (a.travelSeconds! - b.travelSeconds!) ||
          a.evaluation.hospital.id.localeCompare(b.evaluation.hospital.id)
      );

    // Identify best definitive facility for onward transfer reference
    const reachableDefinitive = candidateScores
      .filter((c) => c.evaluation.isFullCareEligible && c.routeStatus === 'AVAILABLE' && c.definitiveCareStartSeconds !== null)
      .sort((a, b) => a.definitiveCareStartSeconds! - b.definitiveCareStartSeconds!);

    const onwardDefinitive = reachableDefinitive.length > 0 ? reachableDefinitive[0].evaluation.hospital : null;

    if (reachableStab.length > 0) {
      const bestImmediate = reachableStab[0];
      const winSec = bestImmediate.immediateCareStartSeconds!;

      globalReasonCodes.push('EARLIER_REQUIRED_INTERVENTION');
      whyChangedSummary = `Immediate stabilisation at ${bestImmediate.evaluation.hospital.name} is recommended under the confirmed plan (care start ~${Math.round(winSec / 60)}m); definitive treatment remains a separate next step.`;

      // Check if nearest facility was excluded for lacking required immediate care
      const allReachable = [...candidateScores]
        .filter((c) => c.routeStatus === 'AVAILABLE' && c.travelSeconds !== null)
        .sort((a, b) => a.travelSeconds! - b.travelSeconds!);

      if (allReachable.length > 0 && !allReachable[0].evaluation.isStabilizationEligible) {
        globalReasonCodes.push('NEARER_FACILITY_MISSING_REQUIRED_SERVICE');
      }

      const onwardRef = onwardDefinitive
        ? {
            hospitalId: onwardDefinitive.id,
            name: onwardDefinitive.name,
            status: 'PROPOSED_SUBSEQUENT',
            note: 'Onward transfer timing not confirmed.',
          }
        : null;

      const serializedPrimary = serializeCandidate(
        bestImmediate,
        'BACKUP_B', // Rendered in stabilization layout
        'STABILIZATION',
        1,
        [whyChangedSummary],
        ['STABILIZATION_FIRST_CONFIRMED', 'EARLIER_REQUIRED_INTERVENTION'],
        onwardRef
      );

      const priorityCandidates: PriorityCandidateDto[] = [serializedPrimary.priority];

      let hospitalC: CandidateEvaluationDto | null = null;
      if (reachableStab.length > 1) {
        const secondStab = reachableStab[1];
        const serializedSecond = serializeCandidate(
          secondStab,
          'BACKUP_C',
          'STABILIZATION',
          2,
          ['Secondary proximity contingency for stabilization.'],
          ['STABILIZATION_FIRST_CONFIRMED']
        );
        hospitalC = serializedSecond.evaluation;
        priorityCandidates.push(serializedSecond.priority);
      }

      // Populate allEvaluations
      const allEvaluations: CandidateEvaluationDto[] = [];
      for (const score of candidateScores) {
        const isB = serializedPrimary.evaluation.hospitalId === score.evaluation.hospital.id;
        const isC = hospitalC && hospitalC.hospitalId === score.evaluation.hospital.id;
        const role = isB ? 'BACKUP_B' : isC ? 'BACKUP_C' : 'BACKUP_C';
        const obj = score.evaluation.isFullCareEligible ? 'FULL_CARE' : 'STABILIZATION';
        const s = serializeCandidate(score, role, obj, 99);
        allEvaluations.push(s.evaluation);
      }

      return {
        recommendationMode: 'STABILIZATION_ONLY',
        selectedPathway: 'STABILIZE_THEN_TRANSFER',
        priorityCandidates,
        hospitalA: null, // Empty in stabilization-only mode
        hospitalB: serializedPrimary.evaluation,
        hospitalC,
        allEvaluations,
        policyReasonCodes: globalReasonCodes,
        whyChanged: whyChangedSummary,
        onwardTransfer: {
          status: 'PROPOSED_SUBSEQUENT',
          destinationHospitalId: onwardDefinitive?.id ?? null,
          destinationName: onwardDefinitive?.name ?? null,
          timingConfirmed: false,
          message: 'Onward transfer timing not confirmed.',
        },
      };
    } else {
      globalReasonCodes.push('NO_FEASIBLE_CONFIRMED_PATHWAY');
      return {
        recommendationMode: 'NO_ELIGIBLE_DESTINATION',
        selectedPathway: 'STABILIZE_THEN_TRANSFER',
        priorityCandidates: [],
        hospitalA: null,
        hospitalB: null,
        hospitalC: null,
        allEvaluations: candidateScores.map((s) => serializeCandidate(s, 'BACKUP_C', 'STABILIZATION', 99).evaluation),
        policyReasonCodes: globalReasonCodes,
        whyChanged: 'No eligible emergency stabilization destination reachable.',
      };
    }
  }

  // PATHWAY BRANCH 2: DIRECT_DEFINITIVE (Direct definitive care confirmed)
  globalReasonCodes.push('DIRECT_TRANSPORT_CONFIRMED');

  const reachableFullCare = candidateScores
    .filter(
      (c) => c.evaluation.isFullCareEligible && c.routeStatus === 'AVAILABLE' && c.definitiveCareStartSeconds !== null
    )
    .sort(
      (a, b) =>
        (a.definitiveCareStartSeconds! - b.definitiveCareStartSeconds!) ||
        (a.travelSeconds! - b.travelSeconds!) ||
        a.evaluation.hospital.id.localeCompare(b.evaluation.hospital.id)
    );

  if (reachableFullCare.length > 0) {
    const bestDefinitive = reachableFullCare[0];
    const bestHosp = bestDefinitive.evaluation.hospital;
    const bestCareSec = bestDefinitive.definitiveCareStartSeconds!;

    // Inspect other candidates to explain the selection
    const allReachable = [...candidateScores]
      .filter((c) => c.routeStatus === 'AVAILABLE' && c.travelSeconds !== null)
      .sort((a, b) => a.travelSeconds! - b.travelSeconds!);

    const nearerCandidates = allReachable.filter(
      (c) => c.travelSeconds! < bestDefinitive.travelSeconds! && c.evaluation.hospital.id !== bestHosp.id
    );

    const nearerEligibleDelayed = nearerCandidates.find(
      (c) =>
        c.evaluation.isFullCareEligible &&
        (c.evaluation.theatreReady === false || (c.definitiveCareStartSeconds! > bestCareSec))
    );

    const nearerIneligible = nearerCandidates.find(
      (c) => !c.evaluation.isFullCareEligible
    );

    const otherDefinitiveDelayed = reachableFullCare.find(
      (c) => c.evaluation.hospital.id !== bestHosp.id && c.definitiveCareStartSeconds! > bestCareSec
    );

    if (nearerEligibleDelayed) {
      // Case 6: Nearer facility compatible theatre occupied / turnover delayed
      if (nearerEligibleDelayed.evaluation.theatreReady === false) {
        globalReasonCodes.push('THEATRE_NOT_READY_AT_ARRIVAL');
      }
      globalReasonCodes.push('EARLIER_REQUIRED_INTERVENTION');
      whyChangedSummary = `${bestHosp.name} can start care earlier at ~${Math.round(bestCareSec / 60)}m; ${nearerEligibleDelayed.evaluation.hospital.name} is delayed to ~${Math.round(nearerEligibleDelayed.definitiveCareStartSeconds! / 60)}m due to theatre turnover.`;
    } else if (nearerIneligible && (reqIntervention === 'NEUROSURGERY' || reqIntervention === 'CARDIAC_CATH' || !otherDefinitiveDelayed)) {
      // Case 1 & 3: Nearer facility lacks required service (e.g. Neurosurgery)
      globalReasonCodes.push('DEFINITIVE_SERVICE_REQUIRED', 'NEARER_FACILITY_MISSING_REQUIRED_SERVICE');
      whyChangedSummary = `${nearerIneligible.evaluation.hospital.name} is nearer but lacks the confirmed specialist service (${reqIntervention}); direct transport to ${bestHosp.name} is the confirmed pathway.`;
    } else if (otherDefinitiveDelayed) {
      // Case 2: Nearer general facility B won over farther comprehensive facility A on earlier care start
      globalReasonCodes.push('EARLIER_REQUIRED_INTERVENTION');
      whyChangedSummary = `${bestHosp.name} meets the required intervention needs and can start at ~${Math.round(bestCareSec / 60)}m; ${otherDefinitiveDelayed.evaluation.hospital.name} can start at ~${Math.round(otherDefinitiveDelayed.definitiveCareStartSeconds! / 60)}m.`;
    }

    const serializedA = serializeCandidate(
      bestDefinitive,
      'PRIMARY_A',
      'FULL_CARE',
      1,
      whyChangedSummary ? [whyChangedSummary] : [],
      globalReasonCodes
    );

    const priorityCandidates: PriorityCandidateDto[] = [serializedA.priority];

    // Stabilization Backups B & C (distinct from A)
    const reachableStab = candidateScores
      .filter(
        (c) =>
          c.evaluation.isStabilizationEligible &&
          c.evaluation.hospital.id !== bestHosp.id &&
          c.routeStatus === 'AVAILABLE' &&
          c.travelSeconds !== null
      )
      .sort(
        (a, b) =>
          (a.travelSeconds! - b.travelSeconds!) ||
          (a.immediateCareStartSeconds! - b.immediateCareStartSeconds!) ||
          a.evaluation.hospital.id.localeCompare(b.evaluation.hospital.id)
      );

    let hospitalB: CandidateEvaluationDto | null = null;
    let hospitalC: CandidateEvaluationDto | null = null;

    if (reachableStab.length > 0) {
      const bestB = reachableStab[0];
      const serializedB = serializeCandidate(
        bestB,
        'BACKUP_B',
        'STABILIZATION',
        2,
        ['Immediate proximity stabilization contingency.'],
        ['STABILIZATION_FIRST_CONFIRMED']
      );
      hospitalB = serializedB.evaluation;
      priorityCandidates.push(serializedB.priority);
    }

    if (reachableStab.length > 1) {
      const bestC = reachableStab[1];
      const serializedC = serializeCandidate(
        bestC,
        'BACKUP_C',
        'STABILIZATION',
        3,
        ['Secondary proximity stabilization contingency.'],
        ['STABILIZATION_FIRST_CONFIRMED']
      );
      hospitalC = serializedC.evaluation;
      priorityCandidates.push(serializedC.priority);
    }

    const allEvaluations: CandidateEvaluationDto[] = [];
    for (const score of candidateScores) {
      const isA = serializedA.evaluation.hospitalId === score.evaluation.hospital.id;
      const isB = hospitalB && hospitalB.hospitalId === score.evaluation.hospital.id;
      const isC = hospitalC && hospitalC.hospitalId === score.evaluation.hospital.id;
      const role = isA ? 'PRIMARY_A' : isB ? 'BACKUP_B' : isC ? 'BACKUP_C' : 'BACKUP_C';
      const obj = score.evaluation.isFullCareEligible ? 'FULL_CARE' : 'STABILIZATION';
      const s = serializeCandidate(score, role, obj, 99);
      allEvaluations.push(s.evaluation);
    }

    return {
      recommendationMode: 'FULL_CARE_AVAILABLE',
      selectedPathway: 'DIRECT_DEFINITIVE',
      priorityCandidates,
      hospitalA: serializedA.evaluation,
      hospitalB,
      hospitalC,
      allEvaluations,
      policyReasonCodes: globalReasonCodes,
      whyChanged: whyChangedSummary,
    };
  } else {
    // No full-care facility reachable: fallback to stabilization only
    globalReasonCodes.push('NO_FEASIBLE_CONFIRMED_PATHWAY');

    const reachableStab = candidateScores
      .filter((c) => c.evaluation.isStabilizationEligible && c.routeStatus === 'AVAILABLE' && c.travelSeconds !== null)
      .sort((a, b) => (a.travelSeconds! - b.travelSeconds!) || a.evaluation.hospital.id.localeCompare(b.evaluation.hospital.id));

    if (reachableStab.length > 0) {
      const bestB = reachableStab[0];
      const serializedB = serializeCandidate(bestB, 'BACKUP_B', 'STABILIZATION', 1);
      const priorityCandidates: PriorityCandidateDto[] = [serializedB.priority];
      let hospitalC: CandidateEvaluationDto | null = null;

      if (reachableStab.length > 1) {
        const bestC = reachableStab[1];
        const serializedC = serializeCandidate(bestC, 'BACKUP_C', 'STABILIZATION', 2);
        hospitalC = serializedC.evaluation;
        priorityCandidates.push(serializedC.priority);
      }

      return {
        recommendationMode: 'STABILIZATION_ONLY',
        selectedPathway: 'DIRECT_DEFINITIVE',
        priorityCandidates,
        hospitalA: null,
        hospitalB: serializedB.evaluation,
        hospitalC,
        allEvaluations: candidateScores.map((s) => serializeCandidate(s, 'BACKUP_C', 'STABILIZATION', 99).evaluation),
        policyReasonCodes: globalReasonCodes,
        whyChanged: 'No definitive-care facility reachable; emergency stabilization destinations ranked.',
      };
    }

    return {
      recommendationMode: 'NO_ELIGIBLE_DESTINATION',
      selectedPathway: 'DIRECT_DEFINITIVE',
      priorityCandidates: [],
      hospitalA: null,
      hospitalB: null,
      hospitalC: null,
      allEvaluations: candidateScores.map((s) => serializeCandidate(s, 'BACKUP_C', 'STABILIZATION', 99).evaluation),
      policyReasonCodes: globalReasonCodes,
      whyChanged: 'No eligible hospital reachable under current road and operating conditions.',
    };
  }
}
