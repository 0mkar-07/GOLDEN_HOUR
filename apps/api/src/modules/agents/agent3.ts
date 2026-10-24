import {
  RecommendationDto,
  CandidateEvaluationDto,
  PriorityCandidateDto,
  RecommendationMode,
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
  recommendationMode: RecommendationMode;
  priorityCandidates: PriorityCandidateDto[];
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
 * Evaluates full-care destination (A) and dynamic stabilization backups (B / C).
 * If no hospital meets full-care requirements, switches to STABILIZATION_ONLY mode,
 * removes the empty A slot, and ranks eligible stabilization options by road ETA.
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
    routingSource: 'SIMULATED_GRAPH' | 'GOOGLE_ROUTES' | 'LIVE_OSRM' | 'FALLBACK_GRAPH';
  }[] = [];

  for (const item of evaluations) {
    const hosp = item.hospital;
    const toNodeId = HOSPITAL_NODE_MAP[hosp.id] || 'node-hosp-a';

    let travelSeconds = 9999;
    let routingSource: 'SIMULATED_GRAPH' | 'GOOGLE_ROUTES' | 'LIVE_OSRM' | 'FALLBACK_GRAPH' = 'SIMULATED_GRAPH';
    try {
      const route = routing.calculateRoute(fromNode.id, toNodeId, trafficOverrides);
      travelSeconds = route.travelSeconds;
      routingSource = route.routingSource ?? 'SIMULATED_GRAPH';
    } catch {
      travelSeconds = 9999;
    }

    // Time-to-care calculation
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
      routingSource,
    });
  }

  // 2. Filter reachable candidates (exclude unavailable routes >= 9999s)
  const reachableFullCare = candidateScores.filter(
    (c) => c.evaluation.isFullCareEligible && c.travelSeconds < 9999
  );

  let recommendationMode: RecommendationMode = 'FULL_CARE_AVAILABLE';
  let hospitalA: CandidateEvaluationDto | null = null;
  let hospitalB: CandidateEvaluationDto | null = null;
  let hospitalC: CandidateEvaluationDto | null = null;
  const priorityCandidates: PriorityCandidateDto[] = [];

  if (reachableFullCare.length > 0) {
    // FULL-CARE AVAILABLE: Sort primarily by timeToCareSeconds ascending
    reachableFullCare.sort(
      (a, b) =>
        a.timeToCareSeconds - b.timeToCareSeconds ||
        a.evaluation.hospital.id.localeCompare(b.evaluation.hospital.id)
    );

    const bestA = reachableFullCare[0];
    const hospA = bestA.evaluation.hospital;
    hospitalA = {
      hospitalId: hospA.id,
      code: hospA.code,
      name: hospA.name,
      role: 'PRIMARY_A',
      eligible: true,
      fullCareEligible: true,
      stabilizationEligible: true,
      careObjective: 'FULL_CARE',
      travelSeconds: bestA.travelSeconds,
      readyAtSeconds: 0,
      receivingDelaySeconds: hospA.receivingDelaySeconds,
      careStartSeconds: bestA.careStartSeconds,
      timeToCareSeconds: bestA.timeToCareSeconds,
      reasons: [
        `Ranked #1 for full definitive care. Estimated care start in ${Math.round(bestA.timeToCareSeconds / 60)} mins (Road ETA: ${Math.round(bestA.travelSeconds / 60)}m, Intake delay: ${Math.round(hospA.receivingDelaySeconds / 60)}m).`,
        ...bestA.evaluation.fullCareReasons,
      ],
      missingCapabilities: [],
      limitations: [],
      readiness: DestinationReadiness.PENDING,
      routingSource: bestA.routingSource,
    };

    priorityCandidates.push({
      hospitalId: hospA.id,
      code: hospA.code,
      name: hospA.name,
      priorityRank: 1,
      careObjective: 'FULL_CARE',
      eligible: true,
      fullCareEligible: true,
      stabilizationEligible: true,
      travelSeconds: bestA.travelSeconds,
      readyAtSeconds: 0,
      receivingDelaySeconds: hospA.receivingDelaySeconds,
      careStartSeconds: bestA.careStartSeconds,
      timeToCareSeconds: bestA.timeToCareSeconds,
      reasons: hospitalA.reasons,
      missingCapabilities: [],
      limitations: [],
      readiness: DestinationReadiness.PENDING,
      routingSource: bestA.routingSource,
    });

    // Stabilization Backups B & C (distinct from A)
    const reachableStab = candidateScores
      .filter(
        (c) =>
          c.evaluation.isStabilizationEligible &&
          c.evaluation.hospital.id !== hospA.id &&
          c.travelSeconds < 9999
      )
      .sort(
        (a, b) =>
          a.travelSeconds - b.travelSeconds ||
          a.timeToCareSeconds - b.timeToCareSeconds ||
          a.evaluation.hospital.id.localeCompare(b.evaluation.hospital.id)
      );

    if (reachableStab.length > 0) {
      const bestB = reachableStab[0];
      const hospB = bestB.evaluation.hospital;
      const bLimitations = bestB.evaluation.missingFullCareCapabilities.length > 0
        ? [`Full-care requirements not available here: ${bestB.evaluation.missingFullCareCapabilities.join(', ')}`]
        : [];
      hospitalB = {
        hospitalId: hospB.id,
        code: hospB.code,
        name: hospB.name,
        role: 'BACKUP_B',
        eligible: true,
        fullCareEligible: false,
        stabilizationEligible: true,
        careObjective: 'STABILIZATION',
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
        limitations: bLimitations,
        readiness: DestinationReadiness.PENDING,
        routingSource: bestB.routingSource,
      };

      priorityCandidates.push({
        hospitalId: hospB.id,
        code: hospB.code,
        name: hospB.name,
        priorityRank: 2,
        careObjective: 'STABILIZATION',
        eligible: true,
        fullCareEligible: false,
        stabilizationEligible: true,
        travelSeconds: bestB.travelSeconds,
        readyAtSeconds: 0,
        receivingDelaySeconds: hospB.receivingDelaySeconds,
        careStartSeconds: bestB.careStartSeconds,
        timeToCareSeconds: bestB.timeToCareSeconds,
        reasons: hospitalB.reasons,
        missingCapabilities: bestB.evaluation.missingFullCareCapabilities,
        limitations: bLimitations,
        readiness: DestinationReadiness.PENDING,
        routingSource: bestB.routingSource,
      });
    }

    if (reachableStab.length > 1) {
      const bestC = reachableStab[1];
      const hospC = bestC.evaluation.hospital;
      const cLimitations = bestC.evaluation.missingFullCareCapabilities.length > 0
        ? [`Full-care requirements not available here: ${bestC.evaluation.missingFullCareCapabilities.join(', ')}`]
        : [];
      hospitalC = {
        hospitalId: hospC.id,
        code: hospC.code,
        name: hospC.name,
        role: 'BACKUP_C',
        eligible: true,
        fullCareEligible: false,
        stabilizationEligible: true,
        careObjective: 'STABILIZATION',
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
        limitations: cLimitations,
        readiness: DestinationReadiness.PENDING,
        routingSource: bestC.routingSource,
      };

      priorityCandidates.push({
        hospitalId: hospC.id,
        code: hospC.code,
        name: hospC.name,
        priorityRank: 3,
        careObjective: 'STABILIZATION',
        eligible: true,
        fullCareEligible: false,
        stabilizationEligible: true,
        travelSeconds: bestC.travelSeconds,
        readyAtSeconds: 0,
        receivingDelaySeconds: hospC.receivingDelaySeconds,
        careStartSeconds: bestC.careStartSeconds,
        timeToCareSeconds: bestC.timeToCareSeconds,
        reasons: hospitalC.reasons,
        missingCapabilities: bestC.evaluation.missingFullCareCapabilities,
        limitations: cLimitations,
        readiness: DestinationReadiness.PENDING,
        routingSource: bestC.routingSource,
      });
    }
  } else {
    // NO FULL-CARE FACILITY ELIGIBLE: Switch to STABILIZATION_ONLY mode!
    const reachableStab = candidateScores
      .filter((c) => c.evaluation.isStabilizationEligible && c.travelSeconds < 9999)
      .sort(
        (a, b) =>
          a.travelSeconds - b.travelSeconds ||
          a.timeToCareSeconds - b.timeToCareSeconds ||
          a.evaluation.hospital.id.localeCompare(b.evaluation.hospital.id)
      );

    if (reachableStab.length > 0) {
      recommendationMode = 'STABILIZATION_ONLY';
      hospitalA = null; // Strictly null! No empty A slot occupying priority position 1

      // First eligible stabilization candidate (Priority 1)
      const bestB = reachableStab[0];
      const hospB = bestB.evaluation.hospital;
      const bLimitations = bestB.evaluation.missingFullCareCapabilities.length > 0
        ? [`Full-care requirements not available here: ${bestB.evaluation.missingFullCareCapabilities.join(', ')}`]
        : ['Immediate stabilization facility; review listed clinical limitations.'];

      hospitalB = {
        hospitalId: hospB.id,
        code: hospB.code,
        name: hospB.name,
        role: 'BACKUP_B',
        eligible: true,
        fullCareEligible: false,
        stabilizationEligible: true,
        careObjective: 'STABILIZATION',
        travelSeconds: bestB.travelSeconds,
        readyAtSeconds: 0,
        receivingDelaySeconds: hospB.receivingDelaySeconds,
        careStartSeconds: bestB.careStartSeconds,
        timeToCareSeconds: bestB.timeToCareSeconds,
        reasons: [
          `First eligible emergency stabilization destination (~${Math.round(bestB.travelSeconds / 60)} mins drive).`,
          ...bestB.evaluation.stabilizationReasons,
        ],
        missingCapabilities: bestB.evaluation.missingFullCareCapabilities,
        limitations: bLimitations,
        readiness: DestinationReadiness.PENDING,
        routingSource: bestB.routingSource,
      };

      priorityCandidates.push({
        hospitalId: hospB.id,
        code: hospB.code,
        name: hospB.name,
        priorityRank: 1,
        careObjective: 'STABILIZATION',
        eligible: true,
        fullCareEligible: false,
        stabilizationEligible: true,
        travelSeconds: bestB.travelSeconds,
        readyAtSeconds: 0,
        receivingDelaySeconds: hospB.receivingDelaySeconds,
        careStartSeconds: bestB.careStartSeconds,
        timeToCareSeconds: bestB.timeToCareSeconds,
        reasons: hospitalB.reasons,
        missingCapabilities: bestB.evaluation.missingFullCareCapabilities,
        limitations: bLimitations,
        readiness: DestinationReadiness.PENDING,
        routingSource: bestB.routingSource,
      });

      // Second eligible stabilization candidate (Priority 2, if exists)
      if (reachableStab.length > 1) {
        const bestC = reachableStab[1];
        const hospC = bestC.evaluation.hospital;
        const cLimitations = bestC.evaluation.missingFullCareCapabilities.length > 0
          ? [`Full-care requirements not available here: ${bestC.evaluation.missingFullCareCapabilities.join(', ')}`]
          : ['Secondary contingency stabilization center.'];

        hospitalC = {
          hospitalId: hospC.id,
          code: hospC.code,
          name: hospC.name,
          role: 'BACKUP_C',
          eligible: true,
          fullCareEligible: false,
          stabilizationEligible: true,
          careObjective: 'STABILIZATION',
          travelSeconds: bestC.travelSeconds,
          readyAtSeconds: 0,
          receivingDelaySeconds: hospC.receivingDelaySeconds,
          careStartSeconds: bestC.careStartSeconds,
          timeToCareSeconds: bestC.timeToCareSeconds,
          reasons: [
            `Secondary stabilization alternative (~${Math.round(bestC.travelSeconds / 60)} mins drive).`,
            ...bestC.evaluation.stabilizationReasons,
          ],
          missingCapabilities: bestC.evaluation.missingFullCareCapabilities,
          limitations: cLimitations,
          readiness: DestinationReadiness.PENDING,
          routingSource: bestC.routingSource,
        };

        priorityCandidates.push({
          hospitalId: hospC.id,
          code: hospC.code,
          name: hospC.name,
          priorityRank: 2,
          careObjective: 'STABILIZATION',
          eligible: true,
          fullCareEligible: false,
          stabilizationEligible: true,
          travelSeconds: bestC.travelSeconds,
          readyAtSeconds: 0,
          receivingDelaySeconds: hospC.receivingDelaySeconds,
          careStartSeconds: bestC.careStartSeconds,
          timeToCareSeconds: bestC.timeToCareSeconds,
          reasons: hospitalC.reasons,
          missingCapabilities: bestC.evaluation.missingFullCareCapabilities,
          limitations: cLimitations,
          readiness: DestinationReadiness.PENDING,
          routingSource: bestC.routingSource,
        });
      }
    } else {
      recommendationMode = 'NO_ELIGIBLE_DESTINATION';
      hospitalA = null;
      hospitalB = null;
      hospitalC = null;
    }
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
      fullCareEligible: score.evaluation.isFullCareEligible,
      stabilizationEligible: score.evaluation.isStabilizationEligible,
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
      limitations: score.evaluation.missingFullCareCapabilities.length > 0
        ? [`Full-care requirements not available here: ${score.evaluation.missingFullCareCapabilities.join(', ')}`]
        : [],
      readiness: DestinationReadiness.PENDING,
      routingSource: score.routingSource,
    };
  });

  return {
    recommendationMode,
    priorityCandidates,
    hospitalA,
    hospitalB,
    hospitalC,
    allEvaluations,
  };
}
