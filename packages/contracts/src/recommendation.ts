import { z } from 'zod';
import { DestinationReadiness } from './enums.js';

export const CandidateEvaluationSchema = z.object({
  hospitalId: z.string(),
  code: z.string(),
  name: z.string(),
  role: z.enum(['PRIMARY_A', 'BACKUP_B', 'BACKUP_C']),
  eligible: z.boolean(),
  travelSeconds: z.number().int().nonnegative(),
  readyAtSeconds: z.number().int().nonnegative(),
  receivingDelaySeconds: z.number().int().nonnegative(),
  careStartSeconds: z.number().int().nonnegative(),
  timeToCareSeconds: z.number().int().nonnegative(),
  reasons: z.array(z.string()),
  missingCapabilities: z.array(z.string()),
  readiness: z.nativeEnum(DestinationReadiness),
});

export type CandidateEvaluationDto = z.infer<typeof CandidateEvaluationSchema>;

export const RecommendationSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  assessmentVersion: z.number().int().positive(),
  positionSequence: z.number().int().nonnegative(),
  inventoryVersion: z.number().int().positive(),
  hospitalA: CandidateEvaluationSchema.nullable(),
  hospitalB: CandidateEvaluationSchema.nullable(),
  hospitalC: CandidateEvaluationSchema.nullable(),
  allCandidates: z.array(CandidateEvaluationSchema).default([]),
  generatedAt: z.string(),
});

export type RecommendationDto = z.infer<typeof RecommendationSchema>;
