import {
  Controller,
  Get,
  Delete,
  Patch,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { LoginActivityService } from './login-activity.service';

@ApiTags('Sessions & Login Activity')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('auth')
export class SessionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loginActivityService: LoginActivityService,
  ) {}

  @Get('sessions')
  @ApiOperation({
    summary: 'List all active sessions for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Active sessions retrieved successfully',
  })
  async getActiveSessions(@GetUser('id') userId: string) {
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        deviceInfo: true,
        loginIp: true,
        loginAt: true,
        expiresAt: true,
      },
      orderBy: { loginAt: 'desc' },
    });

    return {
      success: true,
      message: 'SESSIONS_RETRIEVED',
      data: sessions,
    };
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a specific active session' })
  @ApiResponse({
    status: 200,
    description: 'Session revoked successfully',
  })
  async revokeSession(
    @GetUser('id') userId: string,
    @Param('id') sessionId: string,
  ) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (session && session.userId === userId) {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
      });
    }

    return {
      success: true,
      message: 'SESSION_REVOKED',
    };
  }

  @Delete('sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke all active sessions for the user (logout everywhere)',
  })
  @ApiResponse({
    status: 200,
    description: 'All sessions revoked successfully',
  })
  async revokeAllSessions(@GetUser('id') userId: string) {
    await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { revokedAt: new Date() },
    });

    return {
      success: true,
      message: 'ALL_SESSIONS_REVOKED',
    };
  }

  @Get('login-activity')
  @ApiOperation({ summary: 'Get recent login activity for the user' })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean })
  @ApiResponse({
    status: 200,
    description: 'Login activities retrieved successfully',
  })
  async getLoginActivity(
    @GetUser('id') userId: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    const isUnreadOnly = unreadOnly === 'true';
    const activities = isUnreadOnly
      ? await this.loginActivityService.getUnreadActivities(userId)
      : await this.loginActivityService.getActivities(userId);

    return {
      success: true,
      message: 'LOGIN_ACTIVITY_RETRIEVED',
      data: activities,
    };
  }

  @Patch('login-activity/:id/suspicious')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Mark a login activity as suspicious and revoke its associated session',
  })
  @ApiResponse({
    status: 200,
    description: 'Activity marked as suspicious and session revoked',
  })
  async markSuspicious(
    @GetUser('id') userId: string,
    @Param('id') activityId: string,
  ) {
    await this.loginActivityService.markAsSuspicious(activityId, userId);
    return {
      success: true,
      message: 'LOGIN_MARKED_SUSPICIOUS',
    };
  }
}
