import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';

@Injectable()
export class DoctorsService {
  constructor(private prisma: PrismaService) {}

  private async isAdminInTenant(userId: string, tenantId: string): Promise<boolean> {
    const userTenant = await this.prisma.userTenant.findUnique({
      where: {
        userId_tenantId: { userId, tenantId },
      },
    });
    return userTenant?.role === Role.ADMIN;
  }

  async create(createDoctorDto: CreateDoctorDto, user: { id: string; tenantId: string }) {
    const { email, password, name, specialty, phone, isActive, employeeCode } = createDoctorDto;
    const tenantId = user.tenantId;

    // Validate email format
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
      return {
        success: false,
        message: 'Invalid email format',
        statusCode: 400,
        data: null,
      };
    }

    // Check if requester is admin in the tenant
    if (!(await this.isAdminInTenant(user.id, tenantId))) {
      return {
        success: false,
        message: 'You must be an admin in this tenant to create doctors',
        statusCode: 403,
        data: null,
      };
    }

    // Check if tenant exists and is not soft-deleted
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId, deletedAt: null },
    });
    if (!tenant) {
      return {
        success: false,
        message: 'Tenant not found or deleted',
        statusCode: 404,
        data: null,
      };
    }

    // Check for duplicate email
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      return {
        success: false,
        message: 'Email already in use',
        statusCode: 400,
        data: null,
      };
    }

    // Check for duplicate employeeCode in tenant
    const existingDoctor = await this.prisma.doctor.findFirst({
      where: { employeeCode, tenantId, deletedAt: null },
    });
    if (existingDoctor) {
      return {
        success: false,
        message: 'Employee code already in use in this tenant',
        statusCode: 400,
        data: null,
      };
    }

    try {
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create User
      const newUser = await this.prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          role: Role.DOCTOR,
        },
      });

      // Create Doctor
      const doctor = await this.prisma.doctor.create({
        data: {
          userId: newUser.id,
          tenantId,
          specialty,
          phone,
          isActive: isActive ?? true,
          employeeCode,
        },
      });

      // Create UserTenant entry for the new doctor
      await this.prisma.userTenant.create({
        data: {
          userId: newUser.id,
          tenantId,
          role: Role.DOCTOR,
        },
      });

      return {
        success: true,
        message: 'Doctor created successfully',
        statusCode: 201,
        data: doctor,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create doctor',
        statusCode: 500,
        data: error.message,
      };
    }
  }

  async findAll(user: { id: string; tenantId: string }) {
    // Check if user is admin in the tenant
    if (!(await this.isAdminInTenant(user.id, user.tenantId))) {
      return {
        success: false,
        message: 'You must be an admin in this tenant to list doctors',
        statusCode: 403,
        data: null,
      };
    }

    try {
      const doctors = await this.prisma.doctor.findMany({
        where: { tenantId: user.tenantId, deletedAt: null },
        include: { user: true, tenant: true },
      });
      return {
        success: true,
        message: 'Doctors retrieved successfully',
        statusCode: 200,
        data: doctors,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to retrieve doctors',
        statusCode: 500,
        data: error.message,
      };
    }
  }

  async findOne(id: string, user: { id: string; tenantId: string }) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id },
      include: { tenant: true, user: true },
    });

    if (!doctor || doctor.deletedAt) {
      return {
        success: false,
        message: 'Doctor not found or deleted',
        statusCode: 404,
        data: null,
      };
    }

    if (doctor.tenantId !== user.tenantId || !(await this.isAdminInTenant(user.id, user.tenantId))) {
      return {
        success: false,
        message: 'You must be an admin in this tenant to view this doctor',
        statusCode: 403,
        data: null,
      };
    }

    return {
      success: true,
      message: 'Doctor retrieved successfully',
      statusCode: 200,
      data: doctor,
    };
  }

  async update(id: string, updateDoctorDto: UpdateDoctorDto, user: { id: string; tenantId: string }) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id },
    });

    if (!doctor || doctor.deletedAt) {
      return {
        success: false,
        message: 'Doctor not found or deleted',
        statusCode: 404,
        data: null,
      };
    }

    if (doctor.tenantId !== user.tenantId || !(await this.isAdminInTenant(user.id, user.tenantId))) {
      return {
        success: false,
        message: 'You must be an admin in this tenant to update doctors',
        statusCode: 403,
        data: null,
      };
    }

    // Check for duplicate employeeCode if provided
    if (updateDoctorDto.employeeCode && updateDoctorDto.employeeCode !== doctor.employeeCode) {
      const existingDoctor = await this.prisma.doctor.findFirst({
        where: {
          employeeCode: updateDoctorDto.employeeCode,
          tenantId: user.tenantId,
          deletedAt: null,
        },
      });
      if (existingDoctor && existingDoctor.id !== id) {
        return {
          success: false,
          message: 'Employee code already in use in this tenant',
          statusCode: 400,
          data: null,
        };
      }
    }

    try {
      const updatedDoctor = await this.prisma.doctor.update({
        where: { id },
        data: updateDoctorDto,
      });
      return {
        success: true,
        message: 'Doctor updated successfully',
        statusCode: 200,
        data: updatedDoctor,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update doctor',
        statusCode: 500,
        data: error.message,
      };
    }
  }

  async remove(id: string, user: { id: string; tenantId: string }) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id },
    });

    if (!doctor || doctor.deletedAt) {
      return {
        success: false,
        message: 'Doctor not found or already deleted',
        statusCode: 404,
        data: null,
      };
    }

    if (doctor.tenantId !== user.tenantId || !(await this.isAdminInTenant(user.id, user.tenantId))) {
      return {
        success: false,
        message: 'You must be an admin in this tenant to delete doctors',
        statusCode: 403,
        data: null,
      };
    }

    try {
      const deletedDoctor = await this.prisma.doctor.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      return {
        success: true,
        message: 'Doctor deleted successfully',
        statusCode: 200,
        data: deletedDoctor,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete doctor',
        statusCode: 500,
        data: error.message,
      };
    }
  }
}