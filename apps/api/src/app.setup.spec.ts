import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configureApp } from './app.setup.js';
import { ClockModule } from './common/clock.module.js';
import { HealthModule } from './health/health.module.js';
import { TEST_APP_OPTIONS } from './test/test-app-options.js';

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
    configureApp(app, TEST_APP_OPTIONS);
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

  it('sends the security headers and hides the framework', async () => {
    const response = await request(app.getHttpServer()).get('/v1/ping').expect(200);

    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('authorizes the web origin to read responses and send cookies', async () => {
    const response = await request(app.getHttpServer())
      .options('/v1/ping')
      .set('Origin', TEST_APP_OPTIONS.webOrigin)
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe(TEST_APP_OPTIONS.webOrigin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not authorize any other origin', async () => {
    const response = await request(app.getHttpServer())
      .options('/v1/ping')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });
});
