import { describe, expect, it } from 'vitest';

import { resetDatabase, useTestDatabase } from './test-database.js';

describe('test database helper', () => {
  const prisma = useTestDatabase();

  it('empties every table, including rows linked by foreign keys', async () => {
    await prisma.category.create({
      data: { slug: 'plumbing', nameEs: 'Plomería', nameEn: 'Plumbing' },
    });
    await prisma.user.create({
      data: {
        email: 'ana@example.com',
        privacyNoticeVersion: '2026-10',
        privacyAcceptedAt: new Date(),
        oneTimeTokens: {
          create: { purpose: 'email_verification', tokenHash: 'hash', expiresAt: new Date() },
        },
      },
    });

    await resetDatabase(prisma);

    expect(await prisma.category.count()).toBe(0);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.oneTimeToken.count()).toBe(0);
  });

  it('keeps the migration history', async () => {
    await resetDatabase(prisma);

    const rows = await prisma.$queryRaw<
      { applied: number }[]
    >`SELECT count(*)::int AS applied FROM _prisma_migrations`;

    expect(rows[0]?.applied).toBeGreaterThan(0);
  });
});
