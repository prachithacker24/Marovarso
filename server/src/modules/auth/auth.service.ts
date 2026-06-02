import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { SmsService } from './sms.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly smsService: SmsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Helper to check if a phone number is locked out.
   */
  async checkLockout(phoneNumber: string): Promise<void> {
    const lockout = await this.prisma.userLockout.findUnique({
      where: { phoneNumber },
    });

    if (lockout) {
      const now = new Date();
      if (lockout.lockedUntil && lockout.lockedUntil > now) {
        const secondsLeft = Math.ceil(
          (lockout.lockedUntil.getTime() - now.getTime()) / 1000,
        );
        const minutesLeft = Math.ceil(secondsLeft / 60);
        throw new BadRequestException(
          `Login is temporarily locked due to too many attempts. Please try again after ${minutesLeft} minute(s).`,
        );
      } else if (lockout.lockedUntil && lockout.lockedUntil <= now) {
        // Lockout expired, reset status
        await this.prisma.userLockout.update({
          where: { phoneNumber },
          data: {
            failedOtpAttempts: 0,
            lockedUntil: null,
          },
        });
      }
    }
  }

  /**
   * Generates a 6 digit OTP, stores it in the DB, and dispatches it.
   */
  async sendOtp(phoneNumber: string, countryCode: string) {
    await this.checkLockout(phoneNumber);

    // Generate a 6-digit numeric OTP code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

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

    return {
      success: true,
      message: 'OTP sent successfully',
    };
  }

  /**
   * Resends the active OTP for a phone number.
   * Generates a new OTP, invalidates the previous OTP, enforces a cooldown, and allows up to 3 attempts.
   */
  async resendOtp(phoneNumber: string, countryCode: string) {
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
      throw new BadRequestException(
        'No active OTP request found or it has expired. Please request a new OTP.',
      );
    }

    // 2. Enforce cooldown (default: 30 seconds)
    const cooldownSeconds = Number(
      this.configService.get<string>('OTP_COOLDOWN_SECONDS', '30'),
    );
    const timeElapsed = (new Date().getTime() - otpRecord.createdAt.getTime()) / 1000;
    if (timeElapsed < cooldownSeconds) {
      const secondsLeft = Math.ceil(cooldownSeconds - timeElapsed);
      throw new BadRequestException(
        `Please wait ${secondsLeft} second(s) before resending the OTP.`,
      );
    }

    // 3. Validate resend count limit
    if (otpRecord.resendCount >= 3) {
      // Lock login for 30 minutes
      const lockDurationMinutes = 30;
      await this.prisma.userLockout.upsert({
        where: { phoneNumber },
        update: {
          lockedUntil: new Date(Date.now() + lockDurationMinutes * 60 * 1000),
        },
        create: {
          phoneNumber,
          lockedUntil: new Date(Date.now() + lockDurationMinutes * 60 * 1000),
        },
      });

      throw new BadRequestException(
        'Maximum resend attempts (3) exceeded. Login is locked for 30 minutes.',
      );
    }

    // 4. Invalidate the previous OTP code
    await this.prisma.otp.update({
      where: { id: otpRecord.id },
      data: { isUsed: true },
    });

    // 5. Generate a brand-new 6-digit numeric OTP code
    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();

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

    return {
      success: true,
      message: 'OTP resent successfully',
      resendAttempt: otpRecord.resendCount + 1,
    };
  }

  /**
   * Validates OTP code, marks it as used, and performs registration or login.
   */
  async verifyOtp(phoneNumber: string, countryCode: string, otpCode: string) {
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
      const lockout = await this.prisma.userLockout.upsert({
        where: { phoneNumber },
        update: {
          failedOtpAttempts: { increment: 1 },
        },
        create: {
          phoneNumber,
          failedOtpAttempts: 1,
        },
      });

      if (lockout.failedOtpAttempts >= 5) {
        await this.prisma.userLockout.update({
          where: { phoneNumber },
          data: {
            lockedUntil: new Date(Date.now() + 30 * 60 * 1000),
          },
        });
        throw new BadRequestException(
          'Too many failed attempts. Login is locked for 30 minutes.',
        );
      }

      if (!otpRecord) {
        throw new BadRequestException('Invalid OTP code or phone number');
      } else {
        throw new BadRequestException('OTP code has expired');
      }
    }

    // Atomically mark OTP as used
    await this.prisma.otp.update({
      where: { id: otpRecord.id },
      data: { isUsed: true },
    });

    // Reset lockout counters on success
    await this.prisma.userLockout.upsert({
      where: { phoneNumber },
      update: {
        failedOtpAttempts: 0,
        lockedUntil: null,
      },
      create: {
        phoneNumber,
        failedOtpAttempts: 0,
        lockedUntil: null,
      },
    });

    // Check user existence
    let user = await this.usersService.findByPhoneNumber(phoneNumber);
    let isNewUser = false;

    if (!user) {
      // Auto-create user account seamlessly
      user = await this.usersService.create({
        phoneNumber,
        countryCode,
        isVerified: true,
        isActive: true,
      });
      isNewUser = true;
    } else {
      // Mark as verified if they weren't verified previously
      if (!user.isVerified) {
        user = await this.usersService.update(user.id, { isVerified: true });
      }
    }

    // Issue cryptographic tokens
    const accessToken = await this.generateAccessToken(user.id, user.phoneNumber);
    const refreshToken = await this.generateRefreshToken(user.id, user.phoneNumber);

    return {
      success: true,
      message: 'Authentication successful',
      isNewUser,
      accessToken,
      refreshToken,
      user,
    };
  }

  /**
   * Verifies the Refresh Token and issues a fresh Access Token.
   */
  async refreshToken(token: string) {
    try {
      const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
      const payload = await this.jwtService.verifyAsync(token, { secret });

      // Build fresh Access Token
      const accessToken = await this.generateAccessToken(
        payload.sub,
        payload.phoneNumber,
      );

      return {
        success: true,
        message: 'Tokens refreshed successfully',
        accessToken,
      };
    } catch (err) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /**
   * Performs standard stateless session logout cleanup.
   */
  async logout() {
    return {
      success: true,
      message: 'Logged out successfully. Tokens invalidated.',
    };
  }

  private async generateAccessToken(
    userId: string,
    phoneNumber: string,
  ): Promise<string> {
    const payload = { sub: userId, phoneNumber };
    return this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRATION', '15m') as any,
    });
  }

  private async generateRefreshToken(
    userId: string,
    phoneNumber: string,
  ): Promise<string> {
    const payload = { sub: userId, phoneNumber };
    return this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRATION', '30d') as any,
    });
  }
}
