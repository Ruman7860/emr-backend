import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
// import { PatientsModule } from './patients/patients.module';
import { InventoryModule } from './inventory/inventory.module';
import { PrismaService } from 'prisma/prisma.service';
import { DoctorModule } from './doctor/doctor.module';
import { StaffModule } from './staffs/staffs.module';

@Module({
  imports: [
    AuthModule,
    // PatientsModule,
    DoctorModule,
    StaffModule,
    InventoryModule
  ],
  controllers: [AppController],
  providers: [AppService,PrismaService],
})
export class AppModule {}
