import { Module } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { PrescriptionsController } from './prescriptions.controller';
import { PrismaService } from 'prisma/prisma.service';
import { PdfService } from '../common/services/pdf.service';
import { CloudinaryService } from '../common/services/cloudinary.service';

@Module({
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService, PrismaService, PdfService, CloudinaryService],
})
export class PrescriptionsModule { }