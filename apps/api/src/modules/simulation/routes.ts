import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { simulationService } from './service.js';
import { requireAuth, requireRole } from '../auth/plugin.js';
import { UserRole } from '@goldenhour/contracts';

const SpeedRequestSchema = z.object({
  speedMultiplier: z.number().min(0.5).max(10).default(1.0),
});

const StepRequestSchema = z.object({
  stepSeconds: z.number().positive().max(60).default(5),
});

const TrafficScenarioSchema = z.object({
  edgeId: z.string().default('edge-3'),
  multiplier: z.number().min(1.0).max(10.0).default(3.0),
});

const HospitalSurgeScenarioSchema = z.object({
  hospitalId: z.string().default('hosp-001'),
});

const DecompensationScenarioSchema = z.object({
  caseId: z.string(),
});

export async function registerSimulationRoutes(fastify: FastifyInstance) {
  // Public state endpoint (accessible to all authenticated roles for scene rendering)
  fastify.get('/api/v1/simulation/state', async (_req: FastifyRequest, reply: FastifyReply) => {
    const state = simulationService.getSimulationState();
    return reply.status(200).send(state);
  });

  // Admin-only controls
  fastify.register(async (adminScope) => {
    adminScope.addHook('preHandler', requireAuth);
    adminScope.addHook('preHandler', requireRole([UserRole.ADMIN]));

    adminScope.post('/api/v1/simulation/play', async (req: FastifyRequest, reply: FastifyReply) => {
      const body = req.body as { speedMultiplier?: number };
      const run = simulationService.play(body?.speedMultiplier ?? 1.0);
      return reply.status(200).send({ message: 'Simulation started', simulationRun: run });
    });

    adminScope.post('/api/v1/simulation/pause', async (_req: FastifyRequest, reply: FastifyReply) => {
      const run = simulationService.pause();
      return reply.status(200).send({ message: 'Simulation paused', simulationRun: run });
    });

    adminScope.post('/api/v1/simulation/step', async (req: FastifyRequest, reply: FastifyReply) => {
      const parseResult = StepRequestSchema.safeParse(req.body ?? {});
      const stepSec = parseResult.success ? parseResult.data.stepSeconds : 5;
      const run = simulationService.step(stepSec);
      return reply.status(200).send({ message: `Stepped forward ${stepSec}s`, simulationRun: run });
    });

    adminScope.post('/api/v1/simulation/speed', async (req: FastifyRequest, reply: FastifyReply) => {
      const parseResult = SpeedRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Invalid speed multiplier (0.5 to 10)',
        });
      }
      const run = simulationService.setSpeed(parseResult.data.speedMultiplier);
      return reply.status(200).send({ message: 'Simulation speed updated', simulationRun: run });
    });

    adminScope.post('/api/v1/simulation/reset', async (req: FastifyRequest, reply: FastifyReply) => {
      const run = simulationService.reset();
      return reply.status(200).send({ message: 'Simulation reset to origin', simulationRun: run });
    });

    adminScope.post('/api/v1/simulation/scenarios/traffic', async (req: FastifyRequest, reply: FastifyReply) => {
      const parseResult = TrafficScenarioSchema.safeParse(req.body ?? {});
      const { edgeId, multiplier } = parseResult.success
        ? parseResult.data
        : { edgeId: 'edge-3', multiplier: 3.0 };

      simulationService.injectTraffic(edgeId, multiplier, req.user!.id);
      return reply.status(200).send({
        message: `Traffic congestion ${multiplier}x applied on edge ${edgeId}`,
      });
    });

    adminScope.post('/api/v1/simulation/scenarios/hospital-surge', async (req: FastifyRequest, reply: FastifyReply) => {
      const parseResult = HospitalSurgeScenarioSchema.safeParse(req.body ?? {});
      const { hospitalId } = parseResult.success ? parseResult.data : { hospitalId: 'hosp-001' };

      simulationService.injectHospitalSpike(hospitalId, req.user!.id);
      return reply.status(200).send({
        message: `Hospital surge and intake delay injected for ${hospitalId}`,
      });
    });

    adminScope.post('/api/v1/simulation/scenarios/decompensation', async (req: FastifyRequest, reply: FastifyReply) => {
      const parseResult = DecompensationScenarioSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Case ID is required for patient decompensation scenario',
        });
      }

      simulationService.injectPatientDecompensation(parseResult.data.caseId, req.user!.id);
      return reply.status(200).send({
        message: `Patient acute decompensation scenario injected for case ${parseResult.data.caseId}`,
      });
    });
  });
}
