import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';
import { Fruit } from './fruit.entity';
import { Market } from './market.entity';

@Entity('alerts')
export class Alert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, user => user.alerts)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @ManyToOne(() => Fruit)
  @JoinColumn({ name: 'fruitId' })
  fruit: Fruit;

  @Column()
  fruitId: string;

  @ManyToOne(() => Market)
  @JoinColumn({ name: 'marketId' })
  market: Market;

  @Column()
  marketId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  targetPrice: number;

  @Column({ default: true })
  active: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastTriggered: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
