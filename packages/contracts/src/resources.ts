import { z } from 'zod';
import { ResourceType, SpecialtyType, AllocationState } from './enums.js';

export const StaffAvailabilitySchema = z.object({
  id: z.string(),
  hospitalId: z.string(),
  specialty: z.nativeEnum(SpecialtyType),
  availableTeamSlots: z.number().int().nonnegative(),
  readyAt: z.string(),
  version: z.number().int().positive(),
  updatedAt: z.string(),
});

export type StaffAvailabilityDto = z.infer<typeof StaffAvailabilitySchema>;

export const ResourcePoolSchema = z.object({
  id: z.string(),
  hospitalId: z.string(),
  resourceType: z.nativeEnum(ResourceType),
  totalCount: z.number().int().nonnegative(),
  outOfServiceCount: z.number().int().nonnegative(),
  externalOccupancy: z.number().int().nonnegative(),
  reservedCount: z.number().int().nonnegative(),
  inUseCount: z.number().int().nonnegative(),
  availableCount: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  updatedAt: z.string(),
});

export type ResourcePoolDto = z.infer<typeof ResourcePoolSchema>;

export const UpdateResourcePoolRequestSchema = z.object({
  totalCount: z.number().int().nonnegative().optional(),
  outOfServiceCount: z.number().int().nonnegative().optional(),
  externalOccupancy: z.number().int().nonnegative().optional(),
  expectedVersion: z.number().int().positive(),
});

export type UpdateResourcePoolRequest = z.infer<typeof UpdateResourcePoolRequestSchema>;

export const UpdateStaffAvailabilityRequestSchema = z.object({
  availableTeamSlots: z.number().int().nonnegative().optional(),
  readyAt: z.string().optional(),
  expectedVersion: z.number().int().positive(),
});

export type UpdateStaffAvailabilityRequest = z.infer<typeof UpdateStaffAvailabilityRequestSchema>;

export const AllocationSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  resourcePoolId: z.string(),
  hospitalId: z.string(),
  resourceType: z.nativeEnum(ResourceType),
  quantity: z.number().int().positive(),
  state: z.nativeEnum(AllocationState),
  reservedAt: z.string(),
  inUseAt: z.string().nullable().optional(),
  releasedAt: z.string().nullable().optional(),
  version: z.number().int().positive(),
});

export type AllocationDto = z.infer<typeof AllocationSchema>;
