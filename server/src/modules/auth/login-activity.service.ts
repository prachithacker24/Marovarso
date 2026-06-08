import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LoginActivityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records login activity if there are other active sessions for the user.
   */
  async recordNewLogin(
    userId: string,
    deviceInfo: string | null,
    ipAddress: string | null,
    sessionId: string,
  ): Promise<void> {
    const activeSessionsCount = await this.prisma.session.count({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        id: { not: sessionId }, // Exclude the current session
      },
    });

    if (activeSessionsCount > 0) {
      await this.prisma.loginActivity.create({
        data: {
          userId,
          deviceInfo,
          ipAddress,
          status: 'trusted',
          notified: false,
          sessionId,
        },
      });
    }
  }

  /**
   * Retrieves all login activities for a user.
   */
  async getActivities(userId: string) {
    return this.prisma.loginActivity.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Retrieves unread login activities for a user.
   */
  async getUnreadActivities(userId: string) {
    return this.prisma.loginActivity.findMany({
      where: { userId, notified: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Marks specific login activities as notified.
   */
  async markAsNotified(userId: string, activityIds: string[]) {
    return this.prisma.loginActivity.updateMany({
      where: {
        id: { in: activityIds },
        userId,
      },
      data: { notified: true },
    });
  }

  /**
   * Marks a login activity as suspicious and revokes the associated session.
   */
  async markAsSuspicious(activityId: string, userId: string): Promise<void> {
    const activity = await this.prisma.loginActivity.findUnique({
      where: { id: activityId },
    });

    if (!activity) {
      throw new NotFoundException('Login activity not found');
    }

    if (activity.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to modify this activity',
      );
    }

    if (activity.sessionId) {
      await this.prisma.$transaction([
        // Revoke the session
        this.prisma.session.update({
          where: { id: activity.sessionId },
          data: { revokedAt: new Date() },
        }),
        // Update activity status to blocked/suspicious
        this.prisma.loginActivity.update({
          where: { id: activityId },
          data: { status: 'blocked' },
        }),
      ]);
    }
  }
}
