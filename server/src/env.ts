import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

// Load server-specific .env or monorepo root .env if present
dotenv.config({ path: resolve(moduleDirectory, '../.env') });
dotenv.config({ path: resolve(moduleDirectory, '../../.env') });

function optionalEnvironmentVariable(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function requiredEnvironmentVariable(name: 'MONGODB_URI' | 'SESSION_SECRET') {
  const value = optionalEnvironmentVariable(name);

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function clientOrigins() {
  const configured = optionalEnvironmentVariable('CLIENT_ORIGIN');
  const defaults = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const origins = (configured ?? defaults.join(','))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set(origins);
}

export const environment = {
  clientOrigins: clientOrigins(),
  cookieSameSite: (optionalEnvironmentVariable('COOKIE_SAME_SITE') as 'lax' | 'none' | 'strict') || 'lax',
  mongoDbUri: requiredEnvironmentVariable('MONGODB_URI'),
  nodeEnv: optionalEnvironmentVariable('NODE_ENV') ?? 'development',
  port: Number(optionalEnvironmentVariable('PORT') ?? '5000'),
  sessionSecret: requiredEnvironmentVariable('SESSION_SECRET'),
};

if (!Number.isInteger(environment.port) || environment.port < 1 || environment.port > 65535) {
  throw new Error('PORT must be a valid TCP port number');
}

if (environment.sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must contain at least 32 characters');
}
