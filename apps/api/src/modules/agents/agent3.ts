import {
  RecommendationDto,
  CandidateEvaluationDto,
  DestinationReadiness,
} from '@goldenhour/contracts';
import { HospitalEvaluation } from './agent2.js';
import { RoutingProvider } from '../routing/index.js';

// Map hospital IDs to road graph node IDs
const HOSPITAL_NODE_MAP: Record<string, string> = {
  'hosp-001': 'node-hosp-a',
  'hosp-002': 'node-hosp-b',
  'hosp-003': 'node-hosp-c',
  'hosp-004': 'node-hosp-d',
  'hosp-005': 'node-hosp-e',
};

export interface Agent3RankingResult {
  hospitalA: CandidateEvaluationDto | null;
  hospitalB: CandidateEvaluationDto | null;
  hospitalC: CandidateEvaluationDto | null;
  allEvaluations: CandidateEvaluationDto[];
}

/**
 * Agent 3 — Time Calculation & Destination Coordination Ranking
 * Computes road travel estimates over the network graph and calculates time-to-care:
 *
 *   arrival_at = now + route_travel_seconds
 *   care_start_at = max(arrival_at, resource_ready_at) + receiving_delay_seconds
 *   time_to_care_seconds = care_start_at - now
 *
 * Nominates Hospital A for definitive care and B / C for current-position stabilization.
 */
