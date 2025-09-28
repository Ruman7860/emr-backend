import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.patient.findMany();
  }

  async create(data: { name: string; medicalHistory?: string }) {
    return this.prisma.patient.create({
      data: { ...data, createdAt: new Date(), updatedAt: new Date() },
    });
  }
}