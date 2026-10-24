import { z } from 'zod';
import { DestinationReadiness } from './enums.js';

export const CareObjectiveEnum = z.enum(['FULL_CARE', 'STABILIZATION']);
export type CareObjective = z.infer<typeof CareObjectiveEnum>;

export const RecommendationModeEnum = z.enum([
  'FULL_CARE_AVAILABLE',
  'STABILIZATION_ONLY',
  'NO_ELIGIBLE_DESTINATION',
]);
export type RecommendationMode = z.infer<typeof RecommendationModeEnum>;

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
  receivingDelaySeconds: z.number().int().nonnegative(),
  careStartSeconds: z.number().int().nonnegative(),
  timeToCareSeconds: z.number().int().nonnegative(),
  reasons: z.array(z.string()),
  missingCapabilities: z.array(z.string()),
  limitations: z.array(z.string()).optional(),
  readiness: z.nativeEnum(DestinationReadiness),
  routingSource: z.enum(['SIMULATED_GRAPH', 'GOOGLE_ROUTES', 'LIVE_OSRM', 'FALLBACK_GRAPH']).optional(),
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
  receivingDelaySeconds: z.number().int().nonnegative().default(0),
  careStartSeconds: z.number().int().nonnegative(),
  timeToCareSeconds: z.number().int().nonnegative(),
  reasons: z.array(z.string()).default([]),
  missingCapabilities: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
  readiness: z.nativeEnum(DestinationReadiness).default(DestinationReadiness.PENDING),
  routingSource: z.enum(['SIMULATED_GRAPH', 'GOOGLE_ROUTES', 'LIVE_OSRM', 'FALLBACK_GRAPH']).optional(),
});

export type PriorityCandidateDto = z.infer<typeof PriorityCandidateSchema>;

export const RecommendationSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  assessmentVersion: z.number().int().positive(),
  positionSequence: z.number().int().nonnegative(),
  inventoryVersion: z.number().int().positive(),
  recommendationMode: RecommendationModeEnum.optional(),
  priorityCandidates: z.array(PriorityCandidateSchema).optional(),
  hospitalA: CandidateEvaluationSchema.nullable(),
  hospitalB: CandidateEvaluationSchema.nullable(),
  hospitalC: CandidateEvaluationSchema.nullable(),
  allCandidates: z.array(CandidateEvaluationSchema).default([]),
  coordinatorBriefing: z.string().optional(),
  generatedAt: z.string(),
});

export type RecommendationDto = z.infer<typeof RecommendationSchema>;
