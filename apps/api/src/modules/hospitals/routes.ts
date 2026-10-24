import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  UpdateHospitalRequestSchema,
  UpdateResourcePoolRequestSchema,
  UserRole,
} from '@goldenhour/contracts';
import { store } from '../../db/store.js';
import { requireAuth, requireHospitalOwnership } from '../auth/plugin.js';

interface IdParams {
  id: string;
}

export async function registerHospitalRoutes(fastify: FastifyInstance) {
  // List hospitals (accessible to authenticated users)
  fastify.get(
    '/api/v1/hospitals',
    { preHandler: [requireAuth] },
    async (_req, reply: FastifyReply) => {
      const hospitals = store.listHospitals();
      return reply.status(200).send({ hospitals });
    }
  );

  // Get hospital by ID
  fastify.get<{ Params: IdParams }>(
    '/api/v1/hospitals/:id',
    { preHandler: [requireAuth] },
    async (req, reply: FastifyReply) => {
      const hospital = store.getHospital(req.params.id);
      if (!hospital) {
        return reply.status(404).send({
          code: 'NOT_FOUND',
          message: `Hospital not found: ${req.params.id}`,
        });
      }
      return reply.status(200).send({ hospital });
    }
  );

  // Update hospital (Enforces ownership check: Hospital A cannot mutate Hospital B)
  fastify.patch<{ Params: IdParams; Body: unknown }>(
    '/api/v1/hospitals/:id',
    { preHandler: [requireAuth, requireHospitalOwnership] },
    async (req, reply: FastifyReply) => {
      const parseResult = UpdateHospitalRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Invalid update hospital payload',
          details: parseResult.error.format(),
        });
      }

      try {
        const updated = store.updateHospital(
          req.params.id,
          parseResult.data,
          parseResult.data.expectedVersion
        );

        store.recordAudit({
          actorId: req.user!.id,
          actorRole: req.user!.role,
          action: 'HOSPITAL_UPDATE',
          entityType: 'HOSPITAL',
          entityId: req.params.id,
          details: parseResult.data,
        });

        return reply.status(200).send({ hospital: updated });
      } catch (err: any) {
        if (err.message.includes('Version conflict')) {
          return reply.status(409).send({
            code: 'VERSION_CONFLICT',
            message: err.message,
          });
        }
        return reply.status(400).send({
          code: 'UPDATE_FAILED',
          message: err.message,
        });
      }
    }
  );

  // Get hospital resource pools
  fastify.get<{ Params: IdParams }>(
    '/api/v1/hospitals/:id/resources',
    { preHandler: [requireAuth] },
    async (req, reply: FastifyReply) => {
      const pools = store.listResourcePoolsByHospital(req.params.id);
      return reply.status(200).send({ resourcePools: pools });
    }
  );

  // Update resource pool (Enforces ownership check and strict capacity invariants)
  fastify.patch<{ Params: IdParams; Body: unknown }>(
    '/api/v1/resource-pools/:id',
    { preHandler: [requireAuth] },
    async (req, reply: FastifyReply) => {
      const parseResult = UpdateResourcePoolRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Invalid update resource pool payload',
          details: parseResult.error.format(),
        });
      }

      const pool = store.getResourcePool(req.params.id);
      if (!pool) {
        return reply.status(404).send({
          code: 'NOT_FOUND',
          message: `Resource pool not found: ${req.params.id}`,
        });
      }

      // Check hospital ownership if user is HOSPITAL role
      if (req.user!.role === UserRole.HOSPITAL && req.user!.hospitalId !== pool.hospitalId) {
        return reply.status(403).send({
          code: 'FORBIDDEN',
          message: `Cross-hospital access denied: User belongs to ${req.user!.hospitalId}, cannot mutate pool of ${pool.hospitalId}`,
        });
      }

      try {
        const updated = store.updateResourcePool(req.params.id, parseResult.data);

        store.recordAudit({
          actorId: req.user!.id,
          actorRole: req.user!.role,
          action: 'RESOURCE_POOL_UPDATE',
          entityType: 'RESOURCE_POOL',
          entityId: req.params.id,
          details: parseResult.data,
        });

        return reply.status(200).send({ resourcePool: updated });
      } catch (err: any) {
        if (err.message.includes('Version conflict')) {
          return reply.status(409).send({
            code: 'VERSION_CONFLICT',
            message: err.message,
          });
        }
        return reply.status(400).send({
          code: 'INVARIANT_VIOLATION',
          message: err.message,
        });
      }
    }
  );

  // Get hospital staff readiness
  fastify.get<{ Params: IdParams }>(
    '/api/v1/hospitals/:id/staff',
    { preHandler: [requireAuth] },
    async (req, reply: FastifyReply) => {
      const staff = store.listStaffByHospital(req.params.id);
      return reply.status(200).send({ staffAvailability: staff });
    }
  );
}
