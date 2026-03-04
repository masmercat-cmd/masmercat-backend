import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { LotsService, CreateLotDto, UpdateLotDto, FilterLotsDto } from './lots.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('lots')
export class LotsController {
  constructor(private lotsService: LotsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async createLot(@Body() createLotDto: CreateLotDto, @Req() req: any) {
    return this.lotsService.createLot(createLotDto, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async updateLot(
    @Param('id') id: string,
    @Body() updateLotDto: UpdateLotDto,
    @Req() req: any,
  ) {
    return this.lotsService.updateLot(id, updateLotDto, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteLot(@Param('id') id: string, @Req() req: any) {
    await this.lotsService.deleteLot(id, req.user);
    return { message: 'Lot deleted successfully' };
  }

  @Get()
  async getLots(@Query() filterDto: FilterLotsDto) {
    return this.lotsService.getLots(filterDto);
  }

  @Get('opportunities')
  async getOpportunities(@Query() filterDto: FilterLotsDto) {
    return this.lotsService.getLots({ ...filterDto, isOpportunity: true });
  }

  @Get(':id')
  async getLot(@Param('id') id: string) {
    return this.lotsService.getLotById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my/lots')
  async getMyLots(@Req() req: any, @Query('page') page?: number, @Query('limit') limit?: number) {
    return this.lotsService.getMyLots(req.user, page, limit);
  }
}
