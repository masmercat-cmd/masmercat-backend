import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Not, Repository } from 'typeorm';
import { BetaFeedback } from './beta-feedback.entity';
import { PasswordResetToken } from './password-reset-token.entity';
import { EventType, Log } from '../entities/log.entity';
import { Message } from '../entities/message.entity';

@Injectable()
export class PrivacyCleanupService implements OnModuleInit {
  private readonly logger = new Logger(PrivacyCleanupService.name);

  constructor(
    @InjectRepository(Log) private readonly logs: Repository<Log>,
    @InjectRepository(PasswordResetToken) private readonly resetTokens: Repository<PasswordResetToken>,
    @InjectRepository(BetaFeedback) private readonly feedback: Repository<BetaFeedback>,
    @InjectRepository(Message) private readonly messages: Repository<Message>,
  ) {}

  async onModuleInit() {
    await this.removeExpiredPersonalData();
  }

  @Cron('0 3 * * *')
  async removeExpiredPersonalData() {
    try {
      const now = Date.now();
      const loginCutoff = new Date(now - 90 * 24 * 60 * 60 * 1000);
      const tokenCutoff = new Date(now - 24 * 60 * 60 * 1000);
      const feedbackCutoff = new Date(now - 2 * 365 * 24 * 60 * 60 * 1000);
      const commercialCutoff = new Date(now - 5 * 365 * 24 * 60 * 60 * 1000);
      await Promise.all([
        this.logs.delete({ eventType: EventType.USER_LOGIN, createdAt: LessThan(loginCutoff) }),
        this.logs.delete({ eventType: Not(EventType.USER_LOGIN), createdAt: LessThan(commercialCutoff) }),
        this.resetTokens.delete({ expiresAt: LessThan(tokenCutoff) }),
        this.feedback.delete({ createdAt: LessThan(feedbackCutoff) }),
        this.messages.delete({ createdAt: LessThan(commercialCutoff) }),
      ]);
    } catch (error: any) {
      this.logger.error(`Privacy retention cleanup failed: ${error?.message || error}`);
    }
  }
}
