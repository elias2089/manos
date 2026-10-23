import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, it } from 'vitest';

import { configureApp } from './app.setup.js';
import { ClockModule } from './common/clock.module.js';
import { HealthModule } from './health/health.module.js';

// A business route does not exist yet, so the test brings its own
@Controller('ping')
class PingController {
  @Get()
  ping() {
    return { pong: true };
  }
}

describe('configureApp', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ClockModule, HealthModule],
      controllers: [PingController],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('puts the business routes under /v1', async () => {
    await request(app.getHttpServer()).get('/v1/ping').expect(200);
    await request(app.getHttpServer()).get('/ping').expect(404);
  });

  it('keeps /health outside the version', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
    await request(app.getHttpServer()).get('/v1/health').expect(404);
  });
});
