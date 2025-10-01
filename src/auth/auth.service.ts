import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { UserType } from 'types/types';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwtService: JwtService) { }

  async validateUser(email: string, password: string) {
    if (!email || !password) {
      throw new BadRequestException('Email and password are required');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  async login(user: UserType) {
    const payload = { email: user.email, id: user.id, role: user.role };
    const access_token = this.jwtService.sign(payload);

    return {
      success: true,
      statusCode: 200,
      message: 'Login successful',
      data: {
        access_token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      },
    };
  }

  async signup(data: SignupDto) {
    if (!data.email || !data.password || !data.name) {
      throw new BadRequestException('Email, password, and name are required');
    }
    const hashedPassword = await bcrypt.hash(data.password, 10);
    let role;
    if (data.role) {
      role = data.role.toUpperCase();
    }

    try {
      const isUserExists = await this.prisma.user.findUnique({ where: { email: data.email } })
      if (isUserExists) {
        return {
          success: false,
          statusCode: 409,
          message: 'User Already Exists. Please Login',
        };
      }
      const user = await this.prisma.user.create({
        data: {
          email: data.email,
          password: hashedPassword,
          name: data.name,
          role: role || 'STAFF',
        },
      });

      // Optionally, auto-login after signup
      // const payload = { email: user.email, sub: user.id, role: user.role };
      // const access_token = this.jwtService.sign(payload);

      return {
        success: true,
        statusCode: 201,
        message: 'Signup successful',
        data: {
          // access_token,
          user: { id: user.id, email: user.email, name: user.name, role: user.role },
        },
      };
    } catch (error) {
      if (error.code === 'P2002') { // Prisma unique constraint failed
        return {
          success: false,
          statusCode: 400,
          message: 'Email already registered',
        };
      }
      return {
        success: false,
        statusCode: 500,
        message: 'Internal server error',
        data: error.message,
      };
    }
  }
}
