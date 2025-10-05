import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma, Role } from '@prisma/client';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class StaffsService {
  constructor(private prisma: PrismaService) {}

  private async isAuthorizedInTenant(userId: string, tenantId: string, requiredRoles: Role[]): Promise<boolean> {
    const userTenant = await this.prisma.userTenant.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });
    return userTenant ? requiredRoles.includes(userTenant.role) : false;
  }

  async create(createStaffDto: CreateStaffDto, user: { id: string; tenantId: string }) {
    const { email, password, name, phone, isActive, employeeCode } = createStaffDto;
    const tenantId = user.tenantId;

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Invalid email format');
    }

    // Check authorization (admin or staff can create)
    if (!(await this.isAuthorizedInTenant(user.id, tenantId, [Role.ADMIN]))) {
      throw new ForbiddenException('You must be an admin or staff in this tenant to create staff');
    }

    // Check if tenant exists and is not soft-deleted
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found or deleted');
    }

    // Check for duplicate email
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new BadRequestException('Email already in use');
    }

    // Check for duplicate employeeCode in tenant
    const existingStaff = await this.prisma.staff.findFirst({
      where: { employeeCode, tenantId },
    });
    if (existingStaff) {
      throw new BadRequestException('Employee code already in use in this tenant');
    }

    try {
      // Use transaction to ensure atomicity
      const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create User
        const newUser = await tx.user.create({
          data: {
            email,
            password: hashedPassword,
            name: name || email.split('@')[0], // Default name to email prefix if not provided
            role: Role.STAFF,
            deletedAt: null,
          },
        });

        // Create Staff
        const staff = await tx.staff.create({
          data: {
            userId: newUser.id,
            tenantId,
            phone: phone || null,
            isActive: isActive ?? true,
            employeeCode,
            deletedAt: null,
          },
        });

        // Create UserTenant entry for the new staff
        await tx.userTenant.create({
          data: {
            userId: newUser.id,
            tenantId,
            role: Role.STAFF,
            deletedAt: null,
          },
        });

        return {
          id: staff.id,
          name: newUser.name,
          phone: staff.phone,
          employeeCode: staff.employeeCode,
          isActive: staff.isActive,
          deletedAt: staff.deletedAt || null,
        };
      });

      return {
        success: true,
        message: 'Staff created successfully',
        statusCode: 201,
        data: result,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException('Duplicate entry detected');
        }
      }
      throw new InternalServerErrorException('Failed to create staff due to an internal error');
    }
  }

  async findAll(user: { id: string; tenantId: string }, limit?: number, offset?: number) {
    // Allow admin, staff, nurse, or staff to view (read-only for non-admins)
    if (!(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.ADMIN, Role.STAFF, Role.NURSE, Role.STAFF]))) {
      throw new ForbiddenException('You must be authorized in this tenant to list staff');
    }

    try {
      const staff = await this.prisma.staff.findMany({
        where: { tenantId: user.tenantId },
        include: { user: true },
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      });
      return {
        success: true,
        message: 'Staff retrieved successfully',
        statusCode: 200,
        data: staff,
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to retrieve staff due to an internal error');
    }
  }

  async findOne(id: string, user: { id: string; tenantId: string }) {
    const staff = await this.prisma.staff.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!staff || staff.deletedAt) {
      throw new NotFoundException('Staff not found or deleted');
    }

    if (staff.tenantId !== user.tenantId || !(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.ADMIN, Role.STAFF, Role.NURSE, Role.STAFF]))) {
      throw new ForbiddenException('You must be authorized in this tenant to view this staff');
    }

    return {
      success: true,
      message: 'Staff retrieved successfully',
      statusCode: 200,
      data: staff,
    };
  }

  async update(id: string, updateStaffDto: UpdateStaffDto, user: { id: string; tenantId: string }) {
    // Fetch the staff with related user data
    const staff = await this.prisma.staff.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!staff || staff.deletedAt) {
      throw new NotFoundException('Staff not found or deleted');
    }

    // Authorization check: Ensure the user is an admin or staff in the tenant
    if (
      staff.tenantId !== user.tenantId ||
      !(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.ADMIN]))
    ) {
      throw new ForbiddenException('You are not authorized to update staff in this tenant');
    }

    // Prepare data for Staff and User updates
    const staffData: Partial<Prisma.StaffUpdateInput> = {};
    const userData: Partial<Prisma.UserUpdateInput> = {};

    // Map fields from updateStaffDto to the appropriate model
    if (updateStaffDto.phone !== undefined) staffData.phone = updateStaffDto.phone;
    if (updateStaffDto.isActive !== undefined) staffData.isActive = updateStaffDto.isActive;
    if (updateStaffDto.employeeCode !== undefined) staffData.employeeCode = updateStaffDto.employeeCode;

    if (updateStaffDto.name !== undefined) userData.name = updateStaffDto.name;
    if (updateStaffDto.email !== undefined) userData.email = updateStaffDto.email;

    // Validate employeeCode uniqueness if provided and different
    if (updateStaffDto.employeeCode && updateStaffDto.employeeCode !== staff.employeeCode) {
      const existingStaff = await this.prisma.staff.findFirst({
        where: {
          employeeCode: updateStaffDto.employeeCode,
          tenantId: user.tenantId,
          deletedAt: null,
          id: { not: id }, // Exclude self
        },
      });
      if (existingStaff) {
        throw new BadRequestException('Employee code already in use in this tenant');
      }
    }

    // Validate email uniqueness if provided and different
    if (updateStaffDto.email && updateStaffDto.email !== staff.user.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: updateStaffDto.email },
      });
      if (existingUser && existingUser.id !== staff.userId) {
        throw new BadRequestException('Email already in use');
      }
    }

    try {
      // Start a transaction to update both Staff and User models
      const [updatedStaff] = await this.prisma.$transaction([
        // Update Staff model
        this.prisma.staff.update({
          where: { id },
          data: staffData,
        }),
        // Update User model if there are changes
        ...(Object.keys(userData).length > 0
          ? [
              this.prisma.user.update({
                where: { id: staff.userId },
                data: userData,
              }),
            ]
          : []),
      ]);

      return {
        success: true,
        message: 'Staff updated successfully',
        statusCode: 200,
        data: updatedStaff,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException('Duplicate entry detected');
        }
      }
      throw new InternalServerErrorException('Failed to update staff due to an internal error');
    }
  }

  async remove(id: string, user: { id: string; tenantId: string }) {
    const staff = await this.prisma.staff.findUnique({ where: { id } });

    if (!staff || staff.deletedAt) {
      throw new NotFoundException('Staff not found or already deleted');
    }

    if (staff.tenantId !== user.tenantId || !(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.ADMIN]))) {
      throw new ForbiddenException('You must be an admin in this tenant to delete staff');
    }

    try {
      const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.user.update({
          where: { id: staff.userId },
          data: { deletedAt: new Date() },
        });
        await tx.userTenant.update({
          where: { userId_tenantId: { userId: staff.userId, tenantId: staff.tenantId } },
          data: { deletedAt: new Date() },
        });
        return await tx.staff.update({
          where: { id },
          data: { deletedAt: new Date(), isActive: false },
        });
      });

      return {
        success: true,
        message: 'Staff deleted successfully',
        statusCode: 200,
        data: result,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('Staff not found');
        }
      }
      throw new InternalServerErrorException('Failed to delete staff due to an internal error');
    }
  }

  async restore(id: string, user: { id: string; tenantId: string }) {
    // Fetch the staff
    const staff = await this.prisma.staff.findUnique({ where: { id } });

    if (!staff || !staff.deletedAt) {
      throw new NotFoundException('Staff not found or not deleted');
    }

    // Only admin can restore
    if (staff.tenantId !== user.tenantId || !(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.ADMIN]))) {
      throw new ForbiddenException('You must be an admin in this tenant to restore staff');
    }

    try {
      const restoredStaff = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Restore User
        await tx.user.update({
          where: { id: staff.userId },
          data: { deletedAt: null },
        });

        // Restore UserTenant
        await tx.userTenant.update({
          where: { userId_tenantId: { userId: staff.userId, tenantId: staff.tenantId } },
          data: { deletedAt: null },
        });

        // Restore Staff
        return await tx.staff.update({
          where: { id },
          data: { deletedAt: null, isActive: true },
        });
      });

      return {
        success: true,
        message: 'Staff restored successfully',
        statusCode: 200,
        data: restoredStaff,
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to restore staff due to an internal error');
    }
  }
}