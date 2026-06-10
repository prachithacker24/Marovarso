import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any, context: any, status?: any) {
    if (info && info.name === 'TokenExpiredError') {
      throw new UnauthorizedException('AUTH_TOKEN_EXPIRED');
    }
    if (err || !user) {
      throw new UnauthorizedException('AUTH_UNAUTHORIZED');
    }
    return user;
  }
}
