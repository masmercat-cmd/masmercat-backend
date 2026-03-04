import { Lot } from './lot.entity';
import { Message } from './message.entity';
import { Alert } from './alert.entity';
export declare enum UserRole {
    ADMIN = "admin",
    SELLER = "seller",
    BUYER = "buyer"
}
export declare enum Language {
    ES = "es",
    EN = "en",
    FR = "fr",
    DE = "de",
    PT = "pt",
    AR = "ar",
    ZH = "zh",
    HI = "hi"
}
export declare class User {
    id: string;
    name: string;
    email: string;
    password: string;
    role: UserRole;
    country: string;
    language: Language;
    phone: string;
    company: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    lots: Lot[];
    sentMessages: Message[];
    receivedMessages: Message[];
    alerts: Alert[];
}
