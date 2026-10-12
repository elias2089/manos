import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from './config/env.schema.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // The path is relative to the working directory (apps/api when run with pnpm -F)
      envFilePath: '../../.env',
      validate: validateEnv,
    }),
  ],
})
export class AppModule {}
