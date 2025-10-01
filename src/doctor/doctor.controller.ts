// src/doctor/doctor.controller.ts
import { Controller, Post, Get, Body, UseGuards, Req, ForbiddenException, BadRequestException } from '@nestjs/common';
import { DoctorService } from './doctor.service';
import { CreateDoctorDto } from './dto/doctor.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiBearerAuth()
@Controller('doctor')
export class DoctorController {
  constructor(private doctorService: DoctorService) {}

  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a doctor (Admin only)' })
  @Post()
  async create(@Body() body: CreateDoctorDto, @Req() req: any) {
    const user = req.user;

    if (!user || user.role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can create doctors');
    }

    if (!body.name || !body.email) {
      throw new BadRequestException('Name and email are required');
    }

    return await this.doctorService.createDoctor(body);
  }

  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all doctors' })
  @Get()
  async findAll() {
    return await this.doctorService.getAllDoctors();
  }
}
