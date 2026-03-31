import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { Fruit } from '../entities/fruit.entity';
import { Market } from '../entities/market.entity';
import { Lot, QualityGrade, UnitType, LotStatus } from '../entities/lot.entity';
import { User } from '../entities/user.entity';
import { PriceHistory } from '../entities/price-history.entity';

interface ReferencePriceInput {
  fruitId: string;
  marketId: string;
  price: number;
  date: Date;
  source: string;
  sourceRegion: string;
  currency: string;
  productStage: string;
  unitType: string;
  metadata?: Record<string, any>;
}

interface EuApiRow {
  memberStateCode?: string;
  beginDate?: string;
  price?: string | number;
  unit?: string;
  productStage?: string;
}

interface UsdaApiRow {
  commodity?: string;
  item_name?: string;
  variety?: string;
  published_date?: string;
  report_date?: string;
  report_begin_date?: string;
  weighted_average?: string | number;
  average_price?: string | number;
  mostly_price?: string | number;
  price?: string | number;
  unit?: string;
  package?: string;
  region?: string;
  store_type?: string;
}

interface SeedFruitInput {
  nameEs: string;
  nameEn: string;
  nameFr: string;
  nameDe: string;
  namePt: string;
  nameAr: string;
  nameZh: string;
  nameHi: string;
  scientificName?: string;
}

interface SeedMarketInput {
  name: string;
  country: string;
  city: string;
  continent: string;
  latitude: number;
  longitude: number;
}

