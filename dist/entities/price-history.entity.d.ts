import { Fruit } from './fruit.entity';
import { Market } from './market.entity';
export declare class PriceHistory {
    id: string;
    fruit: Fruit;
    fruitId: string;
    market: Market;
    marketId: string;
    price: number;
    date: Date;
    unitType: string;
    additionalData: any;
    createdAt: Date;
}
