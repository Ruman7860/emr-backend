import { PartialType } from '@nestjs/mapped-types';
import { CreateOperationDto } from './create-operation.dto';
import { IsOptional, IsString, IsDateString, IsNumber } from 'class-validator';

export class UpdateOperationDto extends PartialType(CreateOperationDto) {
  @IsString()
  @IsOptional()
  name?: string;

  @IsDateString()
  @IsOptional()
  date?: string;

  @IsString()
  @IsOptional()
  surgeonId?: string;

  @IsNumber()
  @IsOptional()
  fee?: number;

  @IsString()
  @IsOptional()
  outcome?: string;
}