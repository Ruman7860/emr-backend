import { Module } from '@nestjs/common';
import { LabtestsService } from './labtests.service';
import { LabtestsController } from './labtests.controller';
import { PrismaService } from 'prisma/prisma.service';

@Module({
    controllers: [LabtestsController],
    providers: [LabtestsService, PrismaService],
})
export class LabtestsModule { }
