// src/doctor/dto/doctor.dto.ts
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateStaffDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  password: string;   // ✅ Needed for login

  @IsOptional()
  @IsString()
  phone?: string;
}
