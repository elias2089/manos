import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import type { Env } from '../config/env.schema.js';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService<Env, true>) {
    const adapter = new PrismaPg({ connectionString: config.get('DATABASE_URL', { infer: true }) });
    super({ adapter });
  }

  // With the pg adapter, $connect() does not open a connection. A real query makes the API
  // fail at startup when the database is unreachable instead of at the first request.
  async onModuleInit() {
    await this.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
