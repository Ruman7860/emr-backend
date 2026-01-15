import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { QueueGateway } from './queue.gateway';
import { VisitStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class QueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: QueueGateway,
    private eventEmitter: EventEmitter2,
  ) { }

  // ===============================
  // REAL-TIME EVENTS
  // ===============================

  notifyQueueAdd(data: {
    tenantId: string;
    doctorId: string;
    visitId: string;
    patientName: string;
    visitDate: Date;
  }) {
    console.log("notifyQueueAdd emitting");
    this.eventEmitter.emit('queue.add', data);
    // this.gateway.emitQueueAdd(data);
  }

  notifyQueueRemove(data: {
    tenantId: string;
    doctorId: string;
    visitId: string;
  }) {
    // this.gateway.emitQueueRemove(data);
    this.eventEmitter.emit('queue.remove', data);
  }

  // ===============================
  // REST: GET DOCTOR QUEUE
  // ===============================

  async getDoctorQueue(user: {
    id: string;
    role: string;
    tenantId: string;
  }) {
    if (user.role !== 'DOCTOR') {
      throw new ForbiddenException('Only doctors can access queue');
    }

    // 1️⃣ Resolve doctorId from userId
    const doctor = await this.prisma.doctor.findFirst({
      where: {
        userId: user.id,
        tenantId: user.tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!doctor) {
      throw new ForbiddenException('Doctor profile not found');
    }

    // 2️⃣ Fetch queue
    const visits = await this.prisma.visit.findMany({
      where: {
        doctorId: doctor.id, // ✅ FIXED
        deletedAt: null,
        patient: {
          tenantId: user.tenantId,
          deletedAt: null,
          visitStatus: {
            in: [VisitStatus.PAID_WAITING, VisitStatus.IN_CONSULTATION, VisitStatus.COMPLETED],
          },
        },
      },
      orderBy: {
        visitDate: 'asc',
      },
      include: {
        patient: {
          select: {
            id: true,
            fullName: true,
            age: true,
            gender: true,
            patientNumber: true,
            visitStatus: true,
            doctorId: true,
          },
        },
      },
    });

    return {
      success: true,
      message: 'Queue fetched successfully',
      statusCode: 200,
      data: visits.map((v) => ({
        visitId: v.id,
        visitDate: v.visitDate,
        chiefComplaint: v.chiefComplaint,
        consultationTime: v.consultationTime,
        patient: { doctorUserId: user.id, ...v.patient },
      })),
    };
  }
  // ===============================
  // ACTION: START CONSULTATION
  // ===============================

  async startConsultation(
    user: { id: string; role: string; tenantId: string },
    patientId: string,
    visitId: string,
  ) {
    if (user.role !== 'DOCTOR') {
      throw new ForbiddenException('Only doctors can start a consultation');
    }

    // 1️⃣ Resolve doctorId (ensure doctor profile exists)
    const doctor = await this.prisma.doctor.findFirst({
      where: {
        userId: user.id,
        tenantId: user.tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!doctor) {
      throw new ForbiddenException('Doctor profile not found');
    }

    // 2️⃣ ATOMIC UPDATE (Locking Mechanism)
    // We try to update the patient status ONLY if it is currently 'PAID_WAITING'.
    // If another doctor beats us, this update will affect 0 records.
    const updateResult = await this.prisma.patient.updateMany({
      where: {
        id: patientId,
        visitStatus: VisitStatus.PAID_WAITING, // The Lock 🔒
        tenantId: user.tenantId,
      },
      data: {
        visitStatus: VisitStatus.IN_CONSULTATION,
        doctorId: doctor.id, // Assign this doctor as the current owner
      },
    });

    if (updateResult.count === 0) {
      // Check why it failed for better error messaging
      const patient = await this.prisma.patient.findUnique({
        where: { id: patientId },
        select: { visitStatus: true, doctorId: true },
      });

      if (!patient) {
        throw new ForbiddenException('Patient not found');
      }

      if (patient.visitStatus === VisitStatus.IN_CONSULTATION) {
        if (patient.doctorId === doctor.id) {
          // Already started by this doctor - idempotent success?
          // For now, let's treat it as a conflict or just return success if we want idempotency.
          // But strict locking usually implies "you didn't start it just now".
          // Let's throw conflict to be safe and clear.
          throw new ForbiddenException('Consultation already started for this patient');
        }
        throw new ForbiddenException('Patient is already in consultation with another doctor');
      }

      throw new ForbiddenException('Patient is not in the waiting queue');
    }

    // 3️⃣ Update the Visit record as well (Audit trail)
    await this.prisma.visit.update({
      where: { id: visitId },
      data: {
        doctorId: doctor.id,
        // Optionally update visit status if you had a status on Visit model too, but schemas show it on Patient
      },
    });

    // 4️⃣ Emit Event
    const eventData = {
      tenantId: user.tenantId,
      patientId,
      visitId,
      doctorId: doctor.id,
      status: VisitStatus.IN_CONSULTATION,
    };

    // Emit to both Event Emitter (internal) and Gateway (external)
    this.gateway.emitConsultationStart(eventData);

    return {
      success: true,
      message: 'Consultation started successfully',
      data: {
        visitId,
        patientId,
        status: VisitStatus.IN_CONSULTATION,
      },
    };
  }

  // ===============================
  // ACTION: END CONSULTATION
  // ===============================

  async endConsultation(
    user: { id: string; role: string; tenantId: string },
    patientId: string,
    visitId: string,
    durationInSeconds: number,
  ) {
    if (user.role !== 'DOCTOR') {
      throw new ForbiddenException('Only doctors can end a consultation');
    }

    // 1️⃣ Resolve doctorId (ensure doctor profile exists)
    const doctor = await this.prisma.doctor.findFirst({
      where: {
        userId: user.id,
        tenantId: user.tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!doctor) {
      throw new ForbiddenException('Doctor profile not found');
    }

    // 2️⃣ Verify the patient is in consultation with this doctor
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { visitStatus: true, doctorId: true, tenantId: true },
    });

    if (!patient) {
      throw new ForbiddenException('Patient not found');
    }

    if (patient.tenantId !== user.tenantId) {
      throw new ForbiddenException('Unauthorized access to patient');
    }

    if (patient.visitStatus !== VisitStatus.IN_CONSULTATION) {
      throw new ForbiddenException('Patient is not in consultation');
    }

    if (patient.doctorId !== doctor.id) {
      throw new ForbiddenException('You are not the assigned doctor for this consultation');
    }

    // 3️⃣ Update patient status to COMPLETED
    await this.prisma.patient.update({
      where: { id: patientId },
      data: {
        visitStatus: VisitStatus.COMPLETED,
      },
    });

    // 4️⃣ Update visit with consultation duration (in seconds)
    await this.prisma.visit.update({
      where: { id: visitId },
      data: {
        consultationTime: durationInSeconds,
      },
    });

    // 5️⃣ Emit Event
    const eventData = {
      tenantId: user.tenantId,
      patientId,
      visitId,
      doctorId: doctor.id,
      status: VisitStatus.COMPLETED,
      consultationTime: durationInSeconds,
    };

    this.gateway.emitConsultationEnd(eventData);

    return {
      success: true,
      message: 'Consultation ended successfully',
      data: {
        visitId,
        patientId,
        status: VisitStatus.COMPLETED,
        consultationTime: durationInSeconds,
      },
    };
  }
}
