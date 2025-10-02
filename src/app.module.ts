import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { InventoryModule } from './inventory/inventory.module';
import { PrismaService } from 'prisma/prisma.service';
import { DoctorsModule } from './doctor/doctor.module';
import { StaffsModule } from './staffs/staffs.module';
import { PatientsModule } from './patients/patients.module';
import { VisitsModule } from './visits/visits.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { OperationsModule } from './operations/operations.module';

@Module({
  imports: [
    AuthModule,
    DoctorsModule,
    StaffsModule,
    InventoryModule,
    PatientsModule,
    VisitsModule,
    PrescriptionsModule,
    OperationsModule
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule { }
