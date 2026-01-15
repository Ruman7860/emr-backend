import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { UpdatePrescriptionDto } from './dto/update-prescription.dto';
import { GeneratePrescriptionPdfDto } from './dto/generate-prescription-pdf.dto';

@Controller('prescriptions')
@UseGuards(JwtAuthGuard)
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) { }

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

  @Post('generate-pdf')
  async generatePDF(@Body() dto: GeneratePrescriptionPdfDto, @Req() req) {
    return this.prescriptionsService.generatePrescriptionPDF(dto.visitId, req.user, dto.version || 1);
  }

  @Get('documents/:id/download')
  async downloadPDF(@Param('id') id: string, @Req() req) {
    return this.prescriptionsService.getPrescriptionDownloadUrl(id, req.user);
  }

  @Get('documents/patient/:patientId')
  async getPrescriptionDocumentsByPatient(@Param('patientId') patientId: string, @Req() req) {
    return this.prescriptionsService.getPrescriptionDocumentsByPatient(patientId, req.user);
  }
}