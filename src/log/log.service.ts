import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Log, EventType } from '../entities/log.entity';
import { User } from '../entities/user.entity';

export class CreateLogDto {
  userId?: string;
  eventType: EventType;
  detail?: string;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class LogService {
  constructor(
    @InjectRepository(Log)
    private logRepository: Repository<Log>,
  ) {}

  private normalizePositiveNumber(value: number | string | undefined, fallback: number): number {
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized <= 0) {
      return fallback;
    }

    return Math.floor(normalized);
  }

  private sanitizeUser<T extends Partial<User> | null | undefined>(user: T): T {
    if (!user) {
      return user;
    }

    const { password, ...sanitizedUser } = user as User;
    return sanitizedUser as T;
  }

  private sanitizeLog<T extends Log | null>(log: T): T {
    if (!log) {
      return log;
    }

    return {
      ...log,
      user: this.sanitizeUser(log.user),
    } as T;
  }

  async createLog(createLogDto: CreateLogDto): Promise<Log> {
    const log = this.logRepository.create(createLogDto);
    return this.logRepository.save(log);
  }

  async getLogs(
    page: number = 1,
    limit: number = 50,
    eventType?: EventType,
    userId?: string,
  ) {
    const normalizedPage = this.normalizePositiveNumber(page, 1);
    const normalizedLimit = this.normalizePositiveNumber(limit, 50);

    const query = this.logRepository.createQueryBuilder('log')
      .leftJoinAndSelect('log.user', 'user')
      .orderBy('log.createdAt', 'DESC');

    if (eventType) {
      query.andWhere('log.eventType = :eventType', { eventType });
    }

    if (userId) {
      query.andWhere('log.userId = :userId', { userId });
    }

    const [logs, total] = await query
      .skip((normalizedPage - 1) * normalizedLimit)
      .take(normalizedLimit)
      .getManyAndCount();

    return {
      logs: logs.map((log) => this.sanitizeLog(log)),
      total,
      page: normalizedPage,
      totalPages: Math.ceil(total / normalizedLimit),
    };
  }
}
