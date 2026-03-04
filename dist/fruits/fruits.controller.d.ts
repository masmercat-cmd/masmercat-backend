import { Repository } from 'typeorm';
import { Fruit } from '../entities/fruit.entity';
export declare class FruitsController {
    private fruitsRepository;
    constructor(fruitsRepository: Repository<Fruit>);
    findAll(): Promise<Fruit[]>;
}
