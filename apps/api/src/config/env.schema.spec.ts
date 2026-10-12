import { describe, expect, it } from 'vitest';

import { validateEnv } from './env.schema.js';

describe('validateEnv', () => {
  it('accepts a valid configuration and converts the port to a number', () => {
    expect(validateEnv({ NODE_ENV: 'production', PORT: '4000', LOG_LEVEL: 'info' })).toEqual({
      NODE_ENV: 'production',
      PORT: 4000,
      LOG_LEVEL: 'info',
    });
  });

  it('uses 3000 when PORT is missing', () => {
    expect(validateEnv({ NODE_ENV: 'development' }).PORT).toBe(3000);
  });

  it('requires NODE_ENV', () => {
    expect(() => validateEnv({})).toThrow('NODE_ENV');
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => validateEnv({ NODE_ENV: 'staging' })).toThrow('NODE_ENV');
  });

  it('uses info as the default log level', () => {
    expect(validateEnv({ NODE_ENV: 'development' }).LOG_LEVEL).toBe('info');
  });

  it('rejects an unknown log level', () => {
    expect(() => validateEnv({ NODE_ENV: 'test', LOG_LEVEL: 'loud' })).toThrow('LOG_LEVEL');
  });

  it.each(['abc', '', '0', '65536', '3000.5'])('rejects the invalid port "%s"', (port) => {
    expect(() => validateEnv({ NODE_ENV: 'test', PORT: port })).toThrow('PORT');
  });
});
