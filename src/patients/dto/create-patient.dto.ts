import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsNotEmpty } from 'class-validator';
import { Gender } from '@prisma/client';

export class CreatePatientDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsDateString()
  dateOfBirth: Date;

  @IsEnum(Gender)
  gender: Gender;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsNumber()
  registrationFee: number;

  @IsString()
  @IsOptional()
  doctorId?: string;
}