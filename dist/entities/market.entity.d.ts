import { Lot } from './lot.entity';
import { PriceHistory } from './price-history.entity';
export declare class Market {
    id: string;
    name: string;
    country: string;
    city: string;
    continent: string;
    latitude: number;
    longitude: number;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
    lots: Lot[];
    priceHistories: PriceHistory[];
}
