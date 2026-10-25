import { callGoogleComputeRoutes } from '../routing/google-routes.js';
import { NITK_REGION, isWithinNitkRegion } from '@goldenhour/contracts';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { simulationService } from './service.js';
import { requireAuth, requireRole } from '../auth/plugin.js';
import { UserRole, SourceSwitchRequestSchema } from '@goldenhour/contracts';
import { store } from '../../db/store.js';
import { SEEDED_ROAD_GRAPH } from '@goldenhour/scenario-fixtures';

const previewOwners = new Map<string, { userId: string; expiresAt: number }>();

const SpeedRequestSchema = z.object({
  speedMultiplier: z.number().min(0.5).max(10).default(1.0),
});

const StepRequestSchema = z.object({
  stepSeconds: z.number().positive().max(60).default(5),
});

const TrafficScenarioSchema = z.object({
  edgeId: z.string().optional().default('edge-3'),
  multiplier: z.number().min(1.0).max(10.0).optional().default(3.0),
  preset: z
    .enum(['FREE_FLOW', 'MORNING_PEAK', 'EVENING_PEAK', 'CORRIDOR_CONGESTION', 'INCIDENT_CLOSURE'])
    .optional(),
});

const OriginRequestSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  validationId: z.string().optional(),
  expectedRunVersion: z.number().int().positive().optional(),
  idempotencyKey: z.string().optional(),
}).refine((v) => Boolean(v.validationId) || (v.lat !== undefined && v.lng !== undefined), 'Coordinates or validationId required');

const OriginPreviewRouteSchema = z.object({
  requested: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  expectedRunVersion: z.number().int().positive().optional(),
  clientRequestId: z.string().optional(),
});

const HospitalSurgeScenarioSchema = z.object({
  hospitalId: z.string().default('hosp-001'),
});

const DecompensationScenarioSchema = z.object({
  caseId: z.string(),
});

