import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { registerHealthRoutes } from './routes/health.js';
import { config } from './config.js';

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

  // Register routes
  fastify.register(registerHealthRoutes);

  return fastify;
}
