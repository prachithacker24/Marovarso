import { ApiProperty } from '@nestjs/swagger';

export class SecurityEvent {
  @ApiProperty({ description: 'Unique identifier' })
  id: string;

  @ApiProperty({
    description:
      'Type of security event (maps to AuditLog.action, e.g. OTP_ABUSE)',
  })
  eventType: string;

  @ApiProperty({
    description: 'Severity of the security event (LOW, MEDIUM, HIGH, CRITICAL)',
  })
  severity: string;

  @ApiProperty({
    description: 'Actor role ID associated with event',
    required: false,
  })
  roleId?: string | null;

  @ApiProperty({
    description: 'Actor role type associated with event',
    required: false,
  })
  roleType?: string | null;

  @ApiProperty({ description: 'Source IP address', required: false })
  ipAddress?: string | null;

  @ApiProperty({
    description: 'Originating client User Agent',
    required: false,
  })
  userAgent?: string | null;

  @ApiProperty({ description: 'Detailed description of the security event' })
  description: string;

  @ApiProperty({ description: 'Additional metadata', required: false })
  metadata?: any | null;

  @ApiProperty({
    description: 'Status of the event action (SUCCESS, FAILED)',
    required: false,
  })
  status?: string | null;

  @ApiProperty({
    description: 'Request identifier correlation ID',
    required: false,
  })
  requestId?: string | null;

  @ApiProperty({ description: 'Timestamp of event creation' })
  createdAt: Date;
}
