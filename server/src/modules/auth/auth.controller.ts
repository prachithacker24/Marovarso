import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { User } from '@prisma/client';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Request a passwordless verification OTP code' })
  @ApiResponse({
    status: 200,
    description: 'OTP generated and sent successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'OTP sent successfully' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid input payload' })
  async sendOtp(@Body() sendOtpDto: SendOtpDto, @Req() req: Request) {
    const ipAddress =
      req.ip || (req.headers['x-forwarded-for'] as string) || '';
    const deviceInfo = req.headers['user-agent'] || '';

    return this.authService.sendOtp(
      sendOtpDto.phoneNumber,
      sendOtpDto.countryCode,
      ipAddress,
      deviceInfo,
    );
  }

  @Post('otp/resend')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({
    summary: 'Resend an active passwordless verification OTP code',
  })
  @ApiResponse({
    status: 200,
    description: 'OTP resent successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'OTP resent successfully' },
        resendAttempt: { type: 'number', example: 1 },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'No active OTP or limit exceeded' })
  async resendOtp(@Body() sendOtpDto: SendOtpDto, @Req() req: Request) {
    const ipAddress =
      req.ip || (req.headers['x-forwarded-for'] as string) || '';
    const deviceInfo = req.headers['user-agent'] || '';

    return this.authService.resendOtp(
      sendOtpDto.phoneNumber,
      sendOtpDto.countryCode,
      ipAddress,
      deviceInfo,
    );
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Verify OTP code and authenticate (login / auto-signup)',
  })
  @ApiResponse({
    status: 200,
    description: 'Authentication successful. Session tokens issued.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Authentication successful' },
        isNewUser: { type: 'boolean', example: true },
        accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsIn...' },
        refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsIn...' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'd08fa671-87ab-4bb3-ab90-...' },
            createdAt: { type: 'string', example: '2026-05-30T15:23:00.000Z' },
            updatedAt: { type: 'string', example: '2026-05-30T15:23:00.000Z' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Expired, used, or invalid OTP code',
  })
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto, @Req() req: Request) {
    const ipAddress =
      req.ip || (req.headers['x-forwarded-for'] as string) || '';
    const deviceInfo = req.headers['user-agent'] || '';

    return this.authService.verifyOtp(
      verifyOtpDto.phoneNumber,
      verifyOtpDto.countryCode,
      verifyOtpDto.otp,
      ipAddress,
      deviceInfo,
    );
  }

  @Post('token/refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Refresh session and obtain rotated Access and Refresh Tokens',
  })
  @ApiResponse({
    status: 200,
    description: 'Fresh tokens issued successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Tokens refreshed successfully' },
        accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsIn...' },
        refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsIn...' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired Refresh Token' })
  async refreshToken(
    @Body() refreshTokenDto: RefreshTokenDto,
    @Req() req: Request,
  ) {
    const ipAddress =
      req.ip || (req.headers['x-forwarded-for'] as string) || '';
    const deviceInfo = req.headers['user-agent'] || '';
    return this.authService.refreshToken(
      refreshTokenDto.refreshToken,
      ipAddress,
      deviceInfo,
    );
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Log out the authenticated user by invalidating the current session',
  })
  @ApiResponse({
    status: 200,
    description: 'Logout action finished successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: {
          type: 'string',
          example: 'Logged out successfully. Tokens invalidated.',
        },
      },
    },
  })
  async logout(
    @GetUser('sessionId') sessionId: string,
    @GetUser('id') userId: string,
    @Req() req: Request,
  ) {
    const ipAddress =
      req.ip || (req.headers['x-forwarded-for'] as string) || '';
    const deviceInfo = req.headers['user-agent'] || '';
    return this.authService.logout(sessionId, userId, ipAddress, deviceInfo);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retrieve active user profile details' })
  @ApiResponse({
    status: 200,
    description: 'User details fetched successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Operation successful' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'd08fa671-87ab-4bb3-ab90-...' },
            createdAt: { type: 'string', example: '2026-05-30T15:23:00.000Z' },
            updatedAt: { type: 'string', example: '2026-05-30T15:23:00.000Z' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Missing, expired or invalid JWT Access Token',
  })
  getProfile(@GetUser() user: User) {
    return {
      success: true,
      message: 'PROFILE_RETRIEVED',
      data: user,
    };
  }
}
