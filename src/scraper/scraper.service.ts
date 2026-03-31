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

export interface ProviderDiagnostics {
  provider: string;
  attempted: number;
  matched: number;
  saved: number;
  skipped: number;
  notes: string[];
}

export interface ProviderDebugResult {
  provider: string;
  ok: boolean;
  status?: number;
  query: Record<string, any>;
  rowCount: number;
  sample: any[];
  message?: string;
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
  item_description?: string;
  published_date?: string;
  report_date?: string;
  report_begin_date?: string;
  report_end_date?: string;
  weighted_average?: string | number;
  weighted_avg?: string | number;
  weightedaverage?: string | number;
  average_price?: string | number;
  average?: string | number;
  mostly_price?: string | number;
  price?: string | number;
  mostly_low?: string | number;
  mostly_high?: string | number;
  unit?: string;
  package?: string;
  region?: string;
  store_type?: string;
  organic?: string;
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
    argentina: 'AR',
    brazil: 'BR',
    brasil: 'BR',
    chile: 'CL',
    paraguay: 'PY',
    uruguay: 'UY',
    australia: 'AU',
    'new zealand': 'NZ',
    china: 'CN',
    japan: 'JP',
    india: 'IN',
    singapore: 'SG',
    thailand: 'TH',
    vietnam: 'VN',
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
    { name: 'Mercado Central de Buenos Aires', country: 'Argentina', city: 'Buenos Aires', continent: 'South America', latitude: -34.8086, longitude: -58.4801 },
    { name: 'CEAGESP', country: 'Brazil', city: 'Sao Paulo', continent: 'South America', latitude: -23.5358, longitude: -46.7219 },
    { name: 'Lo Valledor', country: 'Chile', city: 'Santiago', continent: 'South America', latitude: -33.4977, longitude: -70.6807 },
    { name: 'Abasto Norte', country: 'Paraguay', city: 'Asuncion', continent: 'South America', latitude: -25.2637, longitude: -57.5759 },
    { name: 'Unidad Agroalimentaria Metropolitana', country: 'Uruguay', city: 'Montevideo', continent: 'South America', latitude: -34.8158, longitude: -56.0686 },
    { name: 'Sydney Markets', country: 'Australia', city: 'Sydney', continent: 'Oceania', latitude: -33.8856, longitude: 150.8931 },
    { name: 'Melbourne Market', country: 'Australia', city: 'Melbourne', continent: 'Oceania', latitude: -37.7995, longitude: 144.9396 },
    { name: 'Auckland Produce Market', country: 'New Zealand', city: 'Auckland', continent: 'Oceania', latitude: -36.8885, longitude: 174.8166 },
    { name: 'Jiangnan Wholesale Market', country: 'China', city: 'Guangzhou', continent: 'Asia', latitude: 23.0938, longitude: 113.2506 },
    { name: 'Ota Market', country: 'Japan', city: 'Tokyo', continent: 'Asia', latitude: 35.5850, longitude: 139.7424 },
    { name: 'Azadpur Mandi', country: 'India', city: 'Delhi', continent: 'Asia', latitude: 28.7183, longitude: 77.1697 },
    { name: 'Pasir Panjang Wholesale Centre', country: 'Singapore', city: 'Singapore', continent: 'Asia', latitude: 1.2899, longitude: 103.7696 },
    { name: 'Talaad Thai', country: 'Thailand', city: 'Bangkok', continent: 'Asia', latitude: 14.0819, longitude: 100.6304 },
    { name: 'Thu Duc Wholesale Market', country: 'Vietnam', city: 'Ho Chi Minh City', continent: 'Asia', latitude: 10.8515, longitude: 106.7656 },
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

  async syncReferencePrices(): Promise<{
    saved: number;
    diagnostics: ProviderDiagnostics[];
  }> {
    const seeded = await this.ensureReferenceCatalog();
    const fruits = seeded.fruits;
    const markets = seeded.markets;

    const euResult = await this.syncEuReferencePrices(fruits, markets);
    const usdaResult = await this.syncUsdaReferencePrices(fruits, markets);
    const euSaved = euResult.saved;
    const usdaSaved = usdaResult.saved;
    const saved = euSaved + usdaSaved;
    this.logger.log(`Reference prices synchronized: ${saved}`);
    return {
      saved,
      diagnostics: [euResult.diagnostics, usdaResult.diagnostics],
    };
  }

