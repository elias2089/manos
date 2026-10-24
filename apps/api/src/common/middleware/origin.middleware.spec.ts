import { Controller, Delete, Get, type INestApplication, Patch, Post, Put } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureApp } from '../../app.setup.js';
import { TEST_APP_OPTIONS } from '../../test/test-app-options.js';

// Counts how many requests got past the middleware, so a rejection can prove "nothing ran"
let handled = 0;

@Controller('change')
class ChangeController {
  @Get()
  read() {
    handled += 1;
    return { ok: true };
  }

  @Post()
  create() {
    handled += 1;
    return { ok: true };
  }

  @Patch()
  update() {
    handled += 1;
    return { ok: true };
  }

  @Put()
  replace() {
    handled += 1;
    return { ok: true };
  }

  @Delete()
  remove() {
    handled += 1;
    return { ok: true };
  }
}

const { webOrigin } = TEST_APP_OPTIONS;

describe('origin middleware', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ChangeController],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app, TEST_APP_OPTIONS);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    handled = 0;
  });

  describe('accepts', () => {
    it('a write from the web origin', async () => {
      await request(app.getHttpServer()).post('/v1/change').set('Origin', webOrigin).expect(201);
      expect(handled).toBe(1);
    });

    it('a write with no origin and no cookies, like a testing tool', async () => {
      await request(app.getHttpServer()).post('/v1/change').expect(201);
      expect(handled).toBe(1);
    });

    it('a write with no origin and only unrelated cookies', async () => {
      await request(app.getHttpServer()).post('/v1/change').set('Cookie', 'theme=dark').expect(201);
      expect(handled).toBe(1);
    });

    it('a write from the web origin that carries the session cookie', async () => {
      await request(app.getHttpServer())
        .post('/v1/change')
        .set('Origin', webOrigin)
        .set('Cookie', 'access=token')
        .expect(201);
      expect(handled).toBe(1);
    });
  });

  describe('rejects', () => {
    const cases = [
      ['another origin', { Origin: 'https://evil.example' }],
      ['the "null" origin', { Origin: 'null' }],
      ['the web origin with a trailing slash', { Origin: `${webOrigin}/` }],
      ['an origin that only starts like the web origin', { Origin: `${webOrigin}.evil.example` }],
      ['no origin with the access cookie', { Cookie: 'access=token' }],
      ['no origin with the refresh cookie among others', { Cookie: 'theme=dark; refresh=token' }],
    ] as const;

    it.each(cases)('%s', async (_name, headers) => {
      const response = await request(app.getHttpServer()).post('/v1/change').set(headers);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'csrf_origin_rejected' });
      expect(handled).toBe(0);
    });

    it.each(['post', 'patch', 'put', 'delete'] as const)(
      'a %s from another origin',
      async (method) => {
        await request(app.getHttpServer())
          [method]('/v1/change')
          .set('Origin', 'https://evil.example')
          .expect(403);
        expect(handled).toBe(0);
      },
    );
  });

  it('does not check reads', async () => {
    await request(app.getHttpServer())
      .get('/v1/change')
      .set('Origin', 'https://evil.example')
      .expect(200);
    expect(handled).toBe(1);
  });
});
