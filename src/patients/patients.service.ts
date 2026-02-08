import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { BillingType, PaymentStatus, Role, PatientStatus, PaymentMode } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { QueueService } from 'src/queue/queue.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

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
  constructor(
    private prisma: PrismaService,
    private queueService: QueueService,
    private eventEmitter: EventEmitter2,
  ) { }

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
        where: { id: doctorId, tenantId, deletedAt: null },
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

    try {
      // Step 1: Create Patient FIRST (todayVisitId = null initially)
      const patient = await this.prisma.patient.create({
        data: {
          fullName,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
          age,
          gender,
          address,
          phone,
          chiefComplaint,
          patientNumber,
          status: 'ACTIVE',
          registeredById: user.id,
          doctorId: doctorId || null,
          tenantId,
          deletedAt: null,

          // NEW: Start with pending status, no visit linked yet
          visitStatus: 'PENDING_PAYMENT',
          todayVisitId: null, // ← Will update after creating visit
          noOfVisits: 1,
        },
      });

      // Step 2: Now create today's Visit (we have patient.id)
      const todayVisit = await this.prisma.visit.create({
        data: {
          patientId: patient.id, // ← Valid ObjectId now
          doctorId: doctorId || null,
          staffId: user.id,
          chiefComplaint,
          notes: 'Initial registration visit',
          visitStatus: 'PENDING_PAYMENT',
          visitFee: registrationFee,
          isFirstVisit: true,
          deletedAt: null,
        },
      });

      // Step 3: Update Patient to point to today's visit
      await this.prisma.patient.update({
        where: { id: patient.id },
        data: {
          todayVisitId: todayVisit.id,
          // visitStatus remains PENDING_PAYMENT
        },
      });

      // Step 4: Create Billing (UNPAID)
      await this.prisma.billing.create({
        data: {
          patientId: patient.id,
          visitId: todayVisit.id,
          type: 'NEW_REGISTRATION',
          amount: registrationFee,
          status: 'UNPAID',
          paymentMode: null,
          deletedAt: null,
        },
      });

      return {
        success: true,
        message: 'Patient registered successfully',
        statusCode: 201,
        data: patient,
      };
    } catch (error) {
      console.error('Error creating patient:', error);
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
          include: { doctor: true, visits: { where: { deletedAt: null }, orderBy: { visitDate: 'desc' } }, Billing: { where: { deletedAt: null } }, },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.patient.count({ where }),
      ]);

      // Compute lastCompletedVisitDate for each patient
      const patientsWithLastVisit = patients.map((patient: any) => {
        const completedVisit = patient.visits?.find((v: any) => v.visitStatus === 'COMPLETED');
        console.log("completedVisit",completedVisit)
        return {
          ...patient,
          lastCompletedVisitDate: completedVisit?.visitDate || null,
        };
      });

      console.log("patientsWithLastVisit",patientsWithLastVisit)

      return {
        success: true,
        message: 'Patients retrieved successfully',
        statusCode: 200,
        data: {
          patients: patientsWithLastVisit,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error: any) {
      console.log("Error", error.message)
      return {
        success: false,
        message: 'Failed to retrieve patients',
        statusCode: 500,
        data: error.message || error,
      };
    }
  }

  async findOne(
    patientId: string,
    user: { id: string; tenantId: string }
  ) {
    // 1️⃣ Authorization FIRST (cheap check)
    const isAuthorized = await this.isAuthorizedInTenant(
      user.id,
      user.tenantId
    );

    if (!isAuthorized) {
      return {
        success: false,
        message: 'You are not authorized to view this patient',
        statusCode: 403,
        data: null,
      };
    }

    // 2️⃣ Tenant-safe + soft-delete-safe query
    const patient = await this.prisma.patient.findFirst({
      where: {
        id: patientId,
        tenantId: user.tenantId,
        deletedAt: null,
      },
      include: {
        doctor: {
          select: {
            id: true,
            specialty: true,
            user: {
              select: {
                name: true,
              },
            },
          },
        },

        todayVisit: {
          include: {
            doctor: {
              select: {
                user: { select: { name: true } },
              },
            },
            billings: {
              where: { deletedAt: null },
              orderBy: { date: 'desc' },
            },
          },
        },

        visits: {
          where: {
            deletedAt: null,
          },
          orderBy: {
            visitDate: 'desc',
          },
          include: {
            doctor: {
              select: {
                user: { select: { name: true } },
              },
            },
            Prescription: {
              where: { deletedAt: null },
              include: {
                prescriptionDocuments: true
              }
            },
            billings: {
              where: { deletedAt: null },
              orderBy: { date: 'desc' },
            },
          },
        },

        Operation: {
          where: { deletedAt: null },
        },

        LabTest: {
          where: { deletedAt: null },
        },
      },
    });

    // 3️⃣ Not found
    if (!patient) {
      return {
        success: false,
        message: 'Patient not found',
        statusCode: 404,
        data: null,
      };
    }

    const payments = patient.visits.flatMap(
      (visit) => visit.billings || []
    );

    // 4️⃣ Shape response for Page-2 UI
    return {
      success: true,
      message: 'Patient retrieved successfully',
      statusCode: 200,
      data: {
        header: {
          id: patient.id,
          fullName: patient.fullName,
          age: patient.age,
          gender: patient.gender,
          dateOfBirth: patient.dateOfBirth,
          phone: patient.phone,
          patientNumber: patient.patientNumber,
          address: patient.address,
          status: patient.status,
          visitStatus: patient.visitStatus,
          createdAt: patient.createdAt,
          updatedAt: patient.updatedAt,
        },

        overview: {
          chiefComplaint: patient.chiefComplaint,
          todayVisit: patient.todayVisit,
        },

        visits: patient.visits,

        payments,

        prescriptions: patient.visits.flatMap(
          (v) => v.Prescription || []
        ),

        operations: patient.Operation,
        labTests: patient.LabTest,
      },
    };
  }


  // async getTimeline(id: string, user: { id: string; tenantId: string }) {
  //   const patient = await this.prisma.patient.findUnique({
  //     where: { id },
  //     include: {
  //       visits: {
  //         where: { deletedAt: null },
  //         include: {
  //           Prescription: { where: { deletedAt: null } },
  //         },
  //         orderBy: { visitDate: 'desc' },
  //       },
  //       Operation: {
  //         where: { deletedAt: null },
  //         include: { surgeon: { include: { user: true } } },
  //         orderBy: { date: 'desc' },
  //       },
  //       doctor: { where: { deletedAt: null }, include: { user: true } },
  //       Billing: { where: { deletedAt: null }, orderBy: { date: 'desc' } },
  //       LabTest: { where: { deletedAt: null }, orderBy: { date: 'desc' } },
  //     },
  //   });

  //   if (!patient || patient.deletedAt) {
  //     return {
  //       success: false,
  //       message: 'Patient not found or deleted',
  //       statusCode: 404,
  //       data: null,
  //     };
  //   }

  //   if (patient.tenantId !== user.tenantId || !(await this.isAuthorizedInTenant(user.id, user.tenantId))) {
  //     return {
  //       success: false,
  //       message: 'You are not authorized to view this patient\'s timeline',
  //       statusCode: 403,
  //       data: null,
  //     };
  //   }

  //   try {
  //     const timeline: TimelineEvent[] = [];

  //     // Add patient registration
  //     timeline.push({
  //       type: 'REGISTRATION',
  //       date: patient.createdAt,
  //       details: {
  //         fullName: patient.fullName,
  //         patientNumber: patient.patientNumber,
  //       },
  //     });

  //     // Add visits
  //     patient.visits.forEach(visit => {
  //       const prescriptions: Medication[] = visit.Prescription
  //         .map(p => p.medications as unknown)
  //         .filter((med): med is Medication[] => Array.isArray(med))
  //         .flat()
  //         .map(med => ({
  //           drugName: String(med.drugName ?? ''),
  //           dosage: String(med.dosage ?? ''),
  //           duration: med.duration ? String(med.duration) : undefined,
  //           instructions: med.instructions ? String(med.instructions) : undefined,
  //         }));

  //       timeline.push({
  //         type: 'VISIT',
  //         date: visit.visitDate,
  //         details: {
  //           // Use patient.doctor for name if needed
  //           doctor: patient.doctor
  //             ? { id: patient.doctor.id, name: patient.doctor.user?.name ?? 'Unknown' }
  //             : visit.doctorId
  //               ? { id: visit.doctorId, name: 'Unknown' }
  //               : null,
  //           staff: visit.staffId
  //             ? { id: visit.staffId, name: 'Unknown' } // You can fetch staff name separately if needed
  //             : null,
  //           notes: visit.notes,
  //           consultationFee: visit.consultationFee,
  //           prescriptions,
  //         },
  //       });
  //     });

  //     // Add operations
  //     patient.Operation.forEach(operation => {
  //       timeline.push({
  //         type: 'OPERATION',
  //         date: operation.date,
  //         details: {
  //           name: operation.name,
  //           surgeon: operation.surgeon ? { id: operation.surgeon.id, name: operation.surgeon.user.name ?? 'Unknown' } : null,
  //           outcome: operation.outcome,
  //           fee: operation.fee,
  //         },
  //       });
  //     });

  //     // Add billing
  //     patient.Billing.forEach(bill => {
  //       timeline.push({
  //         type: 'BILLING',
  //         date: bill.date,
  //         details: {
  //           type: bill.type,
  //           amount: bill.amount,
  //           status: bill.status,
  //           paymentMode: bill.paymentMode,
  //         },
  //       });
  //     });

  //     // Add lab tests
  //     patient.LabTest.forEach(labTest => {
  //       timeline.push({
  //         type: 'LAB_TEST',
  //         date: labTest.date,
  //         details: {
  //           name: labTest.name,
  //           results: labTest.results,
  //           fee: labTest.fee,
  //         },
  //       });
  //     });

  //     // Sort timeline by date (descending)
  //     timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  //     return {
  //       success: true,
  //       message: 'Patient timeline retrieved successfully',
  //       statusCode: 200,
  //       data: {
  //         patient: {
  //           id: patient.id,
  //           fullName: patient.fullName,
  //           patientNumber: patient.patientNumber,
  //         },
  //         timeline,
  //       },
  //     };
  //   } catch (error) {
  //     return {
  //       success: false,
  //       message: 'Failed to retrieve patient timeline',
  //       statusCode: 500,
  //       data: error.message,
  //     };
  //   }
  // }

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

  async collectPayment(
    patientId: string,
    payload: {
      visitId: string;
      billingType: BillingType;
      amount: number;
      paymentMode: PaymentMode;
      markPaid: boolean;
    },
    user: { id: string; tenantId: string }
  ) {
    const { visitId, billingType, amount, paymentMode, markPaid } = payload;

    // 1️⃣ Validate patient
    const patient = await this.prisma.patient.findFirst({
      where: {
        id: patientId,
        tenantId: user.tenantId,
        deletedAt: null,
      },
    });

    if (!patient) {
      return {
        success: false,
        message: 'Patient not found',
        statusCode: 404,
      };
    }

    // 2️⃣ Validate visit
    const visit = await this.prisma.visit.findFirst({
      where: {
        id: visitId,
        patientId,
        deletedAt: null,
      },
    });

    if (!visit) {
      return {
        success: false,
        message: 'Visit not found',
        statusCode: 404,
      };
    }

    // 3️⃣ Validate billing entry
    const billing = await this.prisma.billing.findFirst({
      where: {
        visitId,
        patientId,
        type: billingType,
        deletedAt: null,
      },
    });

    if (!billing) {
      return {
        success: false,
        message: `Billing entry not found for type ${billingType}`,
        statusCode: 404,
      };
    }

    // 4️⃣ Prevent double payment
    if (billing.status === 'PAID') {
      return {
        success: false,
        message: 'This billing item is already paid',
        statusCode: 400,
      };
    }

    // 5️⃣ Transaction (VERY IMPORTANT)
    await this.prisma.$transaction(async (tx) => {
      // 5.1 Update billing
      await tx.billing.update({
        where: { id: billing.id },
        data: {
          amount,
          paymentMode,
          status: markPaid ? 'PAID' : 'PENDING',
        },
      });

      // 5.2 Update patient visit status
      await tx.patient.update({
        where: { id: patientId },
        data: {
          visitStatus: markPaid ? 'PAID_WAITING' : 'PENDING_PAYMENT',
        },
      });

      // 5.3 Update Visit status (NEW)
      await tx.visit.update({
        where: { id: visitId },
        data: {
          visitStatus: markPaid ? 'PAID_WAITING' : 'PENDING_PAYMENT',
        },
      });
    });

    if (markPaid) {
      // this.queueService.notifyQueueAdd({
      //   tenantId: user.tenantId,
      //   doctorId: visit.doctorId!, 
      //   visitId: visit.id,
      //   patientName: patient.fullName,
      //   visitDate: visit.visitDate,
      // });
      this.eventEmitter.emit('queue.add', {
        tenantId: user.tenantId,
        doctorId: visit.doctorId!,
        visitId: visit.id,
        patientName: patient.fullName,
        visitDate: visit.visitDate,
      });
    }

    return {
      success: true,
      message: 'Payment collected successfully',
      statusCode: 200,
    };
  }

  async createRepeatVisit(
    patientId: string,
    dto: { chiefComplaint?: string; registrationFee?: number; doctorId?: string },
    user: { id: string; tenantId: string }
  ) {
    // 1️⃣ Authorization
    if (!(await this.isAuthorizedInTenant(user.id, user.tenantId))) {
      return {
        success: false,
        message: 'You are not authorized to create visits in this tenant',
        statusCode: 403,
        data: null,
      };
    }

    // 2️⃣ Validate patient exists and belongs to tenant
    const patient = await this.prisma.patient.findFirst({
      where: {
        id: patientId,
        tenantId: user.tenantId,
        deletedAt: null,
      },
    });

    if (!patient) {
      return {
        success: false,
        message: 'Patient not found',
        statusCode: 404,
        data: null,
      };
    }

    // 3️⃣ Validate patient's current visit is COMPLETED
    if (patient.visitStatus !== 'COMPLETED') {
      return {
        success: false,
        message: `Cannot create repeat visit. Current visit status is ${patient.visitStatus}, expected COMPLETED`,
        statusCode: 400,
        data: null,
      };
    }

    // 4️⃣ Find last completed visit date
    const lastVisit = await this.prisma.visit.findFirst({
      where: {
        patientId: patient.id,
        visitStatus: 'COMPLETED',
        deletedAt: null,
      },
      orderBy: { visitDate: 'desc' },
    });

    // Calculate if within 21 days
    const now = new Date();
    const daysSinceLastVisit = lastVisit
      ? Math.floor((now.getTime() - new Date(lastVisit.visitDate).getTime()) / (1000 * 60 * 60 * 24))
      : 999; // If no last visit, treat as after 21 days
    const isWithin21Days = daysSinceLastVisit <= 21;

    // 5️⃣ Validate fee for visits after 21 days
    if (!isWithin21Days && (!dto.registrationFee || dto.registrationFee <= 0)) {
      return {
        success: false,
        message: 'Visit fee is required for revisits after 21 days',
        statusCode: 400,
        data: null,
      };
    }

    // 6️⃣ Validate doctor if provided
    const doctorId = dto.doctorId || patient.doctorId || null;
    if (dto.doctorId) {
      const doctor = await this.prisma.doctor.findUnique({
        where: { id: dto.doctorId, tenantId: user.tenantId, deletedAt: null },
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

    try {
      // 7️⃣ Create new Visit
      const newVisit = await this.prisma.visit.create({
        data: {
          patientId: patient.id,
          doctorId: doctorId,
          staffId: user.id,
          chiefComplaint: dto.chiefComplaint || patient.chiefComplaint || null,
          notes: isWithin21Days ? 'Free follow-up visit (within 21 days)' : 'Repeat visit',
          visitStatus: isWithin21Days ? 'PAID_WAITING' : 'PENDING_PAYMENT',
          visitFee: isWithin21Days ? null : (dto.registrationFee as number),
          isFirstVisit: false,
          within21: isWithin21Days,
          deletedAt: null,
        },
      });

      // 8️⃣ Update Patient to point to new visit
      const updatedPatient = await this.prisma.patient.update({
        where: { id: patient.id },
        data: {
          todayVisitId: newVisit.id,
          visitStatus: isWithin21Days ? 'PAID_WAITING' : 'PENDING_PAYMENT',
          noOfVisits: { increment: 1 },
          // Update doctorId if a new one was provided
          ...(dto.doctorId && { doctorId: dto.doctorId }),
          // Update chief complaint if provided
          ...(dto.chiefComplaint && { chiefComplaint: dto.chiefComplaint }),
        },
      });

      // 9️⃣ Case 1: Within 21 days - emit queue event (no billing)
      if (isWithin21Days) {
        // Emit queue event for immediate assignment
        this.eventEmitter.emit('queue.add', {
          tenantId: user.tenantId,
          doctorId: doctorId!,
          visitId: newVisit.id,
          patientName: patient.fullName,
          visitDate: newVisit.visitDate,
        });

        return {
          success: true,
          message: 'Free follow-up visit created (within 21 days)',
          statusCode: 201,
          data: {
            ...updatedPatient,
            within21Days: true,
            requiresPayment: false,
          },
        };
      }

      // 🔟 Case 2: After 21 days - create billing entry
      await this.prisma.billing.create({
        data: {
          patientId: patient.id,
          visitId: newVisit.id,
          type: 'CONSULTATION',
          amount: dto.registrationFee!,
          status: 'UNPAID',
          paymentMode: null,
          deletedAt: null,
        },
      });

      return {
        success: true,
        message: 'Repeat visit created successfully',
        statusCode: 201,
        data: {
          ...updatedPatient,
          within21Days: false,
          requiresPayment: true,
        },
      };
    } catch (error) {
      console.error('Error creating repeat visit:', error);
      return {
        success: false,
        message: 'Failed to create repeat visit',
        statusCode: 500,
        data: error.message,
      };
    }
  }


}