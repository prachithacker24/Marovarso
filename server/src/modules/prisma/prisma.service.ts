import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    // Automatically establish PostgreSQL connection on application launch.
    await this.$connect();
  }

  async onModuleDestroy() {
    // Gracefully sever PostgreSQL connection on application shutdown.
    await this.$disconnect();
  }
}
