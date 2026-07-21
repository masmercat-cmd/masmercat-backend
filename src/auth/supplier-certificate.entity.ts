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

export enum CertificateStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

@Entity('supplier_certificates')
export class SupplierCertificate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  profileId: string;

  @ManyToOne(() => MarketplaceProfile, profile => profile.certificates, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'profileId' })
  profile: MarketplaceProfile;

  @Column({ length: 120 })
  name: string;

  @Column({ length: 180 })
  issuer: string;

  @Column({ length: 120, nullable: true })
  certificateNumber?: string;

  @Column({ type: 'date', nullable: true })
  issuedAt?: string;

  @Column({ type: 'date', nullable: true })
  expiresAt?: string;

  @Column({ length: 500 })
  documentUrl: string;

  @Column({ type: 'enum', enum: CertificateStatus, default: CertificateStatus.PENDING })
  status: CertificateStatus;

  @Column({ type: 'text', nullable: true })
  reviewNote?: string;

  @Column({ nullable: true })
  reviewedBy?: string;

  @Column({ nullable: true })
  reviewedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
