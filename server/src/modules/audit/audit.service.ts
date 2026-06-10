import { Injectable, Logger } from '@nestjs/common';
import { AuditRepository } from './audit.repository';
import { AuditLog, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

export interface AuditLogParams {
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  roleId?: string | null;
  roleType?: string | null;
  previousState?: any | null;
  currentState?: any | null;
  description?: string | null;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string | null;
  status?: 'SUCCESS' | 'FAILED' | string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: any | null;
}

export interface SecurityEventParams {
  eventType: string; // maps to action
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string;
  description: string;
  roleId?: string | null;
  roleType?: string | null;
  status?: 'SUCCESS' | 'FAILED' | string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: any | null;
  requestId?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly auditRepository: AuditRepository) {}

  /**
   * Log a general audit event or state modification.
   */
  async log(params: AuditLogParams): Promise<AuditLog> {
    try {
      const {
        action,
        entityType = null,
        entityId = null,
        roleId = null,
        roleType = null,
        previousState = null,
        currentState = null,
        description = null,
        severity = null,
        status = null,
        requestId = null,
        ipAddress = null,
        userAgent = null,
        metadata = null,
      } = params;

      // Ensure we have a request ID for tracing correlation
      const resolvedRequestId = requestId || randomUUID();

      const auditLogData: Prisma.AuditLogCreateInput = {
        action,
        entityType,
        entityId,
        roleId,
        roleType,
        previousState: previousState
          ? (previousState as Prisma.InputJsonValue)
          : Prisma.DbNull,
        currentState: currentState
          ? (currentState as Prisma.InputJsonValue)
          : Prisma.DbNull,
        description,
        severity,
        status,
        requestId: resolvedRequestId,
        ipAddress,
        userAgent,
        metadata: metadata
          ? (metadata as Prisma.InputJsonValue)
          : Prisma.DbNull,
      };

      const logRecord = await this.auditRepository.create(auditLogData);

      this.logger.debug(
        `Audit Log recorded: action=${action}, requestId=${resolvedRequestId}, status=${status}`,
      );

      return logRecord;
    } catch (error) {
      this.logger.error(
        `Failed to record audit log: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Helper to write security events to the AuditLog table.
   */
  async logSecurityEvent(params: SecurityEventParams): Promise<AuditLog> {
    return this.log({
      action: params.eventType,
      entityType: 'SECURITY',
      roleId: params.roleId,
      roleType: params.roleType,
      description: params.description,
      severity: params.severity,
      status: params.status || 'FAILED',
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: params.metadata,
      requestId: params.requestId,
    });
  }
}
