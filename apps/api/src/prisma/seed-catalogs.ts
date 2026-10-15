import type { PrismaClient } from '../generated/prisma/client.js';
import { CATEGORIES, ZONES } from './seed-data.js';

export interface SeedResult {
  categories: number;
  zones: number;
}

/**
 * Inserts the initial catalogs. Safe to run many times: rows whose slug already exists are
 * skipped, so edits made later to a name are never overwritten. Returns the rows inserted.
 */
export async function seedCatalogs(prisma: PrismaClient): Promise<SeedResult> {
  const [categories, zones] = await prisma.$transaction([
    prisma.category.createMany({ data: [...CATEGORIES], skipDuplicates: true }),
    prisma.zone.createMany({ data: [...ZONES], skipDuplicates: true }),
  ]);
  return { categories: categories.count, zones: zones.count };
}
