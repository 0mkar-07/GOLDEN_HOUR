import { z } from 'zod';
import {
  CaseStatus,
  RequestRole,
  RequestStatus,
  DestinationReadiness,
  DestinationActor,
} from './enums.js';
import {
  CareObjectiveEnum,
  type CareObjective,
  ClinicalStabilityEnum,
  type ClinicalStability,
  ConditionTrendEnum,
  type ConditionTrend,
  TransportAssessmentEnum,
  type TransportAssessment,
  SelectedPathwayEnum,
  type SelectedPathway,
  RequiredInterventionEnum,
  type RequiredIntervention,
} from './pathway.js';

export {
  CareObjectiveEnum,
  type CareObjective,
  ClinicalStabilityEnum,
  type ClinicalStability,
  ConditionTrendEnum,
  type ConditionTrend,
  TransportAssessmentEnum,
  type TransportAssessment,
  SelectedPathwayEnum,
  type SelectedPathway,
  RequiredInterventionEnum,
  type RequiredIntervention,
};

export const VitalSignsSchema = z.object({
  heartRate: z.number().nullable().optional(),
  systolicBp: z.number().nullable().optional(),
  diastolicBp: z.number().nullable().optional(),
  respiratoryRate: z.number().nullable().optional(),
  oxygenSaturation: z.number().nullable().optional(),
  gcs: z.number().nullable().optional(),
});

export type VitalSignsDto = z.infer<typeof VitalSignsSchema>;

export const MissingEvidenceItemSchema = z.object({
  field: z.string(),
  reason: z.enum(['ABSENT', 'NULL', 'STALE', 'CONTRADICTORY', 'INVALID']),
  description: z.string(),
});
export type MissingEvidenceItem = z.infer<typeof MissingEvidenceItemSchema>;

export const CareRequirementItemSchema = z.object({
  capability: z.string(),
  priority: z.enum(['IMMEDIATE', 'DEFINITIVE']),
  reason: z.string(),
  dependencies: z.array(z.string()).default([]),
  source: z.string().optional(),
});
export type CareRequirementItem = z.infer<typeof CareRequirementItemSchema>;

export const TimeConstraintSchema = z.object({
  constraintType: z.enum(['ARRIVAL', 'INTERVENTION_START', 'DEFINITIVE_CARE']),
  maxDurationSeconds: z.number().int().nonnegative(),
  scope: z.string(),
  author: z.string(),
  policySource: z.string(),
});
export type TimeConstraint = z.infer<typeof TimeConstraintSchema>;

export const AssessmentObservationsSchema = z.object({
  presentingIssue: z.string(),
  urgencyLevel: z.enum(['CRITICAL', 'URGENT', 'STABLE']),
  vitals: VitalSignsSchema,
  notes: z.string().optional(),
  ambulanceSupportProvided: z.array(z.string()).default([]),
  clinicalStability: ClinicalStabilityEnum.optional(),
  conditionTrend: ConditionTrendEnum.optional(),
  observationTime: z.string().optional(),
  priorObservationIds: z.array(z.string()).optional(),
});

export type AssessmentObservationsDto = z.infer<typeof AssessmentObservationsSchema>;

export const AssessmentSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  version: z.number().int().positive(),
  observations: AssessmentObservationsSchema,
  proposedFullCareNeeds: z.array(z.string()),
  proposedStabilizationNeeds: z.array(z.string()),
  confirmedFullCareNeeds: z.array(z.string()),
  confirmedStabilizationNeeds: z.array(z.string()),
  clinicianConfirmed: z.boolean(),
  confirmedAt: z.string().nullable().optional(),
  confirmedBy: z.string().nullable().optional(),
  createdAt: z.string(),

  // Structured Patient State & Pathway Fields (Stage 2)
  proposedClinicalStability: ClinicalStabilityEnum.default('UNKNOWN').optional(),
  confirmedClinicalStability: ClinicalStabilityEnum.default('UNKNOWN').optional(),
  proposedConditionTrend: ConditionTrendEnum.default('UNKNOWN').optional(),
  confirmedConditionTrend: ConditionTrendEnum.default('UNKNOWN').optional(),
  proposedTransportAssessment: TransportAssessmentEnum.default('REVIEW_REQUIRED').optional(),
  confirmedTransportAssessment: TransportAssessmentEnum.default('REVIEW_REQUIRED').optional(),
  proposedPathway: SelectedPathwayEnum.default('REVIEW_REQUIRED').optional(),
  confirmedPathway: SelectedPathwayEnum.default('REVIEW_REQUIRED').optional(),
  requiredIntervention: RequiredInterventionEnum.default('UNKNOWN').optional(),
  immediateRequirements: z.array(CareRequirementItemSchema).default([]).optional(),
  definitiveRequirements: z.array(CareRequirementItemSchema).default([]).optional(),
  timeConstraints: z.array(TimeConstraintSchema).default([]).optional(),
  missingEvidence: z.array(MissingEvidenceItemSchema).default([]).optional(),
  policyVersion: z.string().optional(),
  overrideReason: z.string().nullable().optional(),
});

