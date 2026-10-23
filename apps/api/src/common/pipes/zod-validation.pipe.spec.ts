import { Body, Controller, type INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { configureApp } from '../../app.setup.js';
import { ApiException } from '../errors/api.exception.js';
import { ERROR_MESSAGES } from '../errors/error-codes.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';
import { TEST_APP_OPTIONS } from '../../test/test-app-options.js';

const signupSchema = z.strictObject({
  email: z.email(),
  password: z.string().min(12),
});

// The API has no business routes yet, so the test brings one that uses the pipe
@Controller('signup')
class SignupController {
  @Post()
  create(@Body(new ZodValidationPipe(signupSchema)) body: z.infer<typeof signupSchema>) {
    return { email: body.email };
  }
}

function validationError<T>(pipe: ZodValidationPipe<T>, value: unknown): ApiException {
  try {
    pipe.transform(value);
  } catch (error) {
    if (error instanceof ApiException) {
      return error;
    }
    throw error;
  }
  throw new Error('The pipe accepted an invalid value');
}

describe('ZodValidationPipe', () => {
  it('returns the parsed data, with the defaults applied', () => {
    const pipe = new ZodValidationPipe(z.object({ page: z.coerce.number().default(1) }));

    expect(pipe.transform({})).toEqual({ page: 1 });
    expect(pipe.transform({ page: '3' })).toEqual({ page: 3 });
  });

  it('names a nested field with dots', () => {
    const pipe = new ZodValidationPipe(z.object({ profile: z.object({ name: z.string() }) }));

    const error = validationError(pipe, { profile: {} });

    expect(error.getStatus()).toBe(400);
    expect(error.code).toBe('validation_failed');
    expect(error.details).toEqual([{ field: 'profile.name', code: 'invalid_type' }]);
  });

  describe('in a route', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [SignupController],
      }).compile();

      app = moduleRef.createNestApplication({ logger: false });
      configureApp(app, TEST_APP_OPTIONS);
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('lets a valid body through', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/signup')
        .send({ email: 'ana@example.com', password: 'a-long-enough-password' })
        .expect(201);

      expect(response.body).toEqual({ email: 'ana@example.com' });
    });

    it('answers an invalid body with validation_failed and the details', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/signup')
        .send({ email: 'not-an-email', password: 'short' })
        .expect(400);

      expect(response.body).toEqual({
        code: 'validation_failed',
        message: ERROR_MESSAGES.validation_failed,
        details: [
          { field: 'email', code: 'invalid_format' },
          { field: 'password', code: 'too_small' },
        ],
      });
    });

    it('rejects a field the schema does not list', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/signup')
        .send({ email: 'ana@example.com', password: 'a-long-enough-password', role: 'admin' })
        .expect(400);

      expect(response.body.code).toBe('validation_failed');
      expect(response.body.details).toEqual([{ field: '', code: 'unrecognized_keys' }]);
    });
  });
});