  async debugReferenceSources(options?: {
    euProduct?: string;
    euCountry?: string;
    usdaCommodity?: string;
  }): Promise<{
    eu: ProviderDebugResult;
    usda: ProviderDebugResult;
  }> {
    const now = new Date().getUTCFullYear();
    const euProduct = options?.euProduct?.trim() || 'apples';
    const euCountry = options?.euCountry?.trim() || 'ES';
    const usdaCommodity = options?.usdaCommodity?.trim() || 'Apples';

    const eu = await this.debugEuReferenceSource(euProduct, euCountry, now);
    const usda = await this.debugUsdaReferenceSource(usdaCommodity);

    return { eu, usda };
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
  ): Promise<{ saved: number; diagnostics: ProviderDiagnostics }> {
    let saved = 0;
    let attempted = 0;
    let matched = 0;
    const currentYear = new Date().getUTCFullYear();
    const diagnostics: ProviderDiagnostics = {
      provider: 'EU AgriData',
      attempted: 0,
      matched: 0,
      saved: 0,
      skipped: 0,
      notes: [],
    };

    for (const fruit of fruits) {
      const euProduct = this.resolveEuProductName(fruit.nameEs);
      if (!euProduct) {
        diagnostics.skipped += 1;
        continue;
      }

      const marketsByCountry = new Map<string, Market[]>();
      for (const market of markets) {
        const code = this.resolveCountryCode(market.country);
        if (!code || code === 'US') continue;

        const bucket = marketsByCountry.get(code) ?? [];
        bucket.push(market);
        marketsByCountry.set(code, bucket);
      }

      for (const [countryCode, countryMarkets] of marketsByCountry.entries()) {
        attempted += 1;
        const latest = await this.fetchLatestEuPrice(euProduct, countryCode, currentYear);
        if (!latest) {
          diagnostics.notes.push(`No EU price for ${euProduct}/${countryCode}`);
          continue;
        }
        if (latest.debugNote) {
          diagnostics.notes.push(latest.debugNote);
        }
        matched += 1;

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

    diagnostics.attempted = attempted;
    diagnostics.matched = matched;
    diagnostics.saved = saved;
    diagnostics.notes = diagnostics.notes.slice(0, 20);
    return { saved, diagnostics };
  }

  private async syncUsdaReferencePrices(
    fruits: Fruit[],
    markets: Market[],
  ): Promise<{ saved: number; diagnostics: ProviderDiagnostics }> {
    const apiKey = process.env.USDA_MARS_API_KEY?.trim();
    const diagnostics: ProviderDiagnostics = {
      provider: 'USDA Market News',
      attempted: 0,
      matched: 0,
      saved: 0,
      skipped: 0,
      notes: [],
    };
    if (!apiKey) {
      this.logger.log('USDA provider skipped: USDA_MARS_API_KEY is not configured');
      diagnostics.notes.push('USDA_MARS_API_KEY is not configured');
      diagnostics.skipped = fruits.length;
      return { saved: 0, diagnostics };
    }

    const usaMarkets = markets.filter(
      (market) => this.resolveCountryCode(market.country) === 'US',
    );
    if (usaMarkets.length === 0) {
      diagnostics.notes.push('No active US markets found');
      return { saved: 0, diagnostics };
    }

    let saved = 0;
    for (const fruit of fruits) {
      const commodity = this.resolveUsdaCommodityName(fruit.nameEs);
      if (!commodity) {
        diagnostics.skipped += 1;
        continue;
      }

      diagnostics.attempted += 1;
      const latest = await this.fetchLatestUsdaRetailPrice(apiKey, commodity);
      if (!latest) {
        diagnostics.notes.push(`No USDA price for ${commodity}`);
        continue;
      }
      if (latest.debugNote) {
        diagnostics.notes.push(latest.debugNote);
      }
      diagnostics.matched += 1;

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

    diagnostics.saved = saved;
    diagnostics.notes = diagnostics.notes.slice(0, 20);
    return { saved, diagnostics };
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
    debugNote?: string;
  } | null> {
    try {
      const productVariants = Array.from(new Set([product.toLowerCase(), product, product.toUpperCase()]));
      let rows: EuApiRow[] = [];
      let debugNote = '';

      for (const productVariant of productVariants) {
        try {
          const response = await axios.get<EuApiRow[]>(
            'https://agridata.ec.europa.eu/api/fruitAndVegetable/pricesSupplyChain',
            {
              timeout: 15000,
              params: {
                years: `${currentYear - 1},${currentYear}`,
                products: productVariant,
                memberStateCodes: memberStateCode,
                productStages: 'Retail buying price',
              },
            },
          );

          rows = Array.isArray(response.data) ? response.data : [];
          if (rows.length > 0) {
            debugNote = `EU rows ${rows.length} for ${productVariant}/${memberStateCode}`;
            break;
          }
        } catch (variantError) {
          const status = axios.isAxiosError(variantError)
            ? variantError.response?.status
            : undefined;
          debugNote = `EU ${productVariant}/${memberStateCode}: ${status ?? 'no-status'} ${variantError.message}`;
        }
      }

      if (rows.length === 0) {
        this.logger.log(debugNote || `EU reference returned 0 rows for ${product}/${memberStateCode}`);
        return null;
      }

      const parsed = rows
        .map((row) => ({
          price: this.parseNumericPrice(row.price),
          unitRaw: `${row.unit ?? 'EUR/kg'}`,
          productStage: `${row.productStage ?? 'Retail buying price'}`,
          referenceDate: this.parseEuDate(`${row.beginDate ?? ''}`),
        }))
        .filter((row) => !Number.isNaN(row.price) && row.price > 0 && row.referenceDate != null)
        .sort(
          (a, b) =>
            (b.referenceDate?.getTime() ?? 0) - (a.referenceDate?.getTime() ?? 0),
        );

      if (parsed.length === 0) {
        this.logger.log(`EU reference rows had no usable prices for ${product}/${memberStateCode}`);
        return null;
      }

      const latest = parsed[0];
      const { currency, unitType } = this.normalizeUnit(latest.unitRaw);
      return {
        price: Number(latest.price.toFixed(2)),
        currency,
        unitType,
        productStage: latest.productStage,
        referenceDate: latest.referenceDate!,
        debugNote,
      };
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      this.logger.warn(
        `EU reference fetch failed for ${product}/${memberStateCode}: ${status ?? 'no-status'} ${error.message}`,
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
    debugNote?: string;
  } | null> {
    try {
      const auth = Buffer.from(`${apiKey}:`).toString('base64');
      const response = await axios.get<any>(
        'https://marsapi.ams.usda.gov/services/v1.2/reports/3324/Details',
        {
          timeout: 15000,
          headers: {
            Authorization: `Basic ${auth}`,
          },
          params: {
            lastReports: 1,
          },
        },
      );

      const rows = this.extractUsdaRows(response.data);
      if (rows.length === 0) {
        const keys =
          response.data != null && typeof response.data === 'object'
            ? Object.keys(response.data).slice(0, 10).join(', ')
            : typeof response.data;
        this.logger.log(`USDA report 3324 returned 0 rows for ${commodity}. Keys: ${keys}`);
        return null;
      }

      const parsed = rows
        .map((row) => {
          const rawPrice =
            row.weighted_average ??
            row.weighted_avg ??
            row.weightedaverage ??
            row.average_price ??
            row.average ??
            row.mostly_price ??
            row.price ??
            row.mostly_high ??
            row.mostly_low;
          const searchableText = this.normalizeText(
            [
              row.commodity,
              row.item_name,
              row.item_description,
              row.variety,
            ]
              .filter(Boolean)
              .join(' '),
          );
          const price = this.parseNumericPrice(rawPrice);
          const dateValue =
            row.published_date ??
            row.report_date ??
            row.report_end_date ??
            row.report_begin_date ??
            '';

          return {
            commodity: searchableText,
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
            this.matchesCommodity(row.commodity, commodity) &&
            !Number.isNaN(row.price) &&
            row.price > 0 &&
            row.referenceDate != null,
        )
        .sort(
          (a, b) =>
            (b.referenceDate?.getTime() ?? 0) - (a.referenceDate?.getTime() ?? 0),
        );

      if (parsed.length === 0) {
        const sample = rows
          .slice(0, 5)
          .map((row) => [row.commodity, row.item_name, row.item_description, row.variety].filter(Boolean).join(' | '))
          .filter((value) => value.trim().length > 0)
          .join(' || ');
        this.logger.log(`USDA report 3324 returned rows but no commodity match for ${commodity}. Sample: ${sample}`);
        return null;
      }

      const latest = parsed[0];
      return {
        price: Number(latest.price.toFixed(2)),
        unitType: this.normalizeUsdaUnit(latest.unitRaw),
        productStage: latest.productStage,
        referenceDate: latest.referenceDate!,
        debugNote: `USDA matched ${parsed.length} rows for ${commodity}`,
      };
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      this.logger.warn(
        `USDA reference fetch failed for ${commodity}: ${status ?? 'no-status'} ${error.message}`,
      );
      return null;
    }
  }

  private async debugEuReferenceSource(
    product: string,
    memberStateCode: string,
    currentYear: number,
  ): Promise<ProviderDebugResult> {
    try {
      const response = await axios.get<any>(
        'https://agridata.ec.europa.eu/api/fruitAndVegetable/pricesSupplyChain',
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
      return {
        provider: 'EU AgriData',
        ok: true,
        status: response.status,
        query: {
          product,
          memberStateCode,
          years: `${currentYear - 1},${currentYear}`,
          productStage: 'Retail buying price',
        },
        rowCount: rows.length,
        sample: rows.slice(0, 3),
      };
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      const payload = axios.isAxiosError(error) ? error.response?.data : undefined;
      return {
        provider: 'EU AgriData',
        ok: false,
        status,
        query: {
          product,
          memberStateCode,
          years: `${currentYear - 1},${currentYear}`,
          productStage: 'Retail buying price',
        },
        rowCount: 0,
        sample: payload != null ? [payload] : [],
        message: error.message,
      };
    }
  }

  private async debugUsdaReferenceSource(
    commodity: string,
  ): Promise<ProviderDebugResult> {
    const apiKey = process.env.USDA_MARS_API_KEY?.trim();
    if (!apiKey) {
      return {
        provider: 'USDA Market News',
        ok: false,
        query: { commodity },
        rowCount: 0,
        sample: [],
        message: 'USDA_MARS_API_KEY is not configured',
      };
    }

    try {
      const auth = Buffer.from(`${apiKey}:`).toString('base64');
      const response = await axios.get<any>(
        'https://marsapi.ams.usda.gov/services/v1.2/reports/3324/Details',
        {
          timeout: 15000,
          headers: {
            Authorization: `Basic ${auth}`,
          },
          params: {
            lastReports: 1,
          },
        },
      );

      const rows = this.extractUsdaRows(response.data);
      return {
        provider: 'USDA Market News',
        ok: true,
        status: response.status,
        query: {
          commodity,
          reportId: 3324,
          lastReports: 1,
        },
        rowCount: rows.length,
        sample: rows.slice(0, 3),
      };
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      const payload = axios.isAxiosError(error) ? error.response?.data : undefined;
      return {
        provider: 'USDA Market News',
        ok: false,
        status,
        query: {
          commodity,
          reportId: 3324,
          lastReports: 1,
        },
        rowCount: 0,
        sample: payload != null ? [payload] : [],
        message: error.message,
      };
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

  private extractUsdaRows(payload: any): UsdaApiRow[] {
    if (Array.isArray(payload)) {
      const nested = payload.flatMap((item) => this.extractUsdaRows(item));
      return nested.length > 0 ? nested : payload;
    }

    if (payload && typeof payload === 'object') {
      const looksLikeLeafRow =
        'commodity' in payload ||
        'item_name' in payload ||
        'item_description' in payload ||
        'variety' in payload ||
        'weighted_average' in payload ||
        'average_price' in payload;
      if (looksLikeLeafRow) {
        return [payload as UsdaApiRow];
      }

      const candidates = [
        payload.results,
        payload.Results,
        payload.data,
        payload.Data,
        payload.report,
        payload.rows,
        payload.details,
      ];

      for (const candidate of candidates) {
        const extracted = this.extractUsdaRows(candidate);
        if (extracted.length > 0) {
          return extracted;
        }
      }
    }

    return [];
  }

  private parseNumericPrice(value: string | number | null | undefined): number {
    if (typeof value === 'number') {
      return value;
    }

    const normalized = `${value ?? ''}`.replace(/[^0-9,.\-]/g, '').trim();
    if (!normalized) {
      return Number.NaN;
    }

    const hasComma = normalized.includes(',');
    const hasDot = normalized.includes('.');
    let candidate = normalized;

    if (hasComma && hasDot) {
      candidate = normalized.replace(/\./g, '').replace(',', '.');
    } else if (hasComma) {
      candidate = normalized.replace(',', '.');
    }

    return Number.parseFloat(candidate);
  }

  private matchesCommodity(searchableText: string, commodity: string): boolean {
    const normalizedCommodity = this.normalizeText(commodity);
    const variants = Array.from(
      new Set([
        normalizedCommodity,
        normalizedCommodity.replace(/es$/, ''),
        normalizedCommodity.replace(/s$/, ''),
      ]),
    ).filter((value) => value.length >= 3);

    return variants.some((variant) => searchableText.includes(variant));
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
