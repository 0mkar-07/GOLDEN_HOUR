import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  UserRole,
  DivertCaseRequestSchema,
  UpdateAllocationStateRequestSchema,
} from '@goldenhour/contracts';
import { store } from '../../db/store.js';
import { requireAuth, requireHospitalOwnership } from '../auth/plugin.js';
import { emitRealtimeEvent } from '../realtime/index.js';

interface IdParams {
  id: string;
}

export async function registerDispatchRoutes(fastify: FastifyInstance) {
  // 1. Dispatch Case (Ambulance initiates)
  fastify.post<{ Params: IdParams }>(
    '/api/v1/cases/:id/dispatch',
    { preHandler: [requireAuth] },
    async (req, reply: FastifyReply) => {
      try {
        const result = store.dispatchCase(req.params.id, req.user!.id);

        // Broadcast real-time events to all interested rooms
        emitRealtimeEvent('case.updated', result.case.id, result.case);
        emitRealtimeEvent('destination.updated', result.case.id, result.destination);

        for (const r of result.requests) {
          emitRealtimeEvent('request.created', r.id, r, `hospital:${r.hospitalId}`);
        }

        return reply.status(200).send(result);
      } catch (err: any) {
        return reply.status(400).send({
          code: 'DISPATCH_FAILED',
          message: err.message,
        });
      }
    }
  );

  // 2. List Hospital Requests
  fastify.get<{ Querystring: { hospitalId?: string } }>(
    '/api/v1/hospital-requests',
    { preHandler: [requireAuth] },
    async (req, reply: FastifyReply) => {
      // If user is HOSPITAL role, enforce filtering by their own hospitalId
      const targetHospitalId =
        req.user!.role === UserRole.HOSPITAL
          ? req.user!.hospitalId || undefined
          : req.query.hospitalId;

      const requests = store.getHospitalRequests(targetHospitalId);
      return reply.status(200).send({ requests });
    }
  );

  // 3. Hospital Accepts Request (Triggers atomic reservation)
  fastify.post<{ Params: IdParams }>(
    '/api/v1/hospital-requests/:id/accept',
    { preHandler: [requireAuth] },
    async (req, reply: FastifyReply) => {
      const request = store.getHospitalRequest(req.params.id);
      if (!request) {
        return reply.status(404).send({
          code: 'NOT_FOUND',
          message: `Hospital request not found: ${req.params.id}`,
        });
      }

      // Check hospital ownership
      if (req.user!.role === UserRole.HOSPITAL && req.user!.hospitalId !== request.hospitalId) {
        return reply.status(403).send({
          code: 'FORBIDDEN',
          message: `Cross-hospital access denied: User belongs to ${req.user!.hospitalId}, cannot accept request for ${request.hospitalId}`,
        });
      }

      try {
        const result = store.acceptHospitalRequest(req.params.id, req.user!.id);

        // Broadcast real-time events
        emitRealtimeEvent('request.updated', result.request.id, result.request);
        emitRealtimeEvent('case.updated', result.case.id, result.case);
        const destination = store.getDestination(result.case.id);
        if (destination) {
          emitRealtimeEvent('destination.updated', result.case.id, destination);
        }
        emitRealtimeEvent('inventory.updated', result.request.hospitalId, {
          hospitalId: result.request.hospitalId,
        });

        return reply.status(200).send(result);
      } catch (err: any) {
        if (err.message.includes('RESOURCE_UNAVAILABLE')) {
          return reply.status(409).send({
            code: 'RESOURCE_UNAVAILABLE',
            message: err.message,
          });
        }
        if (err.message.includes('Obsolete request rejected')) {
          return reply.status(409).send({
            code: 'REQUEST_OBSOLETE',
            message: err.message,
          });
        }
        return reply.status(400).send({
          code: 'ACCEPT_FAILED',
          message: err.message,
        });
      }
    }
  );

  // 4. Hospital Declines Request
  fastify.post<{ Params: IdParams }>(
    '/api/v1/hospital-requests/:id/decline',
    { preHandler: [requireAuth] },
    async (req, reply: FastifyReply) => {
      const request = store.getHospitalRequest(req.params.id);
      if (!request) {
        return reply.status(404).send({
          code: 'NOT_FOUND',
          message: `Hospital request not found: ${req.params.id}`,
        });
      }

      if (req.user!.role === UserRole.HOSPITAL && req.user!.hospitalId !== request.hospitalId) {
        return reply.status(403).send({
          code: 'FORBIDDEN',
          message: `Cross-hospital access denied`,
        });
      }

      try {
        const updated = store.declineHospitalRequest(req.params.id, req.user!.id);
        emitRealtimeEvent('request.updated', updated.id, updated);
        const destination = store.getDestination(updated.caseId);
        if (destination) {
          emitRealtimeEvent('destination.updated', updated.caseId, destination);
        }
        return reply.status(200).send({ request: updated });
      } catch (err: any) {
        return reply.status(400).send({
          code: 'DECLINE_FAILED',
          message: err.message,
        });
      }
    }
  );

  // 5. Get Case Destination & Allocations
  fastify.get<{ Params: IdParams }>(
    '/api/v1/cases/:id/destination',
    { preHandler: [requireAuth] },
    async (req, reply: FastifyReply) => {
      const destination = store.getDestination(req.params.id) || null;
      const allocations = store.listAllocationsByCase(req.params.id);
      return reply.status(200).send({ destination, allocations });
    }
  );

  // 6. Divert Case (Ambulance clinician selects alternative destination)
  fastify.post<{ Params: IdParams }>(
    '/api/v1/cases/:id/divert',
    { preHandler: [requireAuth] },
    async (req, reply: FastifyReply) => {
      const parseResult = DivertCaseRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: parseResult.error.message,
        });
      }

      const { targetHospitalId, expectedDestinationVersion, reason } = parseResult.data;

      try {
        const result = store.divertCase(
          req.params.id,
          targetHospitalId,
          expectedDestinationVersion,
          reason,
          req.user!.id
        );

        // Broadcast real-time events to all interested rooms
        emitRealtimeEvent('case.updated', result.case.id, result.case);
        emitRealtimeEvent('destination.updated', result.case.id, result.destination);
        emitRealtimeEvent('request.created', result.request.id, result.request, `hospital:${result.request.hospitalId}`);

        return reply.status(200).send(result);
      } catch (err: any) {
        if (err.message.includes('Version conflict')) {
          return reply.status(409).send({
            code: 'VERSION_CONFLICT',
            message: err.message,
          });
        }
        return reply.status(400).send({
          code: 'DIVERSION_FAILED',
          message: err.message,
        });
      }
    }
  );

  // 7. Ambulance Arrives at Destination
  fastify.post<{ Params: IdParams }>(
    '/api/v1/cases/:id/arrive',
    { preHandler: [requireAuth] },
    async (req, reply: FastifyReply) => {
      try {
        const updatedCase = store.arriveCase(req.params.id, req.user!.id);
        emitRealtimeEvent('case.updated', updatedCase.id, updatedCase);
        return reply.status(200).send({ case: updatedCase });
      } catch (err: any) {
        return reply.status(400).send({
          code: 'ARRIVAL_FAILED',
          message: err.message,
        });
      }
    }
  );

  // 8. Ambulance Clinical Handover
  fastify.post<{ Params: IdParams }>(
    '/api/v1/cases/:id/handover',
    { preHandler: [requireAuth] },
    async (req, reply: FastifyReply) => {
      try {
        const updatedCase = store.handoverCase(req.params.id, req.user!.id);
        emitRealtimeEvent('case.updated', updatedCase.id, updatedCase);
        return reply.status(200).send({ case: updatedCase });
      } catch (err: any) {
        return reply.status(400).send({
          code: 'HANDOVER_FAILED',
          message: err.message,
        });
      }
    }
  );

  // 9. List Hospital Allocations
  fastify.get<{ Params: IdParams }>(
    '/api/v1/hospitals/:id/allocations',
    { preHandler: [requireAuth, requireHospitalOwnership] },
    async (req, reply: FastifyReply) => {
      const allocations = store.listAllocationsByHospital(req.params.id);
      return reply.status(200).send({ allocations });
    }
  );

  // 10. Start Resource Use (Hospital records active use, RESERVED -> IN_USE)
  fastify.post<{ Params: IdParams }>(
    '/api/v1/allocations/:id/start-use',
    { preHandler: [requireAuth] },
    async (req, reply: FastifyReply) => {
      const alloc = store.getAllocation(req.params.id);
      if (!alloc) {
        return reply.status(404).send({
          code: 'NOT_FOUND',
          message: `Allocation not found: ${req.params.id}`,
        });
      }

      if (req.user!.role === UserRole.HOSPITAL && req.user!.hospitalId !== alloc.hospitalId) {
        return reply.status(403).send({
          code: 'FORBIDDEN',
          message: `Cross-hospital access denied: User belongs to ${req.user!.hospitalId}, allocation is at ${alloc.hospitalId}`,
        });
      }

      const parseResult = UpdateAllocationStateRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: parseResult.error.message,
        });
      }

      try {
        const updated = store.startUseAllocation(
          req.params.id,
          parseResult.data.expectedVersion,
          req.user!.id
        );
        emitRealtimeEvent('allocation.updated', updated.id, updated);
        emitRealtimeEvent('inventory.updated', updated.hospitalId, { hospitalId: updated.hospitalId });
        return reply.status(200).send({ allocation: updated });
      } catch (err: any) {
        if (err.message.includes('Version conflict')) {
          return reply.status(409).send({
            code: 'VERSION_CONFLICT',
            message: err.message,
          });
        }
        return reply.status(400).send({
          code: 'START_USE_FAILED',
          message: err.message,
        });
      }
    }
  );

  // 11. Release Resource (Hospital explicitly releases, IN_USE / RESERVED -> RELEASED)
  fastify.post<{ Params: IdParams }>(
    '/api/v1/allocations/:id/release',
    { preHandler: [requireAuth] },
    async (req, reply: FastifyReply) => {
      const alloc = store.getAllocation(req.params.id);
      if (!alloc) {
        return reply.status(404).send({
          code: 'NOT_FOUND',
          message: `Allocation not found: ${req.params.id}`,
        });
      }

      if (req.user!.role === UserRole.HOSPITAL && req.user!.hospitalId !== alloc.hospitalId) {
        return reply.status(403).send({
          code: 'FORBIDDEN',
          message: `Cross-hospital access denied: User belongs to ${req.user!.hospitalId}, allocation is at ${alloc.hospitalId}`,
        });
      }

      const parseResult = UpdateAllocationStateRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: parseResult.error.message,
        });
      }

      try {
        const updated = store.releaseAllocation(
          req.params.id,
          parseResult.data.expectedVersion,
          req.user!.id
        );
        emitRealtimeEvent('allocation.updated', updated.id, updated);
        emitRealtimeEvent('inventory.updated', updated.hospitalId, { hospitalId: updated.hospitalId });
        return reply.status(200).send({ allocation: updated });
      } catch (err: any) {
        if (err.message.includes('Version conflict')) {
          return reply.status(409).send({
            code: 'VERSION_CONFLICT',
            message: err.message,
          });
        }
        return reply.status(400).send({
          code: 'RELEASE_FAILED',
          message: err.message,
        });
      }
    }
  );
}
