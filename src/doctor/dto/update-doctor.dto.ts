import { IsString, IsOptional, IsBoolean, IsEmail, MinLength, MaxLength } from 'class-validator';

export class UpdateDoctorDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  specialty?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(15)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  employeeCode?: string;
}