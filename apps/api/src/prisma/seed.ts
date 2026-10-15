import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client.js';
import { seedCatalogs } from './seed-catalogs.js';

const connectionString = process.env['DATABASE_URL'];
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

try {
  const { categories, zones } = await seedCatalogs(prisma);
  console.log(`Seed done: ${categories} categories and ${zones} zones inserted`);
} finally {
  await prisma.$disconnect();
}
