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

export const AmbulancePositionSchema = z.object({
  ambulanceId: z.string(),
  x: z.number(),
  y: z.number(),
  lat: z.number(),
  lng: z.number(),
  speed: z.number().default(0),
  heading: z.number().default(0),
  serverSequence: z.number().int().nonnegative(),
  observedAt: z.string(),
});

export type AmbulancePositionDto = z.infer<typeof AmbulancePositionSchema>;
