import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class StaffsService {
  constructor(private prisma: PrismaService) {}

  private async isAdminInTenant(userId: string, tenantId: string): Promise<boolean> {
    const userTenant = await this.prisma.userTenant.findUnique({
      where: {
        userId_tenantId: { userId, tenantId },
      },
    });
    return userTenant?.role === Role.ADMIN;
  }

  async create(createStaffDto: CreateStaffDto, user: { id: string; tenantId: string }) {
    const { email, password, name, phone, isActive, employeeCode } = createStaffDto;
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
        message: 'You must be an admin in this tenant to create staff',
        statusCode: 403,
        data: null,
      };
    }

    // Check if tenant exists and is not soft-deleted
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
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
    const existingStaff = await this.prisma.staff.findFirst({
      where: { employeeCode, tenantId },
    });
    if (existingStaff) {
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
          role: Role.STAFF,
        },
      });

      // Create Staff
      const staff = await this.prisma.staff.create({
        data: {
          userId: newUser.id,
          tenantId,
          phone,
          isActive: isActive ?? true,
          employeeCode,
        },
      });

      // Create UserTenant entry for the new staff
      await this.prisma.userTenant.create({
        data: {
          userId: newUser.id,
          tenantId,
          role: Role.STAFF,
        },
      });

      return {
        success: true,
        message: 'Staff created successfully',
        statusCode: 201,
        data: staff,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create staff',
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
        message: 'You must be an admin in this tenant to list staff',
        statusCode: 403,
        data: null,
      };
    }

    try {
      const staff = await this.prisma.staff.findMany({
        where: { tenantId: user.tenantId },
        include: { user: true, tenant: true },
      });
      return {
        success: true,
        message: 'Staff retrieved successfully',
        statusCode: 200,
        data: staff,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to retrieve staff',
        statusCode: 500,
        data: error.message,
      };
    }
  }

  async findOne(id: string, user: { id: string; tenantId: string }) {
    const staff = await this.prisma.staff.findUnique({
      where: { id },
      include: { tenant: true, user: true },
    });

    if (!staff || staff.deletedAt) {
      return {
        success: false,
        message: 'Staff not found or deleted',
        statusCode: 404,
        data: null,
      };
    }

    if (staff.tenantId !== user.tenantId || !(await this.isAdminInTenant(user.id, user.tenantId))) {
      return {
        success: false,
        message: 'You must be an admin in this tenant to view this staff',
        statusCode: 403,
        data: null,
      };
    }

    return {
      success: true,
      message: 'Staff retrieved successfully',
      statusCode: 200,
      data: staff,
    };
  }

  async update(id: string, updateStaffDto: UpdateStaffDto, user: { id: string; tenantId: string }) {
    const staff = await this.prisma.staff.findUnique({
      where: { id },
    });

    if (!staff || staff.deletedAt) {
      return {
        success: false,
        message: 'Staff not found or deleted',
        statusCode: 404,
        data: null,
      };
    }

    if (staff.tenantId !== user.tenantId || !(await this.isAdminInTenant(user.id, user.tenantId))) {
      return {
        success: false,
        message: 'You must be an admin in this tenant to update staff',
        statusCode: 403,
        data: null,
      };
    }

    // Check for duplicate employeeCode if provided
    if (updateStaffDto.employeeCode && updateStaffDto.employeeCode !== staff.employeeCode) {
      const existingStaff = await this.prisma.staff.findFirst({
        where: {
          employeeCode: updateStaffDto.employeeCode,
          tenantId: user.tenantId,
        },
      });
      if (existingStaff && existingStaff.id !== id) {
        return {
          success: false,
          message: 'Employee code already in use in this tenant',
          statusCode: 400,
          data: null,
        };
      }
    }

    try {
      const updatedStaff = await this.prisma.staff.update({
        where: { id },
        data: updateStaffDto,
      });
      return {
        success: true,
        message: 'Staff updated successfully',
        statusCode: 200,
        data: updatedStaff,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update staff',
        statusCode: 500,
        data: error.message,
      };
    }
  }

  async remove(id: string, user: { id: string; tenantId: string }) {
    const staff = await this.prisma.staff.findUnique({
      where: { id },
    });

    if (!staff || staff.deletedAt) {
      return {
        success: false,
        message: 'Staff not found or already deleted',
        statusCode: 404,
        data: null,
      };
    }

    if (staff.tenantId !== user.tenantId || !(await this.isAdminInTenant(user.id, user.tenantId))) {
      return {
        success: false,
        message: 'You must be an admin in this tenant to delete staff',
        statusCode: 403,
        data: null,
      };
    }

    try {
      const deletedStaff = await this.prisma.staff.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      return {
        success: true,
        message: 'Staff deleted successfully',
        statusCode: 200,
        data: deletedStaff,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete staff',
        statusCode: 500,
        data: error.message,
      };
    }
  }
}