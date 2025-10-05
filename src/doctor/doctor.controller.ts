import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DoctorsService } from './doctor.service';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';

@Controller('doctors')
@UseGuards(JwtAuthGuard)
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) { }

  @Post()
  async create(@Body() createDoctorDto: CreateDoctorDto, @Req() req) {
    return this.doctorsService.create(createDoctorDto, req.user);
  }

  @Get()
  async findAll(@Req() req, @Query('limit') limit?: number, @Query('offset') offset?: number) {
    return this.doctorsService.findAll(req.user, limit, offset);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req) {
    return this.doctorsService.findOne(id, req.user);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateDoctorDto: UpdateDoctorDto, @Req() req) {
    return this.doctorsService.update(id, updateDoctorDto, req.user);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req) {
    return this.doctorsService.remove(id, req.user);
  }

  @Patch(':id/restore')
  async restoreDoctor(
    @Param('id') id: string,
    @Req() req: any
  ) {
    return this.doctorsService.restore(id, { id: req.user.id, tenantId: req.user.tenantId });
  }
}