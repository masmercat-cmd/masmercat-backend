import { MessagesService, CreateMessageDto } from './messages.service';
export declare class MessagesController {
    private messagesService;
    constructor(messagesService: MessagesService);
    createMessage(createMessageDto: CreateMessageDto, req: any): Promise<import("../entities").Message>;
    getReceivedMessages(req: any, page?: number, limit?: number): Promise<{
        messages: import("../entities").Message[];
        total: number;
        page: number;
        totalPages: number;
    }>;
    getSentMessages(req: any, page?: number, limit?: number): Promise<{
        messages: import("../entities").Message[];
        total: number;
        page: number;
        totalPages: number;
    }>;
    markAsRead(id: string, req: any): Promise<import("../entities").Message>;
}
