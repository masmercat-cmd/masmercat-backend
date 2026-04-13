import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { Repository } from 'typeorm';
import { Market } from '../entities/market.entity';
import { PriceHistory } from '../entities/price-history.entity';
import { Lot } from '../entities/lot.entity';

interface ReferencePriceFilters {
  query?: string;
  products?: string;
  country?: string;
  region?: string;
  source?: string;
  marketId?: string;
  limit?: number;
}

@Injectable()
export class MarketsService {
  private static readonly euBaseUrls = [
    'https://agridata.ec.europa.eu',
    'https://acceptance.agridata.ec.europa.eu',
  ];

  private static readonly countryAliases: Record<string, string> = {
    spain: 'es',
    espana: 'es',
    france: 'fr',
    francia: 'fr',
    italy: 'it',
    italia: 'it',
    germany: 'de',
    alemania: 'de',
    portugal: 'pt',
    netherlands: 'nl',
    'paises bajos': 'nl',
    argentina: 'ar',
    brazil: 'br',
    brasil: 'br',
    chile: 'cl',
    paraguay: 'py',
    uruguay: 'uy',
    australia: 'au',
    'new zealand': 'nz',
    china: 'cn',
    india: 'in',
    japan: 'jp',
    singapore: 'sg',
    thailand: 'th',
    vietnam: 'vn',
    morocco: 'ma',
    marruecos: 'ma',
    egypt: 'eg',
    egipto: 'eg',
    algeria: 'dz',
    argelia: 'dz',
    tunisia: 'tn',
    tunez: 'tn',
    'saudi arabia': 'sa',
    'arabia saudi': 'sa',
    'united arab emirates': 'ae',
    emiratos: 'ae',
    qatar: 'qa',
    kuwait: 'kw',
    jordan: 'jo',
    jordania: 'jo',
    lebanon: 'lb',
    libano: 'lb',
    canada: 'ca',
    mexico: 'mx',
    'united states': 'us',
    usa: 'us',
    eeuu: 'us',
    russia: 'ru',
    rusia: 'ru',
  };
  private static readonly regionCountryMap: Record<string, string[]> = {
    eu: ['es', 'fr', 'it', 'de', 'pt', 'nl'],
    mercosur: ['ar', 'br', 'cl', 'py', 'uy'],
    australia: ['au', 'nz'],
    asia: ['cn', 'in', 'jp', 'sg', 'th', 'vn'],
    arab_countries: ['ma', 'eg', 'dz', 'tn', 'sa', 'ae', 'qa', 'kw', 'jo', 'lb'],
    north_america: ['us', 'ca', 'mx'],
    russia: ['ru'],
  };

  constructor(
    @InjectRepository(Market)
    private readonly marketsRepository: Repository<Market>,
    @InjectRepository(PriceHistory)
    private readonly priceHistoryRepository: Repository<PriceHistory>,
    @InjectRepository(Lot)
    private readonly lotsRepository: Repository<Lot>,
  ) {}

  async findAll() {
    return this.marketsRepository.find({ where: { active: true } });
  }

  async getReferencePrices(filters: ReferencePriceFilters) {
    const limit = Math.min(Math.max(filters.limit ?? 40, 1), 200);
    const query = (filters.query ?? '').trim().toLowerCase();

    const rows = await this.priceHistoryRepository.find({
      relations: ['fruit', 'market'],
      order: {
        date: 'DESC',
        createdAt: 'DESC',
      },
      take: 400,
    });

    const filtered = rows.filter((row) => {
      if (!row.market?.active || !row.fruit?.active) return false;
      if (filters.marketId && row.marketId !== filters.marketId) return false;
      if (!this.matchesCountryFilter(row, filters.country)) return false;
      if (!this.matchesRegionFilter(row, filters.region)) return false;
      if (!this.matchesSourceFilter(row, filters.source)) return false;
      if (!query) return true;

      const values = [
        row.fruit?.nameEs,
        row.fruit?.nameEn,
        row.fruit?.nameFr,
        row.fruit?.nameDe,
        row.fruit?.namePt,
        row.market?.name,
        row.market?.country,
        row.market?.city,
      ]
        .filter(Boolean)
        .map((value) => `${value}`.toLowerCase());

      return values.some((value) => value.includes(query));
    });

    const deduped = new Map<string, PriceHistory>();
    for (const row of filtered) {
      const key = `${row.fruitId}:${row.marketId}`;
      if (!deduped.has(key)) {
        deduped.set(key, row);
      }
    }

    return Array.from(deduped.values())
      .slice(0, limit)
      .map((row) => this.mapReferencePrice(row));
  }

