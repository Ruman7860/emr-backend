import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { BillingType, PaymentStatus, Role } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) { }

  private async isAuthorizedInTenant(userId: string, tenantId: string): Promise<boolean> {
    const userTenant = await this.prisma.userTenant.findUnique({
      where: {
        userId_tenantId: { userId, tenantId },
      },
    });
    const role = userTenant?.role;
    if (!role) return false;
    return role === Role.ADMIN || role === Role.DOCTOR || role === Role.STAFF || role === Role.NURSE;
  }

  private async isAdminInTenant(userId: string, tenantId: string): Promise<boolean> {
    const userTenant = await this.prisma.userTenant.findUnique({
      where: {
        userId_tenantId: { userId, tenantId },
      },
    });
    return userTenant?.role === Role.ADMIN;
  }

  private async generatePatientNumber(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const count = await this.prisma.patient.count({ where: { tenantId } });
    return `PT-${tenant.code.toUpperCase()}-${(count + 1).toString().padStart(3, '0')}`;
  }

  async create(createPatientDto: CreatePatientDto, user: { id: string; tenantId: string }) {
    const { fullName, dateOfBirth, gender, address, phone, registrationFee, doctorId } = createPatientDto;
    const tenantId = user.tenantId;

    // Check authorization
    if (!(await this.isAuthorizedInTenant(user.id, tenantId))) {
      return {
        success: false,
        message: 'You are not authorized to create patients in this tenant',
        statusCode: 403,
        data: null,
      };
    }

    // Check tenant exists
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId},
    });
    if (!tenant) {
      return {
        success: false,
        message: 'Tenant not found or deleted',
        statusCode: 404,
        data: null,
      };
    }

    // Validate registrationFee
    const fee = new Decimal(registrationFee);
    if (fee.lte(0)) {
      return {
        success: false,
        message: 'Registration fee must be positive',
        statusCode: 400,
        data: null,
      };
    }

    // Validate doctorId if provided
    if (doctorId) {
      console.log("tenantId",tenantId)
      const doctor = await this.prisma.doctor.findUnique({
        where: { id: doctorId, tenantId},
      });
      if (!doctor) {
        return {
          success: false,
          message: 'Doctor not found in this tenant',
          statusCode: 404,
          data: null,
        };
      }
    }

    // Validate phone format if provided (basic check)
    if (phone && !/^\d{10,15}$/.test(phone)) {
      return {
        success: false,
        message: 'Invalid phone format',
        statusCode: 400,
        data: null,
      };
    }

    // Generate patientNumber
    const patientNumber = await this.generatePatientNumber(tenantId);

    try {
      // Create Patient
      const patient = await this.prisma.patient.create({
        data: {
          fullName,
          dateOfBirth,
          gender,
          address,
          phone,
          registeredById: user.id,
          registrationFee,
          doctorId,
          patientNumber,
          tenantId,
        },
      });

      // Create initial Billing (REGISTRATION)
      await this.prisma.billing.create({
        data: {
          patientId: patient.id,
          type: BillingType.REGISTRATION,
          amount: registrationFee,
          status: PaymentStatus.UNPAID,
          // paymentMode to be updated later
        },
      });

      // Create initial Visit
      await this.prisma.visit.create({
        data: {
          patientId: patient.id,
          doctorId: doctorId || '', // Default or from input
          staffId: user.id,
          notes: 'Initial registration',
          consultationFee: 0, // Included in registration
        },
      });

      // Update noOfVisits
      await this.prisma.patient.update({
        where: { id: patient.id },
        data: { noOfVisits: 1 },
      });

      return {
        success: true,
        message: 'Patient created successfully',
        statusCode: 201,
        data: patient,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create patient',
        statusCode: 500,
        data: error.message,
      };
    }
  }

  async findAll(user: { id: string; tenantId: string }) {
    if (!(await this.isAuthorizedInTenant(user.id, user.tenantId))) {
      return {
        success: false,
        message: 'You are not authorized to list patients in this tenant',
        statusCode: 403,
        data: null,
      };
    }

    try {
      const patients = await this.prisma.patient.findMany({
        where: { tenantId: user.tenantId, deletedAt: null },
        include: { doctor: true, visits: true, billing: true },
      });
      return {
        success: true,
        message: 'Patients retrieved successfully',
        statusCode: 200,
        data: patients,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to retrieve patients',
        statusCode: 500,
        data: error.message,
      };
    }
  }

  async findOne(id: string, user: { id: string; tenantId: string }) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: { doctor: true, visits: true, billing: true, labTests: true, operations: true },
    });

    if (!patient || patient.deletedAt) {
      return {
        success: false,
        message: 'Patient not found or deleted',
        statusCode: 404,
        data: null,
      };
    }

    if (patient.tenantId !== user.tenantId || !(await this.isAuthorizedInTenant(user.id, user.tenantId))) {
      return {
        success: false,
        message: 'You are not authorized to view this patient',
        statusCode: 403,
        data: null,
      };
    }

    return {
      success: true,
      message: 'Patient retrieved successfully',
      statusCode: 200,
      data: patient,
    };
  }

  async update(id: string, updatePatientDto: UpdatePatientDto, user: { id: string; tenantId: string }) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
    });

    if (!patient || patient.deletedAt) {
      return {
        success: false,
        message: 'Patient not found or deleted',
        statusCode: 404,
        data: null,
      };
    }

    if (patient.tenantId !== user.tenantId || !(await this.isAuthorizedInTenant(user.id, user.tenantId))) {
      return {
        success: false,
        message: 'You are not authorized to update this patient',
        statusCode: 403,
        data: null,
      };
    }

    try {
      const updatedPatient = await this.prisma.patient.update({
        where: { id },
        data: updatePatientDto,
      });
      return {
        success: true,
        message: 'Patient updated successfully',
        statusCode: 200,
        data: updatedPatient,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update patient',
        statusCode: 500,
        data: error.message,
      };
    }
  }

  async remove(id: string, user: { id: string; tenantId: string }) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
    });

    if (!patient || patient.deletedAt) {
      return {
        success: false,
        message: 'Patient not found or already deleted',
        statusCode: 404,
        data: null,
      };
    }

    if (patient.tenantId !== user.tenantId || !(await this.isAdminInTenant(user.id, user.tenantId))) {
      return {
        success: false,
        message: 'You must be an admin in this tenant to delete patients',
        statusCode: 403,
        data: null,
      };
    }

    try {
      const deletedPatient = await this.prisma.patient.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      return {
        success: true,
        message: 'Patient deleted successfully',
        statusCode: 200,
        data: deletedPatient,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete patient',
        statusCode: 500,
        data: error.message,
      };
    }
  }
}