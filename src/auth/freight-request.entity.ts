import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../entities/user.entity';
import { FreightQuote } from './freight-quote.entity';
import { TradeOrder } from './trade-order.entity';

export enum FreightRequestStatus { OPEN = 'open', QUOTE_SELECTED = 'quote_selected', CLOSED = 'closed', CANCELLED = 'cancelled' }

@Entity('freight_requests')
export class FreightRequest {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) orderId: string;
  @ManyToOne(() => TradeOrder, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'orderId' }) order: TradeOrder;
  @Column() requestedById: string;
  @ManyToOne(() => User) @JoinColumn({ name: 'requestedById' }) requestedBy: User;
  @Column({ length: 255 }) origin: string;
  @Column({ length: 255 }) destination: string;
  @Column({ nullable: true }) pickupFrom?: Date;
  @Column({ nullable: true }) deliveryBefore?: Date;
  @Column({ default: true }) coldChainRequired: boolean;
  @Column({ type: 'text', nullable: true }) requirements?: string;
  @Column({ type: 'enum', enum: FreightRequestStatus, default: FreightRequestStatus.OPEN }) status: FreightRequestStatus;
  @Column({ nullable: true }) selectedQuoteId?: string;
  @OneToMany(() => FreightQuote, quote => quote.request) quotes: FreightQuote[];
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
