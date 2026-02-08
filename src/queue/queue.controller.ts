import { Controller, Get, Req, UseGuards, Post, Body } from '@nestjs/common';
import { QueueService } from './queue.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('queue')
@UseGuards(JwtAuthGuard)
export class QueueController {
  constructor(private readonly queueService: QueueService) { }

  @Get()
  async getDoctorQueue(@Req() req) {
    return this.queueService.getDoctorQueue(req.user);
  }

  @Get('completed')
  async getCompletedQueue(@Req() req) {
    return this.queueService.getCompletedQueue(req.user);
  }

  @Post('start-consultation')
  async startConsultation(@Req() req, @Body() body: { patientId: string; visitId: string }) {
    return this.queueService.startConsultation(req.user, body.patientId, body.visitId);
  }

  @Post('end-consultation')
  async endConsultation(@Req() req, @Body() body: { patientId: string; visitId: string; durationInSeconds: number }) {
    return this.queueService.endConsultation(req.user, body.patientId, body.visitId, body.durationInSeconds);
  }

  @Post('cancel-visit')
  async cancelVisit(@Req() req, @Body() body: { patientId: string; visitId: string }) {
    return this.queueService.cancelVisit(req.user, body.patientId, body.visitId);
  }
}
