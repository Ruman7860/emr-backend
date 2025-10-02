import { PartialType } from '@nestjs/mapped-types';
import { CreateVisitDto } from './create-visit.dto';
import { IsOptional, IsString, IsNumber } from 'class-validator';

export class UpdateVisitDto extends PartialType(CreateVisitDto) {
  @IsString()
  @IsOptional()
  notes?: string;

  @IsNumber()
  @IsOptional()
  consultationFee?: number;
}