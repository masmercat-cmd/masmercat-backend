import { Controller, Post, Get, Put, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { MessagesService, CreateMessageDto } from './messages.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('messages')
export class MessagesController {
  constructor(private messagesService: MessagesService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async createMessage(@Body() createMessageDto: CreateMessageDto, @Req() req: any) {
    return this.messagesService.createMessage(createMessageDto, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('received')
  async getReceivedMessages(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.messagesService.getMessagesForSeller(req.user, page, limit);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sent')
  async getSentMessages(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.messagesService.getMessagesForBuyer(req.user, page, limit);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/read')
  async markAsRead(@Param('id') id: string, @Req() req: any) {
    return this.messagesService.markAsRead(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('thread')
  async getThreadMessages(
    @Req() req: any,
    @Query('lotId') lotId: string,
    @Query('userId') userId: string,
  ) {
    return this.messagesService.getThreadMessages(lotId, userId, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Put('thread/read')
  async markThreadAsRead(
    @Req() req: any,
    @Query('lotId') lotId: string,
    @Query('userId') userId: string,
  ) {
    return this.messagesService.markThreadAsRead(lotId, userId, req.user);
  }
}
