import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
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
  async sendOtp(@Body() sendOtpDto: SendOtpDto) {
    return this.authService.sendOtp(
      sendOtpDto.phoneNumber,
      sendOtpDto.countryCode,
    );
  }

  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend an active passwordless verification OTP code' })
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
  async resendOtp(@Body() sendOtpDto: SendOtpDto) {
    return this.authService.resendOtp(
      sendOtpDto.phoneNumber,
      sendOtpDto.countryCode,
    );
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
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
            phoneNumber: { type: 'string', example: '9876543210' },
            countryCode: { type: 'string', example: '+91' },
            fullName: { type: 'string', nullable: true, example: null },
            isActive: { type: 'boolean', example: true },
            isVerified: { type: 'boolean', example: true },
            createdAt: { type: 'string', example: '2026-05-30T15:23:00.000Z' },
            updatedAt: { type: 'string', example: '2026-05-30T15:23:00.000Z' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Expired, used, or invalid OTP code' })
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyOtp(
      verifyOtpDto.phoneNumber,
      verifyOtpDto.countryCode,
      verifyOtpDto.otp,
    );
  }

  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh session and obtain a new Access Token' })
  @ApiResponse({
    status: 200,
    description: 'Fresh Access Token issued successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Tokens refreshed successfully' },
        accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsIn...' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired Refresh Token' })
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshToken(refreshTokenDto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out the authenticated user' })
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
  async logout() {
    return this.authService.logout();
  }
}
