import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PatientStatus } from '@prisma/client';
import { CollectPaymentDto } from './dto/collect-payment.dto';

@Controller('patients')
@UseGuards(JwtAuthGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) { }

  @Post()
  async create(@Body() createPatientDto: CreatePatientDto, @Req() req) {
    return this.patientsService.create(createPatientDto, req.user);
  }

  @Get()
  async findAll(
    @Req() req,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
    @Query('status') status?: PatientStatus,
    @Query('deleted') deleted?: string
  ) {
    return this.patientsService.findAll(req.user, {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      search,
      deleted
    });
  }


  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req) {
    return this.patientsService.findOne(id, req.user);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updatePatientDto: UpdatePatientDto, @Req() req) {
    return this.patientsService.update(id, updatePatientDto, req.user);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req) {
    return this.patientsService.remove(id, req.user);
  }

  @Post(':id/restore')
  async restore(@Param('id') id: string, @Req() req) {
    return this.patientsService.restore(id, req.user);
  }

  // @Get(':id/timeline')
  // async getTimeline(@Param('id') id: string, @Req() req) {
  //   return this.patientsService.getTimeline(id, req.user);
  // }

  @Patch(':id/collect-payment')
  async collectPayment(
    @Param('id') patientId: string,
    @Body() body: CollectPaymentDto,
    @Req() req: { user: { id: string; tenantId: string } }
  ) {
    return this.patientsService.collectPayment(
      patientId,
      body,
      req.user
    );
  }

}