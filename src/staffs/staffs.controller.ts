import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { StaffsService } from './staffs.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

@Controller('staffs')
@UseGuards(JwtAuthGuard)
export class StaffsController {
  constructor(private readonly staffsService: StaffsService) {}

  @Post()
  async create(@Body() createStaffDto: CreateStaffDto, @Req() req) {
    return this.staffsService.create(createStaffDto, req.user);
  }

  @Get()
  async findAll(@Req() req) {
    return this.staffsService.findAll(req.user);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req) {
    return this.staffsService.findOne(id, req.user);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateStaffDto: UpdateStaffDto, @Req() req) {
    return this.staffsService.update(id, updateStaffDto, req.user);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req) {
    return this.staffsService.remove(id, req.user);
  }

  @Patch(':id/restore')
  async restoreStaff(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.staffsService.restore(id, { id: req.user.id, tenantId: req.user.tenantId });
  }
}