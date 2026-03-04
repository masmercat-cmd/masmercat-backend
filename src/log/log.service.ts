import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Log, EventType } from '../entities/log.entity';

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
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      logs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }
}
