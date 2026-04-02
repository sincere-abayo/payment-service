import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const responseBody =
      exception instanceof HttpException ? exception.getResponse() : 'Internal server error';

    const normalized = this.normalizeResponse(responseBody, status);

    // Keep logs concise and professional for all requests.
    // Avoid printing stack traces/file paths for client-facing errors.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${req.method}] ${req.url} - ${status} - ${normalized.message}`,
      );
    } else {
      this.logger.warn(
        `[${req.method}] ${req.url} - ${status} - ${normalized.message}`,
      );
    }

    res.status(status).json({
      success: false,
      statusCode: status,
      message: normalized.message,
      timestamp: new Date().toISOString(),
      ...(normalized.error ? { error: normalized.error } : {}),
    });
  }

  private normalizeResponse(
    responseBody: string | object,
    status: number,
  ): { message: string; error?: string } {
    if (typeof responseBody === 'string') {
      return {
        message: responseBody,
        error: HttpStatus[status] ?? undefined,
      };
    }

    const body = responseBody as {
      message?: string | string[];
      error?: string;
    };

    const message = Array.isArray(body.message)
      ? body.message.join(', ')
      : body.message ?? 'Request failed';

    return {
      message,
      error: body.error,
    };
  }
}