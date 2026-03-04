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
exports.LotsController = void 0;
const common_1 = require("@nestjs/common");
const lots_service_1 = require("./lots.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
let LotsController = class LotsController {
    constructor(lotsService) {
        this.lotsService = lotsService;
    }
    async createLot(createLotDto, req) {
        return this.lotsService.createLot(createLotDto, req.user);
    }
    async updateLot(id, updateLotDto, req) {
        return this.lotsService.updateLot(id, updateLotDto, req.user);
    }
    async deleteLot(id, req) {
        await this.lotsService.deleteLot(id, req.user);
        return { message: 'Lot deleted successfully' };
    }
    async getLots(filterDto) {
        return this.lotsService.getLots(filterDto);
    }
    async getOpportunities(filterDto) {
        return this.lotsService.getLots({ ...filterDto, isOpportunity: true });
    }
    async getLot(id) {
        return this.lotsService.getLotById(id);
    }
    async getMyLots(req, page, limit) {
        return this.lotsService.getMyLots(req.user, page, limit);
    }
};
exports.LotsController = LotsController;
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [lots_service_1.CreateLotDto, Object]),
    __metadata("design:returntype", Promise)
], LotsController.prototype, "createLot", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Put)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, lots_service_1.UpdateLotDto, Object]),
    __metadata("design:returntype", Promise)
], LotsController.prototype, "updateLot", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], LotsController.prototype, "deleteLot", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [lots_service_1.FilterLotsDto]),
    __metadata("design:returntype", Promise)
], LotsController.prototype, "getLots", null);
__decorate([
    (0, common_1.Get)('opportunities'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [lots_service_1.FilterLotsDto]),
    __metadata("design:returntype", Promise)
], LotsController.prototype, "getOpportunities", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], LotsController.prototype, "getLot", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('my/lots'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Number]),
    __metadata("design:returntype", Promise)
], LotsController.prototype, "getMyLots", null);
exports.LotsController = LotsController = __decorate([
    (0, common_1.Controller)('lots'),
    __metadata("design:paramtypes", [lots_service_1.LotsService])
], LotsController);
//# sourceMappingURL=lots.controller.js.map