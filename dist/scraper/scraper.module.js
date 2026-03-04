"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScraperModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const schedule_1 = require("@nestjs/schedule");
const scraper_service_1 = require("./scraper.service");
const scraper_controller_1 = require("./scraper.controller");
const scraper_cron_1 = require("./scraper.cron");
const fruit_entity_1 = require("../entities/fruit.entity");
const market_entity_1 = require("../entities/market.entity");
const lot_entity_1 = require("../entities/lot.entity");
const user_entity_1 = require("../entities/user.entity");
let ScraperModule = class ScraperModule {
};
exports.ScraperModule = ScraperModule;
exports.ScraperModule = ScraperModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([fruit_entity_1.Fruit, market_entity_1.Market, lot_entity_1.Lot, user_entity_1.User]),
            schedule_1.ScheduleModule.forRoot(),
        ],
        controllers: [scraper_controller_1.ScraperController],
        providers: [scraper_service_1.ScraperService, scraper_cron_1.ScraperCron],
        exports: [scraper_service_1.ScraperService],
    })
], ScraperModule);
//# sourceMappingURL=scraper.module.js.map