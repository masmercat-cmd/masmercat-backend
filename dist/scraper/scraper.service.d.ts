import { Repository } from 'typeorm';
import { Fruit } from '../entities/fruit.entity';
import { Market } from '../entities/market.entity';
import { Lot } from '../entities/lot.entity';
import { User } from '../entities/user.entity';
export declare class ScraperService {
    private fruitRepository;
    private marketRepository;
    private lotRepository;
    private userRepository;
    private readonly logger;
    constructor(fruitRepository: Repository<Fruit>, marketRepository: Repository<Market>, lotRepository: Repository<Lot>, userRepository: Repository<User>);
    scrapeMAPAPrices(): Promise<any>;
    generateLotsFromPrices(): Promise<void>;
    private getRandomCaliber;
    private getRandomQuality;
    updatePricesDaily(): Promise<void>;
}
