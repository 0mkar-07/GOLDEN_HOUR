import { z } from 'zod';

export const ServiceTypeEnum = z.enum([
  'EMERGENCY_DEPT',
  'OPERATING_THEATRE',
  'CARDIAC_CATH_LAB',
  'IMAGING_CT_MRI',
  'ICU',
]);
export type ServiceType = z.infer<typeof ServiceTypeEnum>;

export const ProcedureCaseTypeEnum = z.enum(['ELECTIVE', 'URGENT', 'EMERGENCY']);
export type ProcedureCaseType = z.infer<typeof ProcedureCaseTypeEnum>;

export const ProcedureStatusEnum = z.enum([
  'SCHEDULED',
  'PREPARING',
  'IN_PROGRESS',
  'COMPLETED',
  'DEFERRED',
  'CANCELLED',
]);
export type ProcedureStatus = z.infer<typeof ProcedureStatusEnum>;

export const DeferralEligibilityEnum = z.enum([
  'ELIGIBLE_FOR_REVIEW',
  'NOT_DEFERRABLE',
  'PROTECTED_IN_PROGRESS',
]);
export type DeferralEligibility = z.infer<typeof DeferralEligibilityEnum>;

export const OperatingTheatreSchema = z.object({
  id: z.string(),
  hospitalId: z.string(),
  name: z.string(),
  capabilities: z.array(z.string()),
  active: z.boolean(),
});
export type OperatingTheatreDto = z.infer<typeof OperatingTheatreSchema>;

export const ScheduledProcedureSchema = z.object({
  id: z.string(),
  hospitalId: z.string(),
  theatreId: z.string(),
  caseType: ProcedureCaseTypeEnum,
  procedureName: z.string(),
  status: ProcedureStatusEnum,
  plannedStart: z.string(),
  plannedEnd: z.string(),
  actualStart: z.string().nullable().optional(),
  actualEnd: z.string().nullable().optional(),
  turnoverMinutes: z.number().default(20),
  deferralEligibility: DeferralEligibilityEnum,
  clinicianInCharge: z.string(),
  version: z.number().default(1),
});
export type ScheduledProcedureDto = z.infer<typeof ScheduledProcedureSchema>;

export const ServiceHoursSchema = z.object({
  hospitalId: z.string(),
  serviceType: ServiceTypeEnum,
  is24x7: z.boolean(),
  openTime: z.string().optional(),
  closeTime: z.string().optional(),
  timezone: z.string().default('Asia/Kolkata'),
});
export type ServiceHoursDto = z.infer<typeof ServiceHoursSchema>;

export const TicketStatusEnum = z.enum([
  'PENDING_REVIEW',
  'ACKNOWLEDGED',
  'APPROVED',
  'DECLINED',
  'SUPERSEDED',
  'EXPIRED',
  'APPLIED',
]);
export type TicketStatus = z.infer<typeof TicketStatusEnum>;

export const RequestedActionEnum = z.enum([
  'REVIEW_ELECTIVE_DEFERRAL',
  'REVIEW_RESOURCE_ALTERNATIVE',
]);
export type RequestedAction = z.infer<typeof RequestedActionEnum>;

export const EmergencyArrivalWindowSchema = z.object({
  start: z.string(),
  end: z.string(),
  estimatedSeconds: z.number(),
});
export type EmergencyArrivalWindow = z.infer<typeof EmergencyArrivalWindowSchema>;

export const EmergencyPriorityTicketSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  hospitalId: z.string(),
  targetTheatreId: z.string(),
  conflictingProcedureId: z.string(),
  conflictingProcedureName: z.string(),
  caseType: z.string().default('ELECTIVE'),
  emergencyArrivalWindow: EmergencyArrivalWindowSchema,
  status: TicketStatusEnum,
  requestedAction: RequestedActionEnum,
  clinicalRationale: z.string(),
  reviewerNotes: z.string().nullable().optional(),
  reviewedBy: z.string().nullable().optional(),
  reviewedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  version: z.number().default(1),
});
export type EmergencyPriorityTicketDto = z.infer<typeof EmergencyPriorityTicketSchema>;

export const CreatePriorityReviewRequestSchema = z.object({
  caseId: z.string().optional(),
  hospitalId: z.string(),
  estimatedArrivalSeconds: z.number().positive(),
  urgencyLevel: z.string().optional(),
  clinicalRationale: z.string().optional(),
});
export type CreatePriorityReviewRequest = z.infer<typeof CreatePriorityReviewRequestSchema>;

export const DecidePriorityTicketRequestSchema = z.object({
  decision: z.enum(['APPROVED', 'DECLINED', 'ALTERNATIVE_RESOURCE']),
  alternateTheatreId: z.string().optional(),
  reviewerNotes: z.string().min(1, 'Reason or clinical notes required'),
});
export type DecidePriorityTicketRequest = z.infer<typeof DecidePriorityTicketRequestSchema>;
