
import { Injectable, UnauthorizedException, ConflictException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole, Language } from '../entities/user.entity';
import { LogService } from '../log/log.service';
import { EventType } from '../entities/log.entity';
import { IsString, IsEmail, IsEnum, IsOptional, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsEnum(['admin', 'seller', 'buyer'])
  role: UserRole;

  @IsString()
  country: string;

  @IsOptional()
  @IsEnum(['es', 'en', 'fr', 'de', 'pt', 'ar', 'zh', 'hi'])
  language?: Language;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  company?: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private logService: LogService,
  ) {}

  async register(registerDto: RegisterDto, ipAddress?: string, userAgent?: string) {
    const existingUser = await this.userRepository.findOne({
      where: { email: registerDto.email },
    });
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    const user = this.userRepository.create({
      ...registerDto,
      password: hashedPassword,
      language: registerDto.language || Language.ES,
    });
    await this.userRepository.save(user);
    await this.logService.createLog({
      userId: user.id,
      eventType: EventType.USER_REGISTER,
      detail: `User registered: ${user.email}`,
      ipAddress,
      userAgent,
    });
    const { password, ...result } = user;
    return {
      user: result,
      token: this.generateToken(user),
    };
  }

  async login(loginDto: LoginDto, ipAddress?: string, userAgent?: string) {
    const user = await this.userRepository.findOne({
      where: { email: loginDto.email, isActive: true },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.logService.createLog({
      userId: user.id,
      eventType: EventType.USER_LOGIN,
      detail: `User logged in: ${user.email}`,
      ipAddress,
      userAgent,
    });
    const { password, ...result } = user;
    return {
      user: result,
      token: this.generateToken(user),
    };
  }

  async updateProfile(userId: string, updateData: any) {
    const user = await this.userRepository.findOne({
      where: { id: userId, isActive: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    Object.assign(user, updateData);
    await this.userRepository.save(user);
    const { password, ...result } = user;
    return result;
  }

  private generateToken(user: User): string {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return this.jwtService.sign(payload);
  }

  async validateUser(userId: string): Promise<User> {
    return this.userRepository.findOne({
      where: { id: userId, isActive: true },
    });
  }
}
