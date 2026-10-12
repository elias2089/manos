import type { Params } from 'nestjs-pino';
import type { DestinationStream } from 'pino';

import type { Env } from './env.schema.js';

const SENSITIVE_KEYS = [
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'token',
  'accessToken',
  'refreshToken',
];

// The "*" wildcard covers one level of nesting, so each key is listed at the root and one level down
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  ...SENSITIVE_KEYS,
  ...SENSITIVE_KEYS.map((key) => `*.${key}`),
];

// The optional stream lets tests capture the log lines instead of writing them to stdout
export function buildLoggerParams(level: Env['LOG_LEVEL'], stream?: DestinationStream): Params {
  const options = { level, redact: REDACTED_PATHS };
  return { pinoHttp: stream ? [options, stream] : options };
}
