import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { OperationsService } from './operations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateOperationDto } from './dto/create-operation.dto';
import { UpdateOperationDto } from './dto/update-operation.dto';

@Controller('operations')
@UseGuards(JwtAuthGuard)
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Post()
  async create(@Body() createOperationDto: CreateOperationDto, @Req() req) {
    return this.operationsService.create(createOperationDto, req.user);
  }

  @Get()
  async findAll(@Query('patientId') patientId: string, @Req() req) {
    return this.operationsService.findAll(req.user, patientId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req) {
    return this.operationsService.findOne(id, req.user);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateOperationDto: UpdateOperationDto, @Req() req) {
    return this.operationsService.update(id, updateOperationDto, req.user);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req) {
    return this.operationsService.remove(id, req.user);
  }
}