export type AssessmentDto = z.infer<typeof AssessmentSchema>;

export const EmergencyCaseSchema = z.object({
  id: z.string(),
  assignedAmbulanceId: z.string(),
  caseStatus: z.nativeEnum(CaseStatus),
  patientLabel: z.string(),
  assessmentVersion: z.number().int().nonnegative(),
  destinationVersion: z.number().int().nonnegative(),
  selectedHospitalId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type EmergencyCaseDto = z.infer<typeof EmergencyCaseSchema>;

export const CreateCaseRequestSchema = z.object({
  patientLabel: z.string().min(1),
  assignedAmbulanceId: z.string().default('amb-104'),
});

export type CreateCaseRequest = z.infer<typeof CreateCaseRequestSchema>;

export const SubmitAssessmentRequestSchema = z.object({
  observations: AssessmentObservationsSchema,
});

export type SubmitAssessmentRequest = z.infer<typeof SubmitAssessmentRequestSchema>;

export const ConfirmRequirementsRequestSchema = z.object({
  assessmentVersion: z.number().int().positive(),
  confirmedFullCareNeeds: z.array(z.string()).default([]),
  confirmedStabilizationNeeds: z.array(z.string()).default([]),
  confirmedPathway: SelectedPathwayEnum.optional(),
  confirmedTransportAssessment: TransportAssessmentEnum.optional(),
  confirmedClinicalStability: ClinicalStabilityEnum.optional(),
  confirmedConditionTrend: ConditionTrendEnum.optional(),
  requiredIntervention: RequiredInterventionEnum.optional(),
  overrideReason: z.string().optional(),
});

export type ConfirmRequirementsRequest = z.infer<typeof ConfirmRequirementsRequestSchema>;

export const Agent1ProposalSchema = z.object({
  proposedFullCareNeeds: z.array(z.string()),
  proposedStabilizationNeeds: z.array(z.string()),
  reasons: z.array(z.string()),
  missingInputs: z.array(z.string()),
  interpreterType: z.enum(['GEMINI_LLM', 'DETERMINISTIC_RULES']).optional(),
  confidence: z.number().min(0).max(1).optional(),
  proposedClinicalStability: ClinicalStabilityEnum.default('UNKNOWN').optional(),
  proposedConditionTrend: ConditionTrendEnum.default('UNKNOWN').optional(),
  proposedTransportAssessment: TransportAssessmentEnum.default('REVIEW_REQUIRED').optional(),
  proposedPathway: SelectedPathwayEnum.default('REVIEW_REQUIRED').optional(),
  requiredIntervention: RequiredInterventionEnum.default('UNKNOWN').optional(),
  immediateRequirements: z.array(CareRequirementItemSchema).default([]).optional(),
  definitiveRequirements: z.array(CareRequirementItemSchema).default([]).optional(),
  missingEvidence: z.array(MissingEvidenceItemSchema).default([]).optional(),
  policyReasonCodes: z.array(z.string()).default([]).optional(),
});

export type Agent1Proposal = z.infer<typeof Agent1ProposalSchema>;

export const DispatchCaseRequestSchema = z.object({
  targetHospitalId: z.string().optional(),
  careObjective: CareObjectiveEnum.optional().default('FULL_CARE'),
  selectionReason: z.string().optional(),
  assessmentVersion: z.number().int().positive().optional(),
  idempotencyKey: z.string().optional(),
});

export type DispatchCaseRequest = z.infer<typeof DispatchCaseRequestSchema>;

export const DivertCaseRequestSchema = z.object({
  targetHospitalId: z.string().min(1),
  expectedDestinationVersion: z.number().int().positive(),
  reason: z.string().min(1),
  previewId: z.string().optional(),
  careObjective: CareObjectiveEnum.optional().default('STABILIZATION'),
});

export type DivertCaseRequest = z.infer<typeof DivertCaseRequestSchema>;

export const DiversionComparisonSchema = z.object({
  hospitalId: z.string(),
  code: z.string(),
  name: z.string(),
  role: z.enum(['PRIMARY_A', 'BACKUP_B', 'BACKUP_C']),
  travelSeconds: z.number().int().nonnegative(),
  receivingDelaySeconds: z.number().int().nonnegative(),
  timeToCareSeconds: z.number().int().nonnegative(),
  eligible: z.boolean(),
  rejectionReason: z.string().optional(),
  routingSource: z.string().optional(),
  limitations: z.array(z.string()).default([]),
});

export type DiversionComparisonDto = z.infer<typeof DiversionComparisonSchema>;

export const DiversionPreviewSchema = z.object({
  previewId: z.string(),
  caseId: z.string(),
  currentDestinationHospitalId: z.string().nullable().optional(),
  currentDestinationEtaSeconds: z.number().nullable().optional(),
  suggestedTargetHospitalId: z.string().nullable().optional(),
  candidates: z.array(DiversionComparisonSchema),
  generatedAt: z.string(),
  expiresAt: z.string(),
});

export type DiversionPreviewDto = z.infer<typeof DiversionPreviewSchema>;

export const HospitalRequestSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  hospitalId: z.string(),
  role: z.nativeEnum(RequestRole),
  careObjective: CareObjectiveEnum.optional(),
  status: z.nativeEnum(RequestStatus),
  destinationGeneration: z.number().int().positive(),
  expiresAt: z.string(),
  respondedAt: z.string().nullable().optional(),
  createdAt: z.string(),
});

