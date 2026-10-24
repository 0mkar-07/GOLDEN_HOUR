import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  CreatePriorityReviewRequestSchema,
  DecidePriorityTicketRequestSchema,
  UserRole,
} from '@goldenhour/contracts';
import { store } from '../../db/store.js';
import { requireAuth } from '../auth/plugin.js';

interface HospitalIdParams {
  id: string;
}

interface CaseIdParams {
  id: string;
}

interface TicketIdParams {
  id: string;
}

export async function registerSchedulingRoutes(fastify: FastifyInstance) {
  // Hospital service hours
  fastify.get<{ Params: HospitalIdParams }>(
    '/api/v1/hospitals/:id/services',
    { preHandler: [requireAuth] },
    async (req, reply: FastifyReply) => {
      const services = store.getHospitalServices(req.params.id);
      return reply.status(200).send({ services });
    }
  );

  // Hospital operating theatres
  fastify.get<{ Params: HospitalIdParams }>(
    '/api/v1/hospitals/:id/theatres',
    { preHandler: [requireAuth] },
    async (req, reply: FastifyReply) => {
      const theatres = store.listOperatingTheatres(req.params.id);
      return reply.status(200).send({ theatres });
    }
  );

  // Hospital scheduled procedures
  fastify.get<{ Params: HospitalIdParams }>(
    '/api/v1/hospitals/:id/procedures',
    { preHandler: [requireAuth] },
    async (req, reply: FastifyReply) => {
      const procedures = store.listScheduledProcedures(req.params.id);
      return reply.status(200).send({ procedures });
    }
  );

  // Ambulance requests emergency-priority scheduling review for an incoming case
  fastify.post<{ Params: CaseIdParams; Body: unknown }>(
    '/api/v1/cases/:id/priority-review',
    { preHandler: [requireAuth] },
    async (req, reply: FastifyReply) => {
      const parseResult = CreatePriorityReviewRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Invalid priority review request payload',
          errors: parseResult.error.errors,
        });
      }

      const { hospitalId, estimatedArrivalSeconds, urgencyLevel, clinicalRationale } = parseResult.data;
      const ticket = store.createPriorityReview(
        req.params.id,
        hospitalId,
        estimatedArrivalSeconds,
        urgencyLevel,
        clinicalRationale
      );

      if (!ticket) {
        return reply.status(200).send({
          conflict: false,
          ticket: null,
          message: 'No conflicting scheduled procedure overlaps with emergency arrival window',
        });
      }

      return reply.status(201).send({ conflict: true, ticket });
    }
  );

  // Get current case priority review status (ambulance-safe summary)
  fastify.get<{ Params: CaseIdParams }>(
    '/api/v1/cases/:id/priority-review',
    { preHandler: [requireAuth] },
    async (req, reply: FastifyReply) => {
      const ticket = store.getCasePriorityReview(req.params.id);
      return reply.status(200).send({ ticket: ticket || null });
    }
  );

  // List pending and active priority review tickets for hospital
  fastify.get<{ Params: HospitalIdParams }>(
    '/api/v1/hospitals/:id/priority-tickets',
    { preHandler: [requireAuth] },
    async (req, reply: FastifyReply) => {
      const tickets = store.listHospitalPriorityTickets(req.params.id);
      return reply.status(200).send({ tickets });
    }
  );

  // Hospital decision on emergency priority ticket (approve deferral, decline, or alternate resource)
  fastify.post<{ Params: TicketIdParams; Body: unknown }>(
    '/api/v1/priority-tickets/:id/decision',
    { preHandler: [requireAuth] },
    async (req, reply: FastifyReply) => {
      const parseResult = DecidePriorityTicketRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'Invalid decision payload',
          errors: parseResult.error.errors,
        });
      }

      const { decision, reviewerNotes, alternateTheatreId } = parseResult.data;
      const user = (req as any).user;
      const reviewerId = user?.name || user?.email || 'Hospital Medical Director';

      const ticket = store.emergencyPriorityTickets.get(req.params.id);
      if (!ticket) {
        return reply.status(404).send({
          code: 'TICKET_NOT_FOUND',
          message: `Priority ticket ${req.params.id} not found`,
        });
      }

      // Authorization check (F-20 / S-02)
      if (user?.role === UserRole.AMBULANCE) {
        return reply.status(403).send({
          code: 'FORBIDDEN',
          message: 'Ambulance personnel cannot decide hospital surgical priority tickets',
        });
      }

      if (user?.role === UserRole.HOSPITAL) {
        const userHosp = store.resolveHospitalId(user.hospitalId || '');
        const ticketHosp = store.resolveHospitalId(ticket.hospitalId);
        if (userHosp !== ticketHosp) {
          return reply.status(403).send({
            code: 'FORBIDDEN',
            message: 'User does not belong to the hospital managing this surgical priority ticket',
          });
        }
      }

      try {
        const result = store.decidePriorityTicket(
          req.params.id,
          decision,
          reviewerNotes,
          reviewerId,
          alternateTheatreId
        );
        return reply.status(200).send(result);
      } catch (err: any) {
        return reply.status(400).send({
          code: 'DECISION_FAILED',
          message: err.message || 'Failed to process priority ticket decision',
        });
      }
    }
  );
}
