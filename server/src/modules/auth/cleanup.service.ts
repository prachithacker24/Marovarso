import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Daily cleanup cron job running at 3:00 AM.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCleanup() {
    this.logger.log('Starting daily database cleanup job...');

    try {
      const now = new Date();

      // 1. Purge expired OTPs and used OTPs older than retention limit
      const otpRetentionDays = Number(
        this.configService.get<string>('OTP_CLEANUP_RETENTION_DAYS', '7'),
      );
      const otpThreshold = new Date(
        now.getTime() - otpRetentionDays * 24 * 60 * 60 * 1000,
      );
      const deletedOtps = await this.prisma.otp.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { isUsed: true, createdAt: { lt: otpThreshold } },
          ],
        },
      });
      this.logger.log(
        `Cleaned up ${deletedOtps.count} expired or old used OTP records.`,
      );

      // 2. Purge expired sessions and revoked sessions older than retention limit
      const sessionRetentionDays = Number(
        this.configService.get<string>('SESSION_CLEANUP_RETENTION_DAYS', '60'),
      );
      const sessionThreshold = new Date(
        now.getTime() - sessionRetentionDays * 24 * 60 * 60 * 1000,
      );
      const deletedSessions = await this.prisma.session.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            { revokedAt: { lt: sessionThreshold } },
          ],
        },
      });
      this.logger.log(
        `Cleaned up ${deletedSessions.count} expired or old revoked session records.`,
      );

      // 3. Purge LoginActivity records older than retention limit (default 90 days)
      const activityRetentionDays = 90;
      const activityThreshold = new Date(
        now.getTime() - activityRetentionDays * 24 * 60 * 60 * 1000,
      );
      const deletedActivities = await this.prisma.loginActivity.deleteMany({
        where: {
          createdAt: { lt: activityThreshold },
        },
      });
      this.logger.log(
        `Cleaned up ${deletedActivities.count} old login activity records.`,
      );

      this.logger.log('Daily database cleanup job completed successfully.');
    } catch (error) {
      this.logger.error('Error occurred during database cleanup job:', error);
    }
  }
}
