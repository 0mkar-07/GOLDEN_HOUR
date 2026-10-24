import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { registerHealthRoutes } from './routes/health.js';
import { registerAuthPlugin } from './modules/auth/plugin.js';
import { registerHospitalRoutes } from './modules/hospitals/routes.js';
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

  return fastify;
}

export async function initApp() {
  await store.seed();
  const server = buildServer();
  return server;
}
