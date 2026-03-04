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
exports.Lot = exports.QualityGrade = exports.UnitType = exports.LotStatus = void 0;
const typeorm_1 = require("typeorm");
const user_entity_1 = require("./user.entity");
const fruit_entity_1 = require("./fruit.entity");
const market_entity_1 = require("./market.entity");
const message_entity_1 = require("./message.entity");
var LotStatus;
(function (LotStatus) {
    LotStatus["AVAILABLE"] = "available";
    LotStatus["RESERVED"] = "reserved";
    LotStatus["SOLD"] = "sold";
})(LotStatus || (exports.LotStatus = LotStatus = {}));
var UnitType;
(function (UnitType) {
    UnitType["KG"] = "kg";
    UnitType["BOX"] = "box";
})(UnitType || (exports.UnitType = UnitType = {}));
var QualityGrade;
(function (QualityGrade) {
    QualityGrade["EXTRA"] = "extra";
    QualityGrade["FIRST"] = "first";
    QualityGrade["SECOND"] = "second";
    QualityGrade["INDUSTRIAL"] = "industrial";
})(QualityGrade || (exports.QualityGrade = QualityGrade = {}));
let Lot = class Lot {
};
exports.Lot = Lot;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Lot.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, user => user.lots),
    (0, typeorm_1.JoinColumn)({ name: 'sellerId' }),
    __metadata("design:type", user_entity_1.User)
], Lot.prototype, "seller", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Lot.prototype, "sellerId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => fruit_entity_1.Fruit, fruit => fruit.lots),
    (0, typeorm_1.JoinColumn)({ name: 'fruitId' }),
    __metadata("design:type", fruit_entity_1.Fruit)
], Lot.prototype, "fruit", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Lot.prototype, "fruitId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => market_entity_1.Market, market => market.lots),
    (0, typeorm_1.JoinColumn)({ name: 'marketId' }),
    __metadata("design:type", market_entity_1.Market)
], Lot.prototype, "market", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Lot.prototype, "marketId", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 100, nullable: true }),
    __metadata("design:type", String)
], Lot.prototype, "caliber", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: QualityGrade,
        default: QualityGrade.FIRST
    }),
    __metadata("design:type", String)
], Lot.prototype, "quality", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2 }),
    __metadata("design:type", Number)
], Lot.prototype, "price", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: UnitType,
        default: UnitType.KG
    }),
    __metadata("design:type", String)
], Lot.prototype, "unitType", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2, nullable: true }),
    __metadata("design:type", Number)
], Lot.prototype, "weight", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', nullable: true }),
    __metadata("design:type", Number)
], Lot.prototype, "numberOfBoxes", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', array: true, default: [] }),
    __metadata("design:type", Array)
], Lot.prototype, "photos", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: LotStatus,
        default: LotStatus.AVAILABLE
    }),
    __metadata("design:type", String)
], Lot.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Lot.prototype, "isOpportunity", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], Lot.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], Lot.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Lot.prototype, "isBlocked", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Lot.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], Lot.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => message_entity_1.Message, message => message.lot),
    __metadata("design:type", Array)
], Lot.prototype, "messages", void 0);
exports.Lot = Lot = __decorate([
    (0, typeorm_1.Entity)('lots')
], Lot);
//# sourceMappingURL=lot.entity.js.map