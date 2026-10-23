import { describe, expect, it } from 'vitest';

import { validateEnv } from './env.schema.js';

const SECRET = 'secret-db-password';
const DATABASE_URL = `postgresql://manos:${SECRET}@127.0.0.1:5432/manos`;
const WEB_ORIGIN = 'https://manos.example';
const validConfig = { NODE_ENV: 'development', DATABASE_URL, WEB_ORIGIN };

describe('validateEnv', () => {
  it('accepts a valid configuration and converts the port to a number', () => {
    const config = validateEnv({ ...validConfig, NODE_ENV: 'production', PORT: '4000' });

    expect(config).toEqual({
      NODE_ENV: 'production',
      DATABASE_URL,
      WEB_ORIGIN,
      PORT: 4000,
      LOG_LEVEL: 'info',
    });
  });

  it('uses 3000 when PORT is missing', () => {
    expect(validateEnv(validConfig).PORT).toBe(3000);
  });

  it('requires NODE_ENV', () => {
    expect(() => validateEnv({ DATABASE_URL })).toThrow('NODE_ENV');
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => validateEnv({ ...validConfig, NODE_ENV: 'staging' })).toThrow('NODE_ENV');
  });

  it('uses info as the default log level', () => {
    expect(validateEnv(validConfig).LOG_LEVEL).toBe('info');
  });

  it('rejects an unknown log level', () => {
    expect(() => validateEnv({ ...validConfig, LOG_LEVEL: 'loud' })).toThrow('LOG_LEVEL');
  });

  it.each(['abc', '', '0', '65536', '3000.5'])('rejects the invalid port "%s"', (port) => {
    expect(() => validateEnv({ ...validConfig, PORT: port })).toThrow('PORT');
  });

  it('requires DATABASE_URL', () => {
    expect(() => validateEnv({ NODE_ENV: 'development' })).toThrow('DATABASE_URL');
  });

  it.each([`mysql://manos:${SECRET}@127.0.0.1:3306/manos`, 'not a url', ''])(
    'rejects the invalid database URL "%s"',
    (url) => {
      expect(() => validateEnv({ ...validConfig, DATABASE_URL: url })).toThrow('DATABASE_URL');
    },
  );

  it('never prints the password of an invalid database URL', () => {
    const invalid = {
      ...validConfig,
      DATABASE_URL: `mysql://manos:${SECRET}@127.0.0.1:3306/manos`,
    };

    expect(() => validateEnv(invalid)).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(SECRET) }),
    );
  });

  it('requires WEB_ORIGIN', () => {
    expect(() => validateEnv({ NODE_ENV: 'development', DATABASE_URL })).toThrow('WEB_ORIGIN');
  });

  it('accepts a local origin with a port', () => {
    const config = validateEnv({ ...validConfig, WEB_ORIGIN: 'http://localhost:3001' });

    expect(config.WEB_ORIGIN).toBe('http://localhost:3001');
  });

  it.each([
    'https://manos.example/',
    'https://manos.example/app',
    'ftp://manos.example',
    'manos.example',
    '',
  ])('rejects the invalid web origin "%s"', (origin) => {
    expect(() => validateEnv({ ...validConfig, WEB_ORIGIN: origin })).toThrow('WEB_ORIGIN');
  });
});
