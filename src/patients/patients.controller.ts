import { Controller, Get, Post, Body, UseGuards, Request, UnauthorizedException } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('patients')
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) { }

  @ApiOperation({ summary: 'Get all patients' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(@Request() req) {
    const start = Date.now();
    if (!['ADMIN', 'DOCTOR'].includes(req.user.role)) {
      throw new UnauthorizedException('Insufficient permissions');
    }
    const patients = await this.patientsService.findAll();
    console.log('Patients fetch time:', Date.now() - start, 'ms');
    return patients;
  }

  @ApiOperation({ summary: 'Create a patient' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Request() req, @Body() body: { name: string; medicalHistory?: string }) {
    if (!['ADMIN', 'DOCTOR'].includes(req.user.role)) {
      throw new UnauthorizedException('Insufficient permissions');
    }
    return this.patientsService.create(body);
  }
}