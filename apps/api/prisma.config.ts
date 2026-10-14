import { existsSync } from 'node:fs';

import { defineConfig } from 'prisma/config';

// Prisma 7 does not load .env files. The path is relative to the working directory
// (apps/api when run with pnpm -F), the same one ConfigModule reads. In CI and production
// the file does not exist and the variables come from the environment.
if (existsSync('../../.env')) {
  process.loadEnvFile('../../.env');
}

const url = process.env['DATABASE_URL'];

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // exactOptionalPropertyTypes: an undefined url must be left out, not set to undefined
  ...(url ? { datasource: { url } } : {}),
});
