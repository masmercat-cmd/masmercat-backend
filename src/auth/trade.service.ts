import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, LessThan, Repository } from 'typeorm';
import { Lot, LotStatus, UnitType } from '../entities/lot.entity';
import { MarketplaceAccountType, MarketplaceProfile } from './marketplace-profile.entity';
import { OfferParty, TradeOffer, TradeOfferStatus } from './trade-offer.entity';
import { TradeOrder, TradeOrderStatus } from './trade-order.entity';
import { TradeCurrency, TradeRequest, TradeRequestStatus } from './trade-request.entity';
import { FreightRequest, FreightRequestStatus } from './freight-request.entity';
import { FreightQuote, FreightQuoteStatus } from './freight-quote.entity';

export interface CreateTradeRequestData {
  lotId: string; quantity: number; currency: TradeCurrency; unitPrice: number; note?: string; validUntil?: string;
}
export interface CreateTradeOfferData {
  quantity: number; currency: TradeCurrency; unitPrice: number; note?: string; validUntil?: string;
}
export interface CreateFreightRequestData {
  orderId: string; origin: string; destination: string; pickupFrom?: string;
  deliveryBefore?: string; coldChainRequired?: boolean; requirements?: string;
}
export interface CreateFreightQuoteData {
  price: number; currency: TradeCurrency; transitDays: number; conditions: string; validUntil?: string;
}

