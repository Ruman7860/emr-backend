import { IsString, IsOptional, IsNumber } from 'class-validator';

export class CreateVisitDto {
  @IsString()
  patientId: string;

  @IsString()
  doctorId: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsNumber()
  @IsOptional()
  consultationFee?: number;
}