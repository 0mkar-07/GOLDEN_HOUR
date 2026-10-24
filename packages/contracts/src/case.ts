import { z } from 'zod';
import {
  CaseStatus,
  RequestRole,
  RequestStatus,
  DestinationReadiness,
  DestinationActor,
} from './enums.js';

export const VitalSignsSchema = z.object({
  heartRate: z.number().nullable().optional(),
  systolicBp: z.number().nullable().optional(),
  diastolicBp: z.number().nullable().optional(),
  respiratoryRate: z.number().nullable().optional(),
  oxygenSaturation: z.number().nullable().optional(),
  gcs: z.number().nullable().optional(),
});

export type VitalSignsDto = z.infer<typeof VitalSignsSchema>;

export const AssessmentObservationsSchema = z.object({
  presentingIssue: z.string(),
  urgencyLevel: z.enum(['CRITICAL', 'URGENT', 'STABLE']),
  vitals: VitalSignsSchema,
  notes: z.string().optional(),
  ambulanceSupportProvided: z.array(z.string()).default([]),
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
  confirmedFullCareNeeds: z.array(z.string()).min(1),
  confirmedStabilizationNeeds: z.array(z.string()).min(1),
});

export type ConfirmRequirementsRequest = z.infer<typeof ConfirmRequirementsRequestSchema>;

export const Agent1ProposalSchema = z.object({
  proposedFullCareNeeds: z.array(z.string()),
  proposedStabilizationNeeds: z.array(z.string()),
  reasons: z.array(z.string()),
  missingInputs: z.array(z.string()),
  interpreterType: z.enum(['GEMINI_LLM', 'DETERMINISTIC_RULES']).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export type Agent1Proposal = z.infer<typeof Agent1ProposalSchema>;

export const DivertCaseRequestSchema = z.object({
  targetHospitalId: z.string().min(1),
  expectedDestinationVersion: z.number().int().positive(),
  reason: z.string().min(1),
});

export type DivertCaseRequest = z.infer<typeof DivertCaseRequestSchema>;

export const HospitalRequestSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  hospitalId: z.string(),
  role: z.nativeEnum(RequestRole),
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
  readiness: z.nativeEnum(DestinationReadiness),
  version: z.number().int().positive(),
  selectedBy: z.nativeEnum(DestinationActor),
  updatedAt: z.string(),
});

export type DestinationDto = z.infer<typeof DestinationSchema>;

export const PositionSourceEnum = z.enum(['SIMULATED', 'DEVICE_GPS']);
export type PositionSource = z.infer<typeof PositionSourceEnum>;

export const AmbulancePositionSchema = z.object({
  ambulanceId: z.string(),
  x: z.number().default(0),
  y: z.number().default(0),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speed: z.number().default(0),
  heading: z.number().default(0),
  accuracyMeters: z.number().nonnegative().optional(),
  source: PositionSourceEnum.default('SIMULATED'),
  serverSequence: z.number().int().nonnegative(),
  observedAt: z.string(),
});

export type AmbulancePositionDto = z.infer<typeof AmbulancePositionSchema>;

export const SubmitDevicePositionSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speed: z.number().nonnegative().optional().default(0),
  heading: z.number().min(0).max(360).optional().default(0),
  accuracyMeters: z.number().nonnegative().optional(),
  observedAt: z.string().optional(),
});

export type SubmitDevicePositionRequest = z.infer<typeof SubmitDevicePositionSchema>;
