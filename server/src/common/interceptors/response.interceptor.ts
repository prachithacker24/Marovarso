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
        const requestId = request.requestId || randomUUID();
        const url = request.url || '';
        const versionMatch = url.match(/\/v(\d+)/);
        const version = versionMatch ? `v${versionMatch[1]}` : 'v1';
        const timestamp = new Date().toISOString();

        // Default values
        let data = res;
        let customMeta = {};
        let code: string | undefined = undefined;
        let message: string | undefined = undefined;

        const resolvedLang = i18n ? i18n.lang : 'en';
        const supportedLanguages = ['en', 'hi', 'gu'];
        const lang = supportedLanguages.includes(resolvedLang)
          ? resolvedLang
          : 'en';

        // If the service/controller returns a structured object containing 'success'
        if (res && typeof res === 'object') {
          if ('success' in res) {
            // Extract code and message if present
            const rawCode = res.code || res.message;
            if (rawCode && typeof rawCode === 'string' && /^[A-Z0-9_]+$/.test(rawCode)) {
              code = rawCode;
            }

            const rawMessage = res.message || code;
            if (rawMessage && typeof rawMessage === 'string') {
              if (/^[A-Z0-9_]+$/.test(rawMessage)) {
                message = i18n
                  ? i18n.translate(`success.${rawMessage}`, { lang, defaultValue: rawMessage })
                  : rawMessage;
              } else {
                message = rawMessage;
              }
            }

            // Separate data if present
            if ('data' in res) {
              data = res.data;
            } else {
              // Remove success, message, and code from the data payload
              const {
                success: _,
                message: __,
                code: ___,
                meta: ____,
                ...rest
              } = res;
              data = Object.keys(rest).length > 0 ? rest : null;
            }
          }

          if ('meta' in res && res.meta && typeof res.meta === 'object') {
            customMeta = res.meta;
          }
        }

        return {
          success: true,
          ...(code ? { code } : {}),
          ...(message ? { message } : {}),
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
