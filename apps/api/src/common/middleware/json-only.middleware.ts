import { HttpStatus } from '@nestjs/common';

import { ApiException } from '../errors/api.exception.js';
import { UNSAFE_METHODS } from './unsafe-methods.js';

interface IncomingRequest {
  method: string;
  headers: {
    'content-type'?: string;
    'content-length'?: string;
    'transfer-encoding'?: string;
  };
}

function hasBody({ headers }: IncomingRequest): boolean {
  return headers['transfer-encoding'] !== undefined || Number(headers['content-length']) > 0;
}

function isJson({ headers }: IncomingRequest): boolean {
  const mediaType = headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase();
  return mediaType === 'application/json';
}

/**
 * Rejects a body that is not JSON on routes that change data. A page on another site can only
 * send forms or plain text without the browser asking first, so this closes that route (CSRF).
 */
export function jsonOnlyMiddleware(
  request: IncomingRequest,
  _response: unknown,
  next: (error?: unknown) => void,
): void {
  if (UNSAFE_METHODS.has(request.method) && hasBody(request) && !isJson(request)) {
    next(new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'unsupported_media_type'));
    return;
  }
  next();
}
