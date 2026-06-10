import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const headerName = 'x-request-id';
    const requestId = (req.headers[headerName] as string) || randomUUID();
    
    // Attach to request object
    (req as any).requestId = requestId;
    
    // Set response header
    res.setHeader(headerName, requestId);
    next();
  }
}
