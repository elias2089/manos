import { HttpException } from '@nestjs/common';

import type { ErrorCode } from './error-codes.js';

/** One problem inside a request. The client translates `code`; there is no text here. */
export interface ErrorDetail {
  field: string;
  code: string;
}

/** An error the API raises on purpose: it carries the stable code the client relies on. */
export class ApiException extends HttpException {
  constructor(
    status: number,
    readonly code: ErrorCode,
    readonly details: readonly ErrorDetail[] = [],
  ) {
    super(code, status);
  }
}
