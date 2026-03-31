import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ScraperService } from './scraper.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('scraper')
export class ScraperController {
  constructor(private scraperService: ScraperService) {}

  @Post('update-prices')
  async updatePrices() {
    await this.scraperService.updatePricesDaily();
    return { message: 'Price update completed' };
  }

  @Post('sync-reference-prices')
  async syncReferencePrices() {
    const result = await this.scraperService.syncReferencePrices();
    return {
      message: 'Reference prices synchronized',
      ...result,
    };
  }

  @Get('reference-debug')
  async getReferenceDebug(
    @Query('euProduct') euProduct?: string,
    @Query('euCountry') euCountry?: string,
    @Query('usdaCommodity') usdaCommodity?: string,
  ) {
    return this.scraperService.debugReferenceSources({
      euProduct,
      euCountry,
      usdaCommodity,
    });
  }

 
  @Post('generate-lots')
  async generateLots() {
    await this.scraperService.generateLotsFromPrices();
    return { message: 'Lots generated successfully' };
  }
}
