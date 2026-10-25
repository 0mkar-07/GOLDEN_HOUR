import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  CreateCaseRequestSchema,
  SubmitAssessmentRequestSchema,
  ConfirmRequirementsRequestSchema,
  SubmitDevicePositionSchema,
  RecommendationDto,
} from '@goldenhour/contracts';
import { store } from '../../db/store.js';
import { requireAuth } from '../auth/plugin.js';
import { runAgent1, runAgent1Async } from '../agents/agent1.js';
import { callGeminiCoordinatorBriefing } from '../agents/gemini.js';
import { runAgent2 } from '../agents/agent2.js';
import { runAgent3 } from '../agents/agent3.js';
import { runAgentCoordinator } from '../agents/agentCoordinator.js';
import { routingProvider, geographicRoutingProvider, evaluateCaseCandidateRoutes } from '../routing/index.js';
import { getIO } from '../realtime/index.js';
import { SEEDED_ROAD_GRAPH } from '@goldenhour/scenario-fixtures';
import { simulationService } from '../simulation/service.js';

interface IdParams {
  id: string;
}

export async function registerCaseRoutes(fastify: FastifyInstance) {
  // 1. Create Emergency Case
  fastify.post(
    '/api/v1/cases',
    { preHandler: [requireAuth] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parseResult = CreateCaseRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Invalid create case payload',
          details: parseResult.error.format(),
        });
      }

      const { patientLabel, assignedAmbulanceId } = parseResult.data;
      const newCase = store.createCase(patientLabel, assignedAmbulanceId);

      store.recordAudit({
        actorId: req.user!.id,
        actorRole: req.user!.role,
        action: 'CASE_CREATED',
        entityType: 'EMERGENCY_CASE',
        entityId: newCase.id,
        details: { patientLabel, assignedAmbulanceId },
      });

      return reply.status(201).send({ case: newCase });
    }
  );

  // 2. List Cases
  fastify.get(
    '/api/v1/cases',
    { preHandler: [requireAuth] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const cases = store.listCases();
      return reply.status(200).send({ cases });
    }
  );

  // 3. Get Case with Latest Assessment
  fastify.get<{ Params: IdParams }>(
    '/api/v1/cases/:id',
    { preHandler: [requireAuth] },
    async (req, reply: FastifyReply) => {
      const emergencyCase = store.getCase(req.params.id);
      if (!emergencyCase) {
        return reply.status(404).send({
          code: 'NOT_FOUND',
          message: `Case not found: ${req.params.id}`,
        });
      }

      const latestAssessment = store.getLatestAssessment(req.params.id) || null;
      return reply.status(200).send({
        case: emergencyCase,
        latestAssessment,
      });
    }
  );

  // 4. Submit Assessment & Run Agent 1
  fastify.post<{ Params: IdParams; Body: unknown }>(
    '/api/v1/cases/:id/assessments',
    { preHandler: [requireAuth] },
    async (req, reply: FastifyReply) => {
      const parseResult = SubmitAssessmentRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Invalid assessment payload',
          details: parseResult.error.format(),
        });
      }

      const emergencyCase = store.getCase(req.params.id);
      if (!emergencyCase) {
        return reply.status(404).send({
          code: 'NOT_FOUND',
          message: `Case not found: ${req.params.id}`,
        });
      }

      const { observations } = parseResult.data;

      // Execute Agent 1 (uses Gemini AI LLM agent when API key is provided)
      const agent1Proposal = await runAgent1Async(observations);

      // Persist new assessment
      const assessment = store.createAssessment(
        req.params.id,
        observations,
        agent1Proposal.proposedFullCareNeeds,
        agent1Proposal.proposedStabilizationNeeds
      );

      store.recordAudit({
        actorId: req.user!.id,
        actorRole: req.user!.role,
        action: 'ASSESSMENT_SUBMITTED',
        entityType: 'ASSESSMENT',
        entityId: assessment.id,
        details: {
          assessmentVersion: assessment.version,
          proposedFullCare: agent1Proposal.proposedFullCareNeeds,
          proposedStabilization: agent1Proposal.proposedStabilizationNeeds,
        },
      });

      return reply.status(200).send({
        assessment,
        agent1Proposal,
      });
    }
  );

  // 5. Clinician Confirm Requirements
  fastify.post<{ Params: IdParams; Body: unknown }>(
    '/api/v1/cases/:id/confirm-requirements',
    { preHandler: [requireAuth] },
    async (req, reply: FastifyReply) => {
      const parseResult = ConfirmRequirementsRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Invalid requirement confirmation payload',
          details: parseResult.error.format(),
        });
      }

      const { assessmentVersion, confirmedFullCareNeeds, confirmedStabilizationNeeds } = parseResult.data;

      try {
        const updatedAssessment = store.confirmRequirements(
          req.params.id,
          assessmentVersion,
          confirmedFullCareNeeds,
          confirmedStabilizationNeeds,
          req.user!.id
        );

        store.recordAudit({
          actorId: req.user!.id,
          actorRole: req.user!.role,
          action: 'REQUIREMENTS_CONFIRMED',
          entityType: 'ASSESSMENT',
          entityId: updatedAssessment.id,
          details: {
            assessmentVersion,
            confirmedFullCareNeeds,
            confirmedStabilizationNeeds,
            clinician: req.user!.name,
          },
        });

        return reply.status(200).send({
          assessment: updatedAssessment,
          message: 'Patient requirements successfully confirmed by clinician.',
        });
      } catch (err: any) {
        if (err.message.includes('Version conflict')) {
          return reply.status(409).send({
            code: 'VERSION_CONFLICT',
            message: err.message,
          });
        }
        return reply.status(400).send({
          code: 'CONFIRMATION_FAILED',
          message: err.message,
        });
      }
    }
  );

  // 6. Generate Recommendations (Runs Agent 2 & Agent 3)
  fastify.post<{ Params: IdParams }>(
    '/api/v1/cases/:id/recommendations',
    { preHandler: [requireAuth] },
    async (req, reply: FastifyReply) => {
      const emergencyCase = store.getCase(req.params.id);
      if (!emergencyCase) {
        return reply.status(404).send({
          code: 'NOT_FOUND',
          message: `Case not found: ${req.params.id}`,
        });
      }

      const assessment = store.getLatestAssessment(req.params.id);
      if (!assessment || !assessment.clinicianConfirmed) {
        return reply.status(400).send({
          code: 'REQUIREMENTS_UNCONFIRMED',
          message: 'Clinical requirements must be confirmed by clinician before generating destination recommendations.',
        });
      }

      // Execute Stage 6 Bounded Agent Coordinator
      const { recommendation } = await runAgentCoordinator(
        req.params.id,
        req.user!.id,
        req.user!.role
      );

      return reply.status(200).send({ recommendation });
    }
  );

  // 7. Get Latest Recommendation
  fastify.get<{ Params: IdParams }>(
    '/api/v1/cases/:id/recommendations',
    { preHandler: [requireAuth] },
    async (req, reply: FastifyReply) => {
      const recommendation = store.getRecommendation(req.params.id);
      return reply.status(200).send({ recommendation: recommendation || null });
    }
  );

  // 8. Get Road Graph & Live Simulation State
  fastify.get(
    '/api/v1/routing/graph',
    { preHandler: [requireAuth] },
    async (_req, reply: FastifyReply) => {
      return reply.status(200).send({
        graph: SEEDED_ROAD_GRAPH,
        trafficOverrides: store.trafficOverrides,
        ambulancePosition: store.ambulancePosition,
      });
    }
  );

  // 8.5 Get Active Preview Routes (even before case creation or recommendation)
  fastify.get(
    '/api/v1/routing/preview-routes',
    { preHandler: [requireAuth] },
    async (_req, reply: FastifyReply) => {
      const hospitals = store.listHospitals().slice(0, 3);
      const currentPos = store.ambulancePosition;
      const routeResults: Record<string, any> = {};

      for (const target of hospitals) {
        const route = await geographicRoutingProvider.calculateGeographicRoute(
          { lat: currentPos.lat, lng: currentPos.lng },
          { hospitalId: target.id, hospitalName: target.name, lat: target.location.lat, lng: target.location.lng },
          store.trafficOverrides
        );
        routeResults[target.id] = route;
      }

      return reply.status(200).send({
        positionSequence: currentPos.serverSequence,
        routes: routeResults,
        generatedAt: new Date().toISOString(),
      });
    }
  );

  // 9. Get Case Geographic Routes (Google Routes / Simulated Road Geometry)
  fastify.get<{ Params: IdParams }>(
    '/api/v1/cases/:id/routes',
    { preHandler: [requireAuth] },
    async (req, reply: FastifyReply) => {
      const emergencyCase = store.getCase(req.params.id);
      if (!emergencyCase) {
        return reply.status(404).send({
          code: 'CASE_NOT_FOUND',
          message: `Case ${req.params.id} does not exist`,
        });
      }

      const currentPos = store.ambulancePosition;

      // Query shared route snapshot used by recommendations (Stage 2 / Finding 31)
      let snapshot = store.getCaseRouteSnapshot(req.params.id);
      if (!snapshot) {
        snapshot = await evaluateCaseCandidateRoutes({
          caseId: req.params.id,
          origin: { lat: currentPos.lat, lng: currentPos.lng },
          candidates: store.listHospitals(),
          trafficOverrides: store.trafficOverrides,
          positionSequence: currentPos.serverSequence,
          sourceGeneration: currentPos.sourceGeneration,
        });
      }

      return reply.status(200).send({
        caseId: req.params.id,
        routeSnapshotId: snapshot.snapshotId,
        positionSequence: currentPos.serverSequence,
        routes: snapshot.routes,
        generatedAt: snapshot.evaluatedAt,
      });
    }
  );

  // 10. Get Recommendation Diagnostic Provenance (Stage 1 / Gate 1)
  fastify.get<{ Params: IdParams }>(
    '/api/v1/cases/:id/recommendation-diagnostic',
    { preHandler: [requireAuth] },
    async (req, reply: FastifyReply) => {
      const diag = store.getRecommendationDiagnostic(req.params.id);
      if (!diag) {
        return reply.status(404).send({
          code: 'DIAGNOSTIC_NOT_FOUND',
          message: `No diagnostic report found for case ${req.params.id}`,
        });
      }
      return reply.status(200).send({ diagnostic: diag });
    }
  );

  // 10. Ingest Ambulance Position (Device GPS or Field Telemetry)
  fastify.post<{ Params: IdParams }>(
    '/api/v1/ambulances/:id/position',
    { preHandler: [requireAuth] },
    async (req, reply: FastifyReply) => {
      const parseResult = SubmitDevicePositionSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Invalid ambulance position payload',
          details: parseResult.error.format(),
        });
      }

      const { lat, lng, speed, heading, accuracyMeters, observedAt } = parseResult.data;

      // Exclusive position producer enforcement (Stage 1.3): Live GPS pauses simulation
      if (simulationService.getSimulationState().simulationRun.running) {
        simulationService.pause();
      }

      const updatedPosition = store.submitDevicePosition(
        lat,
        lng,
        speed || 0,
        heading || 0,
        accuracyMeters,
        observedAt
      );

      const io = getIO();
      if (io) {
        io.to('ambulance:cases').emit('ambulance.position.updated', updatedPosition);
        io.to('admin').emit('ambulance.position.updated', updatedPosition);
      }

      return reply.status(200).send({
        success: true,
        position: updatedPosition,
      });
    }
  );
}
