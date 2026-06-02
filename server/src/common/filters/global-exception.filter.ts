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

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: string[] = [];

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resObj = exceptionResponse as any;
        if (Array.isArray(resObj.message)) {
          // Typically class-validator pipes return validation messages in 'message' as an array
          message = 'Validation failed';
          errors = resObj.message;
        } else {
          message = resObj.message || exception.message;
          errors = resObj.error ? [resObj.error] : [message];
        }
      } else {
        message = exception.message;
        errors = [message];
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Gracefully capture database constraints
      switch (exception.code) {
        case 'P2002': {
          status = HttpStatus.CONFLICT;
          const targets = exception.meta?.target as string[] | undefined;
          const field = targets ? targets.join(', ') : 'field';
          message = `Unique constraint violation on ${field}`;
          errors = [`A record with this ${field} already exists.`];
          break;
        }
        case 'P2025': {
          status = HttpStatus.NOT_FOUND;
          message = 'Resource not found';
          errors = [exception.meta?.cause as string || 'The requested database record does not exist.'];
          break;
        }
        default: {
          status = HttpStatus.BAD_REQUEST;
          message = 'Database operation failed';
          errors = ['A database error occurred during processing.'];
          break;
        }
      }
    } else if (exception instanceof Error) {
      // Internal code errors
      message = exception.message;
      errors = ['An unexpected application error occurred.'];
    } else {
      errors = ['An unknown error occurred.'];
    }

    // Log the error stack internally
    this.logger.error(
      `${request.method} ${request.url} - Status: ${status} - Error: ${message}`,
      exception instanceof Error ? exception.stack : JSON.stringify(exception),
    );

    response.status(status).json({
      success: false,
      message,
      errors: errors.length > 0 ? errors : [message],
    });
  }
}
