import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeEach } from 'vitest';

import { PrismaClient } from '../generated/prisma/client.js';
import { getTestDatabaseUrl } from './test-database-url.js';

/**
 * Empties every table of the test database and keeps the migration history. The database
 * builds the statement from its own list of tables, so a new model is covered without
 * touching this file.
 */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRaw`DO $$
    BEGIN
      EXECUTE (
        SELECT 'TRUNCATE ' || string_agg(format('%I', tablename), ', ') || ' CASCADE'
        FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
      );
    END $$`;
}

/**
 * Connects a Prisma client to the test database and empties it before every test. Call it
 * once at the top of an integration test file.
 */
export function useTestDatabase(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: getTestDatabaseUrl() });
  const prisma = new PrismaClient({ adapter });

  beforeEach(() => resetDatabase(prisma));
  afterAll(() => prisma.$disconnect());

  return prisma;
}
