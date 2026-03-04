import { Controller, Post, UseGuards } from '@nestjs/common';
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

 
  @Post('generate-lots')
  async generateLots() {
    await this.scraperService.generateLotsFromPrices();
    return { message: 'Lots generated successfully' };
  }
}