  async getMapReferencePrices(filters: ReferencePriceFilters) {
    const query = (filters.query ?? '').trim().toLowerCase();
    const histories = await this.priceHistoryRepository.find({
      relations: ['fruit', 'market'],
      order: {
        date: 'DESC',
        createdAt: 'DESC',
      },
      take: 600,
    });

    const latestByFruitMarket = new Map<string, PriceHistory>();
    for (const row of histories) {
      const key = `${row.fruitId}:${row.marketId}`;
      if (!latestByFruitMarket.has(key)) {
        latestByFruitMarket.set(key, row);
      }
    }

    const grouped = new Map<string, any>();
    for (const row of latestByFruitMarket.values()) {
      if (!row.market?.active || row.market.latitude == null || row.market.longitude == null) {
        continue;
      }
      if (!this.matchesCountryFilter(row, filters.country)) continue;
      if (!this.matchesRegionFilter(row, filters.region)) continue;
      if (!this.matchesSourceFilter(row, filters.source)) continue;

      const group = grouped.get(row.marketId) ?? {
        marketId: row.marketId,
        marketName: row.market.name,
        country: row.market.country,
        city: row.market.city,
        continent: row.market.continent,
        region: this.resolveRegionKey(row),
        latitude: Number(row.market.latitude),
        longitude: Number(row.market.longitude),
        currency: (row.additionalData?.currency as string) ?? 'EUR',
        source: (row.additionalData?.source as string) ?? 'MasMercat',
        lastReferenceDate: row.date,
        lastUpdatedAt: row.createdAt,
        priceItems: [] as any[],
      };

      group.priceItems.push(this.mapReferencePrice(row));

      if (new Date(row.date) > new Date(group.lastReferenceDate)) {
        group.lastReferenceDate = row.date;
        group.lastUpdatedAt = row.createdAt;
      }
      grouped.set(row.marketId, group);
    }

    const activeLots = await this.lotsRepository.find({
      relations: ['fruit', 'market'],
      where: { isActive: true },
      take: 300,
      order: { createdAt: 'DESC' },
    });

    for (const lot of activeLots) {
      if (!this.matchesLotFilters(lot, filters)) {
        continue;
      }

      const lotProductName = `${lot.fruit?.nameEs ?? lot.fruit?.nameEn ?? ''}`.trim();
      const group = grouped.get(lot.marketId) ?? {
        marketId: lot.marketId,
        marketName: lot.market.name,
        country: lot.market.country,
        city: lot.market.city,
        continent: lot.market.continent,
        region: this.resolveRegionFromCountryOrContinent(
          `${lot.market.country ?? ''}`,
          `${lot.market.continent ?? ''}`,
        ),
        latitude: Number(lot.market.latitude),
        longitude: Number(lot.market.longitude),
        currency: 'EUR',
        source: 'MasMercat lots',
        lastReferenceDate: lot.createdAt,
        lastUpdatedAt: lot.createdAt,
        priceItems: [] as any[],
        lotCount: 0,
        lotProducts: [] as string[],
      };

      group.priceItems = Array.isArray(group.priceItems) ? group.priceItems : [];
      group.lotProducts = Array.isArray(group.lotProducts) ? group.lotProducts : [];
      group.lotCount = Number(group.lotCount ?? 0) + 1;
      if (lotProductName && !group.lotProducts.includes(lotProductName)) {
        group.lotProducts.push(lotProductName);
      }

      if (group.priceItems.length === 0) {
        group.priceItems.push({
          fruitId: lot.fruit?.id,
          fruitName: lotProductName,
          marketId: lot.marketId,
          marketName: lot.market.name,
          country: lot.market.country,
          city: lot.market.city,
          price: Number(lot.price),
          currency: 'EUR',
          unitType: lot.unitType,
          source: 'MasMercat lots',
          sourceRegion: lot.market.country,
          region: this.resolveRegionFromCountryOrContinent(
            `${lot.market.country ?? ''}`,
            `${lot.market.continent ?? ''}`,
          ),
          productStage: 'Market lot price',
          referenceDate: lot.createdAt,
          updatedAt: lot.createdAt,
        });
      }

      if (new Date(lot.createdAt) > new Date(group.lastReferenceDate)) {
        group.lastReferenceDate = lot.createdAt;
        group.lastUpdatedAt = lot.createdAt;
      }

      grouped.set(lot.marketId, group);
    }

    let values = Array.from(grouped.values()).map((group) => {
      const validPrices = group.priceItems
        .map((item) => Number(item.price))
        .filter((value) => !Number.isNaN(value) && value > 0);

      const averagePrice =
        validPrices.length > 0
          ? Number(
              (
                validPrices.reduce((total, value) => total + value, 0) /
                validPrices.length
              ).toFixed(2),
            )
          : null;

      return {
        ...group,
        averagePrice,
        productCount: group.priceItems.length,
        lotCount: Number(group.lotCount ?? 0),
        topProducts: Array.from(
          new Set(
            [
              ...group.priceItems.map((item) => `${item.fruitName ?? ''}`.trim()),
              ...(group.lotProducts ?? []),
            ].filter((item) => item.length > 0),
          ),
        ).slice(0, 5),
      };
    });

    if (query) {
      values = values.filter((item) => {
        const haystack = [
          item.marketName,
          item.country,
          item.city,
          item.continent,
          ...item.priceItems.map((price) => price.fruitName),
          ...(item.topProducts ?? []),
        ]
          .filter(Boolean)
          .map((value) => `${value}`.toLowerCase());

        return haystack.some((value) => value.includes(query));
      });
    }

    if (values.length === 0) {
      return this.getMapFallbackFromLots(query);
    }

    return values;
  }

