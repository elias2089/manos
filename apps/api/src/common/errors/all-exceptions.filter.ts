import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

import { ApiException, type ErrorDetail } from './api.exception.js';
import { ERROR_MESSAGES, type ErrorCode } from './error-codes.js';

interface ErrorAnswer {
  status: number;
  code: ErrorCode;
  details: readonly ErrorDetail[];
}

const CODE_BY_STATUS = new Map<number, ErrorCode>([
  [HttpStatus.BAD_REQUEST, 'bad_request'],
  [HttpStatus.UNAUTHORIZED, 'unauthorized'],
  [HttpStatus.FORBIDDEN, 'forbidden'],
  [HttpStatus.NOT_FOUND, 'not_found'],
  [HttpStatus.PAYLOAD_TOO_LARGE, 'payload_too_large'],
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'unsupported_media_type'],
  [HttpStatus.TOO_MANY_REQUESTS, 'too_many_requests'],
  [HttpStatus.SERVICE_UNAVAILABLE, 'service_unavailable'],
]);

/** The HTTP status of an error, or undefined when it is not an HTTP error. */
function statusOf(exception: unknown): number | undefined {
  if (exception instanceof HttpException) {
    return exception.getStatus();
  }
  // Express and body-parser raise http-errors: they are not Nest exceptions, but carry a status
  if (
    typeof exception === 'object' &&
    exception !== null &&
    'statusCode' in exception &&
    typeof exception.statusCode === 'number'
  ) {
    return exception.statusCode;
  }
  return undefined;
}

/** Turns every error into { code, message, details }. Internal details never reach the client. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { status, code, details } = this.describe(exception);

    if (status >= 500) {
      this.logger.error(exception);
    }

    // The code is a closed union checked by the compiler, never user input
    // eslint-disable-next-line security/detect-object-injection
    const body = { code, message: ERROR_MESSAGES[code], details };
    this.httpAdapterHost.httpAdapter.reply(host.switchToHttp().getResponse(), body, status);
  }

  private describe(exception: unknown): ErrorAnswer {
    if (exception instanceof ApiException) {
      return { status: exception.getStatus(), code: exception.code, details: exception.details };
    }

    const status = statusOf(exception);
    if (status === undefined) {
      return { status: HttpStatus.INTERNAL_SERVER_ERROR, code: 'internal_error', details: [] };
    }

    const fallback: ErrorCode = status >= 500 ? 'internal_error' : 'bad_request';
    return { status, code: CODE_BY_STATUS.get(status) ?? fallback, details: [] };
  }
}
