"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LotsService = exports.FilterLotsDto = exports.UpdateLotDto = exports.CreateLotDto = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const lot_entity_1 = require("../entities/lot.entity");
const log_service_1 = require("../log/log.service");
const log_entity_1 = require("../entities/log.entity");
class CreateLotDto {
}
exports.CreateLotDto = CreateLotDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateLotDto.prototype, "fruitId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateLotDto.prototype, "marketId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateLotDto.prototype, "caliber", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(['extra', 'first', 'second', 'industrial']),
    __metadata("design:type", String)
], CreateLotDto.prototype, "quality", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateLotDto.prototype, "price", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(['kg', 'box']),
    __metadata("design:type", String)
], CreateLotDto.prototype, "unitType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CreateLotDto.prototype, "weight", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CreateLotDto.prototype, "numberOfBoxes", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], CreateLotDto.prototype, "photos", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CreateLotDto.prototype, "isOpportunity", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateLotDto.prototype, "description", void 0);
class UpdateLotDto {
}
exports.UpdateLotDto = UpdateLotDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateLotDto.prototype, "caliber", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['extra', 'first', 'second', 'industrial']),
    __metadata("design:type", String)
], UpdateLotDto.prototype, "quality", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], UpdateLotDto.prototype, "price", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['kg', 'box']),
    __metadata("design:type", String)
], UpdateLotDto.prototype, "unitType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], UpdateLotDto.prototype, "weight", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], UpdateLotDto.prototype, "numberOfBoxes", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], UpdateLotDto.prototype, "photos", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['available', 'reserved', 'sold']),
    __metadata("design:type", String)
], UpdateLotDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateLotDto.prototype, "isOpportunity", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateLotDto.prototype, "description", void 0);
class FilterLotsDto {
}
exports.FilterLotsDto = FilterLotsDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], FilterLotsDto.prototype, "fruitId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], FilterLotsDto.prototype, "marketId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], FilterLotsDto.prototype, "country", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], FilterLotsDto.prototype, "minPrice", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], FilterLotsDto.prototype, "maxPrice", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['available', 'reserved', 'sold']),
    __metadata("design:type", String)
], FilterLotsDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Boolean),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], FilterLotsDto.prototype, "isOpportunity", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], FilterLotsDto.prototype, "page", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], FilterLotsDto.prototype, "limit", void 0);
let LotsService = class LotsService {
    constructor(lotRepository, logService) {
        this.lotRepository = lotRepository;
        this.logService = logService;
    }
    async createLot(createLotDto, user) {
        const lot = this.lotRepository.create({
            ...createLotDto,
            sellerId: user.id,
        });
        const savedLot = await this.lotRepository.save(lot);
        await this.logService.createLog({
            userId: user.id,
            eventType: createLotDto.isOpportunity ? log_entity_1.EventType.OPPORTUNITY_CREATE : log_entity_1.EventType.LOT_CREATE,
            detail: `Lot created: ${savedLot.id}`,
            metadata: { lotId: savedLot.id, fruitId: createLotDto.fruitId },
        });
        return this.getLotById(savedLot.id);
    }
    async updateLot(lotId, updateLotDto, user) {
        const lot = await this.lotRepository.findOne({
            where: { id: lotId },
            relations: ['seller'],
        });
        if (!lot) {
            throw new common_1.NotFoundException('Lot not found');
        }
        if (lot.sellerId !== user.id && user.role !== 'admin') {
            throw new common_1.ForbiddenException('You can only update your own lots');
        }
        Object.assign(lot, updateLotDto);
        await this.lotRepository.save(lot);
        await this.logService.createLog({
            userId: user.id,
            eventType: log_entity_1.EventType.LOT_UPDATE,
            detail: `Lot updated: ${lotId}`,
            metadata: { lotId, changes: updateLotDto },
        });
        return this.getLotById(lotId);
    }
    async deleteLot(lotId, user) {
        const lot = await this.lotRepository.findOne({
            where: { id: lotId },
        });
        if (!lot) {
            throw new common_1.NotFoundException('Lot not found');
        }
        if (lot.sellerId !== user.id && user.role !== 'admin') {
            throw new common_1.ForbiddenException('You can only delete your own lots');
        }
        await this.lotRepository.remove(lot);
        await this.logService.createLog({
            userId: user.id,
            eventType: log_entity_1.EventType.LOT_DELETE,
            detail: `Lot deleted: ${lotId}`,
            metadata: { lotId },
        });
    }
    async getLotById(lotId) {
        const lot = await this.lotRepository.findOne({
            where: { id: lotId, isActive: true, isBlocked: false },
            relations: ['seller', 'fruit', 'market'],
        });
        if (!lot) {
            throw new common_1.NotFoundException('Lot not found');
        }
        return lot;
    }
    async getLots(filterDto) {
        const { page = 1, limit = 20, ...filters } = filterDto;
        const query = this.lotRepository.createQueryBuilder('lot')
            .leftJoinAndSelect('lot.seller', 'seller')
            .leftJoinAndSelect('lot.fruit', 'fruit')
            .leftJoinAndSelect('lot.market', 'market')
            .where('lot.isActive = :isActive', { isActive: true })
            .andWhere('lot.isBlocked = :isBlocked', { isBlocked: false });
        if (filters.fruitId) {
            query.andWhere('lot.fruitId = :fruitId', { fruitId: filters.fruitId });
        }
        if (filters.marketId) {
            query.andWhere('lot.marketId = :marketId', { marketId: filters.marketId });
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
            .skip((page - 1) * limit)
            .take(limit)
            .getManyAndCount();
        return {
            lots,
            total,
            page,
            totalPages: Math.ceil(total / limit),
        };
    }
    async getMyLots(user, page = 1, limit = 20) {
        const [lots, total] = await this.lotRepository.findAndCount({
            where: { sellerId: user.id },
            relations: ['fruit', 'market'],
            order: { createdAt: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });
        return {
            lots,
            total,
            page,
            totalPages: Math.ceil(total / limit),
        };
    }
};
exports.LotsService = LotsService;
exports.LotsService = LotsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(lot_entity_1.Lot)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        log_service_1.LogService])
], LotsService);
//# sourceMappingURL=lots.service.js.map