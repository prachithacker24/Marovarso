import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import type { User } from '@prisma/client';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  @Get('me')
  @UseGuards(JwtAuthGuard)
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
  @ApiResponse({ status: 401, description: 'Missing, expired or invalid JWT Access Token' })
  getProfile(@GetUser() user: User) {
    return user;
  }
}
