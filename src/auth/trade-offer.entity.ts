import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../entities/user.entity';
import { TradeRequest } from './trade-request.entity';
import { TradeCurrency } from './trade-types';

export enum OfferParty { BUYER = 'buyer', SELLER = 'seller' }
export enum TradeOfferStatus { PENDING = 'pending', ACCEPTED = 'accepted', REJECTED = 'rejected', WITHDRAWN = 'withdrawn' }

@Entity('trade_offers')
export class TradeOffer {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() requestId: string;
  @ManyToOne(() => TradeRequest, request => request.offers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requestId' }) request: TradeRequest;
  @Column() createdById: string;
  @ManyToOne(() => User) @JoinColumn({ name: 'createdById' }) createdBy: User;
  @Column({ type: 'enum', enum: OfferParty }) party: OfferParty;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) unitPrice: number;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) quantity: number;
  @Column({ type: 'enum', enum: TradeCurrency, enumName: 'trade_currency_enum' }) currency: TradeCurrency;
  @Column({ type: 'enum', enum: TradeOfferStatus, default: TradeOfferStatus.PENDING }) status: TradeOfferStatus;
  @Column({ type: 'text', nullable: true }) note?: string;
  @Column({ nullable: true }) validUntil?: Date;
  @CreateDateColumn() createdAt: Date;
}
