import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  HttpStatus,
} from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { SmsService } from './sms.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { LoginActivityService } from './login-activity.service';
import { AuditService } from '../audit/audit.service';
import { randomInt, createHash, randomUUID } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly smsService: SmsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly loginActivityService: LoginActivityService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Helper to hash refresh tokens before storing them.
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Helper to check if a phone number is locked out.
   */
  async checkLockout(phoneNumber: string): Promise<void> {
    const credential = await this.prisma.userCredential.findUnique({
      where: { mobileNumber: phoneNumber },
    });

    if (credential) {
      const now = new Date();
      if (credential.lockedUntil && credential.lockedUntil > now) {
        const secondsLeft = Math.ceil(
          (credential.lockedUntil.getTime() - now.getTime()) / 1000,
        );
        const minutesLeft = Math.ceil(secondsLeft / 60);
        throw new AppException('AUTH_LOCKOUT', HttpStatus.BAD_REQUEST, {
          minutes: minutesLeft,
        });
      } else if (credential.lockedUntil && credential.lockedUntil <= now) {
        // Lockout expired, reset status
        await this.prisma.userCredential.update({
          where: { mobileNumber: phoneNumber },
          data: {
            otpAttemptCount: 0,
            lockedUntil: null,
          },
        });
      }
    }
  }

  /**
   * Generates a 6 digit OTP, stores it in the DB, and dispatches it.
   */
  async sendOtp(
    phoneNumber: string,
    countryCode: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const requestId = randomUUID();

    // Find or create user immediately to manage lockout state on credential
    let user = await this.usersService.findByPhoneNumber(phoneNumber);
    if (!user) {
      user = await this.usersService.create({
        mobileNumber: phoneNumber,
        countryCode,
      });
    }

    await this.checkLockout(phoneNumber);

    // Abuse detection: check excessive OTP requests (limit to 5 in 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const recentOtpCount = await this.prisma.otp.count({
      where: {
        phoneNumber,
        createdAt: { gte: tenMinutesAgo },
      },
    });

    if (recentOtpCount >= 5) {
      await this.auditService.logSecurityEvent({
        eventType: 'OTP_ABUSE',
        severity: 'HIGH',
        description: `Excessive OTP requests (more than 5 in 10 minutes)`,
        status: 'FAILED',
        roleId: user.id,
        roleType: 'USER',
        ipAddress,
        userAgent,
        metadata: { phoneNumber, requestCount: recentOtpCount },
        requestId,
      });

      throw new AppException('AUTH_EXCESSIVE_REQUESTS');
    }

    // Find the latest active (unused and unexpired) OTP record
    const activeOtp = await this.prisma.otp.findFirst({
      where: {
        phoneNumber,
        isUsed: false,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (activeOtp) {
      const cooldownSeconds = Number(
        this.configService.get<string>('OTP_COOLDOWN_SECONDS', '30'),
      );
      const timeElapsed =
        (new Date().getTime() - activeOtp.createdAt.getTime()) / 1000;
      if (timeElapsed < cooldownSeconds) {
        const secondsLeft = Math.ceil(cooldownSeconds - timeElapsed);
        throw new AppException('AUTH_OTP_COOLDOWN', HttpStatus.BAD_REQUEST, {
          seconds: secondsLeft,
        });
      }

      // After cooldown, invalidate the previous active OTP code
      await this.prisma.otp.update({
        where: { id: activeOtp.id },
        data: { isUsed: true },
      });
    }

    // Generate a 6-digit numeric OTP code
    const otp = randomInt(100000, 1000000).toString();

    // Compute expiration timestamp (defaults to 5 minutes)
    const expirationMinutes = Number(
      this.configService.get<string>('OTP_EXPIRATION_MINUTES', '5'),
    );
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expirationMinutes);

    // Save transaction in database
    await this.prisma.otp.create({
      data: {
        phoneNumber,
        otp,
        expiresAt,
        isUsed: false,
      },
    });

    // Dispatch SMS conditionally
    await this.smsService.sendOtp(phoneNumber, countryCode, otp);

    // Log successful OTP sent event
    await this.auditService.log({
      action: 'OTP_SENT',
      entityType: 'AUTH',
      entityId: user.id,
      roleId: user.id,
      roleType: 'USER',
      status: 'SUCCESS',
      metadata: { phoneNumber },
      requestId,
      ipAddress,
      userAgent,
      description: 'OTP code generated and sent successfully',
    });

    return {
      success: true,
      message: 'AUTH_OTP_SENT',
    };
  }

  /**
   * Resends the active OTP for a phone number.
   * Generates a new OTP, invalidates the previous OTP, enforces a cooldown, and allows up to 3 attempts.
   */
  async resendOtp(
    phoneNumber: string,
    countryCode: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    let user = await this.usersService.findByPhoneNumber(phoneNumber);
    if (!user) {
      user = await this.usersService.create({
        mobileNumber: phoneNumber,
        countryCode,
      });
    }

    await this.checkLockout(phoneNumber);

    // 1. Find the latest unused and unexpired OTP record
    const otpRecord = await this.prisma.otp.findFirst({
      where: {
        phoneNumber,
        isUsed: false,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!otpRecord) {
      throw new AppException('AUTH_NO_ACTIVE_OTP');
    }

    // 2. Enforce cooldown (default: 30 seconds)
    const cooldownSeconds = Number(
      this.configService.get<string>('OTP_COOLDOWN_SECONDS', '30'),
    );
    const timeElapsed =
      (new Date().getTime() - otpRecord.createdAt.getTime()) / 1000;
    if (timeElapsed < cooldownSeconds) {
      const secondsLeft = Math.ceil(cooldownSeconds - timeElapsed);
      throw new AppException('AUTH_OTP_RESEND_COOLDOWN', HttpStatus.BAD_REQUEST, {
        seconds: secondsLeft,
      });
    }

    // 3. Validate resend count limit
    if (otpRecord.resendCount >= 3) {
      // Lock login for 30 minutes
      const lockDurationMinutes = 30;
      await this.prisma.userCredential.update({
        where: { mobileNumber: phoneNumber },
        data: {
          lockedUntil: new Date(Date.now() + lockDurationMinutes * 60 * 1000),
        },
      });

      // Log OTP Abuse event
      await this.auditService.logSecurityEvent({
        eventType: 'OTP_ABUSE',
        severity: 'HIGH',
        description: `Maximum resend attempts (3) exceeded`,
        status: 'FAILED',
        roleId: user.id,
        roleType: 'USER',
        ipAddress,
        userAgent,
        metadata: { phoneNumber, resendCount: otpRecord.resendCount },
      });

      throw new AppException('AUTH_MAX_RESEND_EXCEEDED');
    }

    // 4. Invalidate the previous OTP code
    await this.prisma.otp.update({
      where: { id: otpRecord.id },
      data: { isUsed: true },
    });

    // 5. Generate a brand-new 6-digit numeric OTP code
    const newOtp = randomInt(100000, 1000000).toString();

    // 6. Compute new expiration timestamp
    const expirationMinutes = Number(
      this.configService.get<string>('OTP_EXPIRATION_MINUTES', '5'),
    );
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expirationMinutes);

    // 7. Save new OTP record carrying over the incremented resendCount
    await this.prisma.otp.create({
      data: {
        phoneNumber,
        otp: newOtp,
        expiresAt,
        isUsed: false,
        resendCount: otpRecord.resendCount + 1,
      },
    });

    // 8. Dispatch SMS with the brand-new OTP code
    await this.smsService.sendOtp(phoneNumber, countryCode, newOtp);

    // Log successful OTP resent event
    await this.auditService.log({
      action: 'OTP_RESENT',
      entityType: 'AUTH',
      entityId: user.id,
      roleId: user.id,
      roleType: 'USER',
      status: 'SUCCESS',
      metadata: { phoneNumber, resendCount: otpRecord.resendCount + 1 },
      ipAddress,
      userAgent,
      description: `OTP code resent successfully. Attempt #${otpRecord.resendCount + 1}`,
    });

    return {
      success: true,
      message: 'AUTH_OTP_RESENT',
      resendAttempt: otpRecord.resendCount + 1,
    };
  }

  /**
   * Validates OTP code, marks it as used, and performs registration or login.
   */
  async verifyOtp(
    phoneNumber: string,
    countryCode: string,
    otpCode: string,
    ipAddress?: string,
    deviceInfo?: string,
  ) {
    let user = await this.usersService.findByPhoneNumber(phoneNumber);
    if (!user) {
      user = await this.usersService.create({
        mobileNumber: phoneNumber,
        countryCode,
      });
    }

    await this.checkLockout(phoneNumber);

    // Look up matching unused OTP record for the phone number
    const otpRecord = await this.prisma.otp.findFirst({
      where: {
        phoneNumber,
        otp: otpCode,
        isUsed: false,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!otpRecord || new Date() > otpRecord.expiresAt) {
      // Increment failed OTP attempts count
      const updatedCred = await this.prisma.userCredential.update({
        where: { mobileNumber: phoneNumber },
        data: {
          otpAttemptCount: { increment: 1 },
        },
      });

      const failureReason = !otpRecord ? 'AUTH_INVALID_OTP' : 'AUTH_OTP_EXPIRED';

      // Log verification failure event
      await this.auditService.log({
        action: 'OTP_VERIFICATION_FAILED',
        entityType: 'AUTH',
        entityId: user.id,
        roleId: user.id,
        roleType: 'USER',
        status: 'FAILED',
        metadata: {
          phoneNumber,
          attemptCount: updatedCred.otpAttemptCount,
          failureReason,
        },
        ipAddress,
        userAgent: deviceInfo,
        description: `OTP verification failed: ${failureReason}. Attempt #${updatedCred.otpAttemptCount}`,
      });

      if (updatedCred.otpAttemptCount >= 5) {
        await this.prisma.userCredential.update({
          where: { mobileNumber: phoneNumber },
          data: {
            lockedUntil: new Date(Date.now() + 30 * 60 * 1000),
          },
        });

        // Trigger OTP_ABUSE security event
        await this.auditService.logSecurityEvent({
          eventType: 'OTP_ABUSE',
          severity: 'HIGH',
          description: `More than 5 failed OTP verification attempts`,
          status: 'FAILED',
          roleId: user.id,
          roleType: 'USER',
          ipAddress,
          userAgent: deviceInfo,
          metadata: { phoneNumber, attemptCount: updatedCred.otpAttemptCount },
        });

        throw new AppException('AUTH_MAX_VERIFY_EXCEEDED');
      }

      if (!otpRecord) {
        throw new AppException('AUTH_INVALID_OTP');
      } else {
        throw new AppException('AUTH_OTP_EXPIRED');
      }
    }

    // Atomically mark OTP as used
    await this.prisma.otp.update({
      where: { id: otpRecord.id },
      data: { isUsed: true },
    });

    // Reset lockout counters on success
    await this.prisma.userCredential.update({
      where: { mobileNumber: phoneNumber },
      data: {
        otpAttemptCount: 0,
        lockedUntil: null,
      },
    });

    // Check if user has logged in before
    const isNewUser = user.lastLoginAt === null;

    // Update lastLoginAt
    user = await this.usersService.update(user.id, {
      lastLoginAt: new Date(),
    });

    // Generate token family ID
    const familyId = randomUUID();

    // Issue cryptographic tokens
    const accessToken = await this.generateAccessToken(user.id, phoneNumber);
    const refreshToken = await this.generateRefreshToken(
      user.id,
      phoneNumber,
      familyId,
    );

    // Hash refresh token for DB storage
    const tokenHash = this.hashToken(refreshToken);

    // Calculate expiration date for session (matches refreshToken 30 days duration)
    const sessionExpiresAt = new Date();
    sessionExpiresAt.setDate(sessionExpiresAt.getDate() + 30);

    // Store Session in DB
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash,
        deviceInfo: deviceInfo || null,
        loginIp: ipAddress || null,
        expiresAt: sessionExpiresAt,
      },
    });

    // Record new login activity (detects other sessions and raises in-app alerts if multi-device)
    await this.loginActivityService.recordNewLogin(
      user.id,
      deviceInfo || null,
      ipAddress || null,
      session.id,
    );

    // Log successful OTP verification event
    await this.auditService.log({
      action: 'OTP_VERIFIED',
      entityType: 'AUTH',
      entityId: user.id,
      roleId: user.id,
      roleType: 'USER',
      status: 'SUCCESS',
      metadata: { phoneNumber },
      ipAddress,
      userAgent: deviceInfo,
      description: 'User successfully verified OTP and logged in',
    });

    return {
      success: true,
      message: 'AUTH_SUCCESS',
      isNewUser,
      accessToken,
      refreshToken,
      user,
    };
  }

  /**
   * Verifies the Refresh Token and issues a fresh Access Token and Refresh Token (Rotation).
   */
  async refreshToken(token: string) {
    try {
      const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        phoneNumber: string;
        familyId: string;
      }>(token, { secret });
      const userId = payload.sub;
      const phoneNumber = payload.phoneNumber;
      const familyId = payload.familyId;

      if (!userId || !familyId) {
        throw new UnauthorizedException('AUTH_UNAUTHORIZED');
      }

      // Hash refresh token to find it in the DB
      const hash = this.hashToken(token);
      const session = await this.prisma.session.findUnique({
        where: { tokenHash: hash },
      });

      if (!session) {
        throw new UnauthorizedException('AUTH_UNAUTHORIZED');
      }

      // RFC 9700 Token Reuse Detection
      if (session.revokedAt !== null) {
        // Breach! Immediately revoke all sessions in this token family
        await this.prisma.session.updateMany({
          where: { familyId: session.familyId },
          data: { revokedAt: new Date() },
        });
        throw new AppException('AUTH_SESSION_COMPROMISED', HttpStatus.UNAUTHORIZED);
      }

      // Generate a new access and refresh token with same familyId
      const newAccessToken = await this.generateAccessToken(
        userId,
        phoneNumber,
      );
      const newRefreshToken = await this.generateRefreshToken(
        userId,
        phoneNumber,
        familyId,
      );
      const newHash = this.hashToken(newRefreshToken);

      const sessionExpiresAt = new Date();
      sessionExpiresAt.setDate(sessionExpiresAt.getDate() + 30);

      // Create new session record and revoke the old one in a transaction
      await this.prisma.$transaction(async (tx) => {
        // Create new session
        const newSessionRecord = await tx.session.create({
          data: {
            userId,
            familyId,
            tokenHash: newHash,
            deviceInfo: session.deviceInfo,
            loginIp: session.loginIp,
            expiresAt: sessionExpiresAt,
          },
        });

        // Revoke the old session and link it to the new one
        await tx.session.update({
          where: { id: session.id },
          data: {
            revokedAt: new Date(),
            replacedBy: newSessionRecord.id,
          },
        });

        return newSessionRecord;
      });

      return {
        success: true,
        message: 'TOKENS_REFRESHED',
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException('AUTH_UNAUTHORIZED');
    }
  }

  /**
   * Revokes a session based on refresh token hash.
   */
  async logout(refreshToken: string, userId: string) {
    const hash = this.hashToken(refreshToken);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hash },
    });

    if (session && session.userId === userId) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
    }

    return {
      success: true,
      message: 'LOGOUT_SUCCESS',
    };
  }

  private async generateAccessToken(
    userId: string,
    phoneNumber: string,
  ): Promise<string> {
    const payload = { sub: userId, phoneNumber };
    const expiresIn = this.configService.get<string>(
      'JWT_ACCESS_EXPIRATION',
      '15m',
    );
    return this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: expiresIn as any,
    });
  }

  private async generateRefreshToken(
    userId: string,
    phoneNumber: string,
    familyId: string,
  ): Promise<string> {
    const payload = { sub: userId, phoneNumber, familyId, jti: randomUUID() };
    const expiresIn = this.configService.get<string>(
      'JWT_REFRESH_EXPIRATION',
      '30d',
    );
    return this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: expiresIn as any,
    });
  }
}
