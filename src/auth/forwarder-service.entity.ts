import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MarketplaceProfile } from './marketplace-profile.entity';

export enum ForwarderServiceCategory {
  ROAD_FREIGHT = 'road_freight',
  SEA_FREIGHT = 'sea_freight',
  AIR_FREIGHT = 'air_freight',
  COLD_CHAIN = 'cold_chain',
  CUSTOMS = 'customs',
  STORAGE = 'storage',
  CARGO_INSURANCE = 'cargo_insurance',
}

@Entity('forwarder_services')
export class ForwarderService {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  profileId: string;

  @ManyToOne(() => MarketplaceProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profileId' })
  profile: MarketplaceProfile;

  @Column({ type: 'enum', enum: ForwarderServiceCategory })
  category: ForwarderServiceCategory;

  @Column({ length: 160 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ length: 500 })
  coverage: string;

  @Column({ default: false })
  coldChain: boolean;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
