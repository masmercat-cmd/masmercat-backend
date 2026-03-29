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
    analyzeTransportTariff(req: Request, body: any): Promise<{
        ok: boolean;
        result: Record<string, any>;
        error?: undefined;
    } | {
        ok: boolean;
        error: any;
        result?: undefined;
    }>;
    saveScanChanges(req: Request, body: any): Promise<{
        ok: boolean;
        id: string;
        updatedAt: Date;
        error?: undefined;
    } | {
        ok: boolean;
        error: any;
        id?: undefined;
        updatedAt?: undefined;
    }>;
    getLatestSavedScan(req: Request): Promise<{
        ok: boolean;
        result: Record<string, any>;
        error?: undefined;
    } | {
        ok: boolean;
        error: any;
        result?: undefined;
    }>;
    deleteSavedScan(req: Request): Promise<{
        ok: boolean;
        deleted: number;
        error?: undefined;
    } | {
        ok: boolean;
        error: any;
        deleted?: undefined;
    }>;
}
