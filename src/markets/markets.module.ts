import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Market } from '../entities/market.entity';
import { MarketsController } from './markets.controller';
import { MarketsService } from './markets.service';
import { PriceHistory } from '../entities/price-history.entity';
import { Lot } from '../entities/lot.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Market, PriceHistory, Lot])],
  controllers: [MarketsController],
  providers: [MarketsService],
  exports: [MarketsService],
})
export class MarketsModule {}
