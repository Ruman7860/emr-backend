import { PartialType } from '@nestjs/mapped-types';
import { CreateStaffDto } from './create-staff.dto';
import { IsOptional, IsString, IsBoolean } from 'class-validator';

export class UpdateStaffDto extends PartialType(CreateStaffDto) {
  @IsString()
  @IsOptional()
  phone?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsOptional()
  employeeCode?: string;
}