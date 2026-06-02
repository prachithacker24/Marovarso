import { IsString, IsNotEmpty, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDto {
  @ApiProperty({
    description: 'Phone number without the country dialing code',
    example: '9876543210',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{7,15}$/, {
    message: 'phoneNumber must be a valid numeric string between 7 and 15 digits',
  })
  phoneNumber: string;

  @ApiProperty({
    description: 'Country calling code with leading plus sign',
    example: '+91',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?\d{1,4}$/, {
    message: 'countryCode must be a valid country dialing code (e.g. +91, 1)',
  })
  countryCode: string;

  @ApiProperty({
    description: 'The 6-digit OTP verification code received by the user',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'otp must be exactly 6 characters long' })
  @Matches(/^\d{6}$/, { message: 'otp must contain only digits' })
  otp: string;
}
