import { Repository } from 'typeorm';
import { Message } from '../entities/message.entity';
import { Lot } from '../entities/lot.entity';
import { User } from '../entities/user.entity';
import { LogService } from '../log/log.service';
export declare class CreateMessageDto {
    lotId: string;
    message: string;
    requestCall?: boolean;
    requestVideo?: boolean;
}
export declare class MessagesService {
    private messageRepository;
    private lotRepository;
    private logService;
    constructor(messageRepository: Repository<Message>, lotRepository: Repository<Lot>, logService: LogService);
    createMessage(createMessageDto: CreateMessageDto, buyer: User): Promise<Message>;
    getMessagesForSeller(seller: User, page?: number, limit?: number): Promise<{
        messages: Message[];
        total: number;
        page: number;
        totalPages: number;
    }>;
    getMessagesForBuyer(buyer: User, page?: number, limit?: number): Promise<{
        messages: Message[];
        total: number;
        page: number;
        totalPages: number;
    }>;
    markAsRead(messageId: string, user: User): Promise<Message>;
    getAllMessages(page?: number, limit?: number): Promise<{
        messages: Message[];
        total: number;
        page: number;
        totalPages: number;
    }>;
}
