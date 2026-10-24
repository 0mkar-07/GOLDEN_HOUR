import { z } from 'zod';

export const HealthLiveResponseSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.string(),
  uptimeSeconds: z.number(),
  service: z.string(),
});

export type HealthLiveResponse = z.infer<typeof HealthLiveResponseSchema>;

export const HealthReadyResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  timestamp: z.string(),
  service: z.string(),
  database: z.object({
    status: z.enum(['connected', 'disconnected', 'mock']),
    latencyMs: z.number().nullable(),
    error: z.string().nullable().optional(),
  }),
});

export type HealthReadyResponse = z.infer<typeof HealthReadyResponseSchema>;
