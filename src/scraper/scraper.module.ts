import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ScraperService } from './scraper.service';
import { ScraperController } from './scraper.controller';
import { ScraperCron } from './scraper.cron';
import { Fruit } from '../entities/fruit.entity';
import { Market } from '../entities/market.entity';
import { Lot } from '../entities/lot.entity';
import { User } from '../entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Fruit, Market, Lot, User]),
    ScheduleModule.forRoot(),
  ],
  controllers: [ScraperController],
  providers: [ScraperService, ScraperCron],
  exports: [ScraperService],
})
export class ScraperModule {}