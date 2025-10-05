import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Doctor, Prisma, Role, User } from '@prisma/client';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class DoctorsService {
  constructor(private prisma: PrismaService) { }

  private async isAuthorizedInTenant(userId: string, tenantId: string, requiredRoles: Role[]): Promise<boolean> {
    const userTenant = await this.prisma.userTenant.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });
    return userTenant ? requiredRoles.includes(userTenant.role) : false;
  }

  async create(createDoctorDto: CreateDoctorDto, user: { id: string; tenantId: string }) {
    const { email, password, name, specialty, phone, isActive, employeeCode } = createDoctorDto;
    const tenantId = user.tenantId;

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Invalid email format');
    }

    // Check authorization (admin or staff can create)
    if (!(await this.isAuthorizedInTenant(user.id, tenantId, [Role.ADMIN, Role.STAFF]))) {
      throw new ForbiddenException('You must be an admin or staff in this tenant to create doctors');
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
    const existingDoctor = await this.prisma.doctor.findFirst({
      where: { employeeCode, tenantId },
    });
    if (existingDoctor) {
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
            role: Role.DOCTOR,
            deletedAt: null
          },
        });

        // Create Doctor
        const doctor = await tx.doctor.create({
          data: {
            userId: newUser.id,
            tenantId,
            specialty: specialty || 'General Practitioner', // Default specialty
            phone: phone || null,
            isActive: isActive ?? true,
            employeeCode,
            deletedAt: null
          },
        });

        // Create UserTenant entry
        await tx.userTenant.create({
          data: {
            userId: newUser.id,
            tenantId,
            role: Role.DOCTOR,
            deletedAt: null
          },
        });

        return {
          id: doctor.id,
          name: newUser.name,
          specialty: doctor.specialty,
          phone: doctor.phone,
          employeeCode: doctor.employeeCode,
          isActive: doctor.isActive,
          deletedAt: doctor.deletedAt || null
        };
      });

      return {
        success: true,
        message: 'Doctor created successfully',
        statusCode: 201,
        data: result,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException('Duplicate entry detected');
        }
      }
      throw new Error('Failed to create doctor due to an internal error');
    }
  }

  async findAll(user: { id: string; tenantId: string }, limit?: number, offset?: number) {
    // Allow admin, staff, nurse, or doctor to view (read-only for non-admins)
    if (!(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.ADMIN, Role.STAFF, Role.NURSE, Role.DOCTOR]))) {
      throw new ForbiddenException('You must be authorized in this tenant to list doctors');
    }

    try {
      const doctors = await this.prisma.doctor.findMany({
        where: { tenantId: user.tenantId },
        include: { user: true },
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      });
      return {
        success: true,
        message: 'Doctors retrieved successfully',
        statusCode: 200,
        data: doctors,
      };
    } catch (error) {
      throw new Error('Failed to retrieve doctors due to an internal error');
    }
  }

  async findOne(id: string, user: { id: string; tenantId: string }) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!doctor || doctor.deletedAt) {
      throw new NotFoundException('Doctor not found or deleted');
    }

    if (doctor.tenantId !== user.tenantId || !(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.ADMIN, Role.STAFF, Role.NURSE, Role.DOCTOR]))) {
      throw new ForbiddenException('You must be authorized in this tenant to view this doctor');
    }

    return {
      success: true,
      message: 'Doctor retrieved successfully',
      statusCode: 200,
      data: doctor,
    };
  }

  async update(id: string, updateDoctorDto: UpdateDoctorDto, user: { id: string; tenantId: string }) {
    // Fetch the doctor with related user data
    const doctor = await this.prisma.doctor.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!doctor || doctor.deletedAt) {
      throw new NotFoundException('Doctor not found or deleted');
    }

    // Authorization check: Ensure the user is an admin or staff in the tenant
    if (
      doctor.tenantId !== user.tenantId ||
      !(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.ADMIN, Role.STAFF]))
    ) {
      throw new ForbiddenException('You are not authorized to update doctors in this tenant');
    }

    // Prepare data for Doctor and User updates
    const doctorData: Partial<Doctor> = {};
    const userData: Partial<User> = {};

    // Map fields from updateDoctorDto to the appropriate model
    if (updateDoctorDto.specialty !== undefined) doctorData.specialty = updateDoctorDto.specialty;
    if (updateDoctorDto.phone !== undefined) doctorData.phone = updateDoctorDto.phone;
    if (updateDoctorDto.isActive !== undefined) doctorData.isActive = updateDoctorDto.isActive;
    if (updateDoctorDto.employeeCode !== undefined) doctorData.employeeCode = updateDoctorDto.employeeCode;

    if (updateDoctorDto.name !== undefined) userData.name = updateDoctorDto.name;
    if (updateDoctorDto.email !== undefined) userData.email = updateDoctorDto.email;

    // Validate employeeCode uniqueness if provided and different
    if (updateDoctorDto.employeeCode && updateDoctorDto.employeeCode !== doctor.employeeCode) {
      const existingDoctor = await this.prisma.doctor.findFirst({
        where: {
          employeeCode: updateDoctorDto.employeeCode,
          tenantId: user.tenantId,
          deletedAt: null,
          id: { not: id }, // Exclude self
        },
      });
      if (existingDoctor) {
        throw new BadRequestException('Employee code already in use in this tenant');
      }
    }

    // Validate email uniqueness if provided and different
    if (updateDoctorDto.email && updateDoctorDto.email !== doctor.user.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: updateDoctorDto.email },
      });
      if (existingUser && existingUser.id !== doctor.userId) {
        throw new BadRequestException('Email already in use');
      }
    }

    try {
      // Start a transaction to update both Doctor and User models
      const [updatedDoctor] = await this.prisma.$transaction([
        // Update Doctor model
        this.prisma.doctor.update({
          where: { id },
          data: doctorData,
        }),
        // Update User model if there are changes
        ...(Object.keys(userData).length > 0
          ? [
            this.prisma.user.update({
              where: { id: doctor.userId },
              data: userData,
            }),
          ]
          : []),
      ]);

      return {
        success: true,
        message: 'Doctor updated successfully',
        statusCode: 200,
        data: updatedDoctor,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException('Duplicate entry detected');
        }
      }
      throw new Error('Failed to update doctor due to an internal error');
    }
  }
  async remove(id: string, user: { id: string; tenantId: string }) {
    const doctor = await this.prisma.doctor.findUnique({ where: { id } });

    if (!doctor || doctor.deletedAt) {
      throw new NotFoundException('Doctor not found or already deleted');
    }

    if (doctor.tenantId !== user.tenantId || !(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.ADMIN]))) {
      throw new ForbiddenException('You must be an admin in this tenant to delete doctors');
    }

    try {
      const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.user.update({
          where: { id: doctor.userId },
          data: { deletedAt: new Date() },
        });
        await tx.userTenant.update({
          where: { userId_tenantId: { userId: doctor.userId, tenantId: doctor.tenantId } },
          data: { deletedAt: new Date() },
        });
        return await tx.doctor.update({
          where: { id },
          data: { deletedAt: new Date(), isActive: false },
        });
      });

      return {
        success: true,
        message: 'Doctor deleted successfully',
        statusCode: 200,
        data: result,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('Doctor not found');
        }
      }
      throw new Error('Failed to delete doctor due to an internal error');
    }
  }

  async restore(id: string, user: { id: string; tenantId: string }) {
    // Fetch the doctor
    const doctor = await this.prisma.doctor.findUnique({ where: { id } });

    if (!doctor || !doctor.deletedAt) {
      throw new NotFoundException('Doctor not found or not deleted');
    }

    // Only admin can restore
    if (doctor.tenantId !== user.tenantId || !(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.ADMIN]))) {
      throw new ForbiddenException('You must be an admin in this tenant to restore doctors');
    }

    try {
      const restoredDoctor = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Restore User
        await tx.user.update({
          where: { id: doctor.userId },
          data: { deletedAt: null },
        });

        // Restore UserTenant
        await tx.userTenant.update({
          where: { userId_tenantId: { userId: doctor.userId, tenantId: doctor.tenantId } },
          data: { deletedAt: null },
        });

        // Restore Doctor
        return await tx.doctor.update({
          where: { id },
          data: { deletedAt: null, isActive: true },
        });
      });

      return {
        success: true,
        message: 'Doctor restored successfully',
        statusCode: 200,
        data: restoredDoctor,
      };
    } catch (error) {
      throw new Error('Failed to restore doctor due to an internal error');
    }
  }

}