export async function registerSimulationRoutes(fastify: FastifyInstance) {
  // Public state endpoint (accessible to all authenticated roles for scene rendering)
  fastify.get(
    '/api/v1/simulation/state',
    { preHandler: [requireAuth] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const state = simulationService.getSimulationState();
      return reply.status(200).send(state);
    }
  );

  // Ambulance origin preview endpoint (Stage 6 & 7 / Section D)
  fastify.post(
    '/api/v1/simulation/origin/preview',
    { preHandler: [requireAuth, requireRole([UserRole.ADMIN, UserRole.AMBULANCE])] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parseResult = OriginPreviewRouteSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Invalid coordinate payload for ambulance origin preview',
          details: parseResult.error.format(),
        });
      }
      const { requested, expectedRunVersion, clientRequestId } = parseResult.data;
      let roadAccess: { lat: number; lng: number; source: string } | undefined;
      const apiKey = process.env.GOOGLE_ROUTES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
      if (apiKey && !apiKey.startsWith('mock-') && isWithinNitkRegion(requested.lat, requested.lng)) {
        try {
          const route = await callGoogleComputeRoutes({ origin: requested,
            destination: { lat: NITK_REGION.centerLat, lng: NITK_REGION.centerLng }, apiKey });
          if (route.pathCoordinates[0]) roadAccess = { ...route.pathCoordinates[0], source: 'GOOGLE_ROUTES' };
        } catch {
          // Offline graph remains explicitly labelled and limited to its coverage.
        }
      }
      const preview = store.previewAmbulanceOrigin(
        requested.lat,
        requested.lng,
        expectedRunVersion,
        clientRequestId,
        roadAccess
      );
      for (const [id, owner] of previewOwners) if (owner.expiresAt <= Date.now()) previewOwners.delete(id);
      previewOwners.set(preview.validationId, { userId: req.user!.id, expiresAt: Date.parse(preview.expiresAt) });
      return reply.status(200).send(preview);
    }
  );

  // Ambulance origin pin placement with 40 km boundary check, 50m road snap, and version validation (Stage 6 & 7)
  fastify.post(
    '/api/v1/simulation/origin',
    { preHandler: [requireAuth, requireRole([UserRole.ADMIN, UserRole.AMBULANCE])] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parseResult = OriginRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Invalid coordinate payload for ambulance origin pin',
          details: parseResult.error.format(),
        });
      }

      const { lat, lng, expectedRunVersion, validationId, idempotencyKey } = parseResult.data;
      try {
        if (validationId && previewOwners.get(validationId)?.userId !== req.user!.id) {
          return reply.status(409).send({ code: 'EXPIRED_PREVIEW', message: 'Select a new point using this account.' });
        }
        const previousVersion = store.simulationRun.runVersion;
        const result = store.setAmbulanceOrigin(
          lat ?? 0,
          lng ?? 0,
          expectedRunVersion,
          validationId,
          idempotencyKey ? `${req.user!.id}:${idempotencyKey}` : undefined
        );
        if (store.simulationRun.runVersion !== previousVersion) simulationService.reset(false);
        return reply.status(200).send({
          message: 'Ambulance origin updated and snapped to road network',
          ...result,
        });
      } catch (err: any) {
        if (
          err.statusCode === 409 ||
          err.code === 'VERSION_CONFLICT' ||
          err.code === 'IDEMPOTENCY_CONFLICT' ||
          err.code === 'EXPIRED_PREVIEW'
        ) {
          return reply.status(409).send({
            code: err.code || 'VERSION_CONFLICT',
            message: err.message,
          });
        }
        if (err.code === 'OUT_OF_REGION' || err.message?.includes('OUT_OF_REGION')) {
          return reply.status(400).send({
            code: 'OUT_OF_REGION',
            message: err.message,
          });
        }
        if (err.code === 'NO_ROAD_ACCESS' || err.statusCode === 422) {
          return reply.status(422).send({
            code: 'NO_ROAD_ACCESS',
            message: err.message,
          });
        }
        return reply.status(400).send({
          code: 'INVALID_ORIGIN',
          message: err.message,
        });
      }
    }
  );

  // Reset ambulance origin to NITK default (13.0108, 74.7936)
  fastify.post(
    '/api/v1/simulation/origin/reset-default',
    { preHandler: [requireAuth, requireRole([UserRole.ADMIN, UserRole.AMBULANCE])] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      if (store.simulationRun.running || Array.from(store.cases.values()).some((c) => ['EN_ROUTE', 'DISPATCHING'].includes(c.caseStatus))) {
        return reply.code(409).send({ code: 'DISALLOWED_RUN_STATE', message: 'Reset origin during setup, before dispatch.' });
      }
      const defaultOrigin = store.resetAmbulanceOriginToDefault();
      simulationService.reset();
      return reply.status(200).send({
        message: 'Ambulance origin reset to NITK default (13.0108, 74.7936)',
        origin: defaultOrigin,
      });
    }
  );

  // Simulation controls (Admin only)
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
      const runState = simulationService.getSimulationState().simulationRun;
      if (runState.running) {
        simulationService.pause();
      }
      const parseResult = StepRequestSchema.safeParse(req.body ?? {});
      if (!parseResult.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Invalid stepSeconds (must be positive number <= 60)',
          details: parseResult.error.format(),
        });
      }
      const stepSec = parseResult.data.stepSeconds;
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

    adminScope.post('/api/v1/simulation/source', async (req: FastifyRequest, reply: FastifyReply) => {
      const parseResult = SourceSwitchRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Invalid source switch payload',
          details: parseResult.error.format(),
        });
      }
      const { targetSource } = parseResult.data;
      if (targetSource === 'DEVICE_GPS') {
        simulationService.pause();
        store.ambulancePosition.source = 'DEVICE_GPS';
      } else if (targetSource === 'SIMULATED') {
        store.ambulancePosition.source = 'SIMULATED';
      }
      store.ambulancePosition.sourceGeneration += 1;
      return reply.status(200).send({
        success: true,
        source: store.ambulancePosition.source,
        sourceGeneration: store.ambulancePosition.sourceGeneration,
      });
    });

    adminScope.post('/api/v1/simulation/scenarios/traffic', async (req: FastifyRequest, reply: FastifyReply) => {
      const parseResult = TrafficScenarioSchema.safeParse(req.body ?? {});
      if (!parseResult.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Invalid traffic scenario payload',
          details: parseResult.error.format(),
        });
      }
      let { edgeId, multiplier, preset } = parseResult.data;

      // Handle presets (Stage 7)
      if (preset) {
        switch (preset) {
          case 'FREE_FLOW':
            multiplier = 1.0;
            break;
          case 'MORNING_PEAK':
            multiplier = 1.8;
            break;
          case 'EVENING_PEAK':
            multiplier = 2.2;
            break;
          case 'CORRIDOR_CONGESTION':
            multiplier = 3.5;
            break;
          case 'INCIDENT_CLOSURE':
            multiplier = 10.0;
            break;
        }
      }

      const activeEdgeId = edgeId || 'edge-3';
      const edgeExists = SEEDED_ROAD_GRAPH.edges.some((e) => e.id === activeEdgeId);
      if (!edgeExists) {
        return reply.status(400).send({
          code: 'EDGE_NOT_FOUND',
          message: `Road edge ${activeEdgeId} not found in road network graph`,
        });
      }

      simulationService.injectTraffic(activeEdgeId, multiplier, req.user!.id);
      return reply.status(200).send({
        message: `Simulated traffic ${multiplier}x travel time applied on edge ${activeEdgeId}`,
        preset: preset ?? 'CUSTOM',
        multiplier,
        label: `${multiplier}x travel time`,
      });
    });

    adminScope.post('/api/v1/simulation/scenarios/hospital-surge', async (req: FastifyRequest, reply: FastifyReply) => {
      const parseResult = HospitalSurgeScenarioSchema.safeParse(req.body ?? {});
      if (!parseResult.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Invalid hospital surge payload',
          details: parseResult.error.format(),
        });
      }
      const { hospitalId } = parseResult.data;
      const hospitalExists = store.getHospital(hospitalId);
      if (!hospitalExists) {
        return reply.status(400).send({
          code: 'HOSPITAL_NOT_FOUND',
          message: `Hospital ${hospitalId} does not exist`,
        });
      }

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
