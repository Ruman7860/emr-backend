import { BadRequestException, Injectable } from "@nestjs/common";
import { CreateStaffDto } from "./dto/staffs.dto";
import { PrismaService } from "prisma/prisma.service";
import * as bcrypt from 'bcrypt';

@Injectable()
export class StaffService {
    constructor(private prisma: PrismaService) { }
    async createStaff(data: CreateStaffDto) {
        try {
            const existingUser = await this.prisma.user.findUnique({ where: { email: data.email } });
            if (existingUser) {
                throw new BadRequestException('Staff with this email already exists');
            }

            const hashedPassword = await bcrypt.hash(data.password, 10);

            const user = await this.prisma.user.create({
                data: { email: data.email, password: hashedPassword, name: data.name, role: 'STAFF' },
            });

            const staff = await this.prisma.staff.create({
                data: { userId: user.id, phone: data.phone }
            })

            return {
                success: true,
                statusCode: 201,
                message: 'Staff created successfully',
                data: { staff, user },
            };
        } catch (error) {
            return {
                success: false,
                statusCode: 500,
                message: 'Internal server error',
                data: error.message,
            };
        }
    }

    async getAllStaffs() {
        const staffs = await this.prisma.staff.findMany();
        return {
            success: true,
            statusCode: 200,
            message: 'Staffs fetched successfully',
            data: staffs,
        };
    }
}