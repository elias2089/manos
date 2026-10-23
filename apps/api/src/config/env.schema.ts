import { z } from 'zod';

const ORIGIN_ERROR =
  'Expected an origin without path or trailing slash, like https://manos.example';

// The browser sends the Origin header in this exact form, so the setting must match it
function isOrigin(value: string): boolean {
  if (!URL.canParse(value)) {
    return false;
  }
  const url = new URL(value);
  return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url({
    protocol: /^postgres(ql)?$/,
    error: 'Expected a PostgreSQL URL like postgresql://user:password@host:5432/database',
  }),
  WEB_ORIGIN: z.string({ error: ORIGIN_ERROR }).refine(isOrigin, { error: ORIGIN_ERROR }),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
