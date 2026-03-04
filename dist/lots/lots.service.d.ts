import { Repository } from 'typeorm';
import { Lot, LotStatus, UnitType, QualityGrade } from '../entities/lot.entity';
import { User } from '../entities/user.entity';
import { LogService } from '../log/log.service';
export declare class CreateLotDto {
    fruitId: string;
    marketId: string;
    caliber?: string;
    quality: QualityGrade;
    price: number;
    unitType: UnitType;
    weight?: number;
    numberOfBoxes?: number;
    photos: string[];
    isOpportunity?: boolean;
    description?: string;
}
export declare class UpdateLotDto {
    caliber?: string;
    quality?: QualityGrade;
    price?: number;
    unitType?: UnitType;
    weight?: number;
    numberOfBoxes?: number;
    photos?: string[];
    status?: LotStatus;
    isOpportunity?: boolean;
    description?: string;
}
export declare class FilterLotsDto {
    fruitId?: string;
    marketId?: string;
    country?: string;
    minPrice?: number;
    maxPrice?: number;
    status?: LotStatus;
    isOpportunity?: boolean;
    page?: number;
    limit?: number;
}
export declare class LotsService {
    private lotRepository;
    private logService;
    constructor(lotRepository: Repository<Lot>, logService: LogService);
    createLot(createLotDto: CreateLotDto, user: User): Promise<Lot>;
    updateLot(lotId: string, updateLotDto: UpdateLotDto, user: User): Promise<Lot>;
    deleteLot(lotId: string, user: User): Promise<void>;
    getLotById(lotId: string): Promise<Lot>;
    getLots(filterDto: FilterLotsDto): Promise<{
        lots: Lot[];
        total: number;
        page: number;
        totalPages: number;
    }>;
    getMyLots(user: User, page?: number, limit?: number): Promise<{
        lots: Lot[];
        total: number;
        page: number;
        totalPages: number;
    }>;
}
