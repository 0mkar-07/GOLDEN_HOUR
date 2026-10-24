import { FastifyInstance } from 'fastify';
import { checkDatabaseHealth } from '../db/index.js';
import { config } from '../config.js';
import { HealthLiveResponse, HealthReadyResponse } from '@goldenhour/contracts';

export async function registerHealthRoutes(fastify: FastifyInstance) {
  // Liveness check
  fastify.get<{ Reply: HealthLiveResponse }>('/health/live', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      service: config.serviceName,
    });
  });

  // Readiness check
  fastify.get<{ Reply: HealthReadyResponse }>('/health/ready', async (_request, reply) => {
    const dbHealth = await checkDatabaseHealth();
    const isReady = dbHealth.status === 'connected';

    const response: HealthReadyResponse = {
      status: isReady ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      service: config.serviceName,
      database: {
        status: dbHealth.status,
        latencyMs: dbHealth.latencyMs,
        error: dbHealth.error,
      },
    };

    // Return 200 if fully ready, or 503 if database check fails
    return reply.status(isReady ? 200 : 503).send(response);
  });

  // Alias for /api/v1/health endpoints
  fastify.get('/api/v1/health', async (_request, reply) => {
    const dbHealth = await checkDatabaseHealth();
    return reply.status(dbHealth.status === 'connected' ? 200 : 200).send({
      service: config.serviceName,
      live: true,
      ready: dbHealth.status === 'connected',
      database: dbHealth,
      timestamp: new Date().toISOString(),
    });
  });
}
