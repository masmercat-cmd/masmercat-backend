import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { Message } from '../entities/message.entity';
import { Lot } from '../entities/lot.entity';
import { User } from '../entities/user.entity';
import { LogModule } from '../log/log.module';
import { MessagesRealtimeService } from './messages-realtime.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Message, Lot, User]),
    LogModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [MessagesController],
  providers: [MessagesService, MessagesRealtimeService],
  exports: [MessagesService, MessagesRealtimeService],
})
export class MessagesModule {}
