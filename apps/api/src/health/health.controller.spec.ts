import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Clock } from '../common/clock.js';
import { ClockModule } from '../common/clock.module.js';
import { HealthModule } from './health.module.js';

describe('GET /health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ClockModule, HealthModule],
    })
      .overrideProvider(Clock)
      .useValue({ now: () => new Date('2026-01-01T10:00:00Z') })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responds 200 with the status and the time from the clock', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body).toEqual({ status: 'ok', time: '2026-01-01T10:00:00.000Z' });
  });

  it('only answers GET', async () => {
    await request(app.getHttpServer()).post('/health').expect(404);
  });
});
