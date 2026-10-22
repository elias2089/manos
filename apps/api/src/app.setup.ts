import { RequestMethod, type INestApplication } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
/**
 * HTTP rules shared by the real application and the tests, so both run the same setup.
 * Runtime-only concerns (logger, shutdown hooks, listen) stay in main.ts.
 */
export function configureApp(app: INestApplication): void {
  // /health is infrastructure, not part of the business API, so it stays outside the version
  app.setGlobalPrefix('v1', { exclude: [{ path: 'health', method: RequestMethod.GET }] });
  app.useGlobalFilters(new AllExceptionsFilter(app.get(HttpAdapterHost)));
}
