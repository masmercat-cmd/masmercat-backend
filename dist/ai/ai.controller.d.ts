import type { Request } from 'express';
import { AiService } from './ai.service';
export declare class AiController {
    private aiService;
    constructor(aiService: AiService);
    chat(req: Request, body: any): Promise<{
        ok: boolean;
        response: string;
        error?: undefined;
    } | {
        ok: boolean;
        error: any;
        response?: undefined;
    }>;
    analyzeFruit(req: Request, body: any): Promise<any>;
}
