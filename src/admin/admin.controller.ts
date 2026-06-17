import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminService } from './admin.service';
import { MessagesService } from '../messages/messages.service';
import { LogService } from '../log/log.service';
import { EventType } from '../entities/log.entity';
import { Language, UserRole } from '../entities/user.entity';

class UpdateAdminUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsEnum(Language)
  language?: Language;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly messagesService: MessagesService,
    private readonly logService: LogService,
  ) {}

  @Get('users')
  async getUsers(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.adminService.getUsers(req.user, page, limit);
  }

  @Put('users/:id')
  async updateUser(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: UpdateAdminUserDto,
  ) {
    return this.adminService.updateUser(id, body, req.user);
  }

  @Patch('users/:id/deactivate')
  async deactivateUser(@Req() req: any, @Param('id') id: string) {
    return this.adminService.deactivateUser(id, req.user);
  }

  @Patch('lots/:id/block')
  async blockLot(@Req() req: any, @Param('id') id: string) {
    return this.adminService.blockLot(id, req.user);
  }

  @Get('messages')
  async getMessages(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    this.adminService.ensureAdminAccess(req.user);
    return this.messagesService.getAllMessages(page, limit);
  }

  @Get('logs')
  async getLogs(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('eventType') eventType?: EventType,
  ) {
    this.adminService.ensureAdminAccess(req.user);
    return this.logService.getLogs(page, limit, eventType);
  }

  @Get('stats/dashboard')
  async getDashboardStats(@Req() req: any) {
    return this.adminService.getDashboardStats(req.user);
  }
}
