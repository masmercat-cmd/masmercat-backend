import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../entities/user.entity';
import { Lot } from '../entities/lot.entity';
import { Message } from '../entities/message.entity';
import { LogService } from '../log/log.service';
import { EventType } from '../entities/log.entity';

export interface AdminUserUpdate {
  name?: string;
  role?: UserRole;
  country?: string;
  language?: User['language'];
  phone?: string | null;
  company?: string | null;
  isActive?: boolean;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Lot)
    private readonly lotRepository: Repository<Lot>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    private readonly logService: LogService,
  ) {}

  private normalizePositiveNumber(
    value: number | string | undefined,
    fallback: number,
  ): number {
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

  private sanitizeLot<T extends Partial<Lot> | null | undefined>(lot: T): T {
    if (!lot) {
      return lot;
    }

    return {
      ...lot,
      seller: this.sanitizeUser((lot as Lot).seller),
    } as T;
  }

  private ensureAdmin(actor: User): void {
    if (actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }
  }

  async getUsers(actor: User, page: number = 1, limit: number = 50) {
    this.ensureAdmin(actor);

    const normalizedPage = this.normalizePositiveNumber(page, 1);
    const normalizedLimit = this.normalizePositiveNumber(limit, 50);

    const [users, total] = await this.userRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (normalizedPage - 1) * normalizedLimit,
      take: normalizedLimit,
    });

    return {
      users: users.map((user) => this.sanitizeUser(user)),
      total,
      page: normalizedPage,
      totalPages: Math.ceil(total / normalizedLimit),
    };
  }

  async updateUser(
    userId: string,
    update: AdminUserUpdate,
    actor: User,
  ) {
    this.ensureAdmin(actor);

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    Object.assign(user, update);
    const saved = await this.userRepository.save(user);

    await this.logService.createLog({
      userId: actor.id,
      eventType: EventType.ADMIN_ACTION,
      detail: `Admin updated user: ${userId}`,
      metadata: { userId, changes: update },
    });

    return this.sanitizeUser(saved);
  }

  async deactivateUser(userId: string, actor: User) {
    this.ensureAdmin(actor);

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenException('Cannot deactivate another admin');
    }

    user.isActive = false;
    const saved = await this.userRepository.save(user);

    await this.logService.createLog({
      userId: actor.id,
      eventType: EventType.ADMIN_ACTION,
      detail: `Admin deactivated user: ${userId}`,
      metadata: { userId },
    });

    return this.sanitizeUser(saved);
  }

  async blockLot(lotId: string, actor: User) {
    this.ensureAdmin(actor);

    const lot = await this.lotRepository.findOne({
      where: { id: lotId },
      relations: ['seller', 'fruit', 'market'],
    });
    if (!lot) {
      throw new NotFoundException('Lot not found');
    }

    lot.isBlocked = true;
    const saved = await this.lotRepository.save(lot);

    await this.logService.createLog({
      userId: actor.id,
      eventType: EventType.ADMIN_ACTION,
      detail: `Admin blocked lot: ${lotId}`,
      metadata: { lotId },
    });

    return this.sanitizeLot(saved);
  }

  async getDashboardStats(actor: User) {
    this.ensureAdmin(actor);

    const now = new Date();
    const oneWeekAgo = new Date(now);
    oneWeekAgo.setDate(now.getDate() - 7);

    const [
      totalUsers,
      totalLots,
      totalMessages,
      activeLots,
      opportunitiesCount,
      newUsersThisWeek,
    ] = await Promise.all([
      this.userRepository.count(),
      this.lotRepository.count(),
      this.messageRepository.count(),
      this.lotRepository.count({
        where: { isActive: true, isBlocked: false },
      }),
      this.lotRepository.count({
        where: { isActive: true, isBlocked: false, isOpportunity: true },
      }),
      this.userRepository
        .createQueryBuilder('user')
        .where('user.createdAt >= :oneWeekAgo', { oneWeekAgo })
        .getCount(),
    ]);

    return {
      totalUsers,
      totalLots,
      totalMessages,
      activeLots,
      opportunitiesCount,
      newUsersThisWeek,
    };
  }

  ensureAdminAccess(actor: User) {
    this.ensureAdmin(actor);
    return { ok: true };
  }
}
