import { User } from './user.entity';
import { Fruit } from './fruit.entity';
import { Market } from './market.entity';
import { Message } from './message.entity';
export declare enum LotStatus {
    AVAILABLE = "available",
    RESERVED = "reserved",
    SOLD = "sold"
}
export declare enum UnitType {
    KG = "kg",
    BOX = "box"
}
export declare enum QualityGrade {
    EXTRA = "extra",
    FIRST = "first",
    SECOND = "second",
    INDUSTRIAL = "industrial"
}
export declare class Lot {
    id: string;
    seller: User;
    sellerId: string;
    fruit: Fruit;
    fruitId: string;
    market: Market;
    marketId: string;
    caliber: string;
    quality: QualityGrade;
    price: number;
    unitType: UnitType;
    weight: number;
    numberOfBoxes: number;
    photos: string[];
    status: LotStatus;
    isOpportunity: boolean;
    description: string;
    isActive: boolean;
    isBlocked: boolean;
    createdAt: Date;
    updatedAt: Date;
    messages: Message[];
}
