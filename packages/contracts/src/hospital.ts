import { z } from 'zod';
import { ReceivingStatus } from './enums.js';

export const LocationSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export type LocationDto = z.infer<typeof LocationSchema>;

export const HospitalSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  address: z.string(),
  location: LocationSchema,
  capabilities: z.array(z.string()),
  receivingStatus: z.nativeEnum(ReceivingStatus),
  receivingDelaySeconds: z.number().nonnegative().default(120),
  version: z.number().int().positive(),
  updatedAt: z.string(),
});

export type HospitalDto = z.infer<typeof HospitalSchema>;

export const UpdateHospitalRequestSchema = z.object({
  name: z.string().optional(),
  receivingStatus: z.nativeEnum(ReceivingStatus).optional(),
  receivingDelaySeconds: z.number().nonnegative().optional(),
  capabilities: z.array(z.string()).optional(),
  expectedVersion: z.number().int().positive().optional(),
});

export type UpdateHospitalRequest = z.infer<typeof UpdateHospitalRequestSchema>;
