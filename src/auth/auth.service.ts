
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { User, UserRole, Language } from '../entities/user.entity';
import { LogService } from '../log/log.service';
import { EventType } from '../entities/log.entity';
import { IsString, IsEmail, IsEnum, IsOptional, MinLength, IsNotEmpty } from 'class-validator';
import { PasswordResetToken } from './password-reset-token.entity';
import { BetaFeedback, BetaFeedbackCategory } from './beta-feedback.entity';

const nodemailer: any = require('nodemailer');

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsString()
  @IsNotEmpty()
  country: string;

  @IsOptional()
  @IsEnum(Language)
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
  @IsNotEmpty()
  password: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @MinLength(8)
  password: string;
}

export type ProfileUpdateData = Partial<
  Pick<User, 'name' | 'language' | 'country' | 'phone' | 'company'>
>;

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(PasswordResetToken)
    private passwordResetRepository: Repository<PasswordResetToken>,
    @InjectRepository(BetaFeedback)
    private betaFeedbackRepository: Repository<BetaFeedback>,
    private jwtService: JwtService,
    private logService: LogService,
    private configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureDefaultAdminUser();
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizeOptionalText(value?: string): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private normalizeRequiredText(value: string, fieldName: string): string {
    const normalized = value.trim();
    if (!normalized) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    return normalized;
  }

  private resolveUpdatedRequiredText(
    value: string | undefined,
    currentValue: string,
    fieldName: string,
  ): string {
    if (typeof value !== 'string') {
      return currentValue;
    }

    return this.normalizeRequiredText(value, fieldName);
  }

  private normalizeRegisterDto(registerDto: RegisterDto): RegisterDto {
    return {
      ...registerDto,
      name: this.normalizeRequiredText(registerDto.name, 'name'),
      email: this.normalizeEmail(registerDto.email),
      country: this.normalizeRequiredText(registerDto.country, 'country'),
      phone: this.normalizeOptionalText(registerDto.phone),
      company: this.normalizeOptionalText(registerDto.company),
    };
  }

  private resolveDefaultAdminLanguage(): Language {
    const configuredLanguage = `${this.configService.get<string>('ADMIN_LANGUAGE') ?? ''}`
      .trim()
      .toLowerCase();

    return Object.values(Language).includes(configuredLanguage as Language)
      ? (configuredLanguage as Language)
      : Language.ES;
  }

  private resolveDefaultAdminName(): string {
    return this.normalizeRequiredText(
      this.configService.get<string>('ADMIN_NAME') || 'Admin',
      'ADMIN_NAME',
    );
  }

  private resolveDefaultAdminCountry(): string {
    return this.normalizeRequiredText(
      this.configService.get<string>('ADMIN_COUNTRY') || 'Spain',
      'ADMIN_COUNTRY',
    );
  }

  private resolveDefaultAdminCredentials():
    | { email: string; password: string }
    | null {
    const configuredEmail = this.normalizeOptionalText(
      this.configService.get<string>('ADMIN_EMAIL'),
    );
    const configuredPassword = this.normalizeOptionalText(
      this.configService.get<string>('ADMIN_PASSWORD'),
    );

    if (!configuredEmail && !configuredPassword) {
      return null;
    }

    if (!configuredEmail || !configuredPassword) {
      throw new Error(
        'ADMIN_EMAIL and ADMIN_PASSWORD must both be configured to bootstrap an admin user',
      );
    }

    return {
      email: this.normalizeEmail(configuredEmail),
      password: configuredPassword,
    };
  }

  private async ensureDefaultAdminUser(): Promise<void> {
    const adminCount = await this.userRepository.count({
      where: { role: UserRole.ADMIN },
    });
    if (adminCount > 0) {
      return;
    }

    const credentials = this.resolveDefaultAdminCredentials();
    if (!credentials) {
      this.logger.warn(
        'Admin bootstrap skipped because ADMIN_EMAIL and ADMIN_PASSWORD are not configured',
      );
      return;
    }

    const { email, password } = credentials;

    const existingEmailUser = await this.userRepository.findOne({
      where: { email },
    });
    if (existingEmailUser) {
      throw new Error(
        `Admin bootstrap blocked because ${email} already exists without admin role`,
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const adminUser = this.userRepository.create({
      name: this.resolveDefaultAdminName(),
      email,
      password: hashedPassword,
      role: UserRole.ADMIN,
      country: this.resolveDefaultAdminCountry(),
      language: this.resolveDefaultAdminLanguage(),
      company: this.normalizeOptionalText(
        this.configService.get<string>('ADMIN_COMPANY'),
      ),
      phone: this.normalizeOptionalText(
        this.configService.get<string>('ADMIN_PHONE'),
      ),
      isActive: true,
    });

    await this.userRepository.save(adminUser);
    this.logger.log(`Default admin user ready: ${email}`);
  }

  async register(registerDto: RegisterDto, ipAddress?: string, userAgent?: string) {
    const normalizedRegisterDto = this.normalizeRegisterDto(registerDto);

    if (normalizedRegisterDto.role === UserRole.ADMIN) {
      throw new UnauthorizedException('Admin registration is not allowed');
    }

    const existingUser = await this.userRepository.findOne({
      where: { email: normalizedRegisterDto.email },
    });
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }
    const hashedPassword = await bcrypt.hash(normalizedRegisterDto.password, 10);
    const user = this.userRepository.create({
      ...normalizedRegisterDto,
      password: hashedPassword,
      language: normalizedRegisterDto.language || Language.ES,
    });
    await this.userRepository.save(user);
    await this.logService.createLog({
      userId: user.id,
      eventType: EventType.USER_REGISTER,
      detail: `User registered: ${user.email}`,
      ipAddress,
      userAgent,
    });
    return {
      user: this.sanitizeUser(user),
      token: this.generateToken(user),
    };
  }

  async login(loginDto: LoginDto, ipAddress?: string, userAgent?: string) {
    const normalizedEmail = this.normalizeEmail(loginDto.email);
    const user = await this.userRepository.findOne({
      where: { email: normalizedEmail, isActive: true },
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
    return {
      user: this.sanitizeUser(user),
      token: this.generateToken(user),
    };
  }

  async requestPasswordReset(email: string): Promise<{ message: string }> {
    const genericMessage = 'Si el correo está registrado, recibirás un enlace para restablecer la contraseña.';
    const user = await this.userRepository.findOne({
      where: { email: this.normalizeEmail(email), isActive: true },
    });
    if (!user) return { message: genericMessage };

    const resendApiKey = this.configService.get<string>('RESEND_API_KEY');
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPassword = this.configService.get<string>('SMTP_PASSWORD');
    const smtpConfigured = Boolean(smtpHost && smtpUser && smtpPassword);
    if (!resendApiKey && !smtpConfigured) {
      this.logger.error('Password reset requested but no email provider is configured');
      throw new ServiceUnavailableException('El servicio de correo todavía no está configurado');
    }

    await this.passwordResetRepository.update(
      { userId: user.id, usedAt: IsNull() },
      { usedAt: new Date() },
    );
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const resetToken = await this.passwordResetRepository.save(this.passwordResetRepository.create({
      tokenHash,
      userId: user.id,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    }));

    const frontendUrl = (this.configService.get<string>('FRONTEND_URL') || 'https://masmercat-mercado.netlify.app').replace(/\/$/, '');
    const resetUrl = `${frontendUrl}/reset-password/?token=${encodeURIComponent(token)}`;
    const subject = 'Restablecer contraseña de MasMercat';
    const text = `Has solicitado restablecer tu contraseña. Abre este enlace, válido durante 30 minutos: ${resetUrl}\n\nSi no lo solicitaste, ignora este mensaje.`;
    const html = `<p>Has solicitado restablecer tu contraseña de MasMercat.</p><p><a href="${resetUrl}">Crear una contraseña nueva</a></p><p>El enlace es válido durante 30 minutos y solo puede utilizarse una vez.</p><p>Si no lo solicitaste, ignora este mensaje.</p>`;

    if (resendApiKey) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `password-reset-${resetToken.id}`,
        },
        body: JSON.stringify({
          from: this.configService.get<string>('RESEND_FROM') || 'MasMercat <acceso@masmercat.com>',
          to: [user.email],
          subject,
          text,
          html,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        const detail = await response.text();
        this.logger.error(`Resend password email failed (${response.status}): ${detail}`);
        throw new ServiceUnavailableException('No se pudo enviar el correo de recuperación');
      }
    } else {
      const smtpPort = Number(this.configService.get<string>('SMTP_PORT') || 587);
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPassword },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      });
      await transporter.sendMail({
        from: this.configService.get<string>('SMTP_FROM') || `MasMercat <${smtpUser}>`,
        to: user.email,
        subject,
        text,
        html,
      });
    }
    return { message: genericMessage };
  }

  async resetPassword(token: string, password: string): Promise<{ message: string }> {
    const tokenHash = createHash('sha256').update(token.trim()).digest('hex');
    const resetToken = await this.passwordResetRepository.findOne({
      where: { tokenHash, usedAt: IsNull(), expiresAt: MoreThan(new Date()) },
    });
    if (!resetToken) throw new BadRequestException('El enlace no es válido o ha caducado');

    const user = await this.userRepository.findOne({ where: { id: resetToken.userId, isActive: true } });
    if (!user) throw new BadRequestException('El enlace no es válido o ha caducado');
    user.password = await bcrypt.hash(password, 10);
    await this.userRepository.manager.transaction(async manager => {
      await manager.save(user);
      resetToken.usedAt = new Date();
      await manager.save(resetToken);
      await manager.update(PasswordResetToken, { userId: user.id, usedAt: IsNull() }, { usedAt: new Date() });
    });
    return { message: 'Contraseña actualizada correctamente' };
  }

  async updateProfile(userId: string, updateData: ProfileUpdateData) {
    const user = await this.userRepository.findOne({
      where: { id: userId, isActive: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.name = this.resolveUpdatedRequiredText(
      updateData.name,
      user.name,
      'name',
    );
    user.language = updateData.language ?? user.language;
    user.country = this.resolveUpdatedRequiredText(
      updateData.country,
      user.country,
      'country',
    );
    user.phone = this.normalizeOptionalText(updateData.phone) ?? user.phone;
    user.company = this.normalizeOptionalText(updateData.company) ?? user.company;

    await this.userRepository.save(user);
    return this.sanitizeUser(user);
  }

  async submitBetaFeedback(
    userId: string,
    category: BetaFeedbackCategory,
    comment: string,
    platform?: string,
    appVersion?: string,
  ) {
    const feedback = this.betaFeedbackRepository.create({
      userId,
      category,
      comment: comment.trim(),
      platform: this.normalizeOptionalText(platform)?.slice(0, 30) ?? 'unknown',
      appVersion: this.normalizeOptionalText(appVersion)?.slice(0, 30) ?? 'beta',
    });
    const saved = await this.betaFeedbackRepository.save(feedback);
    return { ok: true, id: saved.id };
  }

  private generateToken(user: User): string {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return this.jwtService.sign(payload);
  }

  async validateUser(userId: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id: userId, isActive: true },
    });
  }

  sanitizeUser(user: User): Omit<User, 'password'> {
    const { password, ...sanitizedUser } = user;
    return sanitizedUser;
  }
}
