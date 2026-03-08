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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (configService: ConfigService) => {
    const databaseUrl = configService.get<string>('DATABASE_URL');

    if (databaseUrl) {
      return {
        type: 'postgres',
        url: databaseUrl,
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: true,
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
          ? configService.get('DATABASE_NAME')
          : 'masmercat.db',
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
  ],
})
export class AppModule {}