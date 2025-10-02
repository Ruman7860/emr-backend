import { IsArray, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MedicationDto } from './create-prescription.dto';

export class UpdatePrescriptionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MedicationDto)
  @IsOptional()
  medications?: MedicationDto[];
}