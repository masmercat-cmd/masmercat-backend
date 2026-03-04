import { ScraperService } from './scraper.service';
export declare class ScraperController {
    private scraperService;
    constructor(scraperService: ScraperService);
    updatePrices(): Promise<{
        message: string;
    }>;
    generateLots(): Promise<{
        message: string;
    }>;
}
