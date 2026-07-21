import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Lot } from '../entities/lot.entity';
import { User } from '../entities/user.entity';
import { TradeOffer } from './trade-offer.entity';

export enum TradeRequestStatus {
  OPEN = 'open',
  NEGOTIATING = 'negotiating',
  ACCEPTED = 'accepted',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export enum TradeCurrency {
  USD = 'USD', ARS = 'ARS', BRL = 'BRL', PYG = 'PYG', UYU = 'UYU', EUR = 'EUR',
}

@Entity('trade_requests')
export class TradeRequest {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() lotId: string;
  @ManyToOne(() => Lot, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'lotId' }) lot: Lot;
  @Column() buyerId: string;
  @ManyToOne(() => User) @JoinColumn({ name: 'buyerId' }) buyer: User;
  @Column() sellerId: string;
  @ManyToOne(() => User) @JoinColumn({ name: 'sellerId' }) seller: User;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) quantity: number;
  @Column({ type: 'enum', enum: TradeCurrency, default: TradeCurrency.USD }) currency: TradeCurrency;
  @Column({ type: 'enum', enum: TradeRequestStatus, default: TradeRequestStatus.OPEN }) status: TradeRequestStatus;
  @Column({ type: 'text', nullable: true }) note?: string;
  @Column({ nullable: true }) expiresAt?: Date;
  @OneToMany(() => TradeOffer, offer => offer.request) offers: TradeOffer[];
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
