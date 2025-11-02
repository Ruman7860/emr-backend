import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { BillingType, PaymentStatus, Role, PatientStatus } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

// Define interfaces for timeline events
interface Medication {
  drugName: string;
  dosage: string;
  duration?: string;
  instructions?: string;
}

interface RegistrationEvent {
  type: 'REGISTRATION';
  date: Date;
  details: {
    fullName: string;
    patientNumber: string;
    registrationFee: number;
  };
}

interface VisitEvent {
  type: 'VISIT';
  date: Date;
  details: {
    doctor: { id: string; name: string } | null;
    staff: { id: string; name: string } | null;
    notes: string | null;
    consultationFee: number | null;
    prescriptions: Medication[];
  };
}

interface OperationEvent {
  type: 'OPERATION';
  date: Date;
  details: {
    name: string;
    surgeon: { id: string; name: string } | null;
    outcome: string | null;
    fee: number;
  };
}

interface BillingEvent {
  type: 'BILLING';
  date: Date;
  details: {
    type: BillingType;
    amount: number;
    status: PaymentStatus;
    paymentMode: string | null;
  };
}

interface LabTestEvent {
  type: 'LAB_TEST';
  date: Date;
  details: {
    name: string;
    results: string | null;
    fee: number;
  };
}

type TimelineEvent = RegistrationEvent | VisitEvent | OperationEvent | BillingEvent | LabTestEvent;

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
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { code: true },
    });

    if (!tenant?.code) {
      throw new Error('Tenant not found while generating patient number');
    }

    const year = new Date().getFullYear();
    const count = await this.prisma.patient.count({
      where: { tenantId },
    });

    return `${tenant.code}-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  async create(createPatientDto: CreatePatientDto, user: { id: string; tenantId: string }) {
    const {
      fullName,
      dateOfBirth,
      age,
      gender,
      address,
      phone,
      chiefComplaint,
      registrationFee,
      doctorId,
    } = createPatientDto;
    const tenantId = user.tenantId;
    console.log(createPatientDto)

    // Authorization
    if (!(await this.isAuthorizedInTenant(user.id, tenantId))) {
      return {
        success: false,
        message: 'You are not authorized to create patients in this tenant',
        statusCode: 403,
        data: null,
      };
    }

    // Tenant check
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

    // Validate fee
    if (registrationFee <= 0) {
      return {
        success: false,
        message: 'Registration fee must be positive',
        statusCode: 400,
        data: null,
      };
    }

    // Validate doctor if provided
    if (doctorId) {
      const doctor = await this.prisma.doctor.findUnique({
        where: { id: doctorId, tenantId, deletedAt:null },
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

    // Validate phone
    if (phone && !/^\d{10,15}$/.test(phone)) {
      return {
        success: false,
        message: 'Invalid phone format',
        statusCode: 400,
        data: null,
      };
    }

    // Generate patient number
    const patientNumber = await this.generatePatientNumber(tenantId);

    console.log("creating patient")
    try {
      const patient = await this.prisma.patient.create({
        data: {
          fullName,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
          age,
          gender,
          address,
          phone,
          chiefComplaint,
          registrationFee,
          patientNumber,
          status: 'ACTIVE',
          registeredById: user.id,
          doctorId: doctorId || null,
          tenantId,
          deletedAt:null
        },
      });

      // Create billing
      await this.prisma.billing.create({
        data: {
          patientId: patient.id,
          type: 'REGISTRATION',
          amount: registrationFee,
          status: 'UNPAID',
          deletedAt:null
        },
      });

      // Create first visit
      await this.prisma.visit.create({
        data: {
          patientId: patient.id,
          doctorId: doctorId || null,
          staffId: user.id,
          chiefComplaint,
          notes: 'Initial registration visit',
          consultationFee: 0,
          isFirstVisit: true,
        },
      });

      await this.prisma.patient.update({
        where: { id: patient.id },
        data: { noOfVisits: 1 },
      });

      return {
        success: true,
        message: 'Patient registered successfully',
        statusCode: 201,
        data: patient,
      };
    } catch (error) {
      console.log("error",error)
      return {
        success: false,
        message: 'Failed to create patient',
        statusCode: 500,
        data: error.message,
      };
    }
  }

  async findAll(
    user: { id: string; tenantId: string },
    query: { page?: number; limit?: number; search?: string; deleted?: string },
  ) {
    if (!(await this.isAuthorizedInTenant(user.id, user.tenantId))) {
      return {
        success: false,
        message: 'You are not authorized to list patients in this tenant',
        statusCode: 403,
        data: null,
      };
    }

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, Math.min(query.limit ?? 10, 100));
    const skip = (page - 1) * limit;

    try {
      const where: any = { tenantId: user.tenantId };

      if (query.deleted === 'true') {
        where.deletedAt = { not: null };
      } else {
        where.deletedAt = null; // default: active patients
      }

      // Search filter
      if (query.search) {
        where.OR = [
          { fullName: { contains: query.search, mode: 'insensitive' } },
          { patientNumber: { contains: query.search, mode: 'insensitive' } },
        ];
      }

      const [patients, total] = await this.prisma.$transaction([
        this.prisma.patient.findMany({
          where,
          include: { doctor: true, visits: { where: { deletedAt: null } }, Billing: { where: { deletedAt: null } }, },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.patient.count({ where }),
      ]);

      return {
        success: true,
        message: 'Patients retrieved successfully',
        statusCode: 200,
        data: {
          patients,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        message: 'Failed to retrieve patients',
        statusCode: 500,
        data: error.message || error,
      };
    }
  }

  async findOne(id: string, user: { id: string; tenantId: string }) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: { doctor: true, visits: true, Billing: true, LabTest: true, Operation: true },
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

  async getTimeline(id: string, user: { id: string; tenantId: string }) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: {
        visits: {
          where: { deletedAt: null },
          include: {
            Prescription: { where: { deletedAt: null } },
          },
          orderBy: { visitDate: 'desc' },
        },
        Operation: {
          where: { deletedAt: null },
          include: { surgeon: { include: { user: true } } },
          orderBy: { date: 'desc' },
        },
        doctor: { where: { deletedAt: null }, include: { user: true } },
        Billing: { where: { deletedAt: null }, orderBy: { date: 'desc' } },
        LabTest: { where: { deletedAt: null }, orderBy: { date: 'desc' } },
      },
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
        message: 'You are not authorized to view this patient\'s timeline',
        statusCode: 403,
        data: null,
      };
    }

    try {
      const timeline: TimelineEvent[] = [];

      // Add patient registration
      timeline.push({
        type: 'REGISTRATION',
        date: patient.createdAt,
        details: {
          fullName: patient.fullName,
          patientNumber: patient.patientNumber,
          registrationFee: patient.registrationFee,
        },
      });

      // Add visits
      patient.visits.forEach(visit => {
        const prescriptions: Medication[] = visit.Prescription
          .map(p => p.medications as unknown)
          .filter((med): med is Medication[] => Array.isArray(med))
          .flat()
          .map(med => ({
            drugName: String(med.drugName ?? ''),
            dosage: String(med.dosage ?? ''),
            duration: med.duration ? String(med.duration) : undefined,
            instructions: med.instructions ? String(med.instructions) : undefined,
          }));

        timeline.push({
          type: 'VISIT',
          date: visit.visitDate,
          details: {
            // Use patient.doctor for name if needed
            doctor: patient.doctor
              ? { id: patient.doctor.id, name: patient.doctor.user?.name ?? 'Unknown' }
              : visit.doctorId
                ? { id: visit.doctorId, name: 'Unknown' }
                : null,
            staff: visit.staffId
              ? { id: visit.staffId, name: 'Unknown' } // You can fetch staff name separately if needed
              : null,
            notes: visit.notes,
            consultationFee: visit.consultationFee,
            prescriptions,
          },
        });
      });

      // Add operations
      patient.Operation.forEach(operation => {
        timeline.push({
          type: 'OPERATION',
          date: operation.date,
          details: {
            name: operation.name,
            surgeon: operation.surgeon ? { id: operation.surgeon.id, name: operation.surgeon.user.name ?? 'Unknown' } : null,
            outcome: operation.outcome,
            fee: operation.fee,
          },
        });
      });

      // Add billing
      patient.Billing.forEach(bill => {
        timeline.push({
          type: 'BILLING',
          date: bill.date,
          details: {
            type: bill.type,
            amount: bill.amount,
            status: bill.status,
            paymentMode: bill.paymentMode,
          },
        });
      });

      // Add lab tests
      patient.LabTest.forEach(labTest => {
        timeline.push({
          type: 'LAB_TEST',
          date: labTest.date,
          details: {
            name: labTest.name,
            results: labTest.results,
            fee: labTest.fee,
          },
        });
      });

      // Sort timeline by date (descending)
      timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return {
        success: true,
        message: 'Patient timeline retrieved successfully',
        statusCode: 200,
        data: {
          patient: {
            id: patient.id,
            fullName: patient.fullName,
            patientNumber: patient.patientNumber,
          },
          timeline,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to retrieve patient timeline',
        statusCode: 500,
        data: error.message,
      };
    }
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

  async restore(id: string, user: { id: string; tenantId: string }) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
    });

    if (!patient) {
      return {
        success: false,
        message: 'Patient not found',
        statusCode: 404,
        data: null,
      };
    }

    if (!patient.deletedAt) {
      return {
        success: false,
        message: 'Patient is not deleted',
        statusCode: 400,
        data: null,
      };
    }

    if (patient.tenantId !== user.tenantId || !(await this.isAdminInTenant(user.id, user.tenantId))) {
      return {
        success: false,
        message: 'You must be an admin in this tenant to restore patients',
        statusCode: 403,
        data: null,
      };
    }

    try {
      const restoredPatient = await this.prisma.patient.update({
        where: { id },
        data: { deletedAt: null, status: 'ACTIVE' },
      });
      return {
        success: true,
        message: 'Patient restored successfully',
        statusCode: 200,
        data: restoredPatient,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to restore patient',
        statusCode: 500,
        data: error.message,
      };
    }
  }
}