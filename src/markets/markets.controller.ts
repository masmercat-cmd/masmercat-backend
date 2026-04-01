import { Controller, Get, Query } from '@nestjs/common';
import { MarketsService } from './markets.service';

@Controller('markets')
export class MarketsController {
  constructor(private readonly marketsService: MarketsService) {}

  @Get()
  async findAll() {
    return this.marketsService.findAll();
  }

  @Get('reference-prices')
  async getReferencePrices(
    @Query('query') query?: string,
    @Query('country') country?: string,
    @Query('region') region?: string,
    @Query('source') source?: string,
    @Query('marketId') marketId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.marketsService.getReferencePrices({
      query,
      country,
      region,
      source,
      marketId,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('map-reference-prices')
  async getMapReferencePrices(
    @Query('query') query?: string,
    @Query('region') region?: string,
    @Query('source') source?: string,
  ) {
    return this.marketsService.getMapReferencePrices({ query, region, source });
  }
}
