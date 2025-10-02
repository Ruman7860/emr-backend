import { Module } from '@nestjs/common';
import { StaffsService } from './staffs.service';
import { StaffsController } from './staffs.controller';
import { PrismaService } from 'prisma/prisma.service';

@Module({
  controllers: [StaffsController],
  providers: [StaffsService, PrismaService],
})
export class StaffsModule {}