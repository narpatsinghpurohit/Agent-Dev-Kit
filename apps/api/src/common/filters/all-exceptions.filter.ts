import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodSerializationException, ZodValidationException } from 'nestjs-zod';
import type { ErrorResponse } from '@repo/schemas';

interface ZodIssueLike {
  path: PropertyKey[];
  message: string;
}

/**
 * Every non-2xx response uses the single ErrorResponse envelope from
 * @repo/schemas. Internals (stack traces, Mongoose errors) never leak.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.toEnvelope(exception);
    response.status(body.statusCode).json(body);
  }

  private toEnvelope(exception: unknown): ErrorResponse {
    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError() as { issues?: ZodIssueLike[] };
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: 'Validation failed',
        details: (zodError.issues ?? []).map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      };
    }

    if (exception instanceof ZodSerializationException) {
      // A handler returned data that does not match its @ZodResponse schema —
      // that is a server bug, not a client error.
      const zodError = exception.getZodError();
      this.logger.error(
        `Response serialization failed: ${zodError instanceof Error ? zodError.message : String(zodError)}`,
      );
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Internal Server Error',
        message: 'Internal server error',
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const message =
        typeof raw === 'string'
          ? raw
          : ((raw as { message?: string | string[] }).message ?? exception.message);
      return {
        statusCode: status,
        error: httpReason(status),
        message: Array.isArray(message) ? message.join('; ') : message,
      };
    }

    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
    );
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Internal server error',
    };
  }
}

function httpReason(status: number): string {
  const name = HttpStatus[status];
  if (typeof name !== 'string') return 'Error';
  return name
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
