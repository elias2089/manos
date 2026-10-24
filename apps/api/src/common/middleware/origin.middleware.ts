import { HttpStatus, Logger } from '@nestjs/common';

import { ApiException } from '../errors/api.exception.js';
import { UNSAFE_METHODS } from './unsafe-methods.js';

// There is no @types/express here, so this describes only what the middleware reads
interface IncomingRequest {
  method: string;
  headers: { origin?: string; cookie?: string };
}

const SESSION_COOKIES = new Set(['access', 'refresh']);

function hasSessionCookie(cookieHeader = ''): boolean {
  return cookieHeader
    .split(';')
    .some((pair) => SESSION_COOKIES.has(pair.split('=', 1)[0]?.trim() ?? ''));
}

function comesFromAllowedOrigin(request: IncomingRequest, webOrigin: string): boolean {
  const { origin, cookie } = request.headers;
  // Tools like curl send neither Origin nor cookies; a browser with a session always sends Origin
  return origin === undefined ? !hasSessionCookie(cookie) : origin === webOrigin;
}

/** Rejects requests that change data when they do not come from the web app (CSRF defense). */
export function createOriginMiddleware(webOrigin: string) {
  const logger = new Logger('OriginMiddleware');

  return (request: IncomingRequest, _response: unknown, next: (error?: unknown) => void): void => {
    if (!UNSAFE_METHODS.has(request.method) || comesFromAllowedOrigin(request, webOrigin)) {
      next();
      return;
    }

    // The origin is attacker-controlled, so the log keeps only a bounded piece of it
    logger.warn({ event: 'csrf.origin_rejected', origin: request.headers.origin?.slice(0, 200) });
    next(new ApiException(HttpStatus.FORBIDDEN, 'csrf_origin_rejected'));
  };
}