export type HospitalRequestDto = z.infer<typeof HospitalRequestSchema>;

export const DestinationSchema = z.object({
  caseId: z.string(),
  hospitalId: z.string(),
  careObjective: CareObjectiveEnum.optional(),
  readiness: z.nativeEnum(DestinationReadiness),
  version: z.number().int().positive(),
  selectedBy: z.nativeEnum(DestinationActor),
  updatedAt: z.string(),
});

export type DestinationDto = z.infer<typeof DestinationSchema>;

export const PositionSourceEnum = z.enum(['SIMULATED', 'DEVICE_GPS', 'REPLAY']);
export type PositionSource = z.infer<typeof PositionSourceEnum>;

export const AmbulancePositionSchema = z.object({
  ambulanceId: z.string(),
  x: z.number().default(0),
  y: z.number().default(0),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speed: z.number().default(0), // display km/h
  speedMps: z.number().nullable().optional(), // canonical m/s
  heading: z.number().default(0), // display degrees
  headingDegrees: z.number().min(0).max(360).nullable().optional(), // normalized [0, 360)
  accuracyMeters: z.number().nonnegative().optional(),
  source: PositionSourceEnum.default('SIMULATED'),
  sourceGeneration: z.number().int().nonnegative().default(1),
  serverSequence: z.number().int().nonnegative(),
  observedAt: z.string(),
  receivedAt: z.string().optional(),
});

export type AmbulancePositionDto = z.infer<typeof AmbulancePositionSchema>;

export const SubmitDevicePositionSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speed: z.number().nonnegative().optional().default(0),
  speedMps: z.number().nonnegative().nullable().optional(),
  heading: z.number().min(0).max(360).optional().default(0),
  headingDegrees: z.number().min(0).max(360).nullable().optional(),
  accuracyMeters: z.number().nonnegative().optional(),
  observedAt: z.string().optional(),
});

export type SubmitDevicePositionRequest = z.infer<typeof SubmitDevicePositionSchema>;
