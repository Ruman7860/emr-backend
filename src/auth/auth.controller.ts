import { Controller, Post, Body, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { UserType } from 'types/types';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Login user' })
  @Post('login')
  async login(@Body() body: LoginDto) {
    if (!body.email || !body.password) {
      throw new BadRequestException('Email and password are required');
    }

    const userObj = await this.authService.validateUser(body.email, body.password);
    if (!userObj) throw new UnauthorizedException('Invalid credentials');

    return this.authService.login(userObj, body.tenantCode);
  }

  @ApiOperation({ summary: 'Signup user' })
  @Post('signup')
  async signup(@Body() body: SignupDto) {
    if (!body.email || !body.password || !body.name) {
      throw new BadRequestException('Email, password, and name are required');
    }

    try {
      const user = await this.authService.signup(body);
      return user;
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}