  async getEuOfficialPrices(filters: ReferencePriceFilters) {
    const limit = Math.min(Math.max(filters.limit ?? 40, 1), 120);
    const products = `${filters.products ?? ''}`
      .split(',')
      .map((item) => item.trim())
      .filter((item, index, list) => item.length > 0 && list.indexOf(item) === index);
    const memberStateCode = `${filters.country ?? ''}`.trim().toUpperCase();

    if (products.length === 0) {
      return [];
    }

    const stages = [
      '',
      'Retail buying price',
      'Ex-packaging station price',
      'Retail selling price',
      'Farmgate price',
      'Wholesale price',
      'Producer price',
    ];
    const countryFilters = memberStateCode ? [memberStateCode, ''] : [''];
    const collected = new Map<string, any>();

    for (const countryFilter of countryFilters) {
      for (const product of products) {
        for (const stage of stages) {
          try {
            const rows = await this.fetchEuAgriDataPrices(product, countryFilter, stage);
            for (const row of rows) {
              const normalized = this.normalizeEuOfficialMeasurement(
                `${row?.price ?? ''}`,
                `${row?.unit ?? ''}`,
              );
              if (!normalized) {
                continue;
              }

              const mapped = {
                fruitName: product,
                marketName: `${row?.market ?? row?.memberStateName ?? ''}`.trim(),
                country: `${row?.memberStateCode ?? ''}`.trim(),
                city: `${row?.memberStateName ?? ''}`.trim(),
                price: normalized.price,
                currency: normalized.currency,
                unitType: normalized.unitType,
                productStage: `${row?.productStage ?? stage ?? ''}`.trim(),
                source: 'EU AgriData',
                sourceRegion: `${row?.memberStateCode ?? ''}`.trim(),
                region: 'eu',
                referenceDate: `${row?.endDate ?? row?.beginDate ?? ''}`.trim(),
              };
              const dedupeKey = [
                mapped.fruitName,
                mapped.marketName,
                mapped.country,
                mapped.productStage,
                mapped.referenceDate,
              ].join('|');
              if (!collected.has(dedupeKey)) {
                collected.set(dedupeKey, mapped);
              }
            }
            if (collected.size >= limit) {
              break;
            }
          } catch (_) {}
        }
        if (collected.size >= limit) {
          break;
        }
      }
      if (collected.size >= limit) {
        break;
      }
    }

    return Array.from(collected.values())
      .sort((a, b) => this.parseEuropeanDate(b.referenceDate) - this.parseEuropeanDate(a.referenceDate))
      .slice(0, limit);
  }

