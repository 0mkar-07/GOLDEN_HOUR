import { z } from 'zod';
import { DestinationReadiness } from './enums.js';
import {
  CareObjectiveEnum,
  type CareObjective,
  SelectedPathwayEnum,
  type SelectedPathway,
} from './pathway.js';

export { CareObjectiveEnum, type CareObjective, SelectedPathwayEnum, type SelectedPathway };

export const RecommendationModeEnum = z.enum([
  'FULL_CARE_AVAILABLE',
  'STABILIZATION_ONLY',
  'NO_ELIGIBLE_DESTINATION',
  'REVIEW_REQUIRED',
]);
export type RecommendationMode = z.infer<typeof RecommendationModeEnum>;

export const EvaluationModeEnum = z.enum([
  'LLM_ASSISTED',
  'RULES_FALLBACK',
  'WAITING_FOR_DATA',
  'PROVISIONAL',
  'REVIEW_REQUIRED',
]);
export type EvaluationMode = z.infer<typeof EvaluationModeEnum>;

export const CandidateEvaluationSchema = z.object({
  hospitalId: z.string(),
  code: z.string(),
  name: z.string(),
  role: z.enum(['PRIMARY_A', 'BACKUP_B', 'BACKUP_C']),
  eligible: z.boolean(),
  fullCareEligible: z.boolean().optional(),
  stabilizationEligible: z.boolean().optional(),
  careObjective: CareObjectiveEnum.optional(),
  travelSeconds: z.number().int().nonnegative(),
  readyAtSeconds: z.number().int().nonnegative(),
  waitAfterArrivalSeconds: z.number().int().nonnegative().default(0).optional(),
  receivingDelaySeconds: z.number().int().nonnegative(),
  careStartSeconds: z.number().int().nonnegative(),
  timeToCareSeconds: z.number().int().nonnegative(),
  immediateCareStartSeconds: z.number().int().nonnegative().optional(),
  definitiveCareStartSeconds: z.number().int().nonnegative().nullable().optional(),
  theatreReady: z.boolean().optional(),
  theatreWaitSeconds: z.number().int().nonnegative().optional(),
  specialistTeamReady: z.boolean().optional(),
  roadDistanceMeters: z.number().int().nonnegative().nullable().optional(),
  straightLineDistanceMeters: z.number().int().nonnegative().nullable().optional(),
  routeStatus: z.enum(['AVAILABLE', 'UNAVAILABLE', 'PENDING', 'STALE']).default('AVAILABLE').optional(),
  limitingReason: z.string().optional(),
  whyChanged: z.string().optional(),
  reasons: z.array(z.string()),
  missingCapabilities: z.array(z.string()),
  limitations: z.array(z.string()).optional(),
  policyReasonCodes: z.array(z.string()).default([]).optional(),
  readiness: z.nativeEnum(DestinationReadiness),
  routingSource: z.enum(['SIMULATED_GRAPH', 'GOOGLE_ROUTES', 'LIVE_OSRM', 'FALLBACK_GRAPH']).optional(),
  onwardDefinitiveDestination: z
    .object({
      hospitalId: z.string(),
      name: z.string(),
      status: z.string(),
      estimatedTravelSeconds: z.number().nullable().optional(),
      note: z.string().optional(),
    })
    .nullable()
    .optional(),
});

export type CandidateEvaluationDto = z.infer<typeof CandidateEvaluationSchema>;

export const PriorityCandidateSchema = z.object({
  hospitalId: z.string(),
  code: z.string(),
  name: z.string(),
  priorityRank: z.number().int().positive(),
  careObjective: CareObjectiveEnum,
  eligible: z.boolean(),
  fullCareEligible: z.boolean().default(false),
  stabilizationEligible: z.boolean().default(true),
  travelSeconds: z.number().int().nonnegative(),
  readyAtSeconds: z.number().int().nonnegative().default(0),
  waitAfterArrivalSeconds: z.number().int().nonnegative().default(0).optional(),
  receivingDelaySeconds: z.number().int().nonnegative().default(0),
  careStartSeconds: z.number().int().nonnegative(),
  timeToCareSeconds: z.number().int().nonnegative(),
  immediateCareStartSeconds: z.number().int().nonnegative().optional(),
  definitiveCareStartSeconds: z.number().int().nonnegative().nullable().optional(),
  theatreReady: z.boolean().optional(),
  theatreWaitSeconds: z.number().int().nonnegative().optional(),
  specialistTeamReady: z.boolean().optional(),
  roadDistanceMeters: z.number().int().nonnegative().nullable().optional(),
  straightLineDistanceMeters: z.number().int().nonnegative().nullable().optional(),
  routeStatus: z.enum(['AVAILABLE', 'UNAVAILABLE', 'PENDING', 'STALE']).default('AVAILABLE').optional(),
  limitingReason: z.string().optional(),
  whyChanged: z.string().optional(),
  reasons: z.array(z.string()).default([]),
  missingCapabilities: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
  policyReasonCodes: z.array(z.string()).default([]).optional(),
  readiness: z.nativeEnum(DestinationReadiness).default(DestinationReadiness.PENDING),
  routingSource: z.enum(['SIMULATED_GRAPH', 'GOOGLE_ROUTES', 'LIVE_OSRM', 'FALLBACK_GRAPH']).optional(),
  onwardDefinitiveDestination: z
    .object({
      hospitalId: z.string(),
      name: z.string(),
      status: z.string(),
      estimatedTravelSeconds: z.number().nullable().optional(),
      note: z.string().optional(),
    })
    .nullable()
    .optional(),
});

export type PriorityCandidateDto = z.infer<typeof PriorityCandidateSchema>;

export const RecommendationSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  assessmentVersion: z.number().int().positive(),
  positionSequence: z.number().int().nonnegative(),
  inventoryVersion: z.number().int().positive(),
  recommendationMode: RecommendationModeEnum.optional(),
  selectedPathway: SelectedPathwayEnum.optional(),
  confirmedObjective: CareObjectiveEnum.optional(),
  routeSnapshotId: z.string().optional(),
  evaluationMode: EvaluationModeEnum.default('RULES_FALLBACK').optional(),
  diagnosticId: z.string().optional(),
  whyChanged: z.string().optional(),
  priorityCandidates: z.array(PriorityCandidateSchema).optional(),
  hospitalA: CandidateEvaluationSchema.nullable(),
  hospitalB: CandidateEvaluationSchema.nullable(),
  hospitalC: CandidateEvaluationSchema.nullable(),
  allCandidates: z.array(CandidateEvaluationSchema).default([]),
  coordinatorBriefing: z.string().optional(),
  policyReasonCodes: z.array(z.string()).default([]).optional(),
  scenarioId: z.string().optional(),
  onwardTransfer: z
    .object({
      status: z.string(),
      destinationHospitalId: z.string().nullable().optional(),
      destinationName: z.string().nullable().optional(),
      timingConfirmed: z.boolean().default(false),
      message: z.string(),
    })
    .optional(),
  generatedAt: z.string(),
});

export type RecommendationDto = z.infer<typeof RecommendationSchema>;
