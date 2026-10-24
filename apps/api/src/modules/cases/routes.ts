import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  CreateCaseRequestSchema,
  SubmitAssessmentRequestSchema,
  ConfirmRequirementsRequestSchema,
} from '@goldenhour/contracts';
import { store } from '../../db/store.js';
import { requireAuth } from '../auth/plugin.js';
import { runAgent1 } from '../agents/agent1.js';

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

      // Execute Agent 1 deterministic reasoning
      const agent1Proposal = runAgent1(observations);

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
}