  private async getMapFallbackFromLots(query: string) {
    const lots = await this.lotsRepository.find({
      relations: ['fruit', 'market'],
      where: { isActive: true },
      take: 300,
      order: { createdAt: 'DESC' },
    });

    const grouped = new Map<string, any>();
    for (const lot of lots) {
      if (!lot.market || lot.market.latitude == null || lot.market.longitude == null) {
        continue;
      }

      const group = grouped.get(lot.marketId) ?? {
        marketId: lot.marketId,
        marketName: lot.market.name,
        country: lot.market.country,
        city: lot.market.city,
        continent: lot.market.continent,
        region: this.resolveRegionFromCountryOrContinent(
          `${lot.market.country ?? ''}`,
          `${lot.market.continent ?? ''}`,
        ),
        latitude: Number(lot.market.latitude),
        longitude: Number(lot.market.longitude),
        currency: 'EUR',
        source: 'MasMercat lots',
        lastReferenceDate: lot.createdAt,
        lastUpdatedAt: lot.createdAt,
        priceItems: [] as any[],
      };

      group.priceItems.push({
        fruitId: lot.fruit?.id,
        fruitName: lot.fruit?.nameEs ?? '',
        marketId: lot.marketId,
        marketName: lot.market.name,
        price: Number(lot.price),
        currency: 'EUR',
        unitType: lot.unitType,
        source: 'MasMercat lots',
        sourceRegion: lot.market.country,
        region: this.resolveRegionFromCountryOrContinent(
          `${lot.market.country ?? ''}`,
          `${lot.market.continent ?? ''}`,
        ),
        productStage: 'Market lot price',
        referenceDate: lot.createdAt,
        updatedAt: lot.createdAt,
      });
      grouped.set(lot.marketId, group);
    }

    let values = Array.from(grouped.values()).map((group) => {
      const validPrices = group.priceItems
        .map((item) => Number(item.price))
        .filter((value) => !Number.isNaN(value) && value > 0);

      return {
        ...group,
        averagePrice:
          validPrices.length > 0
            ? Number(
                (
                  validPrices.reduce((total, value) => total + value, 0) /
                  validPrices.length
                ).toFixed(2),
              )
            : null,
        productCount: group.priceItems.length,
      };
    });

    if (query) {
      values = values.filter((item) => {
        const haystack = [
          item.marketName,
          item.country,
          item.city,
          item.continent,
          ...item.priceItems.map((price) => price.fruitName),
        ]
          .filter(Boolean)
          .map((value) => `${value}`.toLowerCase());

        return haystack.some((value) => value.includes(query));
      });
    }

    return values;
  }

  private mapReferencePrice(row: PriceHistory) {
    return {
      fruitId: row.fruitId,
      fruitName: row.fruit?.nameEs ?? row.fruit?.nameEn ?? '',
      marketId: row.marketId,
      marketName: row.market?.name ?? '',
      country: row.market?.country ?? '',
      city: row.market?.city ?? '',
      price: Number(row.price),
      currency: (row.additionalData?.currency as string) ?? 'EUR',
      unitType: row.unitType ?? 'kg',
      source: (row.additionalData?.source as string) ?? 'MasMercat',
      sourceRegion: (row.additionalData?.sourceRegion as string) ?? row.market?.country ?? '',
      region: this.resolveRegionKey(row),
      productStage: (row.additionalData?.productStage as string) ?? 'Reference price',
      referenceDate: row.date,
      updatedAt: row.createdAt,
    };
  }

