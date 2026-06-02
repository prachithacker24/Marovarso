import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest();

    // Bypass standard wrapping for health checks
    if (request && request.url && (request.url === '/health' || request.url.endsWith('/health'))) {
      return next.handle();
    }

    return next.handle().pipe(
      map((res) => {
        // If the response is already in the standard API format, return it directly.
        if (res && typeof res === 'object' && 'success' in res) {
          return res;
        }

        // Extract message and data dynamically.
        const message = res && typeof res === 'object' && 'message' in res ? res.message : 'Operation successful';
        const data = res && typeof res === 'object' && 'data' in res ? res.data : res;

        return {
          success: true,
          message,
          data: data === undefined ? null : data,
        };
      }),
    );
  }
}
