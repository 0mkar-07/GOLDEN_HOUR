import { z } from 'zod';
import { ReceivingStatus } from './enums.js';

export const LocationSchema = z.object({
  x: z.number(),
  y: z.number(),
  lat: z.number(),
  lng: z.number(),
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
