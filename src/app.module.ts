import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { FruitsModule } from './fruits/fruits.module';
import { MarketsModule } from './markets/markets.module';
import { LogModule } from './log/log.module';
import { LotsModule } from './lots/lots.module';
import { MessagesModule } from './messages/messages.module';
import { AiModule } from './ai/ai.module';
import { ScraperModule } from './scraper/scraper.module';
import { AdminModule } from './admin/admin.module';
import { UploadModule } from './upload/upload.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (configService: ConfigService) => {
    const databaseUrl = configService.get<string>('DATABASE_URL');
    const isProduction = configService.get<string>('NODE_ENV') === 'production';
    const synchronize =
      configService.get<string>('TYPEORM_SYNCHRONIZE') === 'true' && !isProduction;

    if (databaseUrl) {
      return {
        type: 'postgres',
        url: databaseUrl,
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize,
        ssl: {
          rejectUnauthorized: false,
        },
      };
    }

    const dbType = configService.get('DB_TYPE') || 'sqlite';

    const config: any = {
      type: dbType,
      database:
        dbType === 'postgres'
          ? configService.get('DATABASE_NAME') || configService.get('DB_NAME')
          : 'masmercat.db',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize,
      logging: configService.get('NODE_ENV') === 'development',
    };

    if (dbType === 'postgres') {
      config.host = configService.get('DATABASE_HOST') || configService.get('DB_HOST');
      config.port = parseInt(
        configService.get('DATABASE_PORT') || configService.get('DB_PORT'),
        10,
      );
      config.username =
        configService.get('DATABASE_USER') || configService.get('DB_USERNAME');
      config.password =
        configService.get('DATABASE_PASSWORD') || configService.get('DB_PASSWORD');
    }

    return config;
  },
  inject: [ConfigService],
}),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    AuthModule,
    FruitsModule,
    MarketsModule,
    LogModule,
    LotsModule,
    MessagesModule,
    AiModule,
    ScraperModule,
    AdminModule,
    UploadModule,
  ],
})
export class AppModule {}
