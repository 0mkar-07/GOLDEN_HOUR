import { z } from 'zod';
import { ReceivingStatus, UserRole } from './enums.js';

export const SystemSettingsSchema = z.object({
  demoRefreshIntervalSeconds: z.number().int().min(1).max(60).default(5),
  stalenessThresholdSeconds: z.number().int().min(5).max(300).default(15),
  rankingImprovementMarginSeconds: z.number().int().min(0).max(600).default(120),
});

export type SystemSettingsDto = z.infer<typeof SystemSettingsSchema>;

export const AuditFilterQuerySchema = z.object({
  caseId: z.string().optional(),
  hospitalId: z.string().optional(),
  action: z.string().optional(),
  since: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type AuditFilterQueryDto = z.infer<typeof AuditFilterQuerySchema>;

export const AdminHospitalUpdateSchema = z.object({
  receivingStatus: z.nativeEnum(ReceivingStatus).optional(),
  receivingDelaySeconds: z.number().nonnegative().optional(),
  capabilities: z.array(z.string()).optional(),
});

export type AdminHospitalUpdateDto = z.infer<typeof AdminHospitalUpdateSchema>;

export const AdminOverviewSchema = z.object({
  activeCasesCount: z.number().int().nonnegative(),
  casesByStatus: z.record(z.number().int().nonnegative()),
  hospitalReadiness: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      code: z.string(),
      receivingStatus: z.nativeEnum(ReceivingStatus),
      receivingDelaySeconds: z.number().nonnegative(),
      resourceUtilizationPercent: z.number().min(0).max(100),
      availableCount: z.number().int().nonnegative(),
      reservedCount: z.number().int().nonnegative(),
      inUseCount: z.number().int().nonnegative(),
      outOfServiceCount: z.number().int().nonnegative(),
      totalResources: z.number().int().nonnegative(),
      capabilities: z.array(z.string()),
    })
  ),
  totalResources: z.object({
    total: z.number().int().nonnegative(),
    available: z.number().int().nonnegative(),
    reserved: z.number().int().nonnegative(),
    inUse: z.number().int().nonnegative(),
    outOfService: z.number().int().nonnegative(),
  }),
  pendingRequestsCount: z.number().int().nonnegative(),
  ambulanceTelemetry: z.object({
    position: z.object({
      x: z.number(),
      y: z.number(),
      lat: z.number(),
      lng: z.number(),
    }),
    speed: z.number(),
    heading: z.number(),
    serverSequence: z.number().int().nonnegative(),
    observedAt: z.string(),
    isStale: z.boolean(),
    stalenessSeconds: z.number().nonnegative(),
  }),
  systemSettings: SystemSettingsSchema,
});

export type AdminOverviewDto = z.infer<typeof AdminOverviewSchema>;
