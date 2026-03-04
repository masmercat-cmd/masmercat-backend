import { LotsService, CreateLotDto, UpdateLotDto, FilterLotsDto } from './lots.service';
export declare class LotsController {
    private lotsService;
    constructor(lotsService: LotsService);
    createLot(createLotDto: CreateLotDto, req: any): Promise<import("../entities").Lot>;
    updateLot(id: string, updateLotDto: UpdateLotDto, req: any): Promise<import("../entities").Lot>;
    deleteLot(id: string, req: any): Promise<{
        message: string;
    }>;
    getLots(filterDto: FilterLotsDto): Promise<{
        lots: import("../entities").Lot[];
        total: number;
        page: number;
        totalPages: number;
    }>;
    getOpportunities(filterDto: FilterLotsDto): Promise<{
        lots: import("../entities").Lot[];
        total: number;
        page: number;
        totalPages: number;
    }>;
    getLot(id: string): Promise<import("../entities").Lot>;
    getMyLots(req: any, page?: number, limit?: number): Promise<{
        lots: import("../entities").Lot[];
        total: number;
        page: number;
        totalPages: number;
    }>;
}
