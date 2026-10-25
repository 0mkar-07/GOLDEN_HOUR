import { z } from 'zod';

export const CareObjectiveEnum = z.enum(['FULL_CARE', 'STABILIZATION']);
export type CareObjective = z.infer<typeof CareObjectiveEnum>;

export const ClinicalStabilityEnum = z.enum(['STABLE', 'UNSTABLE', 'UNKNOWN']);
export type ClinicalStability = z.infer<typeof ClinicalStabilityEnum>;

export const ConditionTrendEnum = z.enum(['IMPROVING', 'UNCHANGED', 'DETERIORATING', 'UNKNOWN']);
export type ConditionTrend = z.infer<typeof ConditionTrendEnum>;

export const TransportAssessmentEnum = z.enum([
  'DIRECT_TRANSPORT_PERMITTED',
  'STABILIZE_BEFORE_TRANSFER',
  'REVIEW_REQUIRED',
]);
export type TransportAssessment = z.infer<typeof TransportAssessmentEnum>;

export const SelectedPathwayEnum = z.enum([
  'DIRECT_DEFINITIVE',
  'STABILIZE_THEN_TRANSFER',
  'REVIEW_REQUIRED',
]);
export type SelectedPathway = z.infer<typeof SelectedPathwayEnum>;

export const RequiredInterventionEnum = z.enum([
  'NEUROSURGERY',
  'GENERAL_SURGERY',
  'RESUSCITATION',
  'CARDIAC_CATH',
  'UNKNOWN',
]);
export type RequiredIntervention = z.infer<typeof RequiredInterventionEnum>;
