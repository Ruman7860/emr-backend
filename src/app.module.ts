import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
// import { PatientsModule } from './patients/patients.module';
import { InventoryModule } from './inventory/inventory.module';
import { PrismaService } from 'prisma/prisma.service';
import { DoctorsModule } from './doctor/doctor.module';
import { StaffsModule } from './staffs/staffs.module';

@Module({
  imports: [
    AuthModule,
    // PatientsModule,
    DoctorsModule,
    StaffsModule,
    InventoryModule
  ],
  controllers: [AppController],
  providers: [AppService,PrismaService],
})
export class AppModule {}
