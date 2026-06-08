import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { I18nContext } from 'nestjs-i18n';

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

        // Default values
        let success = true;
        let code = 'SUCCESS';
        let message = 'Operation successful';
        let data = res;

        // If the service/controller returns a structured object containing 'success'
        if (res && typeof res === 'object' && 'success' in res) {
          success = res.success;
          const rawMessage = res.message || 'Operation successful';

          if (
            typeof rawMessage === 'string' &&
            /^[A-Z0-9_]+$/.test(rawMessage)
          ) {
            code = rawMessage;
            message = i18n
              ? i18n.translate(`success.${code}`, { defaultValue: code })
              : code;
          } else {
            message = rawMessage;
          }

          // Separate data if present
          if ('data' in res) {
            data = res.data;
          } else {
            // Remove success and message from the data payload
            const { success: _, message: __, ...rest } = res;
            data = Object.keys(rest).length > 0 ? rest : null;
          }
        } else {
          // If the return is just the raw data payload itself
          if (res && typeof res === 'object' && 'message' in res) {
            const rawMessage = res.message;
            if (
              typeof rawMessage === 'string' &&
              /^[A-Z0-9_]+$/.test(rawMessage)
            ) {
              code = rawMessage;
              message = i18n
                ? i18n.translate(`success.${code}`, { defaultValue: code })
                : code;
              const { message: _, ...rest } = res;
              data = rest;
            }
          }
        }

        return {
          success,
          code,
          message,
          data: data === undefined ? null : data,
        };
      }),
    );
  }
}
