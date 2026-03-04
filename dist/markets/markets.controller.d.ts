import { Repository } from 'typeorm';
import { Market } from '../entities/market.entity';
export declare class MarketsController {
    private marketsRepository;
    constructor(marketsRepository: Repository<Market>);
    findAll(): Promise<Market[]>;
}
