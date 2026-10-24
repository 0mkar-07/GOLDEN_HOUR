import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config();
// Also attempt reading from root .env if running from workspace
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.API_PORT || '4000', 10),
  host: process.env.API_HOST || '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL || 'postgres://goldenhour:goldenhour_dev_password@localhost:5432/goldenhour',
  serviceName: 'goldenhour-api',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
};
