import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { VisitsService } from './visits.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateVisitDto } from './dto/create-visit.dto';
import { UpdateVisitDto } from './dto/update-visit.dto';

@Controller('visits')
@UseGuards(JwtAuthGuard)
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  @Post()
  async create(@Body() createVisitDto: CreateVisitDto, @Req() req) {
    return this.visitsService.create(createVisitDto, req.user);
  }

  @Get()
  async findAll(@Query('patientId') patientId: string, @Req() req) {
    return this.visitsService.findAll(req.user, patientId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req) {
    return this.visitsService.findOne(id, req.user);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateVisitDto: UpdateVisitDto, @Req() req) {
    return this.visitsService.update(id, updateVisitDto, req.user);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req) {
    return this.visitsService.remove(id, req.user);
  }
}