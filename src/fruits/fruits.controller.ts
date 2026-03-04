import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Fruit } from '../entities/fruit.entity';

@Controller('fruits')
export class FruitsController {
  constructor(
    @InjectRepository(Fruit)
    private fruitsRepository: Repository<Fruit>,
  ) {}

  @Get()
  async findAll() {
    return this.fruitsRepository.find({ where: { active: true } });
  }
}