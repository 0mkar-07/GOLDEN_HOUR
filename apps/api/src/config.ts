import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const ConfigSchema = z.object({
  env: z.enum(['development', 'production', 'test']).default('development'),
  port: z.number().int().positive().default(4000),
  host: z.string().default('0.0.0.0'),
  databaseUrl: z.string().default('postgres://goldenhour:goldenhour_dev_password@localhost:5432/goldenhour'),
  serviceName: z.string().default('goldenhour-api'),
  corsOrigin: z.string().default('http://localhost:3000'),
  geminiApiKey: z.string().default(''),
  liveRoutingUrl: z.string().optional(),
});

const parsedConfig = ConfigSchema.safeParse({
  env: process.env.NODE_ENV,
  port: process.env.API_PORT || process.env.PORT ? parseInt(process.env.API_PORT || process.env.PORT || '4000', 10) : 4000,
  host: process.env.API_HOST || '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL,
  serviceName: 'goldenhour-api',
  corsOrigin: process.env.CORS_ORIGIN,
  geminiApiKey: process.env.GEMINI_API_KEY,
  liveRoutingUrl: process.env.LIVE_ROUTING_URL,
});

if (!parsedConfig.success) {
  console.error('[GoldenHour Config Error] Invalid environment configuration:', parsedConfig.error.format());
}

export const config = parsedConfig.success
  ? parsedConfig.data
  : {
      env: (process.env.NODE_ENV as any) || 'development',
      port: parseInt(process.env.PORT || '4000', 10),
      host: '0.0.0.0',
      databaseUrl: process.env.DATABASE_URL || 'postgres://goldenhour:goldenhour_dev_password@localhost:5432/goldenhour',
      serviceName: 'goldenhour-api',
      corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      geminiApiKey: process.env.GEMINI_API_KEY || '',
      liveRoutingUrl: process.env.LIVE_ROUTING_URL,
    };
