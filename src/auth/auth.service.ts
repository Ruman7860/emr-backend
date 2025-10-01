import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { SignupDto } from './dto/signup.dto';
import { UserType } from 'types/types';
import { nanoid } from 'nanoid'; // lightweight unique ID generator

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwtService: JwtService) { }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) throw new UnauthorizedException('Invalid credentials');

    // fetch user's tenants
    const userTenants = await this.prisma.userTenant.findMany({
      where: { userId: user.id },
      include: { tenant: true }
    });

    if (userTenants.length === 0) {
      throw new BadRequestException('User is not assigned to any tenant');
    }

    return { user, userTenants };
  }

  async login(userObj: { user: UserType; userTenants: any[] }, tenantCode?: string) {
    try {
      if (!userObj || !userObj.user || !userObj.userTenants) {
        throw new BadRequestException('Invalid user data');
      }

      let tenant;

      if (tenantCode) {
        tenant = userObj.userTenants.find(t => t.tenant.code === tenantCode)?.tenant;
        if (!tenant) {
          throw new BadRequestException('Invalid tenant code');
        }
      } else if (userObj.userTenants.length === 1) {
        tenant = userObj.userTenants[0].tenant;
      } else if (userObj.userTenants.length > 1) {
        // Multiple tenants found, frontend should ask user to select
        return {
          success: true,
          statusCode: 200,
          message: 'Multiple tenants found. Please select one.',
          isMultiTenant: true,
          data: userObj.userTenants.map(ut => ({
            id: ut.tenant.id,
            name: ut.tenant.name,
            code: ut.tenant.code,
          })),
        };
      } else {
        throw new BadRequestException('User is not assigned to any tenant');
      }

      // Generate JWT including tenantId
      const payload = {
        email: userObj.user.email,
        id: userObj.user.id,
        role: userObj.user.role,
        tenantId: tenant.id,
      };
      const access_token = this.jwtService.sign(payload);

      return {
        success: true,
        statusCode: 200,
        message: 'Login successful',
        data: {
          access_token,
          user: {
            id: userObj.user.id,
            email: userObj.user.email,
            name: userObj.user.name,
            role: userObj.user.role,
          },
          tenant: {
            id: tenant.id,
            name: tenant.name,
            code: tenant.code,
          },
        },
      };
    } catch (error) {
      // Handle known NestJS exceptions
      if (error instanceof BadRequestException) {
        return {
          success: false,
          statusCode: 400,
          message: error.message,
        };
      }

      // Generic server error
      return {
        success: false,
        statusCode: 500,
        message: 'Internal server error',
        data: error.message,
      };
    }
  }

  async signup(data: SignupDto) {
    try {
      // 1️⃣ Validate input
      if (!data.email || !data.password || !data.name || !data.tenantName) {
        throw new BadRequestException('Email, password, name, and tenantName are required');
      }

      // 2️⃣ Check if user already exists
      const existingUser = await this.prisma.user.findUnique({ where: { email: data.email } });
      if (existingUser) {
        return {
          success: false,
          statusCode: 409,
          message: 'User already exists. Please login.',
        };
      }

      // 3️⃣ Hash password
      const hashedPassword = await bcrypt.hash(data.password, 10);

      // 4️⃣ Create user
      const user = await this.prisma.user.create({
        data: {
          email: data.email,
          password: hashedPassword,
          name: data.name,
          role: 'ADMIN', // first signup is always ADMIN
        },
      });

      // 5️⃣ Generate unique tenant code
      let tenantCode;
      let isUnique = false;

      while (!isUnique) {
        tenantCode = nanoid(6).toUpperCase(); // e.g., ABC123
        const existingTenant = await this.prisma.tenant.findUnique({ where: { code: tenantCode } });
        if (!existingTenant) isUnique = true;
      }

      // 6️⃣ Create tenant with tenantCode
      const tenant = await this.prisma.tenant.create({
        data: {
          name: data.tenantName,
          code: tenantCode,
          address: data.address || null,
          phone: data.phone || null,
        },
      });

      // 7️⃣ Link user to tenant via UserTenant
      await this.prisma.userTenant.create({
        data: {
          userId: user.id,
          tenantId: tenant.id,
          role: 'ADMIN',
        },
      });

      // 8️⃣ Return success response (no JWT)
      return {
        success: true,
        statusCode: 201,
        message: 'Signup successful. Tenant created and admin assigned.',
        data: {
          user: { id: user.id, email: user.email, name: user.name, role: user.role },
          tenant: { id: tenant.id, name: tenant.name, code: tenant.code },
        },
      };
    } catch (error) {
      // Handle Prisma unique constraint (email)
      if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
        return {
          success: false,
          statusCode: 400,
          message: 'Email already registered',
        };
      }

      // Handle Prisma unique constraint (UserTenant)
      if (error.code === 'P2002' && error.meta?.target?.includes('userId_tenantId')) {
        return {
          success: false,
          statusCode: 400,
          message: 'User is already linked to this tenant',
        };
      }

      // Generic server error
      return {
        success: false,
        statusCode: 500,
        message: 'Internal server error',
        data: error.message,
      };
    }
  }

}
