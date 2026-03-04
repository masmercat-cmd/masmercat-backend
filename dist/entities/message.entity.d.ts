import { User } from './user.entity';
import { Lot } from './lot.entity';
export declare enum MessageStatus {
    UNREAD = "unread",
    READ = "read",
    REPLIED = "replied"
}
export declare class Message {
    id: string;
    lot: Lot;
    lotId: string;
    buyer: User;
    buyerId: string;
    seller: User;
    sellerId: string;
    message: string;
    requestCall: boolean;
    requestVideo: boolean;
    status: MessageStatus;
    createdAt: Date;
    updatedAt: Date;
}
