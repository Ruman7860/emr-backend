import { Test, TestingModule } from '@nestjs/testing';
import { QueueService } from './queue.service';
import { PrismaService } from 'prisma/prisma.service';
import { QueueGateway } from './queue.gateway';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ForbiddenException } from '@nestjs/common';
import { VisitStatus } from '@prisma/client';

describe('QueueService', () => {
    let service: QueueService;
    let prisma: PrismaService;
    let gateway: QueueGateway;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                QueueService,
                {
                    provide: PrismaService,
                    useValue: {
                        doctor: { findFirst: jest.fn() },
                        patient: { updateMany: jest.fn(), findUnique: jest.fn() },
                        visit: { update: jest.fn() },
                    },
                },
                {
                    provide: QueueGateway,
                    useValue: {
                        emitConsultationStart: jest.fn(),
                    },
                },
                {
                    provide: EventEmitter2,
                    useValue: { emit: jest.fn() },
                },
            ],
        }).compile();

        service = module.get<QueueService>(QueueService);
        prisma = module.get<PrismaService>(PrismaService);
        gateway = module.get<QueueGateway>(QueueGateway);
    });

    describe('startConsultation', () => {
        const user = { id: 'u1', role: 'DOCTOR', tenantId: 't1' };
        const patientId = 'p1';
        const visitId = 'v1';
        const doctorId = 'd1';

        it('should throw ForbiddenException if user is not a doctor', async () => {
            await expect(
                service.startConsultation({ ...user, role: 'STAFF' }, patientId, visitId),
            ).rejects.toThrow(ForbiddenException);
        });

        it('should successfully start consultation if patient is PAID_WAITING', async () => {
            (prisma.doctor.findFirst as jest.Mock).mockResolvedValue({ id: doctorId });
            // updateMany returns count: 1 (Success)
            (prisma.patient.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
            (prisma.visit.update as jest.Mock).mockResolvedValue({});

            const result = await service.startConsultation(user, patientId, visitId);

            expect(prisma.patient.updateMany).toHaveBeenCalledWith({
                where: {
                    id: patientId,
                    visitStatus: VisitStatus.PAID_WAITING,
                    tenantId: 't1',
                },
                data: {
                    visitStatus: VisitStatus.IN_CONSULTATION,
                    doctorId: doctorId,
                },
            });
            expect(gateway.emitConsultationStart).toHaveBeenCalledWith({
                tenantId: 't1',
                patientId,
                visitId,
                doctorId,
                status: VisitStatus.IN_CONSULTATION,
            });
            expect(result.success).toBe(true);
        });

        it('should throw ForbiddenException if another doctor beat us to it (race condition)', async () => {
            (prisma.doctor.findFirst as jest.Mock).mockResolvedValue({ id: doctorId });
            // updateMany returns count: 0 (Failed to lock)
            (prisma.patient.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

            // Simulate patient state after race condition (already IN_CONSULTATION with someone else)
            (prisma.patient.findUnique as jest.Mock).mockResolvedValue({
                visitStatus: VisitStatus.IN_CONSULTATION,
                doctorId: 'other-doc',
            });

            await expect(service.startConsultation(user, patientId, visitId)).rejects.toThrow(
                'Patient is already in consultation with another doctor',
            );
        });

        it('should throw ForbiddenException if patient is not in queue', async () => {
            (prisma.doctor.findFirst as jest.Mock).mockResolvedValue({ id: doctorId });
            (prisma.patient.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

            // Simulate patient state (e.g., COMPLETED or PENDING_PAYMENT)
            (prisma.patient.findUnique as jest.Mock).mockResolvedValue({
                visitStatus: VisitStatus.COMPLETED,
                doctorId: null,
            });

            await expect(service.startConsultation(user, patientId, visitId)).rejects.toThrow(
                'Patient is not in the waiting queue',
            );
        });
    });
});
