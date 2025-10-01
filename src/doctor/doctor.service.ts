// src/doctor/doctor.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { CreateDoctorDto } from './dto/doctor.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class DoctorService {
  constructor(private prisma: PrismaService) { }

  async createDoctor(data: CreateDoctorDto) {
    try {
      const existingUser = await this.prisma.user.findUnique({ where: { email: data.email } });
      if (existingUser) throw new BadRequestException('User with this email already exists');

      const hashedPassword = await bcrypt.hash(data.password, 10);

      const user = await this.prisma.user.create({
        data: { email: data.email, password: hashedPassword, name: data.name, role: 'DOCTOR' },
      });

      const doctor = await this.prisma.doctor.create({
        data: {
          userId: user.id,
          specialty: data.specialty,
          phone: data.phone,
        },
      });

      return {
        success: true,
        statusCode: 201,
        message: 'Doctor created successfully',
        data: { doctor, user },
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


  async getAllDoctors() {
    const doctors = await this.prisma.doctor.findMany();
    return {
      success: true,
      statusCode: 200,
      message: 'Doctors fetched successfully',
      data: doctors,
    };
  }
}
