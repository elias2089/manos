import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

import { ClockModule } from './common/clock.module.js';
import { HealthModule } from './health/health.module.js';
import type { Env } from './config/env.schema.js';
import { validateEnv } from './config/env.schema.js';
import { buildLoggerParams } from './config/logger.config.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // The path is relative to the working directory (apps/api when run with pnpm -F)
      envFilePath: '../../.env',
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        buildLoggerParams(config.get('LOG_LEVEL', { infer: true })),
    }),
    ClockModule,
    PrismaModule,
    HealthModule,
  ],
})
export class AppModule {}
