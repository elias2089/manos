import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import type { Env } from './config/env.schema.js';
import { configureApp } from './app.setup.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  configureApp(app, { webOrigin: config.get('WEB_ORIGIN', { infer: true }) });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  await app.listen(config.get('PORT', { infer: true }));
}

await bootstrap();
