import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../entities/user.entity';
import { SupplierCertificate } from './supplier-certificate.entity';

export enum MarketplaceAccountType {
  PRODUCER = 'producer',
  BUYER = 'buyer',
  FORWARDER = 'forwarder',
}

export enum TrustLevel {
  REGISTERED = 'registered',
  IDENTITY_VERIFIED = 'identity_verified',
  COMPANY_VERIFIED = 'company_verified',
  CERTIFIED_PRODUCER = 'certified_producer',
  TRUSTED_SUPPLIER = 'trusted_supplier',
}

@Entity('marketplace_profiles')
export class MarketplaceProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'enum', enum: MarketplaceAccountType })
  accountType: MarketplaceAccountType;

  @Column({ type: 'enum', enum: TrustLevel, default: TrustLevel.REGISTERED })
  trustLevel: TrustLevel;

  @Column({ length: 180 })
  legalName: string;

  @Column({ length: 80, nullable: true })
  taxId?: string;

  @Column({ length: 120 })
  country: string;

  @Column({ length: 120, nullable: true })
  region?: string;

  @Column({ length: 255, nullable: true })
  website?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ default: false })
  identityVerified: boolean;

  @Column({ default: false })
  companyVerified: boolean;

  @Column({ default: true })
  isPublic: boolean;

  @OneToMany(() => SupplierCertificate, certificate => certificate.profile)
  certificates: SupplierCertificate[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
