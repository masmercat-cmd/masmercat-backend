import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Market } from '../entities/market.entity';
import { PriceHistory } from '../entities/price-history.entity';
import { Lot } from '../entities/lot.entity';

interface ReferencePriceFilters {
  query?: string;
  country?: string;
  marketId?: string;
  limit?: number;
}

@Injectable()
export class MarketsService {
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
      if (filters.country) {
        const requested = `${filters.country}`.trim().toLowerCase();
        const marketCountry = `${row.market?.country ?? ''}`.trim().toLowerCase();
        const sourceRegion = `${row.additionalData?.sourceRegion ?? ''}`.trim().toLowerCase();
        if (requested != marketCountry && requested != sourceRegion) {
          return false;
        }
      }
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

      const group = grouped.get(row.marketId) ?? {
        marketId: row.marketId,
        marketName: row.market.name,
        country: row.market.country,
        city: row.market.city,
        continent: row.market.continent,
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

    if (values.length === 0) {
      return this.getMapFallbackFromLots(query);
    }

    return values;
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
      productStage: (row.additionalData?.productStage as string) ?? 'Reference price',
      referenceDate: row.date,
      updatedAt: row.createdAt,
    };
  }
}
