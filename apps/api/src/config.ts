import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.API_PORT || '4000', 10),
  host: process.env.API_HOST || '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL || 'postgres://goldenhour:goldenhour_dev_password@localhost:5432/goldenhour',
  serviceName: 'goldenhour-api',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
};
