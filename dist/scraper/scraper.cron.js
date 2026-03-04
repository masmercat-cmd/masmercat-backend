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
var ScraperCron_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScraperCron = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const scraper_service_1 = require("./scraper.service");
let ScraperCron = ScraperCron_1 = class ScraperCron {
    constructor(scraperService) {
        this.scraperService = scraperService;
        this.logger = new common_1.Logger(ScraperCron_1.name);
    }
    async updatePricesDaily() {
        this.logger.log('Running scheduled price update...');
        await this.scraperService.updatePricesDaily();
        this.logger.log('Scheduled price update completed');
    }
};
exports.ScraperCron = ScraperCron;
__decorate([
    (0, schedule_1.Cron)('0 6 * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ScraperCron.prototype, "updatePricesDaily", null);
exports.ScraperCron = ScraperCron = ScraperCron_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [scraper_service_1.ScraperService])
], ScraperCron);
//# sourceMappingURL=scraper.cron.js.map