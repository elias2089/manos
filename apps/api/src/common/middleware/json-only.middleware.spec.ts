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

const URL = '/v1/change';

describe('json-only middleware', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

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
    it('a JSON body', async () => {
      await http().post(URL).send({ name: 'Ana' }).expect(201);
      expect(handled).toBe(1);
    });

    it('a JSON body that declares its charset', async () => {
      await http()
        .post(URL)
        .set('Content-Type', 'application/json; charset=utf-8')
        .send('{"name":"Ana"}')
        .expect(201);
      expect(handled).toBe(1);
    });

    it('a request with no body, whatever its content type says', async () => {
      await http().post(URL).set('Content-Type', 'text/plain').expect(201);
      expect(handled).toBe(1);
    });
  });

  describe('rejects', () => {
    const cases = [
      ['a urlencoded form', () => http().post(URL).type('form').send({ name: 'Ana' })],
      ['a multipart form', () => http().post(URL).field('name', 'Ana')],
      ['plain text', () => http().post(URL).type('text').send('hello')],
      ['a look-alike JSON type', () => http().post(URL).type('application/json-evil').send('{}')],
      ['plain text in a PATCH', () => http().patch(URL).type('text').send('hello')],
      ['plain text in a PUT', () => http().put(URL).type('text').send('hello')],
      ['plain text in a DELETE', () => http().delete(URL).type('text').send('hello')],
    ] as const;

    it.each(cases)('%s', async (_name, send) => {
      const response = await send();

      expect(response.status).toBe(415);
      expect(response.body).toMatchObject({ code: 'unsupported_media_type' });
      expect(handled).toBe(0);
    });
  });

  it('does not check reads', async () => {
    await http().get(URL).set('Content-Type', 'text/plain').expect(200);
    expect(handled).toBe(1);
  });
});
