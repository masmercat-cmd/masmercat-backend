import { Controller, Post, Put, Body, Req, UseGuards, Get, ValidationPipe, UsePipes } from '@nestjs/common';
import { AuthService, RegisterDto, LoginDto, ForgotPasswordDto, ResetPasswordDto, ProfileUpdateData } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Request } from 'express';
import { IsString, IsOptional, IsEnum, IsNotEmpty, MaxLength, IsBoolean } from 'class-validator';
import { Language } from '../entities/user.entity';
import { BetaFeedbackCategory } from './beta-feedback.entity';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsEnum(Language)
  language?: Language;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  country?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsBoolean()
  publicContactConsent?: boolean;
}

export class BetaFeedbackDto {
  @IsEnum(BetaFeedbackCategory)
  category: BetaFeedbackCategory;

  @IsString()
  @MaxLength(2000)
  comment: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  appVersion?: string;
}

export class DeactivateAccountDto {
  @IsString()
  @IsNotEmpty()
  password: string;
}

@Controller('auth')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class AuthController {
  constructor(private authService: AuthService) {}

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'masmercat-backend',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('register')
  async register(@Body() registerDto: RegisterDto, @Req() req: Request) {
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    return this.authService.register(registerDto, ipAddress, userAgent);
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto, @Req() req: Request) {
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    return this.authService.login(loginDto, ipAddress, userAgent);
  }

  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Req() req: any) {
    return this.authService.sanitizeUser(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Put('profile')
  async updateProfile(@Req() req: any, @Body() updateDto: UpdateProfileDto) {
    return this.authService.updateProfile(req.user.id, updateDto as ProfileUpdateData);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-data')
  async getMyData(@Req() req: any) {
    return this.authService.getMyData(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('deactivate-account')
  async deactivateAccount(@Req() req: any, @Body() dto: DeactivateAccountDto) {
    return this.authService.deactivateAccount(req.user.id, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Post('feedback')
  async submitBetaFeedback(@Req() req: any, @Body() dto: BetaFeedbackDto) {
    return this.authService.submitBetaFeedback(
      req.user.id,
      dto.category,
      dto.comment,
      dto.platform,
      dto.appVersion,
    );
  }
}
