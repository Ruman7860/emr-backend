import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsNotEmpty, Min } from 'class-validator';
import { Gender } from '@prisma/client';

export class CreatePatientDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsDateString()
  @IsOptional()
  dateOfBirth: Date;

  @IsInt()
  @Min(0)
  age: number; 

  @IsEnum(Gender)
  gender: Gender;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsNotEmpty()
  chiefComplaint: string; 

  @IsNumber()
  @Min(1)
  registrationFee: number; 

  @IsString()
  @IsOptional()
  doctorId?: string;
}