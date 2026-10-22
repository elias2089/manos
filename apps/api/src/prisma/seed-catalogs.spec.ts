import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../test/test-database.js';
import { seedCatalogs } from './seed-catalogs.js';
import { CATEGORIES, ZONES } from './seed-data.js';

describe('seedCatalogs', () => {
  const prisma = useTestDatabase();

  it('inserts every category and zone', async () => {
    const result = await seedCatalogs(prisma);

    expect(result).toEqual({ categories: CATEGORIES.length, zones: ZONES.length });
    expect(await prisma.category.count()).toBe(CATEGORIES.length);
    expect(await prisma.zone.count()).toBe(ZONES.length);
  });

  it('inserts nothing when it runs again', async () => {
    await seedCatalogs(prisma);

    const second = await seedCatalogs(prisma);

    expect(second).toEqual({ categories: 0, zones: 0 });
    expect(await prisma.category.count()).toBe(CATEGORIES.length);
    expect(await prisma.zone.count()).toBe(ZONES.length);
  });

  it('keeps a name that was edited after the first run', async () => {
    await seedCatalogs(prisma);
    await prisma.category.update({
      where: { slug: 'plumbing' },
      data: { nameEn: 'Pipe fitting' },
    });

    await seedCatalogs(prisma);

    const plumbing = await prisma.category.findUniqueOrThrow({ where: { slug: 'plumbing' } });
    expect(plumbing.nameEn).toBe('Pipe fitting');
  });

  it('adds only the missing rows when some already exist', async () => {
    await prisma.zone.create({
      data: { slug: 'coyoacan', name: 'Coyoacán', state: 'Ciudad de México' },
    });

    const result = await seedCatalogs(prisma);

    expect(result.zones).toBe(ZONES.length - 1);
  });
});
