import { IsString, IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendOtpDto {
  @ApiProperty({
    description: 'Phone number without the country dialing code',
    example: '9876543210',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{7,15}$/, {
    message:
      'phoneNumber must be a valid numeric string between 7 and 15 digits',
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
}
