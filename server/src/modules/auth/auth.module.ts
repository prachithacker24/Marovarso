import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SessionsController } from './sessions.controller';
import { UsersModule } from '../users/users.module';
import { SmsService } from './sms.service';
import { LoginActivityService } from './login-activity.service';
import { CleanupService } from './cleanup.service';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
    ConfigModule,
  ],
  controllers: [AuthController, SessionsController],
  providers: [
    AuthService,
    SmsService,
    JwtStrategy,
    LoginActivityService,
    CleanupService,
  ],
  exports: [AuthService, PassportModule, JwtStrategy, LoginActivityService],
})
export class AuthModule {}
