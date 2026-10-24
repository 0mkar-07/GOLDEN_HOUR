import { describe, it, expect, beforeAll } from 'vitest';
import { initApp } from '../src/server.js';
import { store } from '../src/db/store.js';

describe('Stages 3 & 4: Hospital Scheduling and Emergency Priority Review Tickets', () => {
  let app: any;
  let authCookie: string;
  let adminCookie: string;

  beforeAll(async () => {
    app = await initApp();

    // Authenticate demo paramedic
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'paramedic@goldenhour.test',
        password: 'demo123',
      },
    });
    expect(loginRes.statusCode).toBe(200);
    const cookies = loginRes.cookies;
    authCookie = cookies.find((c: any) => c.name === 'gh_session')?.value || '';

    // Authenticate demo admin for hospital priority decisions
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'admin@goldenhour.test',
        password: 'demo123',
      },
    });
    expect(adminLogin.statusCode).toBe(200);
    adminCookie = adminLogin.cookies.find((c: any) => c.name === 'gh_session')?.value || '';
  });

  it('retrieves operating theatres, service hours, and scheduled procedures for NITK/Mangaluru hospital', async () => {
    const theatresRes = await app.inject({
      method: 'GET',
      url: '/api/v1/hospitals/hosp-001/theatres',
      cookies: { gh_session: authCookie },
    });
    expect(theatresRes.statusCode).toBe(200);
    const theatresBody = JSON.parse(theatresRes.body);
    expect(theatresBody.theatres.length).toBeGreaterThan(0);
    expect(theatresBody.theatres[0].name).toContain('OT');

    const procsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/hospitals/hosp-001/procedures',
      cookies: { gh_session: authCookie },
    });
    expect(procsRes.statusCode).toBe(200);
    const procsBody = JSON.parse(procsRes.body);
    expect(procsBody.procedures.length).toBeGreaterThan(0);
    expect(procsBody.procedures.some((p: any) => p.caseType === 'ELECTIVE')).toBe(true);
  });

  it('creates an emergency-priority review ticket when incoming trauma case overlaps with scheduled elective case', async () => {
    const caseId = 'case-sched-test-1';
    store.createCase({
      id: caseId,
      ambulanceId: 'amb-104',
      paramedicId: 'user-amb-001',
      patientLabel: 'Trauma Patient NITK NH66',
      presentingIssue: 'Severe Hemorrhagic Shock',
      urgencyLevel: 'CRITICAL',
    });

    const reviewRes = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/priority-review`,
      cookies: { gh_session: authCookie },
      payload: {
        caseId,
        hospitalId: 'hosp-001',
        estimatedArrivalSeconds: 720,
        urgencyLevel: 'CRITICAL',
        clinicalRationale: 'Immediate trauma resuscitation required at A.J. Hospital OR-1.',
      },
    });

    expect(reviewRes.statusCode).toBe(201);
    const reviewBody = JSON.parse(reviewRes.body);
    expect(reviewBody.ticket).toBeDefined();
    expect(reviewBody.ticket.status).toBe('PENDING_REVIEW');
    expect(reviewBody.ticket.requestedAction).toBe('REVIEW_ELECTIVE_DEFERRAL');
    expect(reviewBody.ticket.conflictingProcedureName).toBeDefined();

    // Verify hospital work queue lists the ticket
    const hospTicketsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/hospitals/hosp-001/priority-tickets',
      cookies: { gh_session: authCookie },
    });
    expect(hospTicketsRes.statusCode).toBe(200);
    const hospTicketsBody = JSON.parse(hospTicketsRes.body);
    expect(hospTicketsBody.tickets.some((t: any) => t.id === reviewBody.ticket.id)).toBe(true);
  });

  it('approves elective deferral: marks ticket APPROVED and procedure DEFERRED without stopping in-progress cases', async () => {
    const caseId = 'case-sched-test-2';
    store.createCase({
      id: caseId,
      ambulanceId: 'amb-104',
      paramedicId: 'user-amb-001',
      patientLabel: 'Acute Neuro Trauma',
      presentingIssue: 'Depressed skull fracture',
      urgencyLevel: 'CRITICAL',
    });

    const ticket = store.createPriorityReview(caseId, 'hosp-001', 600, 'CRITICAL');

    const decisionRes = await app.inject({
      method: 'POST',
      url: `/api/v1/priority-tickets/${ticket.id}/decision`,
      cookies: { gh_session: adminCookie },
      payload: {
        decision: 'APPROVED',
        reviewerNotes: 'Elective case postponed to tomorrow morning; OR-1 reserved for incoming trauma.',
      },
    });

    expect(decisionRes.statusCode).toBe(200);
    const decisionBody = JSON.parse(decisionRes.body);
    expect(decisionBody.ticket.status).toBe('APPROVED');
    expect(decisionBody.deferredProcedure).toBeDefined();
    expect(decisionBody.deferredProcedure.status).toBe('DEFERRED');

    // Ambulance safe status query returns the approved ticket
    const ambTicketRes = await app.inject({
      method: 'GET',
      url: `/api/v1/cases/${caseId}/priority-review`,
      cookies: { gh_session: authCookie },
    });
    expect(ambTicketRes.statusCode).toBe(200);
    const ambTicketBody = JSON.parse(ambTicketRes.body);
    expect(ambTicketBody.ticket.status).toBe('APPROVED');
  });

  it('rejects deferral of protected in-progress procedures', () => {
    // In-progress procedure proc-102 has PROTECTED_IN_PROGRESS
    const ticketId = 'ticket-fail-protected';
    store.emergencyPriorityTickets.set(ticketId, {
      id: ticketId,
      caseId: 'case-protected-test',
      hospitalId: 'hosp-001',
      targetTheatreId: 'ot-001-2',
      conflictingProcedureId: 'proc-102',
      conflictingProcedureName: 'Acute Appendectomy',
      caseType: 'URGENT',
      emergencyArrivalWindow: { start: new Date().toISOString(), end: new Date().toISOString(), estimatedSeconds: 300 },
      status: 'PENDING_REVIEW',
      requestedAction: 'REVIEW_ELECTIVE_DEFERRAL',
      clinicalRationale: 'Test',
      createdAt: new Date().toISOString(),
      version: 1,
    });

    expect(() => {
      store.decidePriorityTicket(ticketId, 'APPROVED', 'Try to defer in-progress surgery');
    }).toThrow(/Cannot defer procedure: already in progress or protected/);
  });
});
