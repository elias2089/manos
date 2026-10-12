import { Controller, Get } from '@nestjs/common';

import { Clock } from '../common/clock.js';

@Controller('health')
export class HealthController {
  constructor(private readonly clock: Clock) {}

  @Get()
  check() {
    return { status: 'ok', time: this.clock.now().toISOString() };
  }
}