export function runAgent3(
  caseId: string,
  assessmentVersion: number,
  ambulancePosition: { x: number; y: number },
  evaluations: HospitalEvaluation[],
  routing: RoutingProvider,
  trafficOverrides: Record<string, number> = {}
): Agent3RankingResult {
  const fromNode = routing.findClosestNode(ambulancePosition.x, ambulancePosition.y);

  // 1. Compute travel times and time-to-care for each facility
  const candidateScores: {
    evaluation: HospitalEvaluation;
    travelSeconds: number;
    careStartSeconds: number;
    timeToCareSeconds: number;
    reasons: string[];
  }[] = [];

  for (const item of evaluations) {
    const hosp = item.hospital;
    const toNodeId = HOSPITAL_NODE_MAP[hosp.id] || 'node-hosp-a';

    let travelSeconds = 9999;
    try {
      const route = routing.calculateRoute(fromNode.id, toNodeId, trafficOverrides);
      travelSeconds = route.travelSeconds;
    } catch {
      travelSeconds = 9999;
    }

    // Time-to-care calculation
    // readyAt is assumed available immediately (0 delay beyond travel) for initial demo allocations
    const readyAtSeconds = 0;
    const receivingDelaySeconds = hosp.receivingDelaySeconds;
    const careStartSeconds = Math.max(travelSeconds, readyAtSeconds) + receivingDelaySeconds;
    const timeToCareSeconds = careStartSeconds;

    candidateScores.push({
      evaluation: item,
      travelSeconds,
      careStartSeconds,
      timeToCareSeconds,
      reasons: [...item.fullCareReasons],
    });
  }

  // 2. Select Hospital A (Primary Destination)
  // Must be Full-Care eligible, sorted by timeToCareSeconds ascending
  const fullCareCandidates = candidateScores
    .filter((c) => c.evaluation.isFullCareEligible)
    .sort((a, b) => a.timeToCareSeconds - b.timeToCareSeconds || a.evaluation.hospital.id.localeCompare(b.evaluation.hospital.id));

  let hospitalA: CandidateEvaluationDto | null = null;
  if (fullCareCandidates.length > 0) {
    const best = fullCareCandidates[0];
    const hosp = best.evaluation.hospital;
    hospitalA = {
      hospitalId: hosp.id,
      code: hosp.code,
      name: hosp.name,
      role: 'PRIMARY_A',
      eligible: true,
      travelSeconds: best.travelSeconds,
      readyAtSeconds: 0,
      receivingDelaySeconds: hosp.receivingDelaySeconds,
      careStartSeconds: best.careStartSeconds,
      timeToCareSeconds: best.timeToCareSeconds,
      reasons: [
        `Ranked #1 for full definitive care. Estimated care start in ${Math.round(best.timeToCareSeconds / 60)} mins (Road ETA: ${Math.round(best.travelSeconds / 60)}m, Intake delay: ${Math.round(hosp.receivingDelaySeconds / 60)}m).`,
        ...best.evaluation.fullCareReasons,
      ],
      missingCapabilities: [],
      readiness: DestinationReadiness.PENDING,
    };
  }

  // 3. Select Hospitals B and C (Dynamic Stabilization Backups)
  // Must be Stabilization eligible, excluding Hospital A, sorted by proximity/timeToCare from current position
  const selectedAId = hospitalA?.hospitalId;
  const stabilizationCandidates = candidateScores
    .filter((c) => c.evaluation.isStabilizationEligible && c.evaluation.hospital.id !== selectedAId)
    .sort((a, b) => a.timeToCareSeconds - b.timeToCareSeconds || a.evaluation.hospital.id.localeCompare(b.evaluation.hospital.id));

  let hospitalB: CandidateEvaluationDto | null = null;
  if (stabilizationCandidates.length > 0) {
    const bestB = stabilizationCandidates[0];
    const hospB = bestB.evaluation.hospital;
    hospitalB = {
      hospitalId: hospB.id,
      code: hospB.code,
      name: hospB.name,
      role: 'BACKUP_B',
      eligible: true,
      travelSeconds: bestB.travelSeconds,
      readyAtSeconds: 0,
      receivingDelaySeconds: hospB.receivingDelaySeconds,
      careStartSeconds: bestB.careStartSeconds,
      timeToCareSeconds: bestB.timeToCareSeconds,
      reasons: [
        `Closest verified stabilization facility from current ambulance position (~${Math.round(bestB.travelSeconds / 60)} mins).`,
        ...bestB.evaluation.stabilizationReasons,
      ],
      missingCapabilities: bestB.evaluation.missingFullCareCapabilities,
      readiness: DestinationReadiness.PENDING,
    };
  }

  let hospitalC: CandidateEvaluationDto | null = null;
  if (stabilizationCandidates.length > 1) {
    const bestC = stabilizationCandidates[1];
    const hospC = bestC.evaluation.hospital;
    hospitalC = {
      hospitalId: hospC.id,
      code: hospC.code,
      name: hospC.name,
      role: 'BACKUP_C',
      eligible: true,
      travelSeconds: bestC.travelSeconds,
      readyAtSeconds: 0,
      receivingDelaySeconds: hospC.receivingDelaySeconds,
      careStartSeconds: bestC.careStartSeconds,
      timeToCareSeconds: bestC.timeToCareSeconds,
      reasons: [
        `Secondary stabilization backup from current ambulance position (~${Math.round(bestC.travelSeconds / 60)} mins).`,
        ...bestC.evaluation.stabilizationReasons,
      ],
      missingCapabilities: bestC.evaluation.missingFullCareCapabilities,
      readiness: DestinationReadiness.PENDING,
    };
  }

  // 4. Build complete candidate evaluation list for inspector
  const allEvaluations: CandidateEvaluationDto[] = candidateScores.map((score) => {
    const hosp = score.evaluation.hospital;
    const role =
      hosp.id === hospitalA?.hospitalId
        ? 'PRIMARY_A'
        : hosp.id === hospitalB?.hospitalId
        ? 'BACKUP_B'
        : hosp.id === hospitalC?.hospitalId
        ? 'BACKUP_C'
        : 'BACKUP_C';

    return {
      hospitalId: hosp.id,
      code: hosp.code,
      name: hosp.name,
      role,
      eligible: score.evaluation.isFullCareEligible || score.evaluation.isStabilizationEligible,
      travelSeconds: score.travelSeconds,
      readyAtSeconds: 0,
      receivingDelaySeconds: hosp.receivingDelaySeconds,
      careStartSeconds: score.careStartSeconds,
      timeToCareSeconds: score.timeToCareSeconds,
      reasons: score.evaluation.isFullCareEligible
        ? score.evaluation.fullCareReasons
        : score.evaluation.missingFullCareCapabilities.length > 0
        ? [`Ineligible for full care: ${score.evaluation.missingFullCareCapabilities.join(', ')}`]
        : score.reasons,
      missingCapabilities: score.evaluation.missingFullCareCapabilities,
      readiness: DestinationReadiness.PENDING,
    };
  });

  return {
    hospitalA,
    hospitalB,
    hospitalC,
    allEvaluations,
  };
}
