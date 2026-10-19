import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../test/test-database.js';

describe('data model rules', () => {
  const prisma = useTestDatabase();

  const newUser = (email: string, role: 'customer' | 'provider' | 'admin' = 'customer') =>
    prisma.user.create({
      data: { email, role, privacyNoticeVersion: '2026-10', privacyAcceptedAt: new Date() },
    });

  const newToken = (userId: string, tokenHash: string, replacedById: string | null = null) =>
    prisma.refreshToken.create({
      data: {
        userId,
        familyId: randomUUID(),
        sessionStartedAt: new Date(),
        tokenHash,
        expiresAt: new Date(),
        replacedById,
      },
    });

  it('stores emails only in lowercase', async () => {
    await expect(newUser('Ana@Example.com')).rejects.toThrow('User_email_lowercase_check');
  });

  it('does not allow two accounts with the same email', async () => {
    await newUser('ana@example.com');

    await expect(newUser('ana@example.com')).rejects.toMatchObject({ code: 'P2002' });
  });

  it('deletes the tokens of a user, even when they are chained', async () => {
    const ana = await newUser('ana@example.com');
    const second = await newToken(ana.id, 'second');
    await newToken(ana.id, 'first', second.id);
    await prisma.oneTimeToken.create({
      data: {
        userId: ana.id,
        purpose: 'password_reset',
        tokenHash: 'reset',
        expiresAt: new Date(),
      },
    });

    await prisma.user.delete({ where: { id: ana.id } });

    expect(await prisma.refreshToken.count()).toBe(0);
    expect(await prisma.oneTimeToken.count()).toBe(0);
  });

  it('allows a refresh token to be replaced by only one token', async () => {
    const ana = await newUser('ana@example.com');
    const next = await newToken(ana.id, 'next');
    await newToken(ana.id, 'first', next.id);

    await expect(newToken(ana.id, 'second', next.id)).rejects.toMatchObject({ code: 'P2002' });
  });

  it('does not delete a user who owns a provider profile', async () => {
    const luis = await newUser('luis@example.com', 'provider');
    await prisma.providerProfile.create({
      data: { userId: luis.id, businessName: 'Plomería Torres' },
    });

    await expect(prisma.user.delete({ where: { id: luis.id } })).rejects.toMatchObject({
      code: 'P2003',
    });
  });

  it('does not delete the administrator who reviewed a profile', async () => {
    const root = await newUser('admin@example.com', 'admin');
    const luis = await newUser('luis@example.com', 'provider');
    await prisma.providerProfile.create({
      data: { userId: luis.id, businessName: 'Plomería Torres', reviewedById: root.id },
    });

    await expect(prisma.user.delete({ where: { id: root.id } })).rejects.toMatchObject({
      code: 'P2003',
    });
  });

  it('does not repeat a category for the same provider', async () => {
    const luis = await newUser('luis@example.com', 'provider');
    const profile = await prisma.providerProfile.create({
      data: { userId: luis.id, businessName: 'Plomería Torres' },
    });
    const category = await prisma.category.create({
      data: { slug: 'plumbing', nameEs: 'Plomería', nameEn: 'Plumbing' },
    });
    const link = { providerId: profile.id, categoryId: category.id };
    await prisma.providerCategory.create({ data: link });

    await expect(prisma.providerCategory.create({ data: link })).rejects.toMatchObject({
      code: 'P2002',
    });
  });
});
