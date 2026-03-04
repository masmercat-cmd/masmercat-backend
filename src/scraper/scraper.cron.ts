import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScraperService } from './scraper.service';

@Injectable()
export class ScraperCron {
  private readonly logger = new Logger(ScraperCron.name);

  constructor(private scraperService: ScraperService) {}

  // Ejecuta cada día a las 6:00 AM
  @Cron('0 6 * * *')
  async updatePricesDaily() {
    this.logger.log('Running scheduled price update...');
    await this.scraperService.updatePricesDaily();
    this.logger.log('Scheduled price update completed');
  }
}