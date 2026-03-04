import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Fruit } from '../entities/fruit.entity';
import { FruitsController } from './fruits.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Fruit])],
  controllers: [FruitsController],
})
export class FruitsModule {}