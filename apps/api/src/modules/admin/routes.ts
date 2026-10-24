import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  UserRole,
  SystemSettingsSchema,
  AuditFilterQuerySchema,
  AdminHospitalUpdateSchema,
} from '@goldenhour/contracts';
import { store } from '../../db/store.js';
import { requireAuth, requireRole } from '../auth/plugin.js';

export async function adminRoutes(fastify: FastifyInstance) {
  // Apply admin authorization check to all routes in this plugin
  fastify.addHook('preHandler', requireAuth);
  fastify.addHook('preHandler', requireRole([UserRole.ADMIN]));

  /**
   * GET /api/v1/admin/overview
   * Real-time network overview: active cases, hospital readiness,
   * resource occupancy, pending requests, and ambulance telemetry.
   */
  fastify.get('/api/v1/admin/overview', async (_req: FastifyRequest, reply: FastifyReply) => {
    const overview = store.getAdminOverview();
    return reply.status(200).send(overview);
  });

  /**
   * GET /api/v1/admin/audit-logs
   * Immutable audit timeline with filters by case, hospital, action, and time.
   */
  fastify.get<{
    Querystring: {
      caseId?: string;
      hospitalId?: string;
      action?: string;
      since?: string;
      limit?: string;
    };
  }>('/api/v1/admin/audit-logs', async (req, reply) => {
    const parseResult = AuditFilterQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Invalid audit filter parameters',
        details: parseResult.error.format(),
      });
    }

    const logs = store.getFilteredAuditLogs(parseResult.data);
    return reply.status(200).send({
      total: logs.length,
      logs,
    });
  });

  /**
   * GET /api/v1/admin/cases
   * Comprehensive list of all cases with associated destinations and requests.
   */
  fastify.get('/api/v1/admin/cases', async (_req: FastifyRequest, reply: FastifyReply) => {
    const cases = Array.from(store.cases.values()).map((c) => {
      const destination = store.destinations.get(c.id);
      const recommendation = store.recommendations.get(c.id);
      const allocations = store.listAllocationsByCase(c.id);
      const requests = Array.from(store.hospitalRequests.values()).filter((r) => r.caseId === c.id);

      return {
        ...c,
        destination,
        recommendation,
        allocations,
        requests,
      };
    });

    return reply.status(200).send({ cases });
  });

  /**
   * GET /api/v1/admin/settings
   * Retrieve current system operational settings (refresh, staleness, ranking margin).
   */
  fastify.get('/api/v1/admin/settings', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({
      settings: store.systemSettings,
    });
  });

  /**
   * PUT /api/v1/admin/settings
   * Update system settings with validation and actor-attributed audit logging.
   */
  fastify.put('/api/v1/admin/settings', async (req: FastifyRequest, reply: FastifyReply) => {
    const parseResult = SystemSettingsSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Invalid system settings format or bounds',
        details: parseResult.error.format(),
      });
    }

    const updated = store.updateSystemSettings(parseResult.data, req.user!.id);
    return reply.status(200).send({
      message: 'System settings updated successfully',
      settings: updated,
    });
  });

  /**
   * PATCH /api/v1/admin/hospitals/:id/status
   * Hospital operational status & delay management.
   * Invariant: Does not silently override clinical requirements or release occupied equipment.
   */
  fastify.patch<{
    Params: { id: string };
  }>('/api/v1/admin/hospitals/:id/status', async (req, reply) => {
    const { id } = req.params;
    const parseResult = AdminHospitalUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: 'Invalid hospital status payload',
        details: parseResult.error.format(),
      });
    }

    try {
      const updated = store.adminUpdateHospital(id, parseResult.data, req.user!.id);
      return reply.status(200).send({
        message: 'Hospital status updated successfully',
        hospital: updated,
      });
    } catch (err: any) {
      return reply.status(404).send({
        code: 'NOT_FOUND',
        message: err.message,
      });
    }
  });

  /**
   * POST /api/v1/admin/reset
   * Admin-only synthetic demo scenario reset.
   */
  fastify.post('/api/v1/admin/reset', async (req: FastifyRequest, reply: FastifyReply) => {
    store.resetDemoScenario(req.user!.id);
    return reply.status(200).send({
      message: 'Demo scenario reset successfully to baseline synthetic state',
    });
  });
}
