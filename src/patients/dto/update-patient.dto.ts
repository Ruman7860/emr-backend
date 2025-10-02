import { PartialType } from '@nestjs/mapped-types';
import { CreatePatientDto } from './create-patient.dto';
import { IsOptional, IsEnum, IsString, IsDateString, IsNumber } from 'class-validator';
import { PatientStatus } from '@prisma/client';


export class UpdatePatientDto extends PartialType(CreatePatientDto) {
  @IsEnum(PatientStatus)
  @IsOptional()
  status?: PatientStatus;

  @IsString()
  @IsOptional()
  referredTo?: string;

  @IsString()
  @IsOptional()
  referredReason?: string;

  @IsString()
  @IsOptional()
  doctorId?: string;
}