  private async fetchEuAgriDataPrices(
    product: string,
    memberStateCode?: string,
    productStage?: string,
  ): Promise<any[]> {
    let lastError: unknown;

    for (const baseUrl of MarketsService.euBaseUrls) {
      try {
        const response = await axios.get(
          `${baseUrl}/api/fruitAndVegetable/pricesSupplyChain`,
          {
            timeout: 15000,
            headers: { Accept: 'application/json' },
            params: {
              years: `${new Date().getFullYear() - 1},${new Date().getFullYear()}`,
              products: product,
              ...(memberStateCode ? { memberStateCodes: memberStateCode } : {}),
              ...(productStage ? { productStages: productStage } : {}),
            },
          },
        );

        if (Array.isArray(response.data)) {
          return response.data;
        }
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error('EU AgriData unavailable');
  }

  private normalizeEuOfficialMeasurement(rawPrice: string, rawUnit: string) {
    const normalizedPrice = `${rawPrice ?? ''}`.replace(',', '.').trim();
    const normalizedUnit = `${rawUnit ?? ''}`.toLowerCase().trim();
    const parsedPrice = Number.parseFloat(normalizedPrice);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      return null;
    }

    let price = parsedPrice;
    let currency = rawPrice.includes('$') || rawUnit.includes('$') ? 'USD' : 'EUR';
    let unitType = 'kg';

    if (
      normalizedUnit.includes('/100 kg') ||
      normalizedUnit.includes('100kg') ||
      normalizedUnit.includes('€/100 kg') ||
      normalizedUnit.includes('euro/100 kg')
    ) {
      price = parsedPrice / 100;
      unitType = 'kg';
      currency = 'EUR';
    } else if (normalizedUnit.includes('/kg') || normalizedUnit.endsWith('kg')) {
      unitType = 'kg';
    } else if (normalizedUnit.includes('box') || normalizedUnit.includes('caja')) {
      unitType = 'box';
    } else if (normalizedUnit.includes('pallet') || normalizedUnit.includes('palet')) {
      unitType = 'pallet';
    }

    return { price, currency, unitType };
  }

  private parseEuropeanDate(value: string): number {
    const parts = `${value ?? ''}`.split('/');
    if (parts.length !== 3) {
      return 0;
    }

    const day = Number.parseInt(parts[0], 10) || 1;
    const month = Number.parseInt(parts[1], 10) || 1;
    const year = Number.parseInt(parts[2], 10) || 1970;
    return new Date(year, month - 1, day).getTime();
  }

  private matchesCountryFilter(row: PriceHistory, country?: string): boolean {
    if (!country) return true;

    const requested = this.resolveCountryCode(`${country}`);
    const marketCountry = this.resolveCountryCode(`${row.market?.country ?? ''}`);
    const sourceRegion = this.resolveCountryCode(`${row.additionalData?.sourceRegion ?? ''}`);

    return requested !== '' && (requested === marketCountry || requested === sourceRegion);
  }

  private matchesRegionFilter(row: PriceHistory, region?: string): boolean {
    if (!region) return true;
    return this.resolveRegionKey(row) === this.normalizeRegionKey(region);
  }

  private matchesSourceFilter(row: PriceHistory, source?: string): boolean {
    if (!source) return true;
    return this
      .normalizeText(`${row.additionalData?.source ?? ''}`)
      .includes(this.normalizeText(source));
  }

  private matchesLotFilters(lot: Lot, filters: ReferencePriceFilters): boolean {
    if (!lot.market?.active || lot.market.latitude == null || lot.market.longitude == null) {
      return false;
    }
    if (filters.marketId && lot.marketId !== filters.marketId) {
      return false;
    }

    if (filters.country) {
      const requested = this.resolveCountryCode(`${filters.country}`);
      const marketCountry = this.resolveCountryCode(`${lot.market?.country ?? ''}`);
      if (!requested || requested !== marketCountry) {
        return false;
      }
    }

    if (filters.region) {
      const region = this.resolveRegionFromCountryOrContinent(
        `${lot.market?.country ?? ''}`,
        `${lot.market?.continent ?? ''}`,
      );
      if (region !== this.normalizeRegionKey(filters.region)) {
        return false;
      }
    }

    if (filters.source) {
      const requestedSource = this.normalizeText(filters.source);
      if (
        requestedSource.length > 0 &&
        !this.normalizeText('MasMercat lots').includes(requestedSource)
      ) {
        return false;
      }
    }

    return true;
  }

  private resolveRegionKey(row: PriceHistory): string {
    const metadataRegion = this.normalizeRegionKey(`${row.additionalData?.region ?? ''}`);
    if (metadataRegion) {
      return metadataRegion;
    }

    return this.resolveRegionFromCountryOrContinent(
      `${row.market?.country ?? ''}`,
      `${row.market?.continent ?? ''}`,
    );
  }

  private resolveRegionFromCountryOrContinent(country: string, continent: string): string {
    const normalizedCountry = this.resolveCountryCode(country);
    const normalizedContinent = this.normalizeText(continent);

    for (const [region, countries] of Object.entries(MarketsService.regionCountryMap)) {
      if (countries.some((code) => normalizedCountry.includes(code))) {
        return region;
      }
    }

    if (normalizedContinent.includes('europe')) return 'eu';
    if (normalizedContinent.includes('asia')) return 'asia';
    if (normalizedContinent.includes('oceania')) return 'australia';
    if (normalizedContinent.includes('south america')) return 'mercosur';
    if (normalizedContinent.includes('north america')) return 'north_america';
    return normalizedContinent || 'global';
  }

  private normalizeText(value: string): string {
    return `${value ?? ''}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  private normalizeRegionKey(value: string): string {
    const normalized = this.normalizeText(value);
    return normalized === 'usa' ? 'north_america' : normalized;
  }

  private resolveCountryCode(value: string): string {
    const normalized = this.normalizeText(value);
    if (normalized.length == 2) {
      return normalized;
    }

    for (const [alias, code] of Object.entries(MarketsService.countryAliases)) {
      if (normalized.includes(alias)) {
        return code;
      }
    }

    return normalized;
  }
}
