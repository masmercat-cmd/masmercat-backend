import { Repository } from 'typeorm';
import { Log, EventType } from '../entities/log.entity';
export declare class CreateLogDto {
    userId?: string;
    eventType: EventType;
    detail?: string;
    metadata?: any;
    ipAddress?: string;
    userAgent?: string;
}
export declare class LogService {
    private logRepository;
    constructor(logRepository: Repository<Log>);
    createLog(createLogDto: CreateLogDto): Promise<Log>;
    getLogs(page?: number, limit?: number, eventType?: EventType, userId?: string): Promise<{
        logs: Log[];
        total: number;
        page: number;
        totalPages: number;
    }>;
}
