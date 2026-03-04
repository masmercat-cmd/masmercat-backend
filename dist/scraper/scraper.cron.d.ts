import { ScraperService } from './scraper.service';
export declare class ScraperCron {
    private scraperService;
    private readonly logger;
    constructor(scraperService: ScraperService);
    updatePricesDaily(): Promise<void>;
}
