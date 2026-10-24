import { z } from 'zod';
import { UserRole } from './enums.js';

export const AuditEventSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  actorRole: z.nativeEnum(UserRole),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  details: z.record(z.any()),
  timestamp: z.string(),
});

export type AuditEventDto = z.infer<typeof AuditEventSchema>;

export const OutboxEventSchema = z.object({
  eventId: z.string(),
  entityId: z.string(),
  entityVersion: z.number().int().positive(),
  authorizedEventType: z.string(),
  occurredAt: z.string(),
  payload: z.record(z.any()),
  deliveryState: z.enum(['PENDING', 'DELIVERED', 'FAILED']).default('PENDING'),
});

export type OutboxEventDto = z.infer<typeof OutboxEventSchema>;