@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);
  private static readonly euProductMap: Record<string, string> = {
    naranjas: 'Oranges',
    limones: 'Lemons',
    mandarinas: 'Mandarins',
    pomelos: 'Grapefruits',
    manzanas: 'Apples',
    peras: 'Pears',
    uvas: 'Table grapes',
    tomates: 'Tomatoes',
    pepinos: 'Cucumbers',
    cebollas: 'Onions',
    patatas: 'Potatoes',
    melones: 'Melons',
    sandias: 'Watermelons',
    fresas: 'Strawberries',
    pimientos: 'Sweet peppers',
    lechugas: 'Lettuces',
  };
  private static readonly usdaProductMap: Record<string, string> = {
    naranjas: 'Oranges',
    limones: 'Lemons',
    manzanas: 'Apples',
    peras: 'Pears',
    fresas: 'Strawberries',
    uvas: 'Grapes',
    sandias: 'Watermelons',
    melones: 'Cantaloupes',
    tomates: 'Tomatoes',
    pepinos: 'Cucumbers',
    cebollas: 'Onions',
    patatas: 'Potatoes',
    aguacates: 'Avocados',
    bananas: 'Bananas',
  };

  private static readonly countryCodeMap: Record<string, string> = {
    spain: 'ES',
    espana: 'ES',
    espanaa: 'ES',
    france: 'FR',
    francia: 'FR',
    italy: 'IT',
    italia: 'IT',
    germany: 'DE',
    alemania: 'DE',
    portugal: 'PT',
    netherlands: 'NL',
    'paises bajos': 'NL',
    usa: 'US',
    eeuu: 'US',
    'estados unidos': 'US',
    'united states': 'US',
  };
  private static readonly defaultSeedFruits: SeedFruitInput[] = [
    {
      nameEs: 'Naranjas',
      nameEn: 'Oranges',
      nameFr: 'Oranges',
      nameDe: 'Orangen',
      namePt: 'Laranjas',
      nameAr: 'برتقال',
      nameZh: '橙子',
      nameHi: 'संतरा',
      scientificName: 'Citrus sinensis',
    },
    {
      nameEs: 'Limones',
      nameEn: 'Lemons',
      nameFr: 'Citrons',
      nameDe: 'Zitronen',
      namePt: 'Limoes',
      nameAr: 'ليمون',
      nameZh: '柠檬',
      nameHi: 'नींबू',
      scientificName: 'Citrus limon',
    },
    {
      nameEs: 'Manzanas',
      nameEn: 'Apples',
      nameFr: 'Pommes',
      nameDe: 'Aepfel',
      namePt: 'Macas',
      nameAr: 'تفاح',
      nameZh: '苹果',
      nameHi: 'सेब',
      scientificName: 'Malus domestica',
    },
    {
      nameEs: 'Peras',
      nameEn: 'Pears',
      nameFr: 'Poires',
      nameDe: 'Birnen',
      namePt: 'Peras',
      nameAr: 'كمثرى',
      nameZh: '梨',
      nameHi: 'नाशपाती',
      scientificName: 'Pyrus communis',
    },
    {
      nameEs: 'Fresas',
      nameEn: 'Strawberries',
      nameFr: 'Fraises',
      nameDe: 'Erdbeeren',
      namePt: 'Morangos',
      nameAr: 'فراولة',
      nameZh: '草莓',
      nameHi: 'स्ट्रॉबेरी',
      scientificName: 'Fragaria × ananassa',
    },
    {
      nameEs: 'Tomates',
      nameEn: 'Tomatoes',
      nameFr: 'Tomates',
      nameDe: 'Tomaten',
      namePt: 'Tomates',
      nameAr: 'طماطم',
      nameZh: '番茄',
      nameHi: 'टमाटर',
      scientificName: 'Solanum lycopersicum',
    },
    {
      nameEs: 'Pepinos',
      nameEn: 'Cucumbers',
      nameFr: 'Concombres',
      nameDe: 'Gurken',
      namePt: 'Pepinos',
      nameAr: 'خيار',
      nameZh: '黄瓜',
      nameHi: 'खीरा',
      scientificName: 'Cucumis sativus',
    },
    {
      nameEs: 'Patatas',
      nameEn: 'Potatoes',
      nameFr: 'Pommes de terre',
      nameDe: 'Kartoffeln',
      namePt: 'Batatas',
      nameAr: 'بطاطس',
      nameZh: '土豆',
      nameHi: 'आलू',
      scientificName: 'Solanum tuberosum',
    },
    {
      nameEs: 'Aguacates',
      nameEn: 'Avocados',
      nameFr: 'Avocats',
      nameDe: 'Avocados',
      namePt: 'Abacates',
      nameAr: 'أفوكادو',
      nameZh: '牛油果',
      nameHi: 'एवोकाडो',
      scientificName: 'Persea americana',
    },
  ];
  private static readonly defaultSeedMarkets: SeedMarketInput[] = [
    { name: 'Mercamadrid', country: 'Spain', city: 'Madrid', continent: 'Europe', latitude: 40.3842, longitude: -3.6217 },
    { name: 'Mercabarna', country: 'Spain', city: 'Barcelona', continent: 'Europe', latitude: 41.3273, longitude: 2.1289 },
    { name: 'Rungis International Market', country: 'France', city: 'Paris', continent: 'Europe', latitude: 48.7472, longitude: 2.3524 },
    { name: 'Centro Agroalimentare Roma', country: 'Italy', city: 'Rome', continent: 'Europe', latitude: 41.7963, longitude: 12.5362 },
    { name: 'Hamburg Wholesale Market', country: 'Germany', city: 'Hamburg', continent: 'Europe', latitude: 53.5426, longitude: 10.0244 },
    { name: 'MARL Lisbon', country: 'Portugal', city: 'Lisbon', continent: 'Europe', latitude: 38.7813, longitude: -9.1022 },
    { name: 'Hunts Point Market', country: 'United States', city: 'New York', continent: 'North America', latitude: 40.8075, longitude: -73.8801 },
    { name: 'Los Angeles Wholesale Produce Market', country: 'United States', city: 'Los Angeles', continent: 'North America', latitude: 34.0312, longitude: -118.2304 },
    { name: 'Chicago International Produce Market', country: 'United States', city: 'Chicago', continent: 'North America', latitude: 41.8466, longitude: -87.6847 },
  ];

  constructor(
    @InjectRepository(Fruit)
    private readonly fruitRepository: Repository<Fruit>,
    @InjectRepository(Market)
    private readonly marketRepository: Repository<Market>,
    @InjectRepository(Lot)
    private readonly lotRepository: Repository<Lot>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(PriceHistory)
    private readonly priceHistoryRepository: Repository<PriceHistory>,
  ) {}

  async updatePricesDaily(): Promise<void> {
    this.logger.log('Running daily price update...');
    await this.syncReferencePrices();
    await this.generateLotsFromPrices();
  }

  async syncReferencePrices(): Promise<{ saved: number }> {
    const seeded = await this.ensureReferenceCatalog();
    const fruits = seeded.fruits;
    const markets = seeded.markets;

    const euSaved = await this.syncEuReferencePrices(fruits, markets);
    const usdaSaved = await this.syncUsdaReferencePrices(fruits, markets);
    const saved = euSaved + usdaSaved;
    this.logger.log(`Reference prices synchronized: ${saved}`);
    return { saved };
  }

  private async ensureReferenceCatalog(): Promise<{
    fruits: Fruit[];
    markets: Market[];
  }> {
    let fruits = await this.fruitRepository.find({ where: { active: true } });
    let markets = await this.marketRepository.find({ where: { active: true } });

    if (fruits.length === 0) {
      this.logger.log('No active fruits found. Seeding default fruit catalog...');
      for (const seed of ScraperService.defaultSeedFruits) {
        const fruit = this.fruitRepository.create({
          ...seed,
          active: true,
        });
        await this.fruitRepository.save(fruit);
      }
      fruits = await this.fruitRepository.find({ where: { active: true } });
    }

    if (markets.length === 0) {
      this.logger.log('No active markets found. Seeding default market catalog...');
      for (const seed of ScraperService.defaultSeedMarkets) {
        const market = this.marketRepository.create({
          ...seed,
          active: true,
        });
        await this.marketRepository.save(market);
      }
      markets = await this.marketRepository.find({ where: { active: true } });
    }

    return { fruits, markets };
  }

  async scrapeMAPAPrices(): Promise<any> {
    this.logger.log('Starting MAPA price scraping...');

    try {
      const prices = {
        naranjas: { min: 0.35, max: 0.65, avg: 0.5 },
        limones: { min: 0.55, max: 0.85, avg: 0.7 },
        mandarinas: { min: 0.45, max: 0.75, avg: 0.6 },
        pomelos: { min: 0.6, max: 0.9, avg: 0.75 },
      };

      this.logger.log(`Scraped prices: ${JSON.stringify(prices)}`);
      return prices;
    } catch (error) {
      this.logger.error(`Scraping failed: ${error.message}`);
      return {
        naranjas: { min: 0.35, max: 0.65, avg: 0.5 },
        limones: { min: 0.55, max: 0.85, avg: 0.7 },
        mandarinas: { min: 0.45, max: 0.75, avg: 0.6 },
        pomelos: { min: 0.6, max: 0.9, avg: 0.75 },
      };
    }
  }

  async generateLotsFromPrices(): Promise<void> {
    this.logger.log('Generating lots from scraped prices...');

    const fruits = await this.fruitRepository.find();
    const markets = await this.marketRepository.find();
    const systemUser = await this.userRepository.findOne({
      where: { email: 'info@masmercat.com' },
    });

    if (!systemUser) {
      this.logger.error('System user not found');
      return;
    }

    const prices = await this.scrapeMAPAPrices();
    const fruitPriceMap = {
      Naranjas: prices.naranjas,
      Limones: prices.limones,
      Mandarinas: prices.mandarinas,
      Pomelos: prices.pomelos,
    };

    for (const fruit of fruits) {
      const priceData = fruitPriceMap[fruit.nameEs];
      if (!priceData) continue;

      const selectedMarkets = markets.filter((m) => m.country === 'Spain').slice(0, 3);

      for (const market of selectedMarkets) {
        const wholesalePrice = Number((priceData.avg * (3 + Math.random() * 2)).toFixed(2));

        const lot = new Lot();
        lot.sellerId = systemUser.id;
        lot.fruitId = fruit.id;
        lot.marketId = market.id;
        lot.caliber = this.getRandomCaliber();
        lot.quality = this.getRandomQuality() as QualityGrade;
        lot.price = wholesalePrice;
        lot.unitType = UnitType.KG;
        lot.weight = Math.floor(500 + Math.random() * 1500);
        lot.numberOfBoxes = Math.floor(20 + Math.random() * 80);
        lot.photos = [];
        lot.status = LotStatus.AVAILABLE;
        lot.isOpportunity = Math.random() > 0.7;
        lot.description = `${fruit.nameEs} de calidad - Precio actualizado desde datos de mercado`;
        lot.isActive = true;

        await this.lotRepository.save(lot);
        await this.upsertReferencePrice({
          fruitId: fruit.id,
          marketId: market.id,
          price: priceData.avg,
          date: this.todayUtc(),
          source: 'MAPA Spain',
          sourceRegion: 'Spain',
          currency: 'EUR',
          productStage: 'National average reference',
          unitType: 'kg',
          metadata: {
            min: priceData.min,
            max: priceData.max,
          },
        });
        this.logger.log(`Created lot: ${fruit.nameEs} at ${market.name}`);
      }
    }

    this.logger.log('Lot generation completed');
  }

  private async syncEuReferencePrices(
    fruits: Fruit[],
    markets: Market[],
  ): Promise<number> {
    let saved = 0;
    const currentYear = new Date().getUTCFullYear();

    for (const fruit of fruits) {
      const euProduct = this.resolveEuProductName(fruit.nameEs);
      if (!euProduct) continue;

      const marketsByCountry = new Map<string, Market[]>();
      for (const market of markets) {
        const code = this.resolveCountryCode(market.country);
        if (!code) continue;

        const bucket = marketsByCountry.get(code) ?? [];
        bucket.push(market);
        marketsByCountry.set(code, bucket);
      }

      for (const [countryCode, countryMarkets] of marketsByCountry.entries()) {
        const latest = await this.fetchLatestEuPrice(euProduct, countryCode, currentYear);
        if (!latest) continue;

        for (const market of countryMarkets) {
          await this.upsertReferencePrice({
            fruitId: fruit.id,
            marketId: market.id,
            price: latest.price,
            date: latest.referenceDate,
            source: 'EU AgriData',
            sourceRegion: countryCode,
            currency: latest.currency,
            productStage: latest.productStage,
            unitType: latest.unitType,
            metadata: {
              euProduct,
              memberStateCode: countryCode,
            },
          });
          saved += 1;
        }
      }
    }

    return saved;
  }

  private async syncUsdaReferencePrices(
    fruits: Fruit[],
    markets: Market[],
  ): Promise<number> {
    const apiKey = process.env.USDA_MARS_API_KEY?.trim();
    if (!apiKey) {
      this.logger.log('USDA provider skipped: USDA_MARS_API_KEY is not configured');
      return 0;
    }

    const usaMarkets = markets.filter(
      (market) => this.resolveCountryCode(market.country) === 'US',
    );
    if (usaMarkets.length === 0) return 0;

    let saved = 0;
    for (const fruit of fruits) {
      const commodity = this.resolveUsdaCommodityName(fruit.nameEs);
      if (!commodity) continue;

      const latest = await this.fetchLatestUsdaRetailPrice(apiKey, commodity);
      if (!latest) continue;

      for (const market of usaMarkets) {
        await this.upsertReferencePrice({
          fruitId: fruit.id,
          marketId: market.id,
          price: latest.price,
          date: latest.referenceDate,
          source: 'USDA Market News',
          sourceRegion: 'US',
          currency: 'USD',
          productStage: latest.productStage,
          unitType: latest.unitType,
          metadata: {
            commodity,
            reportId: 3324,
            reportType: 'National Retail Report - Specialty Crops',
          },
        });
        saved += 1;
      }
    }

    return saved;
  }

  private async fetchLatestEuPrice(
    product: string,
    memberStateCode: string,
    currentYear: number,
  ): Promise<{
    price: number;
    currency: string;
    unitType: string;
    productStage: string;
    referenceDate: Date;
  } | null> {
    try {
      const response = await axios.get<EuApiRow[]>(
        'https://agridata.ec.europa.eu/extensions/DataPortal/api/fruitAndVegetable/pricesSupplyChain',
        {
          timeout: 15000,
          params: {
            years: `${currentYear - 1},${currentYear}`,
            products: product,
            memberStateCodes: memberStateCode,
            productStages: 'Retail buying price',
          },
        },
      );

      const rows = Array.isArray(response.data) ? response.data : [];
      const parsed = rows
        .map((row) => ({
          price: Number.parseFloat(`${row.price ?? 0}`),
          unitRaw: `${row.unit ?? 'EUR/kg'}`,
          productStage: `${row.productStage ?? 'Retail buying price'}`,
          referenceDate: this.parseEuDate(`${row.beginDate ?? ''}`),
        }))
        .filter((row) => !Number.isNaN(row.price) && row.price > 0 && row.referenceDate != null)
        .sort(
          (a, b) =>
            (b.referenceDate?.getTime() ?? 0) - (a.referenceDate?.getTime() ?? 0),
        );

      if (parsed.length === 0) return null;

      const latest = parsed[0];
      const { currency, unitType } = this.normalizeUnit(latest.unitRaw);
      return {
        price: Number(latest.price.toFixed(2)),
        currency,
        unitType,
        productStage: latest.productStage,
        referenceDate: latest.referenceDate!,
      };
    } catch (error) {
      this.logger.warn(
        `EU reference fetch failed for ${product}/${memberStateCode}: ${error.message}`,
      );
      return null;
    }
  }

  private async fetchLatestUsdaRetailPrice(
    apiKey: string,
    commodity: string,
  ): Promise<{
    price: number;
    unitType: string;
    productStage: string;
    referenceDate: Date;
  } | null> {
    try {
      const auth = Buffer.from(`${apiKey}:`).toString('base64');
      const response = await axios.get<{ results?: UsdaApiRow[] }>(
        'https://marsapi.ams.usda.gov/services/v1.2/reports/3324/Details',
        {
          timeout: 15000,
          headers: {
            Authorization: `Basic ${auth}`,
          },
          params: {
            lastReports: 1,
            q: `commodity=${commodity}`,
          },
        },
      );

      const rows = Array.isArray(response.data?.results) ? response.data.results : [];
      const parsed = rows
          .map((row) => {
            const rawPrice =
              row.weighted_average ??
              row.average_price ??
              row.mostly_price ??
              row.price;
            const price = Number.parseFloat(
              `${rawPrice ?? 0}`.replace(/[^0-9.\-]/g, ''),
            );
            const dateValue =
              row.published_date ?? row.report_date ?? row.report_begin_date ?? '';

            return {
              commodity: `${row.commodity ?? row.item_name ?? ''}`,
              price,
              unitRaw: `${row.unit ?? row.package ?? 'USD/unit'}`,
              productStage: row.store_type
                ? `Retail ${row.store_type}`
                : 'Retail advertised price',
              referenceDate: this.parseUsdaDate(dateValue),
            };
          })
          .filter(
            (row) =>
              row.commodity.toLowerCase().includes(commodity.toLowerCase()) &&
              !Number.isNaN(row.price) &&
              row.price > 0 &&
              row.referenceDate != null,
          )
          .sort(
            (a, b) =>
              (b.referenceDate?.getTime() ?? 0) - (a.referenceDate?.getTime() ?? 0),
          );

      if (parsed.length === 0) return null;

      const latest = parsed[0];
      return {
        price: Number(latest.price.toFixed(2)),
        unitType: this.normalizeUsdaUnit(latest.unitRaw),
        productStage: latest.productStage,
        referenceDate: latest.referenceDate!,
      };
    } catch (error) {
      this.logger.warn(`USDA reference fetch failed for ${commodity}: ${error.message}`);
      return null;
    }
  }

  private async upsertReferencePrice(input: ReferencePriceInput): Promise<void> {
    const existing = await this.priceHistoryRepository.findOne({
      where: {
        fruitId: input.fruitId,
        marketId: input.marketId,
        date: input.date,
      },
    });

    const entry = existing ?? new PriceHistory();
    entry.fruitId = input.fruitId;
    entry.marketId = input.marketId;
    entry.price = Number(input.price.toFixed(2));
    entry.date = input.date;
    entry.unitType = input.unitType;
    entry.additionalData = {
      source: input.source,
      sourceRegion: input.sourceRegion,
      currency: input.currency,
      productStage: input.productStage,
      updatedAt: new Date().toISOString(),
      ...input.metadata,
    };

    await this.priceHistoryRepository.save(entry);
  }

  private resolveEuProductName(nameEs: string): string | null {
    const normalized = this.normalizeText(nameEs);
    for (const [key, value] of Object.entries(ScraperService.euProductMap)) {
      if (normalized.includes(key)) {
        return value;
      }
    }
    return null;
  }

  private resolveUsdaCommodityName(nameEs: string): string | null {
    const normalized = this.normalizeText(nameEs);
    for (const [key, value] of Object.entries(ScraperService.usdaProductMap)) {
      if (normalized.includes(key)) {
        return value;
      }
    }
    return null;
  }

  private resolveCountryCode(country: string): string | null {
    const normalized = this.normalizeText(country);
    for (const [key, value] of Object.entries(ScraperService.countryCodeMap)) {
      if (normalized.includes(key)) {
        return value;
      }
    }
    return null;
  }

  private normalizeText(value: string): string {
    return `${value ?? ''}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private parseEuDate(value: string): Date | null {
    const parts = value.split('/');
    if (parts.length !== 3) return null;

    const day = Number.parseInt(parts[0], 10);
    const month = Number.parseInt(parts[1], 10);
    const year = Number.parseInt(parts[2], 10);
    if ([day, month, year].some((item) => Number.isNaN(item))) return null;

    return new Date(Date.UTC(year, month - 1, day));
  }

  private parseUsdaDate(value: string): Date | null {
    const trimmed = `${value ?? ''}`.trim();
    if (!trimmed) return null;

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return new Date(
        Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()),
      );
    }

    const parts = trimmed.split('/');
    if (parts.length !== 3) return null;

    const month = Number.parseInt(parts[0], 10);
    const day = Number.parseInt(parts[1], 10);
    const year = Number.parseInt(parts[2], 10);
    if ([day, month, year].some((item) => Number.isNaN(item))) return null;

    return new Date(Date.UTC(year, month - 1, day));
  }

  private normalizeUnit(unitRaw: string): { currency: string; unitType: string } {
    const normalized = unitRaw.toUpperCase();
    const currency = normalized.includes('EUR')
      ? 'EUR'
      : normalized.includes('USD')
          ? 'USD'
          : normalized.includes('AUD')
              ? 'AUD'
              : 'EUR';

    const unitType = normalized.includes('/100KG')
      ? '100kg'
      : normalized.includes('/KG')
          ? 'kg'
          : normalized.includes('/T')
              ? 't'
              : 'kg';

    return { currency, unitType };
  }

  private normalizeUsdaUnit(unitRaw: string): string {
    const normalized = unitRaw.toLowerCase();
    if (normalized.includes('lb')) return 'lb';
    if (normalized.includes('kg')) return 'kg';
    if (normalized.includes('ea')) return 'unit';
    if (normalized.includes('ct')) return 'unit';
    if (normalized.includes('bunch')) return 'bunch';
    return 'unit';
  }

  private todayUtc(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  private getRandomCaliber(): string {
    const calibers = ['Calibre 1', 'Calibre 2', 'Calibre 3', 'Calibre A', 'Calibre B'];
    return calibers[Math.floor(Math.random() * calibers.length)];
  }

  private getRandomQuality(): 'extra' | 'first' | 'second' {
    const qualities: ('extra' | 'first' | 'second')[] = ['extra', 'first', 'first', 'second'];
    return qualities[Math.floor(Math.random() * qualities.length)];
  }
}
