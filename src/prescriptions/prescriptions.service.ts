import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, Prisma } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { UpdatePrescriptionDto } from './dto/update-prescription.dto';

@Injectable()
export class PrescriptionsService {
  constructor(private prisma: PrismaService) {}

  private async isAuthorizedInTenant(userId: string, tenantId: string, requiredRoles: Role[]): Promise<boolean> {
    const userTenant = await this.prisma.userTenant.findUnique({
      where: {
        userId_tenantId: { userId, tenantId },
      },
    });
    if (!userTenant) {
      return false;
    }
    return requiredRoles.includes(userTenant.role);
  }

  async create(createPrescriptionDto: CreatePrescriptionDto, user: { id: string; tenantId: string }) {
    const { visitId, medications } = createPrescriptionDto;

    // Check authorization (DOCTOR or ADMIN)
    if (!(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.DOCTOR, Role.ADMIN]))) {
      return {
        success: false,
        message: 'You are not authorized to create prescriptions in this tenant',
        statusCode: 403,
        data: null,
      };
    }

    // Check visit exists and is in tenant
    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId, deletedAt: null },
      include: { patient: true },
    });
    if (!visit || visit.patient.tenantId !== user.tenantId) {
      return {
        success: false,
        message: 'Visit not found or not in your tenant',
        statusCode: 404,
        data: null,
      };
    }

    // Validate medications array
    if (!medications || medications.length === 0) {
      return {
        success: false,
        message: 'At least one medication is required',
        statusCode: 400,
        data: null,
      };
    }

    try {
      // Transform medications to plain JSON array
      const medicationsJson: Prisma.InputJsonValue = medications.map(({ drugName, dosage, duration, instructions }) => ({
        drugName,
        dosage,
        duration,
        instructions,
      }));

      const prescription = await this.prisma.prescription.create({
        data: {
          visitId,
          medications: medicationsJson,
        },
      });

      return {
        success: true,
        message: 'Prescription created successfully',
        statusCode: 201,
        data: prescription,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to create prescription',
        statusCode: 500,
        data: error.message,
      };
    }
  }

  async findAll(user: { id: string; tenantId: string }, patientId?: string, visitId?: string) {
    // Check authorization (DOCTOR, ADMIN, STAFF, NURSE)
    if (!(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.ADMIN, Role.DOCTOR, Role.STAFF, Role.NURSE]))) {
      return {
        success: false,
        message: 'You are not authorized to list prescriptions in this tenant',
        statusCode: 403,
        data: null,
      };
    }

    try {
      const where = visitId
        ? { visitId, deletedAt: null, visit: { patient: { tenantId: user.tenantId, deletedAt: null } } }
        : patientId
        ? { visit: { patientId, patient: { tenantId: user.tenantId, deletedAt: null }, deletedAt: null } }
        : { visit: { patient: { tenantId: user.tenantId, deletedAt: null }, deletedAt: null } };

      const prescriptions = await this.prisma.prescription.findMany({
        where,
        include: { visit: { include: { patient: true, doctor: true } } },
        orderBy: { createdAt: 'desc' },
      });

      return {
        success: true,
        message: 'Prescriptions retrieved successfully',
        statusCode: 200,
        data: prescriptions,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to retrieve prescriptions',
        statusCode: 500,
        data: error.message,
      };
    }
  }

  async findOne(id: string, user: { id: string; tenantId: string }) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id },
      include: { visit: { include: { patient: true, doctor: true } } },
    });

    if (!prescription || prescription.deletedAt) {
      return {
        success: false,
        message: 'Prescription not found or deleted',
        statusCode: 404,
        data: null,
      };
    }

    if (prescription.visit.patient.tenantId !== user.tenantId || !(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.ADMIN, Role.DOCTOR, Role.STAFF, Role.NURSE]))) {
      return {
        success: false,
        message: 'You are not authorized to view this prescription',
        statusCode: 403,
        data: null,
      };
    }

    return {
      success: true,
      message: 'Prescription retrieved successfully',
      statusCode: 200,
      data: prescription,
    };
  }

  async update(id: string, updatePrescriptionDto: UpdatePrescriptionDto, user: { id: string; tenantId: string }) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id },
      include: { visit: { include: { patient: true } } },
    });

    if (!prescription || prescription.deletedAt) {
      return {
        success: false,
        message: 'Prescription not found or deleted',
        statusCode: 404,
        data: null,
      };
    }

    if (prescription.visit.patient.tenantId !== user.tenantId || !(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.ADMIN, Role.DOCTOR]))) {
      return {
        success: false,
        message: 'You are not authorized to update this prescription',
        statusCode: 403,
        data: null,
      };
    }

    // Validate medications array if provided
    if (updatePrescriptionDto.medications && updatePrescriptionDto.medications.length === 0) {
      return {
        success: false,
        message: 'Medications array cannot be empty',
        statusCode: 400,
        data: null,
      };
    }

    try {
      // Transform medications to plain JSON array if provided
      const data: Prisma.PrescriptionUpdateInput = {};
      if (updatePrescriptionDto.medications) {
        data.medications = updatePrescriptionDto.medications.map(({ drugName, dosage, duration, instructions }) => ({
          drugName,
          dosage,
          duration,
          instructions,
        }));
      }

      const updatedPrescription = await this.prisma.prescription.update({
        where: { id },
        data,
      });

      return {
        success: true,
        message: 'Prescription updated successfully',
        statusCode: 200,
        data: updatedPrescription,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to update prescription',
        statusCode: 500,
        data: error.message,
      };
    }
  }

  async remove(id: string, user: { id: string; tenantId: string }) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id },
      include: { visit: { include: { patient: true } } },
    });

    if (!prescription || prescription.deletedAt) {
      return {
        success: false,
        message: 'Prescription not found or already deleted',
        statusCode: 404,
        data: null,
      };
    }

    if (prescription.visit.patient.tenantId !== user.tenantId || !(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.ADMIN]))) {
      return {
        success: false,
        message: 'You must be an admin in this tenant to delete prescriptions',
        statusCode: 403,
        data: null,
      };
    }

    try {
      const deletedPrescription = await this.prisma.prescription.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      return {
        success: true,
        message: 'Prescription deleted successfully',
        statusCode: 200,
        data: deletedPrescription,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to delete prescription',
        statusCode: 500,
        data: error.message,
      };
    }
  }
}