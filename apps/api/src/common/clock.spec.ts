import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { Clock, SystemClock } from './clock.js';
import { ClockModule } from './clock.module.js';

class FakeClock extends Clock {
  constructor(private current: Date) {
    super();
  }

  override now(): Date {
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

@Injectable()
class ExpiryChecker {
  constructor(private readonly clock: Clock) {}

  isExpired(expiresAt: Date): boolean {
    return this.clock.now().getTime() >= expiresAt.getTime();
  }
}

const HOUR = 60 * 60 * 1000;

describe('SystemClock', () => {
  it('returns the current time', () => {
    const before = Date.now();
    const now = new SystemClock().now().getTime();
    const after = Date.now();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });
});

describe('ClockModule', () => {
  it('provides the system clock by default', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ClockModule],
    }).compile();

    expect(moduleRef.get(Clock)).toBeInstanceOf(SystemClock);
  });

  it('lets a test replace the clock and move time forward', async () => {
    const fake = new FakeClock(new Date('2026-01-01T10:00:00Z'));
    const moduleRef = await Test.createTestingModule({
      imports: [ClockModule],
      providers: [ExpiryChecker],
    })
      .overrideProvider(Clock)
      .useValue(fake)
      .compile();
    const checker = moduleRef.get(ExpiryChecker);
    const expiresAt = new Date('2026-01-01T11:00:00Z');

    expect(checker.isExpired(expiresAt)).toBe(false);

    fake.advance(HOUR);

    expect(checker.isExpired(expiresAt)).toBe(true);
  });
});
