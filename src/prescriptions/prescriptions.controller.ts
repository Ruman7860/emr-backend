import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { UpdatePrescriptionDto } from './dto/update-prescription.dto';

@Controller('prescriptions')
@UseGuards(JwtAuthGuard)
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  @Post()
  async create(@Body() createPrescriptionDto: CreatePrescriptionDto, @Req() req) {
    return this.prescriptionsService.create(createPrescriptionDto, req.user);
  }

  @Get()
  async findAll(@Query('patientId') patientId: string, @Query('visitId') visitId: string, @Req() req) {
    return this.prescriptionsService.findAll(req.user, patientId, visitId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req) {
    return this.prescriptionsService.findOne(id, req.user);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updatePrescriptionDto: UpdatePrescriptionDto, @Req() req) {
    return this.prescriptionsService.update(id, updatePrescriptionDto, req.user);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req) {
    return this.prescriptionsService.remove(id, req.user);
  }
}