@Injectable()
export class TradeService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(TradeRequest) private readonly requests: Repository<TradeRequest>,
    @InjectRepository(TradeOffer) private readonly offers: Repository<TradeOffer>,
    @InjectRepository(TradeOrder) private readonly orders: Repository<TradeOrder>,
    @InjectRepository(Lot) private readonly lots: Repository<Lot>,
    @InjectRepository(MarketplaceProfile) private readonly profiles: Repository<MarketplaceProfile>,
    @InjectRepository(FreightRequest) private readonly freightRequests: Repository<FreightRequest>,
    @InjectRepository(FreightQuote) private readonly freightQuotes: Repository<FreightQuote>,
  ) {}

  async createRequest(userId: string, data: CreateTradeRequestData) {
    await this.releaseExpiredReservations();
    await this.requireProfile(userId, MarketplaceAccountType.BUYER);
    const lot = await this.lots.findOne({ where: { id: data.lotId, isActive: true, isBlocked: false } });
    if (!lot || lot.status !== LotStatus.AVAILABLE) throw new NotFoundException('Available lot not found');
    if (lot.sellerId === userId) throw new BadRequestException('You cannot buy your own lot');
    this.assertQuantity(lot, data.quantity);
    this.assertFutureDate(data.validUntil);

    const request = await this.requests.save(this.requests.create({
      lotId: lot.id, buyerId: userId, sellerId: lot.sellerId, quantity: data.quantity,
      currency: data.currency, note: data.note?.trim(), status: TradeRequestStatus.OPEN,
      expiresAt: data.validUntil ? new Date(data.validUntil) : undefined,
    }));
    const offer = await this.offers.save(this.offers.create({
      requestId: request.id, createdById: userId, party: OfferParty.BUYER,
      unitPrice: data.unitPrice, quantity: data.quantity, currency: data.currency,
      note: data.note?.trim(), validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
    }));
    return { request, offer };
  }

  async createOffer(userId: string, requestId: string, data: CreateTradeOfferData) {
    const request = await this.getActiveRequest(requestId);
    const party = this.resolveParty(request, userId);
    this.assertFutureDate(data.validUntil);
    const lot = await this.lots.findOneBy({ id: request.lotId });
    if (!lot) throw new NotFoundException('Lot not found');
    this.assertQuantity(lot, data.quantity);
    request.status = TradeRequestStatus.NEGOTIATING;
    await this.requests.save(request);
    return this.offers.save(this.offers.create({
      requestId, createdById: userId, party, unitPrice: data.unitPrice,
      quantity: data.quantity, currency: data.currency, note: data.note?.trim(),
      validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
    }));
  }

  async acceptOffer(userId: string, offerId: string) {
    return this.dataSource.transaction(async manager => {
      const offer = await manager.getRepository(TradeOffer).findOne({
        where: { id: offerId }, relations: ['request'], lock: { mode: 'pessimistic_write' },
      });
      if (!offer || offer.status !== TradeOfferStatus.PENDING) throw new NotFoundException('Pending offer not found');
      const request = offer.request;
      if (![TradeRequestStatus.OPEN, TradeRequestStatus.NEGOTIATING].includes(request.status)) {
        throw new BadRequestException('Trade request is no longer active');
      }
      if (request.expiresAt && request.expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException('Trade request has expired');
      }
      const expectedAcceptor = offer.party === OfferParty.BUYER ? request.sellerId : request.buyerId;
      if (userId !== expectedAcceptor) throw new ForbiddenException('Only the other party can accept this offer');
      if (offer.validUntil && offer.validUntil.getTime() < Date.now()) throw new BadRequestException('Offer has expired');

      const lot = await manager.getRepository(Lot).findOne({
        where: { id: request.lotId }, lock: { mode: 'pessimistic_write' },
      });
      if (!lot || !lot.isActive || lot.isBlocked || lot.status !== LotStatus.AVAILABLE) {
        throw new BadRequestException('Lot is no longer available');
      }
      this.assertQuantity(lot, Number(offer.quantity));
      lot.status = LotStatus.RESERVED;
      await manager.save(lot);
      offer.status = TradeOfferStatus.ACCEPTED;
      await manager.save(offer);
      await manager.getRepository(TradeOffer).update(
        { requestId: request.id, status: TradeOfferStatus.PENDING },
        { status: TradeOfferStatus.REJECTED },
      );
      request.status = TradeRequestStatus.ACCEPTED;
      await manager.save(request);
      const order = manager.getRepository(TradeOrder).create({
        requestId: request.id, acceptedOfferId: offer.id, lotId: lot.id,
        buyerId: request.buyerId, sellerId: request.sellerId,
        quantity: Number(offer.quantity), unitPrice: Number(offer.unitPrice),
        total: Number(offer.quantity) * Number(offer.unitPrice), currency: offer.currency,
        status: TradeOrderStatus.STOCK_RESERVED,
        reservedUntil: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      return manager.save(order);
    });
  }

  async listMine(userId: string) {
    await this.releaseExpiredReservations();
    const [requests, orders] = await Promise.all([
      this.requests.createQueryBuilder('request').leftJoinAndSelect('request.lot', 'lot')
        .leftJoinAndSelect('request.offers', 'offers')
        .where('request.buyerId = :userId OR request.sellerId = :userId', { userId })
        .orderBy('request.createdAt', 'DESC').getMany(),
      this.orders.find({ where: [{ buyerId: userId }, { sellerId: userId }], order: { createdAt: 'DESC' } }),
    ]);
    return { requests, orders };
  }

  async confirmOrder(userId: string, orderId: string) {
    return this.transitionOrder(userId, orderId, 'confirm');
  }

  async cancelOrder(userId: string, orderId: string) {
    return this.transitionOrder(userId, orderId, 'cancel');
  }

  async completeOrder(userId: string, orderId: string) {
    return this.transitionOrder(userId, orderId, 'complete');
  }

  async releaseExpiredReservations() {
    const expired = await this.orders.find({
      where: {
        status: TradeOrderStatus.STOCK_RESERVED,
        reservedUntil: LessThan(new Date()),
      },
      select: ['id'],
    });
    for (const item of expired) {
      await this.expireOrder(item.id);
    }
    return { released: expired.length };
  }

  async createFreightRequest(userId: string, data: CreateFreightRequestData) {
    const order = await this.orders.findOneBy({ id: data.orderId });
    if (!order || order.buyerId !== userId) throw new NotFoundException('Buyer order not found');
    if ([
      TradeOrderStatus.COMPLETED,
      TradeOrderStatus.CANCELLED,
      TradeOrderStatus.EXPIRED,
    ].includes(order.status)) {
      throw new BadRequestException('Order does not accept freight requests');
    }
    this.assertDateRange(data.pickupFrom, data.deliveryBefore);
    const existingRequest = await this.freightRequests.findOneBy({ orderId: order.id });
    if (existingRequest) {
      throw new ConflictException('A freight request already exists for this order');
    }
    return this.freightRequests.save(this.freightRequests.create({
      orderId: order.id, requestedById: userId, origin: data.origin.trim(),
      destination: data.destination.trim(),
      pickupFrom: data.pickupFrom ? new Date(data.pickupFrom) : undefined,
      deliveryBefore: data.deliveryBefore ? new Date(data.deliveryBefore) : undefined,
      coldChainRequired: data.coldChainRequired ?? true,
      requirements: data.requirements?.trim(),
    }));
  }

  async listOpenFreightRequests(userId: string) {
    await this.requireProfile(userId, MarketplaceAccountType.FORWARDER);
    return this.freightRequests.find({
      where: { status: FreightRequestStatus.OPEN },
      order: { createdAt: 'DESC' },
    });
  }

  async listMyFreightRequests(userId: string) {
    return this.freightRequests.find({
      where: { requestedById: userId },
      relations: ['order', 'order.lot', 'order.lot.fruit', 'quotes', 'quotes.forwarderProfile'],
      order: { createdAt: 'DESC' },
    });
  }

  async createFreightQuote(userId: string, requestId: string, data: CreateFreightQuoteData) {
    const profile = await this.requireProfile(userId, MarketplaceAccountType.FORWARDER);
    const request = await this.freightRequests.findOneBy({ id: requestId });
    if (!request || request.status !== FreightRequestStatus.OPEN) throw new NotFoundException('Open freight request not found');
    this.assertFutureDate(data.validUntil);
    return this.freightQuotes.save(this.freightQuotes.create({
      requestId, forwarderProfileId: profile.id, price: data.price,
      currency: data.currency, transitDays: data.transitDays,
      conditions: data.conditions.trim(),
      validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
    }));
  }

  async selectFreightQuote(userId: string, quoteId: string) {
    return this.dataSource.transaction(async manager => {
      const quote = await manager.getRepository(FreightQuote).findOne({
        where: { id: quoteId }, relations: ['request'], lock: { mode: 'pessimistic_write' },
      });
      if (!quote || quote.status !== FreightQuoteStatus.PENDING) throw new NotFoundException('Pending freight quote not found');
      if (quote.request.requestedById !== userId) throw new ForbiddenException('Only the requesting buyer can select a quote');
      if (quote.request.status !== FreightRequestStatus.OPEN) throw new BadRequestException('Freight request is closed');
      if (quote.validUntil && quote.validUntil.getTime() < Date.now()) throw new BadRequestException('Freight quote has expired');
      quote.status = FreightQuoteStatus.SELECTED;
      await manager.save(quote);
      await manager.getRepository(FreightQuote).update(
        { requestId: quote.requestId, status: FreightQuoteStatus.PENDING },
        { status: FreightQuoteStatus.DECLINED },
      );
      quote.request.status = FreightRequestStatus.QUOTE_SELECTED;
      quote.request.selectedQuoteId = quote.id;
      await manager.save(quote.request);
      return quote;
    });
  }

  private async getActiveRequest(id: string) {
    const request = await this.requests.findOneBy({ id });
    if (!request || ![TradeRequestStatus.OPEN, TradeRequestStatus.NEGOTIATING].includes(request.status)) {
      throw new NotFoundException('Active trade request not found');
    }
    if (request.expiresAt && request.expiresAt.getTime() < Date.now()) {
      request.status = TradeRequestStatus.EXPIRED;
      await this.requests.save(request);
      throw new BadRequestException('Trade request has expired');
    }
    return request;
  }

  private async transitionOrder(
    userId: string,
    orderId: string,
    action: 'confirm' | 'cancel' | 'complete',
  ) {
    return this.dataSource.transaction(async manager => {
      const order = await manager.getRepository(TradeOrder).findOne({
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException('Order not found');
      const lot = await manager.getRepository(Lot).findOne({
        where: { id: order.lotId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lot) throw new NotFoundException('Order lot not found');

      if (action === 'confirm') {
        if (userId !== order.sellerId) throw new ForbiddenException('Only the producer can confirm the order');
        if (order.status !== TradeOrderStatus.STOCK_RESERVED) throw new BadRequestException('Only reserved orders can be confirmed');
        if (order.reservedUntil && order.reservedUntil.getTime() < Date.now()) {
          order.status = TradeOrderStatus.EXPIRED;
          lot.status = LotStatus.AVAILABLE;
          await manager.save(lot);
          await this.cancelFreightForOrder(manager, order.id);
          return manager.save(order);
        }
        order.status = TradeOrderStatus.CONFIRMED;
      } else if (action === 'complete') {
        if (userId !== order.buyerId) throw new ForbiddenException('Only the buyer can complete the order');
        if (order.status !== TradeOrderStatus.CONFIRMED) throw new BadRequestException('Only confirmed orders can be completed');
        order.status = TradeOrderStatus.COMPLETED;
        lot.status = LotStatus.SOLD;
        lot.isActive = false;
        await manager.save(lot);
      } else {
        if (userId !== order.buyerId && userId !== order.sellerId) {
          throw new ForbiddenException('Only order parties can cancel');
        }
        if (![TradeOrderStatus.STOCK_RESERVED, TradeOrderStatus.CONFIRMED].includes(order.status)) {
          throw new BadRequestException('Order cannot be cancelled');
        }
        order.status = TradeOrderStatus.CANCELLED;
        lot.status = LotStatus.AVAILABLE;
        await manager.save(lot);
        await this.cancelFreightForOrder(manager, order.id);
      }
      return manager.save(order);
    });
  }

  private async expireOrder(orderId: string) {
    return this.dataSource.transaction(async manager => {
      const order = await manager.getRepository(TradeOrder).findOne({
        where: { id: orderId }, lock: { mode: 'pessimistic_write' },
      });
      if (!order || order.status !== TradeOrderStatus.STOCK_RESERVED ||
          !order.reservedUntil || order.reservedUntil.getTime() >= Date.now()) return false;
      const lot = await manager.getRepository(Lot).findOne({
        where: { id: order.lotId }, lock: { mode: 'pessimistic_write' },
      });
      order.status = TradeOrderStatus.EXPIRED;
      await manager.save(order);
      await this.cancelFreightForOrder(manager, order.id);
      if (lot && lot.status === LotStatus.RESERVED) {
        lot.status = LotStatus.AVAILABLE;
        await manager.save(lot);
      }
      return true;
    });
  }

  private resolveParty(request: TradeRequest, userId: string) {
    if (request.buyerId === userId) return OfferParty.BUYER;
    if (request.sellerId === userId) return OfferParty.SELLER;
    throw new ForbiddenException('You are not part of this negotiation');
  }

  private async cancelFreightForOrder(
    manager: EntityManager,
    orderId: string,
  ): Promise<void> {
    const freightRequest = await manager.getRepository(FreightRequest).findOneBy({
      orderId,
    });
    if (!freightRequest || freightRequest.status === FreightRequestStatus.CANCELLED) {
      return;
    }

    freightRequest.status = FreightRequestStatus.CANCELLED;
    await manager.save(freightRequest);
    await manager.getRepository(FreightQuote).update(
      {
        requestId: freightRequest.id,
        status: FreightQuoteStatus.PENDING,
      },
      { status: FreightQuoteStatus.DECLINED },
    );
  }

  private async requireProfile(userId: string, type: MarketplaceAccountType) {
    const profile = await this.profiles.findOneBy({ userId });
    if (!profile || profile.accountType !== type) throw new ForbiddenException(`${type} marketplace profile required`);
    return profile;
  }

  private assertQuantity(lot: Lot, quantity: number) {
    const available = lot.unitType === UnitType.KG ? Number(lot.weight) : Number(lot.numberOfBoxes);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(available) || quantity > available) {
      throw new BadRequestException('Requested quantity exceeds available stock');
    }
  }

  private assertFutureDate(value?: string) {
    if (value && new Date(value).getTime() <= Date.now()) throw new BadRequestException('Validity date must be in the future');
  }

  private assertDateRange(from?: string, until?: string) {
    if (from && until && new Date(until).getTime() < new Date(from).getTime()) {
      throw new BadRequestException('Delivery date must be after pickup date');
    }
  }
}
