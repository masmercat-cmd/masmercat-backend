import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User } from '../entities/user.entity';
import { Lot } from '../entities/lot.entity';
import { Message } from '../entities/message.entity';
import { LogModule } from '../log/log.module';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Lot, Message]),
    LogModule,
    MessagesModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
