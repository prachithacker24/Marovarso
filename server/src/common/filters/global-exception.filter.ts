import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { Prisma } from '@prisma/client';
import { I18nContext } from 'nestjs-i18n';
import { randomUUID } from 'crypto';
import { AppException } from '../exceptions/app.exception';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_SERVER_ERROR';
    let errors: string[] = [];

    const i18n = I18nContext.current();
    const resolvedLang = i18n ? i18n.lang : 'en';
    const supportedLanguages = ['en', 'hi', 'gu'];
    const lang = supportedLanguages.includes(resolvedLang)
      ? resolvedLang
      : 'en';
    const requestId = (request as any).requestId || randomUUID();

    if (exception instanceof AppException) {
      status = exception.getStatus();
      code = exception.code;
      const translated = i18n
        ? i18n.translate(`errors.${code}`, { lang, defaultValue: code })
        : code;
      message = translated;
      errors = exception.details
        ? Array.isArray(exception.details)
          ? exception.details
          : [exception.details]
        : [translated];
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resObj = exceptionResponse as any;
        if (Array.isArray(resObj.message)) {
          // Typically class-validator pipes return validation messages in 'message' as an array
          code = 'COMMON_VALIDATION_FAILED';
          message = i18n
            ? i18n.translate('errors.COMMON_VALIDATION_FAILED', {
                lang,
                defaultValue: 'Validation failed.',
              })
            : 'Validation failed.';
          errors = resObj.message;
        } else {
          const rawMessage = resObj.message || exception.message;
          if (
            typeof rawMessage === 'string' &&
            /^[A-Z0-9_]+$/.test(rawMessage)
          ) {
            code = rawMessage;
            const translated = i18n
              ? i18n.translate(`errors.${code}`, { lang, defaultValue: code })
              : code;
            message = translated;
            errors = [translated];
          } else {
            // Standard Http exceptions that are not custom UPPER_SNAKE_CASE keys
            if (status === HttpStatus.UNAUTHORIZED) {
              code = 'AUTH_UNAUTHORIZED';
              const translated = i18n
                ? i18n.translate('errors.AUTH_UNAUTHORIZED', {
                    lang,
                    defaultValue: 'You are not authorized.',
                  })
                : 'You are not authorized.';
              message = translated;
              errors = [translated];
            } else {
              code = resObj.error
                ? String(resObj.error).toUpperCase().replace(/\s+/g, '_')
                : 'BAD_REQUEST';
              message = rawMessage;
              errors = [rawMessage];
            }
          }
        }
      } else {
        const rawMessage = exception.message;
        if (typeof rawMessage === 'string' && /^[A-Z0-9_]+$/.test(rawMessage)) {
          code = rawMessage;
          const translated = i18n
            ? i18n.translate(`errors.${code}`, { lang, defaultValue: code })
            : code;
          message = translated;
          errors = [translated];
        } else {
          code = 'BAD_REQUEST';
          message = rawMessage;
          errors = [rawMessage];
        }
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Gracefully capture database constraints
      switch (exception.code) {
        case 'P2002': {
          status = HttpStatus.CONFLICT;
          code = 'DATABASE_CONFLICT';
          const targets = exception.meta?.target as string[] | undefined;
          const field = targets ? targets.join(', ') : 'field';
          message = `Unique constraint violation on ${field}`;
          errors = [`A record with this ${field} already exists.`];
          break;
        }
        case 'P2025': {
          status = HttpStatus.NOT_FOUND;
          code = 'RESOURCE_NOT_FOUND';
          message = 'Resource not found';
          errors = [
            (exception.meta?.cause as string) ||
              'The requested database record does not exist.',
          ];
          break;
        }
        default: {
          status = HttpStatus.BAD_REQUEST;
          code = 'DATABASE_ERROR';
          message = 'Database operation failed';
          errors = ['A database error occurred during processing.'];
          break;
        }
      }
    } else if (exception instanceof Error) {
      // Internal code errors
      code = 'INTERNAL_SERVER_ERROR';
      message = exception.message;
      errors = ['An unexpected application error occurred.'];
    } else {
      code = 'UNKNOWN_ERROR';
      errors = ['An unknown error occurred.'];
    }

    // Log the error stack internally
    this.logger.error(
      `${request.method} ${request.url} - Status: ${status} - Error: ${message}`,
      exception instanceof Error ? exception.stack : JSON.stringify(exception),
    );

    const errorResponse: any = {
      code,
      message,
    };
    if (
      errors &&
      errors.length > 0 &&
      (code === 'COMMON_VALIDATION_FAILED' || errors[0] !== message)
    ) {
      errorResponse.details = { errors };
    }

    response.status(status).json({
      success: false,
      error: errorResponse,
      ...(requestId ? { meta: { requestId } } : {}),
    });
  }
}
