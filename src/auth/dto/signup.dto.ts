// auth/dto/signup.dto.ts
import { IsEmail, IsNotEmpty, MinLength, IsOptional, IsEnum } from 'class-validator';
import { Role } from '@prisma/client';

export class SignupDto {
  @IsEmail({}, { message: 'Invalid email address' })
  email: string;

  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password: string;

  @IsNotEmpty({message:"Tenant Name is required"})
  tenantName: string;

  @IsNotEmpty({ message: 'Admin Name is required' })
  name: string;

  @IsOptional()
  address: string;

  @IsOptional()
  phone: string;

  @IsNotEmpty({message:"Tenant code is missing"})
  code: string;

  @IsOptional()
  @IsEnum(Role, { message: 'Role must be one of ADMIN, DOCTOR, STAFF' })
  role?: Role;
}
