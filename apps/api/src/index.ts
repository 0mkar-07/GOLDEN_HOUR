import { initApp } from './server.js';
import { config } from './config.js';

async function start() {
  try {
    const server = await initApp();
    const address = await server.listen({
      port: config.port,
      host: config.host,
    });
    console.log(`[GoldenHour API] Server running at ${address}`);
    console.log(`[GoldenHour API] Auth endpoints ready at ${address}/api/v1/auth`);
    console.log(`[GoldenHour API] Liveness check: ${address}/health/live`);
    console.log(`[GoldenHour API] Readiness check: ${address}/health/ready`);
  } catch (err) {
    console.error('[GoldenHour API Startup Error]', err);
    process.exit(1);
  }
}

start();
