import { execFileSync } from 'node:child_process';

import { getTestDatabaseUrl } from './src/test/test-database-url.js';

// Applies every migration to the test database before any test runs. It also proves that
// the migrations can be applied to an empty database.
export function setup() {
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: getTestDatabaseUrl() },
    stdio: 'inherit',
  });
}
