import { BadRequestException, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { IsString, IsNumber, IsEnum, IsOptional, IsBoolean, IsArray, Min, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lot, LotStatus, UnitType, QualityGrade, LotCurrency, Incoterm } from '../entities/lot.entity';
import { User, UserRole } from '../entities/user.entity';
import { LogService } from '../log/log.service';
import { EventType } from '../entities/log.entity';

export class CreateLotDto {
  @IsString()
  fruitId: string;

  @IsString()
  marketId: string;

  @IsOptional()
  @IsString()
  caliber?: string;

  @IsOptional() @IsString() variety?: string;
  @IsOptional() @IsString() packaging?: string;
  @IsOptional() @IsEnum(LotCurrency) currency?: LotCurrency;
  @IsOptional() @IsEnum(Incoterm) incoterm?: Incoterm;
  @IsOptional() @IsString() origin?: string;
  @IsOptional() @IsString() loadingLocation?: string;
  @IsOptional() @IsDateString() availableFrom?: string;

  @IsEnum(QualityGrade)
  quality: QualityGrade;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  price: number;

  @IsEnum(UnitType)
  unitType: UnitType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  weight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  numberOfBoxes?: number;

  @IsArray()
  @IsString({ each: true })
  photos: string[];

  @IsOptional()
  @IsBoolean()
  isOpportunity?: boolean;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateLotDto {
  @IsOptional()
  @IsString()
  caliber?: string;

  @IsOptional() @IsString() variety?: string;
  @IsOptional() @IsString() packaging?: string;
  @IsOptional() @IsEnum(LotCurrency) currency?: LotCurrency;
  @IsOptional() @IsEnum(Incoterm) incoterm?: Incoterm;
  @IsOptional() @IsString() origin?: string;
  @IsOptional() @IsString() loadingLocation?: string;
  @IsOptional() @IsDateString() availableFrom?: string;

  @IsOptional()
  @IsEnum(QualityGrade)
  quality?: QualityGrade;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  price?: number;

  @IsOptional()
  @IsEnum(UnitType)
  unitType?: UnitType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  weight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  numberOfBoxes?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];

  @IsOptional()
  @IsEnum(LotStatus)
  status?: LotStatus;

  @IsOptional()
  @IsBoolean()
  isOpportunity?: boolean;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class FilterLotsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  fruitId?: string;

  @IsOptional()
  @IsString()
  marketId?: string;

  @IsOptional()
  @IsString()
  sellerId?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxPrice?: number;

  @IsOptional()
  @IsEnum(LotStatus)
  status?: LotStatus;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isOpportunity?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;
}

@Injectable()
export class LotsService {
  constructor(
    @InjectRepository(Lot)
    private lotRepository: Repository<Lot>,
    private logService: LogService,
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

  private sanitizeLot<T extends Lot | null>(lot: T): T {
    if (!lot) {
      return lot;
    }

    return {
      ...lot,
      seller: this.sanitizeUser(lot.seller),
    } as T;
  }

  async createLot(createLotDto: CreateLotDto, user: User): Promise<Lot> {
    if (user.role !== UserRole.SELLER && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only sellers can create lots');
    }

    this.validateQuantity(createLotDto.unitType, createLotDto.weight, createLotDto.numberOfBoxes);

    const lot = this.lotRepository.create({
      ...createLotDto,
      sellerId: user.id,
    });

    const savedLot = await this.lotRepository.save(lot);

    await this.logService.createLog({
      userId: user.id,
      eventType: createLotDto.isOpportunity ? EventType.OPPORTUNITY_CREATE : EventType.LOT_CREATE,
      detail: `Lot created: ${savedLot.id}`,
      metadata: { lotId: savedLot.id, fruitId: createLotDto.fruitId },
    });

    return this.getLotById(savedLot.id);
  }

  async updateLot(lotId: string, updateLotDto: UpdateLotDto, user: User): Promise<Lot> {
    const lot = await this.lotRepository.findOne({
      where: { id: lotId },
      relations: ['seller'],
    });

    if (!lot) {
      throw new NotFoundException('Lot not found');
    }

    if (lot.sellerId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only update your own lots');
    }

    const unitType = updateLotDto.unitType ?? lot.unitType;
    const weight = updateLotDto.weight ?? Number(lot.weight);
    const boxes = updateLotDto.numberOfBoxes ?? lot.numberOfBoxes;
    if (updateLotDto.unitType !== undefined || updateLotDto.weight !== undefined || updateLotDto.numberOfBoxes !== undefined) {
      this.validateQuantity(unitType, weight, boxes);
    }
    Object.assign(lot, updateLotDto);
    await this.lotRepository.save(lot);

    await this.logService.createLog({
      userId: user.id,
      eventType: EventType.LOT_UPDATE,
      detail: `Lot updated: ${lotId}`,
      metadata: { lotId, changes: updateLotDto },
    });

    const updated = await this.lotRepository.findOne({ where: { id: lotId }, relations: ['seller', 'fruit', 'market'] });
    return this.sanitizeLot(updated)!;
  }

  async deleteLot(lotId: string, user: User): Promise<void> {
    const lot = await this.lotRepository.findOne({
      where: { id: lotId },
    });

    if (!lot) {
      throw new NotFoundException('Lot not found');
    }

    if (lot.sellerId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only delete your own lots');
    }

    await this.lotRepository.remove(lot);

    await this.logService.createLog({
      userId: user.id,
      eventType: EventType.LOT_DELETE,
      detail: `Lot deleted: ${lotId}`,
      metadata: { lotId },
    });
  }

  async getLotById(lotId: string): Promise<Lot> {
    const lot = await this.lotRepository.findOne({
      where: { id: lotId, isActive: true, isBlocked: false },
      relations: ['seller', 'fruit', 'market'],
    });

    if (!lot) {
      throw new NotFoundException('Lot not found');
    }

    return this.sanitizeLot(lot);
  }

  async getLots(filterDto: FilterLotsDto) {
    const { page = 1, limit = 20, ...filters } = filterDto;
    const normalizedPage = this.normalizePositiveNumber(page, 1);
    const normalizedLimit = this.normalizePositiveNumber(limit, 20);
    
    const query = this.lotRepository.createQueryBuilder('lot')
      .leftJoinAndSelect('lot.seller', 'seller')
      .leftJoinAndSelect('lot.fruit', 'fruit')
      .leftJoinAndSelect('lot.market', 'market')
      .where('lot.isActive = :isActive', { isActive: true })
      .andWhere('lot.isBlocked = :isBlocked', { isBlocked: false });

    if (filters.fruitId) {
      query.andWhere('lot.fruitId = :fruitId', { fruitId: filters.fruitId });
    }

    if (filters.search?.trim()) {
      query.andWhere(
        `(
          LOWER(fruit."nameEs") LIKE :search OR
          LOWER(fruit."nameEn") LIKE :search OR
          LOWER(fruit."nameFr") LIKE :search OR
          LOWER(fruit."nameDe") LIKE :search OR
          LOWER(fruit."namePt") LIKE :search
        )`,
        { search: `%${filters.search.trim().toLowerCase()}%` },
      );
    }

    if (filters.marketId) {
      query.andWhere('lot.marketId = :marketId', { marketId: filters.marketId });
    }

    if (filters.sellerId) {
      query.andWhere('lot.sellerId = :sellerId', { sellerId: filters.sellerId });
    }

    if (filters.country) {
      query.andWhere('market.country = :country', { country: filters.country });
    }

    if (filters.minPrice !== undefined) {
      query.andWhere('lot.price >= :minPrice', { minPrice: filters.minPrice });
    }

    if (filters.maxPrice !== undefined) {
      query.andWhere('lot.price <= :maxPrice', { maxPrice: filters.maxPrice });
    }

    if (filters.status) {
      query.andWhere('lot.status = :status', { status: filters.status });
    }

    if (filters.isOpportunity !== undefined) {
      query.andWhere('lot.isOpportunity = :isOpportunity', { isOpportunity: filters.isOpportunity });
    }

    query.orderBy('lot.createdAt', 'DESC');

    const [lots, total] = await query
      .skip((normalizedPage - 1) * normalizedLimit)
      .take(normalizedLimit)
      .getManyAndCount();

    return {
      lots: lots.map((lot) => this.sanitizeLot(lot)),
      total,
      page: normalizedPage,
      totalPages: Math.ceil(total / normalizedLimit),
    };
  }

  async getMyLots(user: User, page: number = 1, limit: number = 20) {
    const normalizedPage = this.normalizePositiveNumber(page, 1);
    const normalizedLimit = this.normalizePositiveNumber(limit, 20);

    const [lots, total] = await this.lotRepository.findAndCount({
      where: { sellerId: user.id },
      relations: ['fruit', 'market'],
      order: { createdAt: 'DESC' },
      skip: (normalizedPage - 1) * normalizedLimit,
      take: normalizedLimit,
    });

    return {
      lots: lots.map((lot) => this.sanitizeLot(lot)),
      total,
      page: normalizedPage,
      totalPages: Math.ceil(total / normalizedLimit),
    };
  }

  private validateQuantity(unitType: UnitType, weight?: number, numberOfBoxes?: number) {
    if (unitType === UnitType.KG && (!Number.isFinite(Number(weight)) || Number(weight) <= 0)) {
      throw new BadRequestException('Weight must be greater than zero for kg lots');
    }
    if (unitType === UnitType.BOX && (!Number.isInteger(Number(numberOfBoxes)) || Number(numberOfBoxes) <= 0)) {
      throw new BadRequestException('Number of boxes must be greater than zero for box lots');
    }
  }
}
