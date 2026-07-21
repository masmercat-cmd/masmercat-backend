import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Lot } from '../entities/lot.entity';
import { User } from '../entities/user.entity';
import { TradeCurrency } from './trade-request.entity';

export enum TradeOrderStatus {
  STOCK_RESERVED = 'stock_reserved', CONFIRMED = 'confirmed', COMPLETED = 'completed',
  CANCELLED = 'cancelled', EXPIRED = 'expired',
}

@Entity('trade_orders')
export class TradeOrder {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) requestId: string;
  @Column() acceptedOfferId: string;
  @Column() lotId: string;
  @ManyToOne(() => Lot) @JoinColumn({ name: 'lotId' }) lot: Lot;
  @Column() buyerId: string;
  @ManyToOne(() => User) @JoinColumn({ name: 'buyerId' }) buyer: User;
  @Column() sellerId: string;
  @ManyToOne(() => User) @JoinColumn({ name: 'sellerId' }) seller: User;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) quantity: number;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) unitPrice: number;
  @Column({ type: 'decimal', precision: 14, scale: 2 }) total: number;
  @Column({ type: 'enum', enum: TradeCurrency }) currency: TradeCurrency;
  @Column({ type: 'enum', enum: TradeOrderStatus, default: TradeOrderStatus.STOCK_RESERVED }) status: TradeOrderStatus;
  @Column({ nullable: true }) reservedUntil?: Date;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
