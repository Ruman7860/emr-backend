import { IsInt, IsOptional, IsString, Min, Max, IsEnum } from 'class-validator';
import { PatientStatus } from '@prisma/client';

export class FindAllPatientsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(PatientStatus)
  status?: PatientStatus;
}