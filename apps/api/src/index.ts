import { buildServer } from './server.js';
import { config } from './config.js';

const server = buildServer();

async function start() {
  try {
    const address = await server.listen({
      port: config.port,
      host: config.host,
    });
    console.log(`[GoldenHour API] Server running at ${address}`);
    console.log(`[GoldenHour API] Liveness check: ${address}/health/live`);
    console.log(`[GoldenHour API] Readiness check: ${address}/health/ready`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();
