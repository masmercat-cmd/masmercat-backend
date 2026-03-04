import { Lot } from './lot.entity';
export declare class Fruit {
    id: string;
    nameEs: string;
    nameEn: string;
    nameFr: string;
    nameDe: string;
    namePt: string;
    nameAr: string;
    nameZh: string;
    nameHi: string;
    scientificName: string;
    imageUrl: string;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
    lots: Lot[];
}
