import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLog, Prisma } from '@prisma/client';

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Insert a new AuditLog record into the database.
   */
  async create(data: Prisma.AuditLogCreateInput): Promise<AuditLog> {
    return this.prisma.auditLog.create({
      data,
    });
  }

  /**
   * Retrieve multiple AuditLog records with pagination, filtering, and sorting.
   */
  async findMany(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.AuditLogWhereUniqueInput;
    where?: Prisma.AuditLogWhereInput;
    orderBy?: Prisma.AuditLogOrderByWithRelationInput;
  }): Promise<AuditLog[]> {
    const { skip, take, cursor, where, orderBy } = params;
    return this.prisma.auditLog.findMany({
      skip,
      take,
      cursor,
      where,
      orderBy,
    });
  }

  /**
   * Find a single AuditLog by ID.
   */
  async findById(id: string): Promise<AuditLog | null> {
    return this.prisma.auditLog.findUnique({
      where: { id },
    });
  }

  /**
   * Count AuditLog records matching a filter.
   */
  async count(params: { where?: Prisma.AuditLogWhereInput }): Promise<number> {
    const { where } = params;
    return this.prisma.auditLog.count({
      where,
    });
  }
}
