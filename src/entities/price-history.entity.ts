import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Fruit } from './fruit.entity';
import { Market } from './market.entity';

@Entity('price_history')
@Index(['fruitId', 'marketId', 'date'])
export class PriceHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Fruit)
  @JoinColumn({ name: 'fruitId' })
  fruit: Fruit;

  @Column()
  fruitId: string;

  @ManyToOne(() => Market, market => market.priceHistories)
  @JoinColumn({ name: 'marketId' })
  market: Market;

  @Column()
  marketId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ type: 'date' })
  date: Date;

  @Column({ length: 20, nullable: true })
  unitType: string;

  @Column({ type: 'jsonb', nullable: true })
  additionalData: any;

  @CreateDateColumn()
  createdAt: Date;
}
