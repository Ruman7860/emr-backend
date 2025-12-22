import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PatientsService } from './patients.service';
import { PatientsController } from './patients.controller';
import { PrismaService } from 'prisma/prisma.service';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    QueueModule,
    EventEmitterModule.forRoot()
  ],
  controllers: [PatientsController,],
  providers: [PatientsService, PrismaService],
})
export class PatientsModule { }