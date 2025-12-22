import { Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { QueueController } from './queue.controller';
import { QueueGateway } from './queue.gateway';
import { PrismaService } from 'prisma/prisma.service';
import { JwtModule } from '@nestjs/jwt';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [JwtModule.register({
    secret: process.env.JWT_SECRET,
  }),
 EventEmitterModule.forRoot()
],
  controllers: [QueueController],
  providers: [QueueService, QueueGateway, PrismaService],
  exports: [QueueService],
})
export class QueueModule { }
