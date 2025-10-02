import { IsString, IsNotEmpty, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class MedicationDto {
  @IsString()
  @IsNotEmpty()
  drugName: string;

  @IsString()
  @IsNotEmpty()
  dosage: string;

  @IsString()
  @IsOptional()
  duration?: string;

  @IsString()
  @IsOptional()
  instructions?: string;
}

export class CreatePrescriptionDto {
  @IsString()
  @IsNotEmpty()
  visitId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MedicationDto)
  medications: MedicationDto[];
}