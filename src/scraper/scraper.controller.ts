import { Controller, ForbiddenException, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ScraperService } from './scraper.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserRole } from '../entities/user.entity';

@Controller('scraper')
export class ScraperController {
  constructor(private scraperService: ScraperService) {}

  private ensureAdmin(user: { role?: string } | undefined): void {
    if (user?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('update-prices')
  async updatePrices(@Req() req: any) {
    this.ensureAdmin(req.user);
    await this.scraperService.updatePricesDaily();
    return { message: 'Price update completed' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('sync-reference-prices')
  async syncReferencePrices(@Req() req: any) {
    this.ensureAdmin(req.user);
    const result = await this.scraperService.syncReferencePrices();
    return {
      message: 'Reference prices synchronized',
      ...result,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('reference-debug')
  async getReferenceDebug(
    @Req() req: any,
    @Query('euProduct') euProduct?: string,
    @Query('euCountry') euCountry?: string,
    @Query('usdaCommodity') usdaCommodity?: string,
  ) {
    this.ensureAdmin(req.user);
    return this.scraperService.debugReferenceSources({
      euProduct,
      euCountry,
      usdaCommodity,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('generate-lots')
  async generateLots(@Req() req: any) {
    this.ensureAdmin(req.user);
    await this.scraperService.generateLotsFromPrices();
    return { message: 'Lots generated successfully' };
  }
}
