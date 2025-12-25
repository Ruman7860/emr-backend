import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { LabtestsService } from './labtests.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateLabTestDto } from './dto/create-labtest.dto';
import { UpdateLabTestDto } from './dto/update-labtest.dto';

@Controller('labtests')
@UseGuards(JwtAuthGuard)
export class LabtestsController {
    constructor(private readonly labtestsService: LabtestsService) { }

    @Post()
    async create(@Body() createLabTestDto: CreateLabTestDto, @Req() req) {
        return this.labtestsService.create(createLabTestDto, req.user);
    }

    @Get()
    async findAll(@Query('patientId') patientId: string, @Query('visitId') visitId: string, @Req() req) {
        return this.labtestsService.findAll(req.user, patientId, visitId);
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @Req() req) {
        return this.labtestsService.findOne(id, req.user);
    }

    @Patch(':id')
    async update(@Param('id') id: string, @Body() updateLabTestDto: UpdateLabTestDto, @Req() req) {
        return this.labtestsService.update(id, updateLabTestDto, req.user);
    }

    @Delete(':id')
    async remove(@Param('id') id: string, @Req() req) {
        return this.labtestsService.remove(id, req.user);
    }
}
