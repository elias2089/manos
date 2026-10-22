import { existsSync } from 'node:fs';

/**
 * Returns the URL of the database used by the integration tests. It must be a different
 * database from the development one, because the tests empty its tables.
 */
export function getTestDatabaseUrl(): string {
  // Vitest does not load .env files. The path is relative to apps/api, as in prisma.config.ts
  if (existsSync('../../.env')) {
    process.loadEnvFile('../../.env');
  }

  const url = process.env['TEST_DATABASE_URL'];
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Create the manos_test database and add it to .env',
    );
  }

  // Only the database name is shown: the URL contains the password
  const database = getDatabaseName(url);
  if (!database.endsWith('_test')) {
    throw new Error(
      `TEST_DATABASE_URL must point to a database whose name ends in _test, got "${database}"`,
    );
  }
  return url;
}

function getDatabaseName(url: string): string {
  try {
    return new URL(url).pathname.slice(1);
  } catch {
    // The parser error includes the whole input, which contains the password
    throw new Error('TEST_DATABASE_URL is not a valid URL');
  }
}
