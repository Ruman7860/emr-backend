import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { PatientsModule } from './patients/patients.module';
import { InventoryModule } from './inventory/inventory.module';
import { PrismaService } from 'prisma/prisma.service';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type:"postgres",
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      synchronize: true, // Set to false in production
    }),
    AuthModule,
    PatientsModule,
    InventoryModule
  ],
  controllers: [AppController],
  providers: [AppService,PrismaService],
})
export class AppModule {}
