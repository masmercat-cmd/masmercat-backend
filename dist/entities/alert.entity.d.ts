import { User } from './user.entity';
import { Fruit } from './fruit.entity';
import { Market } from './market.entity';
export declare class Alert {
    id: string;
    user: User;
    userId: string;
    fruit: Fruit;
    fruitId: string;
    market: Market;
    marketId: string;
    targetPrice: number;
    active: boolean;
    lastTriggered: Date;
    createdAt: Date;
    updatedAt: Date;
}
