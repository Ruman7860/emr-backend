import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { CreateLabTestDto } from './dto/create-labtest.dto';
import { UpdateLabTestDto } from './dto/update-labtest.dto';

@Injectable()
export class LabtestsService {
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

    async create(createLabTestDto: CreateLabTestDto, user: { id: string; tenantId: string }) {
        const { visitId, patientId, tests } = createLabTestDto;

        // Check authorization (DOCTOR or ADMIN)
        if (!(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.DOCTOR, Role.ADMIN]))) {
            return {
                success: false,
                message: 'You are not authorized to create lab tests in this tenant',
                statusCode: 403,
                data: null,
            };
        }

        // Check visit exists and is in tenant
        const visit = await this.prisma.visit.findUnique({
            where: { id: visitId },
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

        // Check patient exists and is in tenant
        const patient = await this.prisma.patient.findUnique({
            where: { id: patientId },
        });
        if (!patient || patient.tenantId !== user.tenantId) {
            return {
                success: false,
                message: 'Patient not found or not in your tenant',
                statusCode: 404,
                data: null,
            };
        }

        // Validate tests content
        if (!tests || tests.trim() === '') {
            return {
                success: false,
                message: 'Lab tests content is required',
                statusCode: 400,
                data: null,
            };
        }

        try {
            const labTest = await this.prisma.labTest.create({
                data: {
                    visitId,
                    patientId,
                    tests,
                    deletedAt: null,
                },
            });

            return {
                success: true,
                message: 'Lab test created successfully',
                statusCode: 201,
                data: labTest,
            };
        } catch (error) {
            return {
                success: false,
                message: 'Failed to create lab test',
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
                message: 'You are not authorized to list lab tests in this tenant',
                statusCode: 403,
                data: null,
            };
        }

        try {
            const where = visitId
                ? {
                    visitId,
                    deletedAt: null,
                    visit: {
                        deletedAt: null,
                        patient: { tenantId: user.tenantId, deletedAt: null }
                    }
                }
                : patientId
                    ? {
                        deletedAt: null,
                        visit: {
                            patientId,
                            deletedAt: null,
                            patient: { tenantId: user.tenantId, deletedAt: null }
                        }
                    }
                    : {
                        deletedAt: null,
                        visit: {
                            deletedAt: null,
                            patient: { tenantId: user.tenantId, deletedAt: null }
                        }
                    };

            const labTests = await this.prisma.labTest.findMany({
                where,
                include: { visit: { include: { patient: true, doctor: true } }, patient: true },
                orderBy: { createdAt: 'desc' },
            });

            return {
                success: true,
                message: 'Lab tests retrieved successfully',
                statusCode: 200,
                data: labTests,
            };
        } catch (error) {
            return {
                success: false,
                message: 'Failed to retrieve lab tests',
                statusCode: 500,
                data: error.message,
            };
        }
    }

    async findOne(id: string, user: { id: string; tenantId: string }) {
        const labTest = await this.prisma.labTest.findUnique({
            where: { id },
            include: { visit: { include: { patient: true, doctor: true } }, patient: true },
        });

        if (!labTest || labTest.deletedAt) {
            return {
                success: false,
                message: 'Lab test not found or deleted',
                statusCode: 404,
                data: null,
            };
        }

        if (labTest.visit.patient.tenantId !== user.tenantId || !(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.ADMIN, Role.DOCTOR, Role.STAFF, Role.NURSE]))) {
            return {
                success: false,
                message: 'You are not authorized to view this lab test',
                statusCode: 403,
                data: null,
            };
        }

        return {
            success: true,
            message: 'Lab test retrieved successfully',
            statusCode: 200,
            data: labTest,
        };
    }

    async update(id: string, updateLabTestDto: UpdateLabTestDto, user: { id: string; tenantId: string }) {
        const labTest = await this.prisma.labTest.findUnique({
            where: { id },
            include: { visit: { include: { patient: true } } },
        });

        if (!labTest || labTest.deletedAt) {
            return {
                success: false,
                message: 'Lab test not found or deleted',
                statusCode: 404,
                data: null,
            };
        }

        if (labTest.visit.patient.tenantId !== user.tenantId || !(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.ADMIN, Role.DOCTOR]))) {
            return {
                success: false,
                message: 'You are not authorized to update this lab test',
                statusCode: 403,
                data: null,
            };
        }

        // Validate tests content if provided
        if (updateLabTestDto.tests !== undefined && (!updateLabTestDto.tests || updateLabTestDto.tests.trim() === '')) {
            return {
                success: false,
                message: 'Lab tests content cannot be empty',
                statusCode: 400,
                data: null,
            };
        }

        try {
            const updatedLabTest = await this.prisma.labTest.update({
                where: { id },
                data: updateLabTestDto,
            });

            return {
                success: true,
                message: 'Lab test updated successfully',
                statusCode: 200,
                data: updatedLabTest,
            };
        } catch (error) {
            return {
                success: false,
                message: 'Failed to update lab test',
                statusCode: 500,
                data: error.message,
            };
        }
    }

    async remove(id: string, user: { id: string; tenantId: string }) {
        const labTest = await this.prisma.labTest.findUnique({
            where: { id },
            include: { visit: { include: { patient: true } } },
        });

        if (!labTest || labTest.deletedAt) {
            return {
                success: false,
                message: 'Lab test not found or already deleted',
                statusCode: 404,
                data: null,
            };
        }

        if (labTest.visit.patient.tenantId !== user.tenantId || !(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.ADMIN, Role.DOCTOR]))) {
            return {
                success: false,
                message: 'You must be an admin or doctor in this tenant to delete lab tests',
                statusCode: 403,
                data: null,
            };
        }

        try {
            const deletedLabTest = await this.prisma.labTest.update({
                where: { id },
                data: { deletedAt: new Date() },
            });

            return {
                success: true,
                message: 'Lab test deleted successfully',
                statusCode: 200,
                data: deletedLabTest,
            };
        } catch (error) {
            return {
                success: false,
                message: 'Failed to delete lab test',
                statusCode: 500,
                data: error.message,
            };
        }
    }
}
