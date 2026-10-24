import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { registerHealthRoutes } from './routes/health.js';
import { registerAuthPlugin } from './modules/auth/plugin.js';
import { registerHospitalRoutes } from './modules/hospitals/routes.js';
import { registerCaseRoutes } from './modules/cases/routes.js';
import { registerDispatchRoutes } from './modules/dispatch/routes.js';
import { adminRoutes } from './modules/admin/routes.js';
import { registerSimulationRoutes } from './modules/simulation/routes.js';
import { initSocketIO } from './modules/realtime/index.js';
import { config } from './config.js';
import { store } from './db/store.js';

export function buildServer() {
  const fastify = Fastify({
    logger: {
      level: config.env === 'test' ? 'silent' : 'info',
    },
  });

  // Enable CORS
  fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  // Sensible defaults
  fastify.register(sensible);

  // Register Auth Plugin (cookies and /api/v1/auth routes)
  fastify.register(registerAuthPlugin);

  // Register Domain Routes
  fastify.register(registerHealthRoutes);
  fastify.register(registerHospitalRoutes);
  fastify.register(registerCaseRoutes);
  fastify.register(registerDispatchRoutes);
  fastify.register(adminRoutes);
  fastify.register(registerSimulationRoutes);

  // Initialize Socket.IO when server is ready
  fastify.addHook('onReady', async () => {
    initSocketIO(fastify.server);
  });

  return fastify;
}

export async function initApp() {
  await store.seed();
  const server = buildServer();
  return server;
}
