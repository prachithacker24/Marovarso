import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { I18nContext } from 'nestjs-i18n';
import { randomUUID } from 'crypto';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest();

    // Bypass standard wrapping for health checks
    if (
      request &&
      request.url &&
      (request.url === '/health' || request.url.endsWith('/health'))
    ) {
      return next.handle();
    }

    return next.handle().pipe(
      map((res) => {
        const i18n = I18nContext.current();
        const requestId = (request as any).requestId || randomUUID();
        const url = request.url || '';
        const versionMatch = url.match(/\/v(\d+)/);
        const version = versionMatch ? `v${versionMatch[1]}` : 'v1';
        const timestamp = new Date().toISOString();

        // Default values
        let data = res;
        let customMeta = {};

        // If the service/controller returns a structured object containing 'success'
        if (res && typeof res === 'object') {
          if ('success' in res) {
            // Separate data if present
            if ('data' in res) {
              data = res.data;
            } else {
              // Remove success and message from the data payload
              const { success: _, message: __, code: ___, meta: ____, ...rest } = res;
              data = Object.keys(rest).length > 0 ? rest : null;
            }
          }

          if ('meta' in res && res.meta && typeof res.meta === 'object') {
            customMeta = res.meta;
          }
        }

        return {
          success: true,
          data: data === undefined ? null : data,
          meta: {
            timestamp,
            requestId,
            version,
            ...customMeta,
          },
        };
      }),
    );
  }
}
