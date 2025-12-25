import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { UpdateNotesDto } from './dto/update-notes.dto';

@Injectable()
export class NotesService {
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

    async getNotesByVisit(visitId: string, user: { id: string; tenantId: string }) {
        // Check authorization (DOCTOR, ADMIN, STAFF, NURSE)
        if (!(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.ADMIN, Role.DOCTOR, Role.STAFF, Role.NURSE]))) {
            return {
                success: false,
                message: 'You are not authorized to view notes in this tenant',
                statusCode: 403,
                data: null,
            };
        }

        try {
            const visit = await this.prisma.visit.findUnique({
                where: { id: visitId },
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

            if (visit.patient.tenantId !== user.tenantId) {
                return {
                    success: false,
                    message: 'Visit not found in your tenant',
                    statusCode: 404,
                    data: null,
                };
            }

            return {
                success: true,
                message: 'Notes retrieved successfully',
                statusCode: 200,
                data: { notes: visit.notes || '' },
            };
        } catch (error) {
            return {
                success: false,
                message: 'Failed to retrieve notes',
                statusCode: 500,
                data: error.message,
            };
        }
    }

    async updateNotes(visitId: string, updateNotesDto: UpdateNotesDto, user: { id: string; tenantId: string }) {
        // Check authorization (DOCTOR or ADMIN)
        if (!(await this.isAuthorizedInTenant(user.id, user.tenantId, [Role.DOCTOR, Role.ADMIN]))) {
            return {
                success: false,
                message: 'You are not authorized to update notes in this tenant',
                statusCode: 403,
                data: null,
            };
        }

        try {
            const visit = await this.prisma.visit.findUnique({
                where: { id: visitId },
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

            if (visit.patient.tenantId !== user.tenantId) {
                return {
                    success: false,
                    message: 'Visit not found in your tenant',
                    statusCode: 404,
                    data: null,
                };
            }

            const updatedVisit = await this.prisma.visit.update({
                where: { id: visitId },
                data: { notes: updateNotesDto.notes },
            });

            return {
                success: true,
                message: 'Notes updated successfully',
                statusCode: 200,
                data: { notes: updatedVisit.notes },
            };
        } catch (error) {
            return {
                success: false,
                message: 'Failed to update notes',
                statusCode: 500,
                data: error.message,
            };
        }
    }
}
