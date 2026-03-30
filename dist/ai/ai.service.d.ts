import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AiScanResult, User } from '../entities';
export declare class ChatMessageDto {
    message: string;
    language?: string;
}
export declare class TransportTariffDto {
    document: string;
    mimeType?: string;
    language?: string;
    origin?: string;
    destination?: string;
    palletCount?: number;
    palletType?: string;
}
export declare class AiService {
    private configService;
    private aiScanResultRepository;
    private userRepository;
    private openai;
    private logVisionSnapshot;
    private toNumber;
    private clamp;
    private normalizeEnvase;
    private normalizeProducto;
    private normalizeMeasure;
    private normalizeStringArray;
    private buildRouteOptions;
    private normalizePriceTiers;
    private resolvePricePerPallet;
    private extractPdfText;
    private finalizeTransportTariffResult;
    private buildImageHash;
    private mapSavedScanResult;
    private extractPatternSource;
    private buildPatternFeatures;
    private computePatternScore;
    private findPatternCorrection;
    private applyPatternCorrection;
    private findSavedCorrection;
    private estimateBoxes;
    private inferBoxWeightKg;
    private inferTarePerBoxKg;
    private inferPalletTareKg;
    private finalizeVisionResult;
    private refinePalletEstimate;
    saveScanResult(userId: string, payload: any): Promise<AiScanResult>;
    getLatestScanResult(userId: string): Promise<Record<string, any> | null>;
    deleteSavedScanResults(userId: string): Promise<number>;
    private systemPrompts;
    constructor(configService: ConfigService, aiScanResultRepository: Repository<AiScanResult>, userRepository: Repository<User>);
    chat(chatMessageDto: ChatMessageDto): Promise<string>;
    analyzeTransportTariff(tariffDto: TransportTariffDto): Promise<Record<string, any>>;
    analyzeFruitImage(base64Image: string, language?: string, options?: {
        imagePath?: string;
    }): Promise<any>;
}
