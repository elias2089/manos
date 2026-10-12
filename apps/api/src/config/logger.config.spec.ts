import { Controller, Get, Header, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LoggerModule, PinoLogger } from 'nestjs-pino';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildLoggerParams } from './logger.config.js';

@Controller()
class FakeLoginController {
  @Get('login')
  @Header('Set-Cookie', 'refresh=secret-refresh-cookie; HttpOnly')
  login() {
    return { ok: true };
  }
}

const lines: string[] = [];
const stream = {
  write: (line: string) => {
    lines.push(line);
  },
};
const output = () => lines.join('');

describe('log redaction', () => {
  let app: INestApplication;
  let logger: PinoLogger;

  // nestjs-pino keeps one root logger per process, so the module is created once per file
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [LoggerModule.forRoot(buildLoggerParams('info', stream))],
      controllers: [FakeLoginController],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    logger = await moduleRef.resolve(PinoLogger);
  });

  beforeEach(() => {
    lines.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  it('hides the Authorization and Cookie request headers', async () => {
    await request(app.getHttpServer())
      .get('/anything')
      .set('Authorization', 'Bearer secret-bearer-token')
      .set('Cookie', 'session=secret-session-cookie');

    await vi.waitFor(() => expect(output()).toContain('request completed'));

    expect(output()).not.toContain('secret-bearer-token');
    expect(output()).not.toContain('secret-session-cookie');
    expect(output()).toContain('[Redacted]');
  });

  it('hides the Set-Cookie response header', async () => {
    await request(app.getHttpServer()).get('/login');

    await vi.waitFor(() => expect(output()).toContain('request completed'));

    expect(output()).not.toContain('secret-refresh-cookie');
    expect(output()).toContain('[Redacted]');
  });

  it('hides sensitive fields in logged objects', () => {
    logger.info(
      { password: 'secret-password', user: { refreshToken: 'secret-refresh-token' } },
      'test event',
    );

    expect(output()).toContain('test event');
    expect(output()).not.toContain('secret-password');
    expect(output()).not.toContain('secret-refresh-token');
  });

  it('keeps fields that are not sensitive', () => {
    logger.info({ userId: 'u-ana' }, 'test event');

    expect(output()).toContain('u-ana');
  });
});
