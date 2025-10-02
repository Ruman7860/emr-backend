import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { BillingType, PaymentMode, PaymentStatus, Role } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { CreateVisitDto } from './dto/create-visit.dto';
import { UpdateVisitDto } from './dto/update-visit.dto';

@Injectable()
export class VisitsService {
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

    async create(createVisitDto: CreateVisitDto, user: { id: string; tenantId: string }) {
        const { patientId, doctorId, notes, consultationFee } = createVisitDto;
        const tenantId = user.tenantId;

        // Check authorization
        if (!(await this.isAuthorizedInTenant(user.id, tenantId))) {
            return {
                success: false,
                message: 'You are not authorized to create visits in this tenant',
                statusCode: 403,
                data: null,
            };
        }

        // Check tenant exists
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

        // Check patient exists
        const patient = await this.prisma.patient.findUnique({
            where: { id: patientId, tenantId },
        });
        if (!patient) {
            return {
                success: false,
                message: 'Patient not found or deleted',
                statusCode: 404,
                data: null,
            };
        }

        // Check doctor exists
        const doctor = await this.prisma.doctor.findUnique({
            where: { id: doctorId, tenantId },
        });
        if (!doctor) {
            return {
                success: false,
                message: 'Doctor not found in this tenant',
                statusCode: 404,
                data: null,
            };
        }

        // Validate consultationFee if provided
        if (consultationFee !== undefined) {
            const fee = new Decimal(consultationFee);
            if (fee.lt(0)) {
                return {
                    success: false,
                    message: 'Consultation fee cannot be negative',
                    statusCode: 400,
                    data: null,
                };
            }
        }

        // Check 14 days rule for revisit
        const lastVisit = await this.prisma.visit.findFirst({
            where: { patientId },
            orderBy: { visitDate: 'desc' },
        });
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
        const needsNewFee = !lastVisit || new Date(lastVisit.visitDate) < fourteenDaysAgo;

        try {
            // Create Visit
            const visit = await this.prisma.visit.create({
                data: {
                    patientId,
                    doctorId,
                    staffId: user.id,
                    notes: notes || 'New visit',
                    consultationFee: consultationFee || 0, // Diagnosis included in registrationFee
                    feeValidUntil: needsNewFee ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) : lastVisit?.feeValidUntil,
                },
            });

            // Update Patient.noOfVisits
            await this.prisma.patient.update({
                where: { id: patientId },
                data: { noOfVisits: { increment: 1 } },
            });

            // Create Billing for registration fee if needed
            if (needsNewFee) {
                await this.prisma.billing.create({
                    data: {
                        patientId,
                        type: BillingType.REGISTRATION,
                        amount: patient.registrationFee,
                        status: PaymentStatus.UNPAID,
                    },
                });
            }

            return {
                success: true,
                message: 'Visit created successfully',
                statusCode: 201,
                data: visit,
            };
        } catch (error) {
            return {
                success: false,
                message: 'Failed to create visit',
                statusCode: 500,
                data: error.message,
            };
        }
    }

    async findAll(user: { id: string; tenantId: string }, patientId?: string) {
        if (!(await this.isAuthorizedInTenant(user.id, user.tenantId))) {
            return {
                success: false,
                message: 'You are not authorized to list visits in this tenant',
                statusCode: 403,
                data: null,
            };
        }

        try {
            const where = patientId
                ? { patientId, deletedAt: null, patient: { tenantId: user.tenantId, deletedAt: null } }
                : { patient: { tenantId: user.tenantId, deletedAt: null }, deletedAt: null };

            const visits = await this.prisma.visit.findMany({
                where,
                include: { patient: true, doctor: true, staff: true, prescriptions: true },
                orderBy: { visitDate: 'desc' },
            });
            return {
                success: true,
                message: 'Visits retrieved successfully',
                statusCode: 200,
                data: visits,
            };
        } catch (error) {
            return {
                success: false,
                message: 'Failed to retrieve visits',
                statusCode: 500,
                data: error.message,
            };
        }
    }

    async findOne(id: string, user: { id: string; tenantId: string }) {
        const visit = await this.prisma.visit.findUnique({
            where: { id },
            include: { patient: true, doctor: true, staff: true, prescriptions: true },
        });

        if (!visit || visit.deletedAt) {
            return {
                success: false,
                message: 'Visit not found or deleted',
                statusCode: 404,
                data: null,
            };
        }

        if (visit.patient.tenantId !== user.tenantId || !(await this.isAuthorizedInTenant(user.id, user.tenantId))) {
            return {
                success: false,
                message: 'You are not authorized to view this visit',
                statusCode: 403,
                data: null,
            };
        }

        return {
            success: true,
            message: 'Visit retrieved successfully',
            statusCode: 200,
            data: visit,
        };
    }

    async update(id: string, updateVisitDto: UpdateVisitDto, user: { id: string; tenantId: string }) {
        const visit = await this.prisma.visit.findUnique({
            where: { id },
            include: { patient: true },
        });

        if (!visit || visit.deletedAt) {
            return {
                success: false,
                message: 'Visit not found or deleted',
                statusCode: 404,
                data: null,
            };
        }

        if (visit.patient.tenantId !== user.tenantId || !(await this.isAuthorizedInTenant(user.id, user.tenantId))) {
            return {
                success: false,
                message: 'You are not authorized to update this visit',
                statusCode: 403,
                data: null,
            };
        }

        // Validate consultationFee if provided
        if (updateVisitDto.consultationFee !== undefined) {
            const fee = new Decimal(updateVisitDto.consultationFee);
            if (fee.lt(0)) {
                return {
                    success: false,
                    message: 'Consultation fee cannot be negative',
                    statusCode: 400,
                    data: null,
                };
            }
        }

        try {
            const updatedVisit = await this.prisma.visit.update({
                where: { id },
                data: updateVisitDto,
            });
            return {
                success: true,
                message: 'Visit updated successfully',
                statusCode: 200,
                data: updatedVisit,
            };
        } catch (error) {
            return {
                success: false,
                message: 'Failed to update visit',
                statusCode: 500,
                data: error.message,
            };
        }
    }

    async remove(id: string, user: { id: string; tenantId: string }) {
        const visit = await this.prisma.visit.findUnique({
            where: { id },
            include: { patient: true },
        });

        if (!visit || visit.deletedAt) {
            return {
                success: false,
                message: 'Visit not found or already deleted',
                statusCode: 404,
                data: null,
            };
        }

        if (visit.patient.tenantId !== user.tenantId || !(await this.isAdminInTenant(user.id, user.tenantId))) {
            return {
                success: false,
                message: 'You must be an admin in this tenant to delete visits',
                statusCode: 403,
                data: null,
            };
        }

        try {
            const deletedVisit = await this.prisma.visit.update({
                where: { id },
                data: { deletedAt: new Date() },
            });
            return {
                success: true,
                message: 'Visit deleted successfully',
                statusCode: 200,
                data: deletedVisit,
            };
        } catch (error) {
            return {
                success: false,
                message: 'Failed to delete visit',
                statusCode: 500,
                data: error.message,
            };
        }
    }
}