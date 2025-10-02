import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { BillingType, PaymentStatus, Role } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { CreateOperationDto } from './dto/create-operation.dto';
import { UpdateOperationDto } from './dto/update-operation.dto';

@Injectable()
export class OperationsService {
    constructor(private prisma: PrismaService) { }

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

    async create(createOperationDto: CreateOperationDto, user: { id: string; tenantId: string }) {
        const { patientId, name, date, surgeonId, fee, outcome } = createOperationDto;

        // Check authorization (DOCTOR or ADMIN)
        if (!(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.DOCTOR, Role.ADMIN]))) {
            return {
                success: false,
                message: 'You are not authorized to create operations in this tenant',
                statusCode: 403,
                data: null,
            };
        }

        // Check patient exists
        const patient = await this.prisma.patient.findUnique({
            where: { id: patientId, tenantId: user.tenantId, deletedAt: null },
        });
        if (!patient) {
            return {
                success: false,
                message: 'Patient not found or not in your tenant',
                statusCode: 404,
                data: null,
            };
        }

        // Check surgeon exists
        const surgeon = await this.prisma.doctor.findUnique({
            where: { id: surgeonId, tenantId: user.tenantId, deletedAt: null },
        });
        if (!surgeon) {
            return {
                success: false,
                message: 'Surgeon not found in this tenant',
                statusCode: 404,
                data: null,
            };
        }

        // Validate fee
        const operationFee = new Decimal(fee);
        if (operationFee.lte(0)) {
            return {
                success: false,
                message: 'Operation fee must be positive',
                statusCode: 400,
                data: null,
            };
        }

        try {
            // Create Operation
            const operation = await this.prisma.operation.create({
                data: {
                    patientId,
                    name,
                    date: new Date(date),
                    surgeonId,
                    fee,
                    outcome,
                },
            });

            // Create Billing for operation
            await this.prisma.billing.create({
                data: {
                    patientId,
                    type: BillingType.OPERATION,
                    amount: fee,
                    status: PaymentStatus.UNPAID,
                },
            });

            // Optionally update related Visit notes (e.g., link to current visit)
            const latestVisit = await this.prisma.visit.findFirst({
                where: { patientId, deletedAt: null },
                orderBy: { visitDate: 'desc' },
            });
            if (latestVisit) {
                await this.prisma.visit.update({
                    where: { id: latestVisit.id },
                    data: { notes: `${latestVisit.notes || ''}\nOperation scheduled: ${name}` },
                });
            }

            return {
                success: true,
                message: 'Operation created successfully',
                statusCode: 201,
                data: operation,
            };
        } catch (error) {
            return {
                success: false,
                message: 'Failed to create operation',
                statusCode: 500,
                data: error.message,
            };
        }
    }

    async findAll(user: { id: string; tenantId: string }, patientId?: string) {
        // Check authorization (DOCTOR, ADMIN, STAFF, NURSE)
        if (!(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.ADMIN, Role.DOCTOR, Role.STAFF, Role.NURSE]))) {
            return {
                success: false,
                message: 'You are not authorized to list operations in this tenant',
                statusCode: 403,
                data: null,
            };
        }

        try {
            const where = patientId
                ? { patientId, deletedAt: null, patient: { tenantId: user.tenantId, deletedAt: null } }
                : { patient: { tenantId: user.tenantId, deletedAt: null }, deletedAt: null };

            const operations = await this.prisma.operation.findMany({
                where,
                include: { patient: true, surgeon: true },
                orderBy: { date: 'desc' },
            });

            return {
                success: true,
                message: 'Operations retrieved successfully',
                statusCode: 200,
                data: operations,
            };
        } catch (error) {
            return {
                success: false,
                message: 'Failed to retrieve operations',
                statusCode: 500,
                data: error.message,
            };
        }
    }

    async findOne(id: string, user: { id: string; tenantId: string }) {
        const operation = await this.prisma.operation.findUnique({
            where: { id },
            include: { patient: true, surgeon: true },
        });

        if (!operation || operation.deletedAt) {
            return {
                success: false,
                message: 'Operation not found or deleted',
                statusCode: 404,
                data: null,
            };
        }

        if (operation.patient.tenantId !== user.tenantId || !(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.ADMIN, Role.DOCTOR, Role.STAFF, Role.NURSE]))) {
            return {
                success: false,
                message: 'You are not authorized to view this operation',
                statusCode: 403,
                data: null,
            };
        }

        return {
            success: true,
            message: 'Operation retrieved successfully',
            statusCode: 200,
            data: operation,
        };
    }

    async update(id: string, updateOperationDto: UpdateOperationDto, user: { id: string; tenantId: string }) {
        const operation = await this.prisma.operation.findUnique({
            where: { id },
            include: { patient: true },
        });

        if (!operation || operation.deletedAt) {
            return {
                success: false,
                message: 'Operation not found or deleted',
                statusCode: 404,
                data: null,
            };
        }

        if (operation.patient.tenantId !== user.tenantId || !(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.ADMIN, Role.DOCTOR]))) {
            return {
                success: false,
                message: 'You are not authorized to update this operation',
                statusCode: 403,
                data: null,
            };
        }

        // Validate fee if provided
        if (updateOperationDto.fee !== undefined) {
            const fee = new Decimal(updateOperationDto.fee);
            if (fee.lte(0)) {
                return {
                    success: false,
                    message: 'Operation fee must be positive',
                    statusCode: 400,
                    data: null,
                };
            }
        }

        try {
            const updatedOperation = await this.prisma.operation.update({
                where: { id },
                data: {
                    ...updateOperationDto,
                    date: updateOperationDto.date ? new Date(updateOperationDto.date) : undefined,
                },
            });

            // Update Billing if fee changes
            if (updateOperationDto.fee !== undefined) {
                const billing = await this.prisma.billing.findFirst({
                    where: { patientId: operation.patientId, type: BillingType.OPERATION, deletedAt: null },
                    orderBy: { createdAt: 'desc' },
                });
                if (billing) {
                    await this.prisma.billing.update({
                        where: { id: billing.id },
                        data: { amount: updateOperationDto.fee },
                    });
                }
            }

            return {
                success: true,
                message: 'Operation updated successfully',
                statusCode: 200,
                data: updatedOperation,
            };
        } catch (error) {
            return {
                success: false,
                message: 'Failed to update operation',
                statusCode: 500,
                data: error.message,
            };
        }
    }

    async remove(id: string, user: { id: string; tenantId: string }) {
        const operation = await this.prisma.operation.findUnique({
            where: { id },
            include: { patient: true },
        });

        if (!operation || operation.deletedAt) {
            return {
                success: false,
                message: 'Operation not found or already deleted',
                statusCode: 404,
                data: null,
            };
        }

        if (operation.patient.tenantId !== user.tenantId || !(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.ADMIN]))) {
            return {
                success: false,
                message: 'You must be an admin in this tenant to delete operations',
                statusCode: 403,
                data: null,
            };
        }

        try {
            const deletedOperation = await this.prisma.operation.update({
                where: { id },
                data: { deletedAt: new Date() },
            });

            // Optionally soft-delete related Billing
            const billing = await this.prisma.billing.findFirst({
                where: { patientId: operation.patientId, type: BillingType.OPERATION, deletedAt: null },
                orderBy: { createdAt: 'desc' },
            });
            if (billing) {
                await this.prisma.billing.update({
                    where: { id: billing.id },
                    data: { deletedAt: new Date() },
                });
            }

            return {
                success: true,
                message: 'Operation deleted successfully',
                statusCode: 200,
                data: deletedOperation,
            };
        } catch (error) {
            return {
                success: false,
                message: 'Failed to delete operation',
                statusCode: 500,
                data: error.message,
            };
        }
    }
}