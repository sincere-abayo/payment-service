import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const command = req.headers['x-command'] ?? 'UNKNOWN';
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(`[${command}] from ${ip} - ${Date.now() - start}ms`);
        },
        error: (err) => {
          this.logger.warn(
            `[${command}] from ${ip} - FAILED ${err?.status ?? 500} - ${Date.now() - start}ms`,
          );
        },
      }),
    );
  }
}