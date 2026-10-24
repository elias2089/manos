import {
  Body,
  Controller,
  Get,
  HttpStatus,
  type INestApplication,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { configureApp } from '../../app.setup.js';
import { ApiException } from './api.exception.js';
import { ERROR_MESSAGES } from './error-codes.js';
import { TEST_APP_OPTIONS } from '../../test/test-app-options.js';

// The API has no business routes yet, so the test brings routes that fail in different ways
@Controller('boom')
class BoomController {
  @Get('api')
  api() {
    throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, 'too_many_requests', [
      { field: 'email', code: 'too_small' },
    ]);
  }

  @Get('nest')
  nest() {
    throw new UnauthorizedException();
  }

  @Get('unexpected')
  unexpected() {
    throw new Error('secret database detail');
  }

  @Post('echo')
  echo(@Body() body: unknown) {
    return body;
  }
}

describe('AllExceptionsFilter', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [BoomController] }).compile();

    // The logger is off so the expected 500 does not fill the test output
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, TEST_APP_OPTIONS);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers an unknown route with not_found in the common format', async () => {
    const response = await request(app.getHttpServer()).get('/v1/nothing-here').expect(404);

    expect(response.body).toEqual({
      code: 'not_found',
      message: ERROR_MESSAGES.not_found,
      details: [],
    });
  });

  it('keeps the status, the code and the details of an ApiException', async () => {
    const response = await request(app.getHttpServer()).get('/v1/boom/api').expect(429);

    expect(response.body).toEqual({
      code: 'too_many_requests',
      message: ERROR_MESSAGES.too_many_requests,
      details: [{ field: 'email', code: 'too_small' }],
    });
  });

  it('maps a Nest exception by its status', async () => {
    const response = await request(app.getHttpServer()).get('/v1/boom/nest').expect(401);

    expect(response.body.code).toBe('unauthorized');
  });

  it('answers an unexpected error with a generic 500 and does not leak it', async () => {
    const response = await request(app.getHttpServer()).get('/v1/boom/unexpected').expect(500);

    expect(response.body).toEqual({
      code: 'internal_error',
      message: ERROR_MESSAGES.internal_error,
      details: [],
    });
    expect(response.text).not.toContain('secret database detail');
  });

  it('answers a malformed JSON body with bad_request', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/boom/echo')
      .set('Content-Type', 'application/json')
      .send('{"broken":')
      .expect(400);

    expect(response.body.code).toBe('bad_request');
  });

  it('answers a body over the size limit with payload_too_large', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/boom/echo')
      .send({ data: 'x'.repeat(200_000) })
      .expect(413);

    expect(response.body.code).toBe('payload_too_large');
  });
});
