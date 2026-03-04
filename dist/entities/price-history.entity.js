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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriceHistory = void 0;
const typeorm_1 = require("typeorm");
const fruit_entity_1 = require("./fruit.entity");
const market_entity_1 = require("./market.entity");
let PriceHistory = class PriceHistory {
};
exports.PriceHistory = PriceHistory;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], PriceHistory.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => fruit_entity_1.Fruit),
    (0, typeorm_1.JoinColumn)({ name: 'fruitId' }),
    __metadata("design:type", fruit_entity_1.Fruit)
], PriceHistory.prototype, "fruit", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], PriceHistory.prototype, "fruitId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => market_entity_1.Market, market => market.priceHistories),
    (0, typeorm_1.JoinColumn)({ name: 'marketId' }),
    __metadata("design:type", market_entity_1.Market)
], PriceHistory.prototype, "market", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], PriceHistory.prototype, "marketId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", Number)
], PriceHistory.prototype, "price", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'date' }),
    __metadata("design:type", Date)
], PriceHistory.prototype, "date", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 20, nullable: true }),
    __metadata("design:type", String)
], PriceHistory.prototype, "unitType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], PriceHistory.prototype, "additionalData", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], PriceHistory.prototype, "createdAt", void 0);
exports.PriceHistory = PriceHistory = __decorate([
    (0, typeorm_1.Entity)('price_history'),
    (0, typeorm_1.Index)(['fruitId', 'marketId', 'date'])
], PriceHistory);
//# sourceMappingURL=price-history.entity.js.map