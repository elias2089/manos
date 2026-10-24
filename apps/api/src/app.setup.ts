import { RequestMethod, type INestApplication } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import helmet from 'helmet';

import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { createOriginMiddleware } from './common/middleware/origin.middleware.js';
import { jsonOnlyMiddleware } from './common/middleware/json-only.middleware.js';

export interface AppOptions {
  /** The only origin that may read the responses and send cookies, like https://manos.example */
  webOrigin: string;
}

// Nest 12 does not export its CORS option types, so this describes only what we answer
interface CorsAnswer {
  origin: string[];
  credentials: boolean;
  methods: string[];
  allowedHeaders: string[];
}

/**
 * HTTP rules shared by the real application and the tests, so both run the same setup.
 * Runtime-only concerns (logger, shutdown hooks, listen) stay in main.ts.
 */
export function configureApp(app: INestApplication, options: AppOptions): void {
  app.use(helmet());

  // The origin is a list, so the header is only sent when the request comes from that origin.
  // Credentials are decided per request: the library would send them for any origin otherwise.
  app.enableCors(
    (
      request: { headers: { origin?: string } },
      callback: (error: Error | null, corsOptions: CorsAnswer) => void,
    ) => {
      callback(null, {
        origin: [options.webOrigin],
        credentials: request.headers.origin === options.webOrigin,
        methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type'],
      });
    },
  );
  // After CORS so preflight requests are already answered; before routing so no route is missed
  app.use(createOriginMiddleware(options.webOrigin));
  // Before the body parsers (Nest adds them in init), so a form is rejected, never parsed
  app.use(jsonOnlyMiddleware);
  // /health is infrastructure, not part of the business API, so it stays outside the version
  app.setGlobalPrefix('v1', { exclude: [{ path: 'health', method: RequestMethod.GET }] });
  app.useGlobalFilters(new AllExceptionsFilter(app.get(HttpAdapterHost)));
}
