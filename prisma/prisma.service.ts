// prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaService | undefined;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super();

    // Use global singleton for serverless / dev hot reload
    if (process.env.NODE_ENV !== 'production') {
      if (!global.prisma) {
        global.prisma = this;
      }
      return global.prisma as PrismaService;
    }
  }

  async onModuleInit() {
    console.log('Prisma connected');
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
