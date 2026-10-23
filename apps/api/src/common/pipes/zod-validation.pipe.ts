import { HttpStatus, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

import { ApiException, type ErrorDetail } from '../errors/api.exception.js';

/** Validates a value against a Zod schema and returns the parsed data, or answers 400. */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) {
      return result.data;
    }

    const details: ErrorDetail[] = result.error.issues.map((issue) => ({
      field: issue.path.map(String).join('.'),
      code: issue.code,
    }));
    throw new ApiException(HttpStatus.BAD_REQUEST, 'validation_failed', details);
  }
}
