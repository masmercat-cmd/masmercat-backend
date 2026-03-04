import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { User } from './user.entity';
import { Fruit } from './fruit.entity';
import { Market } from './market.entity';
import { Message } from './message.entity';

export enum LotStatus {
  AVAILABLE = 'available',
  RESERVED = 'reserved',
  SOLD = 'sold'
}

export enum UnitType {
  KG = 'kg',
  BOX = 'box'
}

export enum QualityGrade {
  EXTRA = 'extra',
  FIRST = 'first',
  SECOND = 'second',
  INDUSTRIAL = 'industrial'
}

@Entity('lots')
export class Lot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, user => user.lots)
  @JoinColumn({ name: 'sellerId' })
  seller: User;

  @Column()
  sellerId: string;

  @ManyToOne(() => Fruit, fruit => fruit.lots)
  @JoinColumn({ name: 'fruitId' })
  fruit: Fruit;

  @Column()
  fruitId: string;

  @ManyToOne(() => Market, market => market.lots)
  @JoinColumn({ name: 'marketId' })
  market: Market;

  @Column()
  marketId: string;

  @Column({ length: 100, nullable: true })
  caliber: string;

  @Column({
    type: 'enum',
    enum: QualityGrade,
    default: QualityGrade.FIRST
  })
  quality: QualityGrade;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({
    type: 'enum',
    enum: UnitType,
    default: UnitType.KG
  })
  unitType: UnitType;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  weight: number;

  @Column({ type: 'int', nullable: true })
  numberOfBoxes: number;

  @Column({ type: 'text', array: true, default: [] })
  photos: string[];

  @Column({
    type: 'enum',
    enum: LotStatus,
    default: LotStatus.AVAILABLE
  })
  status: LotStatus;

  @Column({ default: false })
  isOpportunity: boolean;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isBlocked: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Message, message => message.lot)
  messages: Message[];
}
