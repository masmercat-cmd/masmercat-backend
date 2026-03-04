"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const typeorm_1 = require("@nestjs/typeorm");
const throttler_1 = require("@nestjs/throttler");
const auth_module_1 = require("./auth/auth.module");
const fruits_module_1 = require("./fruits/fruits.module");
const markets_module_1 = require("./markets/markets.module");
const log_module_1 = require("./log/log.module");
const lots_module_1 = require("./lots/lots.module");
const messages_module_1 = require("./messages/messages.module");
const ai_module_1 = require("./ai/ai.module");
const scraper_module_1 = require("./scraper/scraper.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
            }),
            typeorm_1.TypeOrmModule.forRootAsync({
                imports: [config_1.ConfigModule],
                useFactory: (configService) => {
                    const dbType = configService.get('DB_TYPE') || 'sqlite';
                    const config = {
                        type: dbType,
                        database: dbType === 'postgres' ? configService.get('DATABASE_NAME') : configService.get('DB_DATABASE'),
                        entities: [__dirname + '/**/*.entity{.ts,.js}'],
                        synchronize: true,
                        logging: configService.get('NODE_ENV') === 'development',
                    };
                    if (dbType === 'postgres') {
                        config.host = configService.get('DATABASE_HOST');
                        config.port = parseInt(configService.get('DATABASE_PORT'));
                        config.username = configService.get('DATABASE_USER');
                        config.password = configService.get('DATABASE_PASSWORD');
                    }
                    return config;
                },
                inject: [config_1.ConfigService],
            }),
            throttler_1.ThrottlerModule.forRoot([{
                    ttl: 60000,
                    limit: 100,
                }]),
            auth_module_1.AuthModule,
            fruits_module_1.FruitsModule,
            markets_module_1.MarketsModule,
            log_module_1.LogModule,
            lots_module_1.LotsModule,
            messages_module_1.MessagesModule,
            ai_module_1.AiModule,
            scraper_module_1.ScraperModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map