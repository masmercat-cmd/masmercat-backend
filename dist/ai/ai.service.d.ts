import { ConfigService } from '@nestjs/config';
export declare class ChatMessageDto {
    message: string;
    language?: string;
}
export declare class AiService {
    private configService;
    private openai;
    private systemPrompts;
    constructor(configService: ConfigService);
    chat(chatMessageDto: ChatMessageDto): Promise<string>;
    analyzeFruitImage(base64Image: string, language?: string): Promise<any>;
}
