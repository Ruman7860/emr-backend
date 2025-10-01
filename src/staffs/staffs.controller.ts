import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { CreateStaffDto } from "./dto/staffs.dto";
import { StaffService } from "./staffs.service";

@ApiBearerAuth()
@Controller('staff')
export class StaffController {
    constructor(private staffService: StaffService) { }
    @UseGuards(JwtAuthGuard)
    @Post()
    async createStaff(@Body() body: CreateStaffDto, @Req() req: any) {
        const user = req.user;
        if (!user || user.role !== 'ADMIN') {
            throw new ForbiddenException('Only admins can create staff');
        }

        if (!body.name || !body.email) {
            throw new BadRequestException('Name and email are required');
        }

        return await this.staffService.createStaff(body)
    }

    @UseGuards(JwtAuthGuard)
    @Get()
    async findAll() {
        return await this.staffService.getAllStaffs();
    }
}
