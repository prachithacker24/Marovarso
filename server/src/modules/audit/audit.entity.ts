import { ApiProperty } from '@nestjs/swagger';

export class AuditLog {
  @ApiProperty({ description: 'Unique identifier' })
  id: string;

  @ApiProperty({ description: 'Action performed (e.g. OTP_SENT, OTP_VERIFIED, UPDATE)' })
  action: string;

  @ApiProperty({ description: 'Entity type affected', required: false })
  entityType?: string | null;

  @ApiProperty({ description: 'Entity identifier affected', required: false })
  entityId?: string | null;

  @ApiProperty({ description: 'Actor role ID performing action', required: false })
  roleId?: string | null;

  @ApiProperty({ description: 'Actor role type performing action', required: false })
  roleType?: string | null;

  @ApiProperty({ description: 'State of entity before action', required: false })
  previousState?: any | null;

  @ApiProperty({ description: 'State of entity after action', required: false })
  currentState?: any | null;

  @ApiProperty({ description: 'Human-readable description', required: false })
  description?: string | null;

  @ApiProperty({ description: 'Severity of event (LOW, MEDIUM, HIGH, CRITICAL)', required: false })
  severity?: string | null;

  @ApiProperty({ description: 'Status of action (SUCCESS, FAILED)', required: false })
  status?: string | null;

  @ApiProperty({ description: 'Request identifier correlation ID', required: false })
  requestId?: string | null;

  @ApiProperty({ description: 'Originating IP address', required: false })
  ipAddress?: string | null;

  @ApiProperty({ description: 'Originating client User Agent', required: false })
  userAgent?: string | null;

  @ApiProperty({ description: 'Extra metadata payload', required: false })
  metadata?: any | null;

  @ApiProperty({ description: 'Timestamp of event creation' })
  createdAt: Date;
}
