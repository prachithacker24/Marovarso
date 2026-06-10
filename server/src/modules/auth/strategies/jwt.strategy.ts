import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      passReqToCallback: true,
    });
  }

  /**
   * Validate token payload and bind user object to the request.
   */
  async validate(req: any, payload: { sub: string; sid: string }) {
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('AUTH_UNAUTHORIZED');
    }
    if (user.accountStatus !== 'active') {
      throw new UnauthorizedException('AUTH_UNAUTHORIZED');
    }

    if (!payload.sid) {
      throw new UnauthorizedException('AUTH_UNAUTHORIZED');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
    });

    if (
      !session ||
      session.userId !== payload.sub ||
      session.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException('AUTH_UNAUTHORIZED');
    }

    // Allow revoked sessions only for the logout route
    const isLogoutRoute =
      req.url &&
      (req.url.includes('/auth/logout') || req.url.endsWith('/logout'));

    if (session.revokedAt !== null && !isLogoutRoute) {
      throw new UnauthorizedException('AUTH_UNAUTHORIZED');
    }

    return { ...user, sessionId: session.id };
  }
}
