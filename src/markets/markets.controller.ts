import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Market } from '../entities/market.entity';

@Controller('markets')
export class MarketsController {
  constructor(
    @InjectRepository(Market)
    private marketsRepository: Repository<Market>,
  ) {}

  @Get()
  async findAll() {
    return this.marketsRepository.find({ where: { active: true } });
  }
}