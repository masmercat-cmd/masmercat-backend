import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { MarketplaceProfile } from './marketplace-profile.entity';
import { FreightRequest } from './freight-request.entity';
import { TradeCurrency } from './trade-types';

export enum FreightQuoteStatus { PENDING = 'pending', SELECTED = 'selected', DECLINED = 'declined', WITHDRAWN = 'withdrawn' }

@Entity('freight_quotes')
export class FreightQuote {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() requestId: string;
  @ManyToOne(() => FreightRequest, request => request.quotes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requestId' }) request: FreightRequest;
  @Column() forwarderProfileId: string;
  @ManyToOne(() => MarketplaceProfile) @JoinColumn({ name: 'forwarderProfileId' }) forwarderProfile: MarketplaceProfile;
  @Column({ type: 'decimal', precision: 14, scale: 2 }) price: number;
  @Column({ type: 'enum', enum: TradeCurrency, enumName: 'trade_currency_enum' }) currency: TradeCurrency;
  @Column({ type: 'int' }) transitDays: number;
  @Column({ type: 'text' }) conditions: string;
  @Column({ nullable: true }) validUntil?: Date;
  @Column({ type: 'enum', enum: FreightQuoteStatus, default: FreightQuoteStatus.PENDING }) status: FreightQuoteStatus;
  @CreateDateColumn() createdAt: Date;
}
